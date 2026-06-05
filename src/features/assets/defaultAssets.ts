import type { DefaultModel, EnvironmentOption } from '../../shared/types'
import { preferredDefaultEnvironmentKey } from '../../shared/constants'

const defaultModelUrls = import.meta.glob<string>('../../../assets/target.glb', {
  eager: true,
  query: '?url',
  import: 'default',
})

export const defaultModels: DefaultModel[] = Object.entries(defaultModelUrls).map(([path, url]) => ({
  url,
  fileName: path.replace(/^.*\/assets\//, 'assets/'),
}))

const hdrEnvironmentUrls = import.meta.glob<string>('../../assets/hdr/*.hdr', {
  query: '?url',
  import: 'default',
})

export const hdrEnvironmentOptions: EnvironmentOption[] = Object.entries(hdrEnvironmentUrls)
  .map(([path, loadUrl]) => {
    const fileName = path.split('/').pop() ?? path

    return {
      key: fileName,
      label: fileName,
      loadUrl,
      resolvedUrl: null,
    }
  })
  .sort((a, b) => a.label.localeCompare(b.label, 'en'))

export const defaultEnvironmentKey =
  hdrEnvironmentOptions.find((option) => option.key === preferredDefaultEnvironmentKey)?.key ??
  hdrEnvironmentOptions[0]?.key ??
  null

