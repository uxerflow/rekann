import { avatarColors } from '../shared/avatar-colors'

export function avatarInitials(name: string) {
  return (name.trim() || 'You')
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

export function initialAvatar(colorIndex: number, initials: string) {
  const color = avatarColors[colorIndex]
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 320
  const context = canvas.getContext('2d')!
  context.fillStyle = color.background
  context.fillRect(0, 0, 320, 320)
  context.fillStyle = color.foreground
  context.font = '500 120px Inter'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(initials, 160, 166)
  return canvas.toDataURL('image/png')
}
