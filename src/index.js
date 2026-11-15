import { InstanceBase, InstanceStatus } from '@companion-module/base'
import { Wing } from './wing.js'
import { discoverWing } from './discovery.js'
import { encoderPageCommands, navigatePage } from './navigation.js'
import { Rotation } from './rotation.js'
import { controlStyle, presetAppearance } from './appearance.js'
import { buttonCommand, channelPath, faderSnap, gpioPush, resolveTarget } from './targets.js'

const kinds = { button: 8, encoder: 4, user: 4 }
const stateInterval = 100
const assignmentInterval = 750
const defaultStep = 5
const choices = (count) => Array.from({ length: count }, (_, i) => ({ id: i + 1, label: String(i + 1) }))
const optionsFor = (kind) => [
  { type: 'dropdown', id: 'layer', label: kind === 'user' ? 'User page' : 'Layer', default: 1, choices: choices(kind === 'user' ? 4 : 16) },
  { type: 'dropdown', id: 'slot', label: kind === 'encoder' ? 'Encoder' : 'Button', default: 1, choices: choices(kinds[kind]) },
]
const keyFor = (kind, layer, slot) => [kind, layer, slot].join(':')
const stepOption = { type: 'number', id: 'step', label: 'Step (parameter units)', min: 0.1, max: 6, default: defaultStep, step: 0.1 }

export default class WingUserLayer extends InstanceBase {
  subscriptions = new Map()
  state = new Map()
  channelInfo = new Map()
  commands = Promise.resolve()
  heldGpio = new Map()
  generation = 0

  getConfigFields() {
    const detected = this.detectedConsoles?.map(({ host, name }) => (name ? name + ' · ' : '') + host)
    return [
      { type: 'textinput', id: 'host', label: 'WING IP address', width: 8, default: '',
        tooltip: 'Enter the console IP address, or leave blank to discover a single WING on this network.' },
      { type: 'number', id: 'companionTcpPort', label: 'Companion TCP Remote Control port', width: 4,
        min: 1, max: 65535, default: 16759 },
      { type: 'static-text', id: 'discovery', label: 'Discovery', width: 12,
        value: detected?.length ? detected.join(' / ') : 'Leave the IP field blank for automatic discovery.' },
    ]
  }

  async init(config) {
    this.setActionDefinitions({
      button: this.action('button', 'Press Custom Controls button', 0),
      button_hold: this.action('button', 'Press Custom Controls button with GPIO Push', 0, true),
      button_release: this.releaseAction('button', 'Release Custom Controls GPIO Push'),
      user_hold: this.action('user', 'Press User Layer button', 0, true),
      user_release: this.releaseAction('user', 'Release User Layer GPIO Push'),
      encoder_page: {
        name: 'Navigate Companion pages on encoder press',
        options: optionsFor('encoder'),
        callback: ({ surfaceId, options }) => navigatePage(surfaceId, Number(options.slot), this.companionTcpPort)
          .catch((error) => this.log('warn', error.message)),
      },
      left: this.action('encoder', 'Rotate Custom Controls encoder left', -1),
      right: this.action('encoder', 'Rotate Custom Controls encoder right', 1),
    })
    this.setFeedbackDefinitions({
      button: this.feedback('button'),
      user: this.feedback('user'),
      encoder: this.feedback('encoder'),
    })
    const { sections, presets } = this.presets()
    this.setPresetDefinitions(sections, presets)
    await this.configUpdated(config)
  }

  async configUpdated(config) {
    await this.destroy()
    this.detectedConsoles = []
    this.companionTcpPort = Number(config.companionTcpPort ?? 16759)
    await this.connect(config.host?.trim(), this.generation)
  }

  async connect(host, generation) {
    if (generation !== this.generation) return
    if (!host) {
      this.updateStatus(InstanceStatus.Connecting, 'Searching for WING consoles')
      try {
        const detected = await discoverWing()
        if (generation !== this.generation) return
        this.detectedConsoles = detected
      } catch (error) {
        if (generation !== this.generation) return
        this.log('warn', 'WING discovery: ' + error.message)
      }
      if (this.detectedConsoles.length !== 1) {
        const multiple = this.detectedConsoles.length > 1
        const message = multiple
          ? 'Multiple WING consoles found. Enter the IP address: ' + this.detectedConsoles.map(({ host }) => host).join(', ')
          : 'No WING found. Enter the IP address or check the network.'
        this.updateStatus(multiple ? InstanceStatus.BadConfig : InstanceStatus.ConnectionFailure, message)
        if (!multiple) this.timer = setTimeout(() => void this.connect(undefined, generation), 5000)
        return
      }
      host = this.detectedConsoles[0].host
      this.log('info', 'Discovered WING at ' + host)
    }
    const wing = new Wing(host)
    this.wing = wing
    this.rotation = new Rotation(async (layer, slot, delta, fresh) => {
      const result = await wing.apply('encoder', layer, slot, 1, delta, fresh)
      this.publishResult(wing, 'encoder', result)
    }, (error) => this.log('warn', error.message))
    this.lastPollStatus = undefined
    this.updateStatus(InstanceStatus.Connecting)
    await this.poll(generation)
  }

