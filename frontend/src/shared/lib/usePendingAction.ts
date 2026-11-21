import { useRef, useState } from 'react'

export function usePendingAction() {
  const running = useRef(false)
  const [pending, setPending] = useState(false)

  async function run(action: () => Promise<void>) {
    if (running.current) return
    running.current = true
    setPending(true)
    try { await action() } finally {
      running.current = false
      setPending(false)
    }
  }

  return { pending, run }
}
