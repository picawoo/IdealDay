interface Anchor {
  minute: number
  height: number
}

const pixelsPerMinute = 1.6
const calloutGap = 6

export function layoutTimeline<T extends Anchor>(start: number, end: number, anchors: readonly T[]) {
  const sorted = [...anchors].sort((a, b) => a.minute - b.minute)
  const requiredHeight = sorted.reduce((sum, { height }) => sum + height, 0)
    + Math.max(0, sorted.length - 1) * calloutGap
  const height = Math.max((end - start) * pixelsPerMinute, requiredHeight)
  const offset = (minute: number) => (minute - start) / (end - start) * height
  let next = 0
  const callouts = sorted.map((anchor) => {
    const y = offset(anchor.minute)
    const top = Math.max(next, y - anchor.height / 2)
    next = top + anchor.height + calloutGap
    return { ...anchor, y, top }
  })

  // Pack crowded callouts at the end inside the rail without moving their time anchors.
  let limit = height
  for (let index = callouts.length - 1; index >= 0; index--) {
    const callout = callouts[index]
    callout.top = Math.min(callout.top, limit - callout.height)
    limit = callout.top - calloutGap
  }
  return { height, offset, callouts }
}