  async destroy() {
    this.generation++
    clearTimeout(this.timer)
    this.rotation?.stop()
    const wing = this.wing
    this.wing = undefined
    const outputs = new Set(this.heldGpio.values())
    this.heldGpio.clear()
    if (wing) {
      await Promise.allSettled([...outputs].map((path) => wing.setInteger(path, 0)))
    }
    this.state.clear()
    this.channelInfo.clear()
    this.checkFeedbacks('button', 'encoder', 'user')
  }

  releaseAction(kind, name) {
    return {
      name,
      options: optionsFor(kind),
      callback: (event) => this.queueButton((wing) =>
        this.releaseGpio(wing, this.gpioKey(kind, event))),
    }
  }

  gpioKey(kind, event) {
    const { layer, slot } = event.options
    return JSON.stringify([kind, event.surfaceId, event.controlId, Number(layer), Number(slot)])
  }

  queueButton(callback) {
    const wing = this.wing
    this.commands = this.commands.then(async () => {
      if (wing && wing === this.wing) await callback(wing)
    }).catch((error) => this.log('warn', error.message))
    return this.commands
  }

  async releaseGpio(wing, key) {
    const path = this.heldGpio.get(key)
    if (!path) return
    if ([...this.heldGpio].some(([other, output]) => other !== key && output === path)) {
      this.heldGpio.delete(key)
    } else {
      await wing.setInteger(path, 0)
      this.heldGpio.delete(key)
    }
  }

  action(kind, name, direction, allowHold = false) {
    return {
      name,
      options: kind === 'encoder' ? [...optionsFor(kind), stepOption] : optionsFor(kind),
      callback: (event) => {
        const { layer, slot, step = defaultStep } = event.options
        if (kind === 'encoder') {
          this.rotation?.add(Number(layer), Number(slot), direction * Number(step))
          return
        }

        return this.queueButton(async (wing) => {
          if (allowHold) {
            const assignment = await wing.readAssignment(kind, Number(layer), Number(slot), false)
            const output = gpioPush(assignment)
            if (output) {
              const fresh = wing === this.wing
              if (!fresh) return
              const key = this.gpioKey(kind, event)
              this.heldGpio.set(key, output)
              await wing.setInteger(output, 1)
              if (wing !== this.wing) await wing.setInteger(output, 0)
              return
            }
          }
          const result = await wing.apply(kind, Number(layer), Number(slot), direction, Number(step))
          this.publishResult(wing, kind, result)
        })
      },
    }
  }

  publishResult(wing, kind, result) {
    if (!result || wing !== this.wing) return
    for (const [key, data] of this.state) {
      if (key.startsWith(kind + ':') && data.target === result.target &&
          data.mode !== 'SOF' && faderSnap(data) === undefined && !buttonCommand(data)) {
        this.state.set(key, { ...data, ...result })
      }
    }
    this.checkFeedbacks(kind)
  }

  feedback(kind) {
    return {
      type: 'advanced',
      name: {
        button: 'Button assignment and state',
        encoder: 'Encoder assignment and value',
        user: 'User Layer button assignment and state',
      }[kind],
      options: optionsFor(kind),
      unsubscribe: ({ id }) => this.subscriptions.delete(id),
      affectedProperties: ['text', 'bgcolor', 'png64'],
      callback: ({ id, options, image }) => {
        const slot = [kind, Number(options.layer), Number(options.slot)]
        this.subscriptions.set(id, slot)
        return controlStyle(kind, this.state.get(keyFor(...slot)), image)
      },
    }
  }

  getChannelInfo(wing, path, now) {
    const previous = this.channelInfo.get(path)
    if (previous && previous.expires > now) return previous.info
    const info = wing.readChannelInfo(path).catch(() => undefined)
    this.channelInfo.set(path, { expires: now + assignmentInterval, info })
    return info
  }

