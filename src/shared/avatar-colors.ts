// Avvvatars light backgrounds and solid accent palette, without shape artwork.
// https://github.com/nusu/avvvatars/blob/main/src/lib/colors.ts
// MIT attribution is preserved in THIRD_PARTY_NOTICES.md.
export const avatarColors = [
  'F7F9FC',
  'EEEDFD',
  'FFEBEE',
  'FDEFE2',
  'E7F9F3',
  'EDEEFD',
  'ECFAFE',
  'F2FFD1',
  'FFF7E0',
  'FDF1F7',
  'EAEFE6',
  'E0E6EB',
  'E4E2F3',
  'E6DFEC',
  'E2F4E8',
  'E6EBEF',
  'EBE6EF',
  'E8DEF6',
  'D8E8F3',
  'ECE1FE',
  '060A23',
  '5E36F5',
  'E11234',
  'E87917',
  '3EA884',
  '0618BC',
  '0FBBE6',
  '87B80A',
  'FFC933',
  'EE77AF',
  '69785E',
  '2D3A46',
  '280F6D',
  '37364F',
  '363548',
  '4D176E',
  'AB133E',
  '420790',
  '222A54',
  '192251',
].map((hex) => {
  const channels = hex.match(/../g)!.map((channel) => {
    const value = parseInt(channel, 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  return { background: `#${hex}`, foreground: luminance > 0.179 ? '#000000' : '#ffffff' }
})
