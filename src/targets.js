const stripTypes = [
  ['ch', 40], ['aux', 8], ['bus', 16], ['main', 4], ['mtx', 8],
]

function strip(value) {
  let index = Number(value)
  if (!Number.isInteger(index) || index < 1) return undefined
  for (const [name, count] of stripTypes) {
    if (index <= count) return '/' + name + '/' + index
    index -= count
  }
}

function sendPath(source, destination) {
  if (!source) return undefined
  const match = /^(BUS|MAIN|MTX)([1-9]\d*)$/.exec(destination)
  if (!match) return undefined
  const [, group, index] = match
  if (group === 'BUS' && Number(index) <= 16) return source + '/send/' + index + '/lvl'
  if (group === 'MAIN' && Number(index) <= 4) return source + '/main/' + index + '/lvl'
  if (group === 'MTX' && Number(index) <= 8) return source + '/send/MX' + index + '/lvl'
}

const stripParameters = {
  MUTE: 'mute', SOLO: '$solo', INS1: 'preins/on', INS2: 'postins/on', FDR: 'fdr', PAN: 'pan',
}
const modeFields = {
  MUTE: ['ch'], SOLO: ['ch'], INS1: ['ch'], INS2: ['ch'], MGRP: ['mgrp'], DCAMUTE: ['dca'],
  FDR: ['ch'], PAN: ['ch'], DCA: ['dca'], FSND: ['ch', 'send'], SSND: ['send'],
  SPILL: ['area', 'tgt'], SHOWCTL: ['action'], SCENES: ['tag'], GPIO: ['gpio'],
  FX: ['fx', 'par'], FXPAR: ['fx', 'par'], MON: ['mon'], OTHER: ['other'], SOF: ['ch'],
  CHPAGE: ['ch', 'pg'], PAGE: ['pg'], FDRPAGE: ['area', 'bank'], USBPR: ['usbpr'], SDRECA: ['sdrec'], SDRECB: ['sdrec'],
  SESSIONA: ['session'], SESSIONB: ['session'], MARKERA: ['marker'], MARKERB: ['marker'],
  'SD A': ['sdarec'], 'SD B': ['sdbrec'],
}
export function assignmentFields(mode) {
  return Object.hasOwn(modeFields, mode) ? modeFields[mode] : []
}

const otherToggles = {
  TBA: '/cfg/talk/A/$on', TBB: '/cfg/talk/B/$on', ALTSRC: '/io/altsw', DAWSW: '/$ctl/daw/on',
  MONDIM: '/cfg/solo/$dim', MONMONO: '/cfg/solo/$mono', MONSWAP: '/cfg/solo/$flip', MONMUTE: '/cfg/solo/mute',
  AUTOX: '/cfg/amix/x', AUTOY: '/cfg/amix/y',
}
const faderSnaps = { FDROFF: -144, 'FDR-10DB': -10, FDR0DB: 0 }
export function faderSnap(assignment) {
  return assignment.mode === 'OTHER' && Object.hasOwn(faderSnaps, assignment.other)
    ? faderSnaps[assignment.other] : undefined
}

export async function resolveTarget(wing, assignment, selectedStrip) {
  const { mode, ch, dca, mgrp, send, fx, par, mon, other } = assignment
  const source = strip(ch)
  if (source && Object.hasOwn(stripParameters, mode)) return source + '/' + stripParameters[mode]
  if (mode === 'MGRP') {
    const node = await wing.groupPath('mgrp', mgrp, 8)
    if (node) return node + '/mute'
  }
  if (mode === 'DCAMUTE' || mode === 'DCA') {
    const node = await wing.groupPath('dca', dca, 16)
    if (node) return node + (mode === 'DCA' ? '/fdr' : '/mute')
  }
  if (mode === 'FX' || mode === 'FXPAR') {
    const match = /^FX([1-9]|1[0-6])$/.exec(fx)
    const parameter = Number(par)
    if (match && Number.isInteger(parameter) && parameter >= 1 && parameter <= 41) {
      return '/fx/' + match[1] + '/' + (parameter === 41 ? 'fxmix' : parameter)
    }
  }
  if (mode === 'MON' && (mon === 'A' || mon === 'B')) {
    return '/cfg/mon/' + (mon === 'A' ? 1 : 2) + '/$lvl'
  }
  if (mode === 'OTHER' && Object.hasOwn(lights, other)) return '/$ctl/cfg/lights/' + lights[other]
  if (mode === 'OTHER' && Object.hasOwn(otherToggles, other)) return otherToggles[other]
  if (mode === 'GPIO' && /^[A-D]$/.test(assignment.gpio)) {
    return '/$ctl/gpio/' + (assignment.gpio.charCodeAt(0) - 64) + '/gpstate'
  }
  if (faderSnap(assignment) !== undefined) {
    const [selected] = await (selectedStrip ?? wing.request('/$ctl/$stat/selidx'))
    const node = strip(selected)
    if (node) return node + '/fdr'
  }
  if (mode === 'SOF' && source) return '/$ctl/$stat/sof'
  const recorder = recorderEncoder(assignment)
  if (recorder) return recorder.target
  if (mode === 'FSND') return sendPath(source, send)
  if (mode === 'SSND') {
    const [selected] = await (selectedStrip ?? wing.request('/$ctl/$stat/selidx'))
    return sendPath(strip(selected), send)
  }
}

