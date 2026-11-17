import { useLayoutEffect } from 'react'

const drafts = new Set<symbol>()

export function useUnsavedChanges(dirty: boolean) {
  useLayoutEffect(() => {
    if (!dirty) return
    const draft = Symbol()
    drafts.add(draft)
    return () => { drafts.delete(draft) }
  }, [dirty])
}

export function hasUnsavedChanges() {
  return drafts.size > 0
}
