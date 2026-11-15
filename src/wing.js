import dgram from 'node:dgram'
import { assignmentFields, buttonCommand, faderSnap, recorderEncoder, resolveTarget, sdButtonNavigation } from './targets.js'

function oscString(text) {
  const bytes = Buffer.from(text)
  return Buffer.concat([bytes, Buffer.alloc(4 - bytes.length % 4)])
}

function oscReply(packet) {
  let offset = 0
  const readString = () => {
    const end = packet.indexOf(0, offset)
    if (end < 0) throw Error('Invalid OSC string')
    const text = packet.toString('utf8', offset, end)
    offset = (end + 4) & ~3
    return text
  }
  const address = readString()
  const types = readString()
  const values = []
  for (const type of types.slice(1)) {
    if (type === 's') values.push(readString())
    else if (type === 'i' || type === 'f') {
      values.push(type === 'i' ? packet.readInt32BE(offset) : packet.readFloatBE(offset))
      offset += 4
    } else throw Error('Unexpected OSC argument type')
  }
  return { address, values }
}

export class Wing {
  groupNames = new Map()

  constructor(host, port = 2223) {
    this.host = host
    this.port = port
  }

  async groupPath(group, value, count) {
    if (typeof value !== 'string') return
    const explicit = new RegExp('^' + group.toUpperCase() + '\\.([1-9][0-9]*)$').exec(value)
    if (explicit && Number(explicit[1]) <= count) return '/' + group + '/' + explicit[1]
    if (!value.trim()) return

    const now = performance.now()
    let names = this.groupNames.get(group)
    if (!names || names.expires <= now) {
      const info = Promise.all(Array.from({ length: count }, async (_, i) => {
        const [name] = await this.request('/' + group + '/' + (i + 1) + '/name')
        return name
      }))
      names = { expires: now + 750, info }
      this.groupNames.set(group, names)
    }
    const found = (await names.info).flatMap((name, i) => name === value ? [i + 1] : [])
    if (found.length === 1) return '/' + group + '/' + found[0]
  }

