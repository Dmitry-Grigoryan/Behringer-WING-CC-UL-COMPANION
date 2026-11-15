// Combine detents within one short window. Keep only fresh motion while a write is in flight.
const interval = 20
const maxAge = 300

export class Rotation {
  pending = new Map()
  stopped = false
  running = false

  constructor(apply, onError) {
    this.apply = apply
    this.onError = onError
  }

  add(layer, slot, delta) {
    if (this.stopped || !Number.isFinite(delta) || delta === 0) return
    const key = layer + ':' + slot
    const now = performance.now()
    const previous = this.pending.get(key)
    const active = previous && previous.deadline > now ? previous : undefined
    const combined = (active?.delta ?? 0) + delta
    if (combined === 0) {
      this.pending.delete(key)
    } else {
      const direction = Math.sign(delta)
      const streak = active?.direction === direction ? active.streak + 1 : 1
      this.pending.set(key, { layer, slot, delta: combined, direction, streak,
        deadline: active?.deadline ?? now + maxAge })
    }
    this.schedule()
  }

  schedule() {
    if (this.stopped || this.running || this.timer || !this.pending.size) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.flush()
    }, interval)
  }

  async flush() {
    this.running = true
    const batch = this.pending
    this.pending = new Map()
    try {
      for (const { layer, slot, delta, direction, streak, deadline } of batch.values()) {
        const fresh = () => !this.stopped && performance.now() < deadline
        if (!fresh()) continue
        try {
          // Companion exposes direction only. Accelerate consecutive fast turns in the same direction.
          const fast = streak >= 2 && Math.sign(delta) === direction
          await this.apply(layer, slot, fast ? delta * 2 : delta, fresh)
        } catch (error) {
          this.onError(error)
        }
      }
    } finally {
      this.running = false
      this.schedule()
    }
  }

  stop() {
    this.stopped = true
    clearTimeout(this.timer)
    this.pending.clear()
  }
}