const lights = { BRILAMP: 'lamp', BRIGLOW: 'glow', BRIPATCH: 'patch' }
const usbCommands = {
  PSTOP: ['play', 'STOP'], PLAY: ['play', 'PLAY'], PPAUSE: ['play', 'PAUSE'], PPLST: ['play', 'PLAY', 'STOP'], PPLPS: ['play', 'PLAY', 'PAUSE'],
  PNEXT: ['play', 'NEXT'], PPREV: ['play', 'PREV'],
  RSTOP: ['rec', 'STOP'], RECORD: ['rec', 'REC'], RPAUSE: ['rec', 'PAUSE'],
  RNEW: ['rec', 'NEWFILE'],
}

// Observed on the WING Compact by opening the corresponding screen on the console.
const confirmedPageIds = { 'PAGE:FX': 14, 'CHPAGE:EQ': 4 }

const isArea = (area) => /^(L|C|R|CMPCT|RCK|EXT|VRT)$/.test(area)
const spillGroups = { DCA: [0, 16], FX: [16, 16], BUS: [32, 16], MTX: [48, 8], MAIN: [56, 4] }
function spillIndex(target) {
  if (target === 'AUTOX') return 61
  if (target === 'AUTOY') return 62
  const match = /^(DCA|FX|BUS|MTX|MAIN)([1-9]\d*)$/.exec(target)
  if (!match) return undefined
  const [, group, index] = match
  const [offset, max] = spillGroups[group]
  if (Number(index) <= max) return offset + Number(index)
}

export function buttonCommand(assignment) {
  if (assignment.mode === 'PAGE' || assignment.mode === 'CHPAGE') {
    const index = confirmedPageIds[assignment.mode + ':' + assignment.pg]
    const channel = assignment.mode === 'CHPAGE' ? Number(assignment.ch) : undefined
    if (!Number.isInteger(index) || index < 0 || index > 30 ||
        (assignment.mode === 'CHPAGE' && !strip(channel))) return
    const path = '/$ctl/$stat/pageidx'
    return { path, status: path, value: index, page: true, channel }
  }
  const { mode, usbpr, sdrec, area, session, marker } = assignment
  if (mode === 'FDRPAGE') return bankSelection(assignment)
  if (mode === 'OTHER' && ['CHPREV', 'CHNEXT'].includes(assignment.other)) {
    const path = '/$ctl/$stat/selidx'
    return { path, delta: assignment.other === 'CHPREV' ? -1 : 1 }
  }
  if (mode === 'SPILL' && isArea(area)) {
    const value = spillIndex(assignment.tgt)
    if (value !== undefined) {
      const path = '/$ctl/layer/' + area + '/spidx'
      return { path, status: path, value, toggle: 0 }
    }
  }
  if (mode === 'SHOWCTL' && ['GO', 'PREV', 'NEXT', 'GOPREV', 'GONEXT'].includes(assignment.action)) {
    return { path: '/$ctl/lib/$action', value: assignment.action }
  }
  if (mode === 'SCENES' && /^(?:[1-9]|[1-9][0-9]|1[01][0-9]|12[0-8])$/.test(assignment.tag)) {
    return { path: '/$ctl/lib/$action', value: 'GOTAG', tag: Number(assignment.tag),
      status: '/$ctl/lib/$activeid' }
  }
  if (mode === 'OTHER' && ['MONA', 'MONB', 'MONAB'].includes(assignment.other)) {
    const path = '/cfg/solo/mon'
    return { path, status: path, value: { MONA: 'PH', MONB: 'SPK', MONAB: 'PH+SPK' }[assignment.other] }
  }
  if (mode === 'USBPR' && Object.hasOwn(usbCommands, usbpr)) {
    const [node, value, toggle] = usbCommands[usbpr]
    return { path: '/' + node + '/$action', value, toggle,
      status: '/' + node + '/$actstate' }
  }
  const card = mode.endsWith('A') ? 1 : 2
  const node = '/cards/wlive/' + card
  if (mode === 'SDRECA' || mode === 'SDRECB') {
    if (['STOP', 'PLAY', 'PAUSE', 'PPAUSE', 'REC', 'PLAYSTOP', 'PLAYPAUSE', 'ADD'].includes(sdrec)) {
      if (sdrec === 'ADD') return { path: node + '/$ctl/setmarker', value: '1' }
      const toggle = sdrec === 'PLAYSTOP' ? 'STOP' : sdrec === 'PLAYPAUSE' ? 'PPAUSE' : undefined
      return { path: node + '/$ctl/control', status: node + '/$stat/state',
        value: toggle ? 'PLAY' : sdrec === 'PAUSE' ? 'PPAUSE' : sdrec, toggle }
    }
  }
  if ((mode === 'SESSIONA' || mode === 'SESSIONB') && /^S([1-9]|[1-9][0-9]|100)$/.test(session)) {
    return { path: node + '/$ctl/opensession', value: session.slice(1), status: node + '/$stat/sessionpos' }
  }
  if ((mode === 'MARKERA' || mode === 'MARKERB') && marker === 'M0') {
    return { path: node + '/$ctl/stime', value: '0', seek: true }
  }
  if ((mode === 'MARKERA' || mode === 'MARKERB') && /^M([1-9]|[1-9][0-9]|100)$/.test(marker)) {
    return { path: node + '/$ctl/gotomarker', value: marker.slice(1), status: node + '/$stat/markerpos' }
  }
}