  request(path, command, expected = command === undefined ? path : path + '*') {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4')
      const packet = command === undefined ? oscString(path) :
        Buffer.concat([oscString(path), oscString(',s'), oscString(command)])
      let finished = false
      const finish = (error, values) => {
        if (finished) return
        finished = true
        clearTimeout(timer)
        socket.close()
        if (error) reject(error)
        else resolve(values)
      }
      const timer = setTimeout(() => finish(Error('No response from WING: ' + path)), 500)
      socket.on('error', finish)
      socket.on('message', (data) => {
        try {
          const reply = oscReply(data)
          const matches = Array.isArray(expected) ? expected.includes(reply.address) : reply.address === expected
          if (matches) finish(null, reply.values)
        } catch (error) {
          finish(error)
        }
      })
      socket.connect(this.port, this.host, () => socket.send(packet, (error) => {
        if (error) finish(error)
      }))
    })
  }

  async readAssignment(kind, layer, slot, includeLabel = true) {
    const branch = kind === 'encoder' ? 'enc' : kind === 'user' || slot <= 4 ? 'bu' : 'bd'
    const position = (slot - 1) % 4 + 1
    const path = '/$ctl/user/' + (kind === 'user' ? 'U' : '') + layer + '/' + position + '/' + branch
    const [mode] = await this.request(path + '/mode')
    if (mode === 'OFF') return { mode, label: 'OFF' }

    const fields = assignmentFields(mode)
    const [name, defaultName, ...values] = await Promise.all([
      includeLabel ? this.request(path + '/name') : [],
      includeLabel ? this.request(path + '/$fname') : [],
      ...fields.map((field) => this.request(path + '/' + field)),
    ])
    const label = String(name[0] || defaultName[0] || mode).replace(/^[|*]+/, '')
    const parameters = Object.fromEntries(fields.map((field, index) => [field, values[index][0]]))
    return { mode, label, ...parameters }
  }

  async readChannelInfo(path) {
    const effective = /^\/(ch|aux|bus|main|mtx)\//.test(path)
    const fields = path.startsWith('/mgrp/') ? ['name'] : ['name', 'col', 'icon']
    const values = await Promise.all(fields.map(async (field) => {
      const request = (key) => this.request(path + '/' + key).then(([value]) => value).catch(() => undefined)
      return effective ? await request('$' + field) ?? await request(field) : await request(field)
    }))
    const [name, color, icon] = values
    const [, group, index] = path.split('/')
    return { group, number: index, name: name?.trim() || group.toUpperCase() + ' ' + index, color: color === undefined ? undefined : Number(color), icon: icon === undefined ? undefined : Number(icon) }
  }

  async readParameter(path) {
    const [display, , value] = await this.request(path)
    return { display, value }
  }

  async writeParameter(target, value) {
    const separator = target.lastIndexOf('/')
    const node = target.slice(0, separator)
    const [reply] = await this.request(node, target.slice(separator + 1) + '=' + value, [node + '*', '/*'])
    if (reply !== 'OK') throw Error('WING: ' + reply)
  }

  async setInteger(path, value) {
    const socket = dgram.createSocket('udp4')
    try {
      const argument = Buffer.alloc(4)
      argument.writeInt32BE(value)
      const packet = Buffer.concat([oscString(path), oscString(',i'), argument])
      await new Promise((resolve, reject) =>
        socket.send(packet, this.port, this.host, (error) => error ? reject(error) : resolve()))
    } finally {
      socket.close()
    }
  }

  async readControl(target, assignment) {
    const current = await this.readParameter(target)
    const command = buttonCommand(assignment)
    if (command) {
      const [selected] = command.channel ? await this.request('/$ctl/$stat/selidx') : []
      return { ...current, value: Number(current.display === String(command.tag ?? command.value) &&
        (!command.channel || Number(selected) === command.channel)) }
    }
    const snap = faderSnap(assignment)
    if (snap !== undefined) return { ...current, value: Number(Math.abs(current.value - snap) < 0.05) }
    if (assignment.mode === 'SOF') return { ...current, value: Number(current.display === String(assignment.ch)) }
    return current
  }

  async fxParameter(target) {
    const node = target.slice(0, target.lastIndexOf('/'))
    const index = target.slice(node.length + 1)
    const [description] = await this.request(node, '?', node)
    const fields = description.split('\n').map((line) => /^\s*(\S+)\s+(int|lin|log|list)\s+\[(.*?)\]/.exec(line))
      .filter(Boolean)
    // WING's numeric FX aliases count effect-specific fields, excluding the slot's fixed metadata.
    const parameters = fields.filter(([, name]) => name !== 'mdl' && name !== 'fxmix' && !name.startsWith('$'))
    const field = index === 'fxmix' ? fields.find(([, name]) => name === 'fxmix') : parameters[Number(index) - 1]
    if (!field || field[2] === 'list') return
    const limits = /^([+-]?\d+(?:\.\d+)?)\s*\.\.\s*([+-]?\d+(?:\.\d+)?)/.exec(field[3])
    if (limits) return { path: node + '/' + field[1], min: Number(limits[1]), max: Number(limits[2]) }
  }

  async apply(kind, layer, slot, direction, step, fresh = () => true) {
    const assignment = await this.readAssignment(kind, layer, slot, false)
    const navigation = kind !== 'encoder' ? sdButtonNavigation(assignment) : undefined
    if (navigation) {
      const [{ value: current }, { value: limit }] = await Promise.all([
        this.readParameter(navigation.position), this.readParameter(navigation.limit),
      ])
      if (!Number.isInteger(current) || !Number.isInteger(limit) || limit < 1 || !fresh()) return
      const value = Math.min(limit, Math.max(1, current + navigation.delta))
      if (!navigation.delta || value !== current) await this.writeParameter(navigation.command, value)
      if (navigation.play) await this.writeParameter(navigation.play, 'PLAY')
      return
    }
    const command = kind !== 'encoder' ? buttonCommand(assignment) : undefined
    if (command) {
      const [state] = command.toggle !== undefined ? await this.request(command.status) : []
      if (!fresh()) return
      if (command.delta) {
        const [selected] = await this.request(command.path)
        if (!Number.isInteger(Number(selected)) || !fresh()) return
        const value = Math.min(76, Math.max(1, Number(selected) + command.delta))
        if (value !== Number(selected)) await this.setInteger(command.path, value)
      } else if (command.page) {
        if (command.channel) await this.setInteger('/$ctl/$stat/selidx', command.channel)
        await this.setInteger(command.path, command.value)
      } else {
        if (assignment.mode === 'SHOWCTL' || command.tag !== undefined) {
          const [show] = await this.request('/$ctl/lib/$actshow')
          if (!show) throw Error('Open a show on WING before using scene controls.')
        }
        const value = state === String(command.value) ? command.toggle : command.value
        if (command.tag === undefined) {
          await this.writeParameter(command.path, value)
          if (command.seek) await this.writeParameter(command.path.replace(/stime$/, 'gotomarker'), 101)
        } else {
          const index = '/$ctl/lib/$actionidx'
          const [previous] = await this.request(index)
          await this.writeParameter(index, command.tag)
          try {
            await this.writeParameter(command.path, value)
          } finally {
            if (Number(previous) !== command.tag) await this.writeParameter(index, previous)
          }
        }
      }
      if (command.status) return { target: command.status, ...await this.readControl(command.status, assignment) }
      return
    }

    const target = await resolveTarget(this, assignment)
    if (!fresh()) return
    if (!target) {
      if (assignment.mode === 'DCAMUTE' || assignment.mode === 'DCA') {
        throw Error('WING DCA target has no unique name. Assign a distinct name on WING.')
      }
      if (['CHPAGE', 'PAGE', 'VIEWPAGE'].includes(assignment.mode)) {
        throw Error('WING page ' + (assignment.pg ?? assignment.area) + ' is not supported by this module version.')
      }
      return
    }

    const current = await this.readParameter(target)
    if (!Number.isFinite(current.value) || !fresh()) return
    const delta = direction * step
    let value
    let path = target
    const recorder = recorderEncoder(assignment)
    if (recorder) {
      const { value: max } = await this.readParameter(recorder.max)
      if (!Number.isFinite(max) || max < recorder.min || !fresh()) return
      path = recorder.path
      value = Math.min(max, Math.max(recorder.min, Math.round(current.value + delta * recorder.scale)))
    } else if (faderSnap(assignment) !== undefined) {
      value = faderSnap(assignment)
    } else if (assignment.mode === 'SOF') {
      value = current.display === String(assignment.ch) ? 0 : Number(assignment.ch)
    } else if (assignment.mode === 'FX' || assignment.mode === 'FXPAR') {
      const range = await this.fxParameter(target)
      if (!range || !fresh()) return
      // Verify the named parameter matches the numeric alias before writing it.
      const named = await this.readParameter(range.path)
      if (named.display !== current.display || named.value !== current.value || !fresh()) return
      path = range.path
      if (kind !== 'encoder') {
        if (range.min !== 0 || range.max !== 1) return
        value = current.value === 1 ? 0 : 1
      } else value = Math.min(range.max, Math.max(range.min, current.value + delta))
    } else if (kind !== 'encoder') {
      value = current.value === 1 ? 0 : 1
    } else {
      const isPan = assignment.mode === 'PAN'
      const isLight = assignment.mode === 'OTHER'
      const base = current.display === '-oo' && delta > 0 ? -60 : current.value
      value = Math.min(isPan || isLight ? 100 : 10,
        Math.max(isPan ? -100 : isLight ? 0 : -144, base + delta))
    }
    if (value === current.value && assignment.mode !== 'SOF') return
    await this.writeParameter(path, Number(value.toFixed(4)))
    if (recorder?.scale === 1000) {
      await this.writeParameter(path.replace(/stime$/, 'gotomarker'), 101)
    }
    return { target, ...await this.readControl(target, assignment) }
  }
}
