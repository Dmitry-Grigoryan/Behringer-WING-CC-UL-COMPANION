import { icons, palette } from './icons.js'

const functionNames = {
  FDR: 'FADER', INS1: 'INSERT 1', INS2: 'INSERT 2', MGRP: 'GROUP MUTE',
  DCAMUTE: 'MUTE', FDRPAGE: 'FADER BANK', VIEWPAGE: 'VIEW BANK', SOF: 'SENDS ON FADER',
}
const activeColors = {
  MUTE: '#e91b36', DCAMUTE: '#e91b36', MGRP: '#e91b36', SOLO: '#ffda13',
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[char])
}

function label(text, x, y, size, color, { bold = false, align = 'start', maxWidth } = {}) {
  if (!text) return ''
  const chars = Array.from(String(text))
  if (maxWidth) {
    const estimate = chars.reduce((width, char) => width + (/[MWЖШМЩ]/.test(char) ? .85 : .59), 0)
    size = Math.min(size, maxWidth / estimate)
    if (size < 8) {
      size = 8
      const maxChars = Math.floor(maxWidth / (size * .65))
      if (chars.length > maxChars) text = chars.slice(0, maxChars - 1).join('') + '…'
    }
  }
  return '<text x="' + x + '" y="' + y + '" text-anchor="' + align + '" fill="' + color +
    '" font-family="Arial, sans-serif" font-size="' + size.toFixed(2) +
    '" font-weight="' + (bold ? 700 : 400) + '">' + escapeXml(text) + '</text>'
}

function encoderValue(data) {
  const level = data.display === '-oo' ? '−∞' : data.display
  if (data.mode === 'PAN') return data.value === 0 ? 'C' :
    (data.value < 0 ? 'L ' : 'R ') + Math.abs(data.value)
  if (data.mode === 'OTHER') return level + '%'
  return ['FX', 'SD A', 'SD B'].includes(data.mode) ? level : level + ' dB'
}

function card(kind, data, image) {
  const wide = kind === 'encoder'
  const aspect = image?.width / image?.height
  const width = wide ? Math.round(120 * (aspect >= 1.65 && aspect <= 3 ? aspect : 2)) : 120
  const mid = width / 2
  const channel = data?.channel
  const icon = icons[channel?.icon]
  const stripColor = '#' + (palette[channel?.color] ?? palette[0]).toString(16).padStart(6, '0')
  const active = kind !== 'encoder' && data?.target && data.value === 1
  const statusColor = active ? (activeColors[data.mode] ?? '#21bc5c') : '#000000'
  const ink = active ? '#070909' : '#f4f6f8'
  const value = data?.target && kind === 'encoder' ? encoderValue(data) : ''
  const title = channel?.name || (['OTHER', 'GPIO', 'SPILL', 'SCENES', 'SHOWCTL', 'USBPR', 'OFF']
    .includes(data?.mode) ? '' : data?.label) || ''
  const namedFunction = ['OTHER', 'GPIO', 'SPILL', 'SCENES', 'SHOWCTL', 'USBPR'].includes(data?.mode)
  const fn = data?.send ? 'SEND ' + data.send : data?.pg ||
    (namedFunction ? data.label : functionNames[data?.mode] ?? data?.mode ?? '—')
  const iconTag = icon ? '<svg x="' + (width - 30) + '" y="19" width="22" height="22" viewBox="0 0 ' +
    icon[0] + ' ' + icon[1] + '"><path d="' + icon[2] + '" fill="#f8fafc"/></svg>' : ''
  const bottom = value
    ? label(fn, wide ? 15 : 8, 91, 16, '#a9b2bd', { bold: true, maxWidth: width * .42 }) +
      label(value, width - (wide ? 14 : 8), 93, 24, ink, { bold: true, align: 'end', maxWidth: width * .47 })
    : label(fn, mid, 92, 20, ink, { bold: true, align: 'middle', maxWidth: width - 14 })
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    width + '" height="120" viewBox="0 0 ' + width + ' 120">' +
    '<rect width="' + width + '" height="120" fill="#1a1f25"/>' +
    '<rect width="' + width + '" height="8" fill="' + stripColor + '"/>' +
    '<rect y="51" width="' + width + '" height="69" fill="' + statusColor + '"/>' +
    '<path d="M0 51H' + width + '" stroke="#363d46"/>' +
    label(title, 9, 37, 18, '#f6f8fa', { bold: true, maxWidth: width - (icon ? 43 : 18) }) +
    iconTag + bottom + '</svg>'
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
}

export function controlStyle(kind, data, image) {
  return { text: '', bgcolor: 0x080a0c, png64: card(kind, data, image) }
}

export function presetAppearance(label) {
  return {
    canvas: { decoration: 'none', showStatusIcons: 'none' },
    elements: [
      { id: 'background', type: 'box', opacity: 100, color: 0x080a0c },
      { id: 'wing-icon', type: 'image', opacity: 100, base64Image: null, fillMode: 'fit', halign: 'center', valign: 'center' },
      { id: 'wing-label', type: 'text', opacity: 100, text: label, x: 4, y: 22, width: 92, height: 75,
        fontsize: 25, fontsizeAllowShrink: true, color: 0xffffff, halign: 'center', valign: 'center' },
    ],
  }
}