export function recorderEncoder({ mode, sdarec, sdbrec }) {
  if (mode !== 'SD A' && mode !== 'SD B') return
  const card = mode === 'SD A' ? '/cards/wlive/1' : '/cards/wlive/2'
  const field = mode === 'SD A' ? sdarec : sdbrec
  const fields = {
    POS: ['etime', 'stime', 'sessionlen', 1000, 0],
    MARKER: ['markerpos', 'gotomarker', 'markers', 1, 1],
    SESSION: ['sessionpos', 'opensession', 'sessions', 1, 1],
  }
  if (!Object.hasOwn(fields, field)) return
  const [target, control, max, scale, min] = fields[field]
  return { target: card + '/$stat/' + target, path: card + '/$ctl/' + control,
    max: card + '/$stat/' + max, scale, min }
}

export function channelPath(target, assignment) {
  return /^\/(?:ch|aux|bus|main|mtx|dca|mgrp)\/\d+(?=\/)/.exec(target)?.[0] ??
    (['SOF', 'CHPAGE'].includes(assignment.mode) ? strip(assignment.ch) : undefined)
}

function bankSelection({ area, bank }) {
  if (!isArea(area) || !/^(?:[1-9]|1[0-9]|2[0-2])$/.test(bank)) return
  const path = '/$ctl/layer/' + area + '/sel'
  return { path, status: path, value: bank }
}

export function sdButtonNavigation({ mode, sdrec }) {
  if (mode !== 'SDRECA' && mode !== 'SDRECB') return
  const session = ['PREV_S', 'NEXT_S'].includes(sdrec)
  const marker = ['PREV', 'NEXT', 'GOMARKER', 'PLAYMARKER'].includes(sdrec)
  if (!session && !marker) return
  const node = '/cards/wlive/' + (mode === 'SDRECA' ? 1 : 2)
  const delta = ['PREV', 'PREV_S'].includes(sdrec) ? -1 :
    ['NEXT', 'NEXT_S'].includes(sdrec) ? 1 : 0
  return {
    position: node + '/$stat/' + (session ? 'sessionpos' : 'markerpos'),
    limit: node + '/$stat/' + (session ? 'sessions' : 'markers'),
    command: node + '/$ctl/' + (session ? 'opensession' : 'gotomarker'),
    play: sdrec === 'PLAYMARKER' ? node + '/$ctl/control' : undefined,
    delta,
  }
}

export function gpioPush(assignment) {
  if (assignment.mode === 'GPIO' && /^[A-D]-P$/.test(assignment.gpio)) {
    return '/$ctl/gpio/' + (assignment.gpio.charCodeAt(0) - 64) + '/gpstate'
  }
}