  async poll(generation) {
    if (generation !== this.generation || !this.wing) return
    const wing = this.wing
    const requested = new Map()
    for (const slot of this.subscriptions.values()) requested.set(keyFor(...slot), slot)
    for (const key of this.state.keys()) if (!requested.has(key)) this.state.delete(key)

    if (!requested.size) requested.set('probe', ['button', 1, 1])
    const entries = [...requested]
    const requests = new Map()
    let selectedStrip
    const now = Date.now()
    let connected = false
    let changed = false
    for (let i = 0; i < entries.length; i += 12) {
      const batch = entries.slice(i, i + 12).map(([key, slot]) => [key, slot, this.state.get(key)])
      const results = await Promise.allSettled(batch.map(async ([, slot, previous]) => {
        const stale = !previous || now >= previous.nextAssignment
        const assignment = stale
          ? { ...await wing.readAssignment(...slot), nextAssignment: now + assignmentInterval }
          : previous
        if (assignment.mode === 'SSND' || faderSnap(assignment) !== undefined) selectedStrip ??= wing.request('/$ctl/$stat/selidx')
        const command = buttonCommand(assignment)
        const target = command ? command.status :
          gpioPush(assignment) ?? await resolveTarget(wing, assignment, selectedStrip)
        const channelNode = channelPath(target, assignment)
        const channelRead = channelNode ? this.getChannelInfo(wing, channelNode, now) : undefined
        if (!target) return { ...assignment, target: undefined, display: undefined,
          value: undefined, channel: await channelRead }

        const readKey = command || assignment.mode === 'SOF' || faderSnap(assignment) !== undefined
          ? [target, command?.tag ?? command?.value ?? faderSnap(assignment) ?? assignment.ch, command?.channel].join(':')
          : target
        if (!requests.has(readKey)) requests.set(readKey, wing.readControl(target, assignment))
        try {
          const [state, channel] = await Promise.all([requests.get(readKey), channelRead])
          return { ...assignment, target, ...state, channel }
        } catch {
          // Some strip types do not expose particular send or toggle parameters.
          return { ...assignment, target: undefined, display: undefined, value: undefined, channel: await channelRead }
        }
      }))
      if (generation !== this.generation) return
      results.forEach((result, index) => {
        const [key, , previous] = batch[index]
        if (result.status === 'fulfilled') connected = true
        if (key === 'probe' || previous !== this.state.get(key)) return
        if (result.status === 'fulfilled') {
          const data = result.value
          this.state.set(key, data)
          changed ||= !previous || previous.label !== data.label || previous.target !== data.target ||
            previous.channel?.name !== data.channel?.name || previous.channel?.color !== data.channel?.color ||
            previous.channel?.icon !== data.channel?.icon || previous.channel?.number !== data.channel?.number ||
            previous.channel?.group !== data.channel?.group || previous.mode !== data.mode || previous.display !== data.display || previous.value !== data.value
        } else if (previous) {
          this.state.delete(key)
          changed = true
        }
      })
    }
    const status = connected ? InstanceStatus.Ok : InstanceStatus.ConnectionFailure
    if (this.lastPollStatus !== status) {
      this.lastPollStatus = status
      this.updateStatus(status)
    }
    if (changed) this.checkFeedbacks('button', 'encoder', 'user')
    const delay = connected && !requested.has('probe') ? stateInterval : assignmentInterval
    this.timer = setTimeout(() => void this.poll(generation), delay)
  }

  presets() {
    const presets = {}
    const custom = { id: 'custom-controls', name: 'CUSTOM CONTROLS', definitions: [] }
    const user = { id: 'user-layer', name: 'USER LAYER', definitions: [] }
    const add = (definitions, kind, layer) => {
      for (let slot = 1; slot <= kinds[kind]; slot++) {
        const id = keyFor(kind, layer, slot)
        definitions.push(id)
        presets[id] = this.controlPreset(kind, layer, slot)
      }
    }

    for (let layer = 1; layer <= 16; layer++) {
      const group = { id: 'layer-' + layer, name: 'Layer ' + layer, type: 'simple', presets: [] }
      add(group.presets, 'button', layer)
      add(group.presets, 'encoder', layer)
      custom.definitions.push(group)
    }
    for (let page = 1; page <= 4; page++) add(user.definitions, 'user', page)
    return { sections: [custom, user], presets }
  }

  controlPreset(kind, layer, slot) {
    const options = { layer, slot }
    const encoder = kind === 'encoder'
    const action = kind === 'user' ? 'user' : 'button'
    const label = kind === 'user' ? 'U' + layer + ' · Button ' + slot :
      (encoder ? 'Encoder ' : 'Button ') + slot
    const down = encoder
      ? (encoderPageCommands[slot] ? [{ actionId: 'encoder_page', options }] : [])
      : [{ actionId: action + '_hold', options }]
    return {
      type: 'layered',
      name: label,
      ...presetAppearance(label),
      steps: [{
        down,
        up: encoder ? [] : [{ actionId: action + '_release', options }],
        ...(encoder ? {
          rotate_left: [{ actionId: 'left', options: { ...options, step: defaultStep } }],
          rotate_right: [{ actionId: 'right', options: { ...options, step: defaultStep } }],
        } : {}),
      }],
      feedbacks: [{
        feedbackId: kind,
        options,
        styleOverrides: [
          { elementId: 'background', elementProperty: 'color', override: { value: 'bgcolor', isExpression: false } },
          { elementId: 'wing-icon', elementProperty: 'base64Image', override: { value: 'png64', isExpression: false } },
          { elementId: 'wing-label', elementProperty: 'text', override: { value: 'text', isExpression: false } },
        ],
      }],
    }
  }
}
