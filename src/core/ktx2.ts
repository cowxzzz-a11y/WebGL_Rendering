import * as KTX2DECODER from '@babylonjs/ktx2decoder'
import { KhronosTextureContainer2 } from '@babylonjs/core/Misc/khronosTextureContainer2'
import mscBasisTranscoderJsUrl from '@babylonjs/ktx2decoder/wasm/msc_basis_transcoder.js?url'
import mscBasisTranscoderWasmUrl from '@babylonjs/ktx2decoder/wasm/msc_basis_transcoder.wasm?url'
import uastcAstcWasmUrl from '@babylonjs/ktx2decoder/wasm/uastc_astc.wasm?url'
import uastcBc7WasmUrl from '@babylonjs/ktx2decoder/wasm/uastc_bc7.wasm?url'
import uastcR8WasmUrl from '@babylonjs/ktx2decoder/wasm/uastc_r8_unorm.wasm?url'
import uastcRg8WasmUrl from '@babylonjs/ktx2decoder/wasm/uastc_rg8_unorm.wasm?url'
import uastcRgbaSrgbWasmUrl from '@babylonjs/ktx2decoder/wasm/uastc_rgba8_srgb_v2.wasm?url'
import uastcRgbaUnormWasmUrl from '@babylonjs/ktx2decoder/wasm/uastc_rgba8_unorm_v2.wasm?url'
import zstdWasmUrl from '@babylonjs/ktx2decoder/wasm/zstddec.wasm?url'

export const configureLocalKtx2Decoder = () => {
  KTX2DECODER.LiteTranscoder_UASTC_ASTC.WasmModuleURL = uastcAstcWasmUrl
  KTX2DECODER.LiteTranscoder_UASTC_BC7.WasmModuleURL = uastcBc7WasmUrl
  KTX2DECODER.LiteTranscoder_UASTC_R8_UNORM.WasmModuleURL = uastcR8WasmUrl
  KTX2DECODER.LiteTranscoder_UASTC_RG8_UNORM.WasmModuleURL = uastcRg8WasmUrl
  KTX2DECODER.LiteTranscoder_UASTC_RGBA_SRGB.WasmModuleURL = uastcRgbaSrgbWasmUrl
  KTX2DECODER.LiteTranscoder_UASTC_RGBA_UNORM.WasmModuleURL = uastcRgbaUnormWasmUrl
  KTX2DECODER.MSCTranscoder.JSModuleURL = mscBasisTranscoderJsUrl
  KTX2DECODER.MSCTranscoder.WasmModuleURL = mscBasisTranscoderWasmUrl
  KTX2DECODER.ZSTDDecoder.WasmModuleURL = zstdWasmUrl

  // Keep KTX2 decoding inside the app bundle instead of runtime CDN fetches.
  ;(globalThis as typeof globalThis & { KTX2DECODER?: typeof KTX2DECODER }).KTX2DECODER = KTX2DECODER
  KhronosTextureContainer2.DefaultNumWorkers = 0
}

