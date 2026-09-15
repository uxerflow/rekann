import { createAvatar } from '@oreo-design/avatar'
import { mkdir, writeFile } from 'node:fs/promises'

await mkdir('public/avatars', { recursive: true })
for (const [shape, palette] of Object.entries({
  silk: 'rose-milk',
  flare: 'peach-cream',
  nova: 'aurora-pink',
  jade: 'jade-cream',
})) {
  const { svg } = createAvatar({ shape, palette, variantId: 'rekann', drift: 0, size: 320 })
  await writeFile(`public/avatars/${shape}.svg`, svg)
}
