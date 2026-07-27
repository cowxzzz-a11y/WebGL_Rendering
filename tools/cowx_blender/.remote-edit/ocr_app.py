import asyncio
import io
import json
import os
import tempfile
import threading
import time
import zipfile
from pathlib import Path

import fitz
import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from PIL import Image
from pydantic import BaseModel
from transformers import AutoModel, AutoTokenizer, StoppingCriteria, StoppingCriteriaList

from output_quality import clean_output, has_repetition_loop, repetition_score


MODEL_PATH = os.environ.get("MODEL_PATH", "/models/DeepSeek")
STATIC_PATH = Path(__file__).parent / "static"
PROMPTS = {
    "markdown": "<image>\n<|grounding|>Convert the document to markdown. Preserve tables and formulas as Markdown and LaTeX. ",
    "plain": "<image>\nFree OCR. ",
}

app = FastAPI(title="DeepSeek-OCR2 Service", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH, trust_remote_code=True)
model = AutoModel.from_pretrained(
    MODEL_PATH,
    trust_remote_code=True,
    use_safetensors=True,
).eval().cuda().to(torch.bfloat16)
inference_lock = asyncio.Lock()
OCR_HEARTBEAT_INTERVAL_SECONDS = max(5, int(os.environ.get("OCR_HEARTBEAT_INTERVAL_SECONDS", "20")))
OCR_MAX_NEW_TOKENS = max(512, int(os.environ.get("OCR_MAX_NEW_TOKENS", "4096")))

# DeepSeek-OCR2 hard-codes 8192 generated tokens inside model.infer. Cap it at
# the service boundary so a repetitive page cannot monopolize the GPU indefinitely.
_original_generate = model.generate
_inference_context = threading.local()


class CancellationStoppingCriteria(StoppingCriteria):
    def __call__(self, input_ids, scores, **kwargs) -> bool:
        cancel_event = getattr(_inference_context, "cancel_event", None)
        return bool(cancel_event and cancel_event.is_set())


def capped_generate(*args, **kwargs):
    requested = int(kwargs.get("max_new_tokens", OCR_MAX_NEW_TOKENS))
    kwargs["max_new_tokens"] = min(requested, OCR_MAX_NEW_TOKENS)
    stopping_criteria = list(kwargs.get("stopping_criteria") or [])
    stopping_criteria.append(CancellationStoppingCriteria())
    kwargs["stopping_criteria"] = StoppingCriteriaList(stopping_criteria)
    return _original_generate(*args, **kwargs)


model.generate = capped_generate


class ExportItem(BaseModel):
    filename: str
    text: str


class BatchExportRequest(BaseModel):
    files: list[ExportItem]


def infer_image(
    image: Image.Image,
    workdir: Path,
    page: int,
    prompt: str,
    crop_mode: bool,
    cancel_event: threading.Event | None = None,
) -> str:
    variant = "crop" if crop_mode else "global"
    image_path = workdir / f"page-{page}.png"
    output_path = workdir / f"output-{page}-{variant}"
    image.convert("RGB").save(image_path, format="PNG")
    _inference_context.cancel_event = cancel_event
    try:
        return model.infer(
            tokenizer,
            prompt=prompt,
            image_file=str(image_path),
            output_path=str(output_path),
            base_size=1024,
            image_size=768,
            crop_mode=crop_mode,
            save_results=False,
            eval_mode=True,
        ).strip()
    finally:
        _inference_context.cancel_event = None


def infer_page(
    image: Image.Image,
    workdir: Path,
    page: int,
    prompt: str,
    cancel_event: threading.Event | None = None,
) -> tuple[str, bool, float, str | None]:
    try:
        primary = infer_image(image, workdir, page, prompt, crop_mode=True, cancel_event=cancel_event)
    except Exception as primary_exc:
        try:
            retry = infer_image(image, workdir, page, prompt, crop_mode=False, cancel_event=cancel_event)
        except Exception as retry_exc:
            raise RuntimeError(
                f"crop mode failed: {primary_exc}; full-page retry failed: {retry_exc}"
            ) from retry_exc
        return retry, True, repetition_score(retry), f"crop mode failed: {primary_exc}"

    primary_score = repetition_score(primary)
    if not has_repetition_loop(primary):
        return primary, False, primary_score, None

    try:
        retry = infer_image(image, workdir, page, prompt, crop_mode=False, cancel_event=cancel_event)
    except Exception as retry_exc:
        return primary, True, primary_score, f"full-page retry failed after repetitive crop output: {retry_exc}"
    retry_score = repetition_score(retry)
    if retry_score < primary_score:
        return retry, True, retry_score, "crop mode produced repetitive output"
    return primary, True, primary_score, "crop mode produced repetitive output"


@app.get("/health")
def health():
    return {"status": "ok", "model": "DeepSeek-OCR-2", "device": torch.cuda.get_device_name(0)}


@app.get("/")
def index():
    return FileResponse(STATIC_PATH / "index.html")


@app.get("/style.css")
def style():
    return FileResponse(STATIC_PATH / "style.css", media_type="text/css")


@app.get("/script.js")
def script():
    return FileResponse(STATIC_PATH / "script.js", media_type="application/javascript")


@app.post("/export-batch")
def export_batch(request: BatchExportRequest):
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as output:
        for item in request.files:
            safe_name = Path(item.filename).name or "ocr-result.md"
            if not safe_name.lower().endswith(".md"):
                safe_name += ".md"
            output.writestr(safe_name, item.text)
    return Response(
        content=archive.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="deepseek-ocr-results.zip"'},
    )


