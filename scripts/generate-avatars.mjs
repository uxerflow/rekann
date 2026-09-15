import { createAvatar, palettes } from '@oreo-design/avatar'
import { mkdir, writeFile } from 'node:fs/promises'

await mkdir('public/avatars', { recursive: true })
const manifest = []
for (const palette of palettes) {
  for (const shape of ['silk', 'flare', 'nova', 'jade']) {
    const src = `/avatars/${shape}-${palette.id}.svg`
    const { svg } = createAvatar({
      shape,
      palette: palette.id,
      variantId: 'rekann',
      drift: 0,
      size: 320,
    })
    await writeFile(`public${src}`, svg)
    manifest.push({ src, name: `${shape[0].toUpperCase()}${shape.slice(1)} · ${palette.name}` })
  }
}
await writeFile('src/shared/avatar-gradients.json', JSON.stringify(manifest, null, 2) + '\n')
