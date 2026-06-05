import type { AppDom } from '../../ui/dom'
import type { WindowWithQRCode } from '../../shared/types'

type ShareDom = Pick<
  AppDom,
  | 'shareActions'
  | 'shareWechatButton'
  | 'shareOverlay'
  | 'shareWechatGuide'
  | 'shareQrPopup'
  | 'shareQrCanvas'
  | 'shareQrClose'
>

type SetupWechatShareOptions = {
  dom: ShareDom
  showTemporaryStatus: (message: string) => void
}

let qrCodeScriptPromise: Promise<void> | null = null

const getShareData = (shareActions: HTMLElement) => ({
  url: shareActions.dataset.url || window.location.href,
  title: shareActions.dataset.title || document.title,
  desc: shareActions.dataset.desc || '',
})

const loadQRCodeScript = () => {
  const qrWindow = window as WindowWithQRCode

  if (qrWindow.qrcode) {
    return Promise.resolve()
  }

  qrCodeScriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')

    script.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('QR code script failed to load.'))
    document.head.append(script)
  })

  return qrCodeScriptPromise
}

const renderShareQRCode = (canvas: HTMLCanvasElement, text: string, size = 208) => {
  const qrFactory = (window as WindowWithQRCode).qrcode

  if (!qrFactory) {
    return
  }

  const qr = qrFactory(0, 'M')
  qr.addData(text)
  qr.make()

  const context = canvas.getContext('2d')

  if (!context) {
    return
  }

  const moduleCount = qr.getModuleCount()
  const cellSize = Math.floor(size / moduleCount)
  const canvasSize = cellSize * moduleCount

  canvas.width = canvasSize
  canvas.height = canvasSize
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvasSize, canvasSize)
  context.fillStyle = '#111111'

  for (let row = 0; row < moduleCount; row += 1) {
    for (let col = 0; col < moduleCount; col += 1) {
      if (qr.isDark(row, col)) {
        context.fillRect(col * cellSize, row * cellSize, cellSize, cellSize)
      }
    }
  }
}

const showShareOverlay = (dom: ShareDom, mode: 'guide' | 'qr') => {
  dom.shareWechatGuide.hidden = mode !== 'guide'
  dom.shareQrPopup.hidden = mode !== 'qr'
  dom.shareOverlay.classList.add('active')
}

const hideShareOverlay = (shareOverlay: HTMLDivElement) => {
  shareOverlay.classList.remove('active')
}

export const setupWechatShare = ({ dom, showTemporaryStatus }: SetupWechatShareOptions) => {
  const handleWechatShare = async () => {
    const { url } = getShareData(dom.shareActions)
    const isWeChat = /MicroMessenger/i.test(navigator.userAgent)

    if (isWeChat) {
      showShareOverlay(dom, 'guide')
      return
    }

    showShareOverlay(dom, 'qr')

    try {
      await loadQRCodeScript()
      renderShareQRCode(dom.shareQrCanvas, url)
    } catch (error) {
      console.error(error)
      showTemporaryStatus('二维码加载失败，已复制分享链接')
      await navigator.clipboard?.writeText(url)
    }
  }

  dom.shareWechatButton.addEventListener('click', handleWechatShare)
  dom.shareQrClose.addEventListener('click', () => hideShareOverlay(dom.shareOverlay))
  dom.shareOverlay.addEventListener('click', (event) => {
    if (
      event.target === dom.shareOverlay ||
      (event.target instanceof Element && event.target.closest('.share-wechat-guide'))
    ) {
      hideShareOverlay(dom.shareOverlay)
    }
  })
}