@app.post("/upload")
async def upload(file: UploadFile = File(...), mode: str = Form("markdown"), start_page: int = Form(1)):
    prompt = PROMPTS.get(mode, PROMPTS["markdown"])
    filename = (file.filename or "upload").lower()
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty upload")
    if not (filename.endswith(".pdf") or filename.endswith((".png", ".jpg", ".jpeg", ".bmp", ".webp"))):
        raise HTTPException(status_code=400, detail="Only PDF and image files are supported")

    async def stream():
        async with inference_lock:
            with tempfile.TemporaryDirectory(prefix="deepseek-ocr2-") as temp:
                workdir = Path(temp)
                try:
                    if filename.endswith(".pdf"):
                        document = fitz.open(stream=data, filetype="pdf")
                        total = len(document)
                        max_consecutive_failures = max(1, int(os.environ.get("MAX_CONSECUTIVE_PAGE_FAILURES", "5")))
                        consecutive_failures = 0
                        try:
                            for index, page in enumerate(document):
                                page_number = index + 1
                                if page_number < max(1, start_page):
                                    continue
                                image = None
                                inference_task = None
                                cancel_event = threading.Event()
                                try:
                                    pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                                    image = Image.open(io.BytesIO(pixmap.tobytes("png"))).copy()
                                    inference_started = time.monotonic()
                                    inference_task = asyncio.create_task(
                                        asyncio.to_thread(
                                            infer_page, image, workdir, page_number, prompt, cancel_event
                                        )
                                    )
                                    while not inference_task.done():
                                        done, _ = await asyncio.wait(
                                            {inference_task}, timeout=OCR_HEARTBEAT_INTERVAL_SECONDS
                                        )
                                        if inference_task not in done:
                                            yield json.dumps(
                                                {
                                                    "page": page_number,
                                                    "total": total,
                                                    "heartbeat": True,
                                                    "elapsed_seconds": round(time.monotonic() - inference_started),
                                                },
                                                ensure_ascii=False,
                                            ) + "\n"
                                    text, retried, repeat_score, retry_reason = await inference_task
                                    consecutive_failures = 0
                                except Exception as page_exc:
                                    consecutive_failures += 1
                                    yield json.dumps(
                                        {
                                            "page": page_number,
                                            "total": total,
                                            "error": f"Page {page_number} OCR failed: {page_exc}",
                                            "recoverable": consecutive_failures < max_consecutive_failures,
                                            "failed": True,
                                            "consecutive_failures": consecutive_failures,
                                        },
                                        ensure_ascii=False,
                                    ) + "\n"
                                    if consecutive_failures >= max_consecutive_failures:
                                        yield json.dumps(
                                            {
                                                "error": (
                                                    f"DeepSeek-OCR2 stopped after {consecutive_failures} consecutive "
                                                    f"page failures (last page: {page_number})"
                                                ),
                                                "recoverable": False,
                                                "page": page_number,
                                                "total": total,
                                            },
                                            ensure_ascii=False,
                                        ) + "\n"
                                        return
                                    continue
                                finally:
                                    if inference_task is not None and not inference_task.done():
                                        cancel_event.set()
                                    if image is not None:
                                        image.close()
                                payload = {
                                    "page": page_number,
                                    "total": total,
                                    "text": text,
                                    "clean_text": clean_output(text),
                                    "model": "DeepSeek-OCR-2",
                                    "retried": retried,
                                    "retry_reason": retry_reason,
                                    "repetition_score": round(repeat_score, 4),
                                    "quality_warning": repeat_score >= 0.24,
                                }
                                yield json.dumps(payload, ensure_ascii=False) + "\n"
                        finally:
                            document.close()
                    else:
                        image = Image.open(io.BytesIO(data)).copy()
                        inference_task = None
                        cancel_event = threading.Event()
                        try:
                            inference_started = time.monotonic()
                            inference_task = asyncio.create_task(
                                asyncio.to_thread(infer_page, image, workdir, 1, prompt, cancel_event)
                            )
                            while not inference_task.done():
                                done, _ = await asyncio.wait(
                                    {inference_task}, timeout=OCR_HEARTBEAT_INTERVAL_SECONDS
                                )
                                if inference_task not in done:
                                    yield json.dumps(
                                        {
                                            "page": 1,
                                            "total": 1,
                                            "heartbeat": True,
                                            "elapsed_seconds": round(time.monotonic() - inference_started),
                                        },
                                        ensure_ascii=False,
                                    ) + "\n"
                            text, retried, repeat_score, retry_reason = await inference_task
                        finally:
                            if inference_task is not None and not inference_task.done():
                                cancel_event.set()
                            image.close()
                        payload = {
                            "page": 1,
                            "total": 1,
                            "text": text,
                            "clean_text": clean_output(text),
                            "model": "DeepSeek-OCR-2",
                            "retried": retried,
                            "retry_reason": retry_reason,
                            "repetition_score": round(repeat_score, 4),
                            "quality_warning": repeat_score >= 0.24,
                        }
                        yield json.dumps(payload, ensure_ascii=False) + "\n"
                except Exception as exc:
                    yield json.dumps({"error": f"DeepSeek-OCR2 failed: {exc}"}, ensure_ascii=False) + "\n"

    return StreamingResponse(stream(), media_type="application/x-ndjson")
