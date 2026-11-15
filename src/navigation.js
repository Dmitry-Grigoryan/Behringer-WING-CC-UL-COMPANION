import { createConnection } from 'node:net'

export const encoderPageCommands = { 1: 'page-set 1', 3: 'page-up', 4: 'page-down' }

export async function navigatePage(surfaceId, slot, port = 16759) {
  const command = encoderPageCommands[slot]
  if (!command) return
  if (!/^[A-Za-z0-9_.:@%+-]+$/.test(surfaceId ?? '')) {
    throw Error('Press the encoder on a connected Stream Deck+ to navigate its pages.')
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw Error('Enter the TCP Remote Control port from Companion settings.')
  }

  await new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    let buffer = ''
    function finish(error) {
      socket.destroy()
      if (error) reject(error)
      else resolve()
    }
    socket.setEncoding('utf8')
    socket.setTimeout(1000)
    socket.on('connect', () => socket.write('surface ' + surfaceId + ' ' + command + '\n'))
    socket.on('timeout', () => finish(Error('Companion TCP Remote Control did not respond.')))
    socket.on('error', (error) => finish(Error('Enable TCP Remote Control in Companion on port ' + port + ' (' + error.code + ').')))
    socket.on('end', () => finish(Error('Companion TCP Remote Control closed without a reply.')))
    socket.on('data', (part) => {
      buffer += part
      let separator
      while ((separator = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, separator).trim()
        buffer = buffer.slice(separator + 1)
        if (line.startsWith('+OK')) {
          finish(line.includes('Page not found') ? Error('Companion page 1 was not found.') : undefined)
          return
        }
        if (line.startsWith('-ERR')) {
          finish(Error(line.slice(5)))
          return
        }
      }
      if (buffer.length > 8192) finish(Error('Unexpected reply from Companion TCP Remote Control.'))
    })
  })
}
