type ModelImportControlsOptions = {
  glbImportInput: HTMLInputElement
  importButton: HTMLButtonElement
  importModePopup: HTMLDivElement
  loadModel: (file: File, fileName: string, replaceExisting: boolean) => Promise<void>
  showTemporaryStatus: (message: string) => void
  setStatus: (message: string | null) => void
}

export const setupModelImportControls = ({
  glbImportInput,
  importButton,
  importModePopup,
  loadModel,
  showTemporaryStatus,
  setStatus,
}: ModelImportControlsOptions) => {
  let importShouldReplace = false

  glbImportInput.addEventListener('change', () => {
    const file = glbImportInput.files?.[0]

    if (!file) {
      return
    }

    if (!/\.glb$/i.test(file.name)) {
      showTemporaryStatus('\u8bf7\u9009\u62e9 .glb \u6587\u4ef6')
      glbImportInput.value = ''
      return
    }

    const replaceExisting = importShouldReplace

    loadModel(file, file.name, replaceExisting)
      .then(() => {
        showTemporaryStatus(replaceExisting ? `${file.name} \u5df2\u66ff\u6362\u5bfc\u5165` : `${file.name} \u5df2\u5171\u5b58\u5bfc\u5165`)
      })
      .catch((error) => {
        console.error(error)
        setStatus(`\u5bfc\u5165 ${file.name} \u5931\u8d25`)
      })
      .finally(() => {
        glbImportInput.value = ''
      })
  })

  importButton.addEventListener('click', (event) => {
    event.stopPropagation()
    importModePopup.hidden = !importModePopup.hidden
  })

  importModePopup.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      importShouldReplace = button.dataset.mode === 'replace'
      importModePopup.hidden = true
      glbImportInput.value = ''
      glbImportInput.click()
    })
  })

  document.addEventListener('click', (event) => {
    if (!importButton.contains(event.target as Node) && !importModePopup.contains(event.target as Node)) {
      importModePopup.hidden = true
    }
  })
}
