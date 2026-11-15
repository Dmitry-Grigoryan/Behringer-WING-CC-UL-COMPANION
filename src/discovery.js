import dgram from 'node:dgram'
import { networkInterfaces } from 'node:os'

function broadcastAddresses() {
  const addresses = new Set(['255.255.255.255'])
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const info of interfaces ?? []) {
      if (info.internal || info.family !== 'IPv4') continue
      const mask = info.netmask.split('.').map(Number)
      addresses.add(info.address.split('.').map((byte, index) => Number(byte) | (255 ^ mask[index])).join('.'))
    }
  }
  return addresses
}

export function discoverWing({ addresses = broadcastAddresses(), port = 2222 } = {}) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4')
    const consoles = new Map()
    const finish = (error) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      socket.close()
      if (error) reject(error)
      else resolve([...consoles.values()].sort((a, b) => a.host.localeCompare(b.host)))
    }
    let finished = false
    const timer = setTimeout(() => finish(), 500)
    socket.on('error', finish)
    socket.on('message', (bytes, remote) => {
      const [signature, address, name, model] = bytes.toString().split(',')
      if (signature !== 'WING' || address !== remote.address || !model || remote.port !== port) return
      consoles.set(address, { host: address, name, model })
    })
    socket.bind(() => {
      if (finished) return
      socket.setBroadcast(true)
      for (const address of addresses) socket.send('WING?', port, address, () => {})
    })
  })
}
