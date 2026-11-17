import { intersects } from '../tasks/timeIntervals.ts'
import type { Interval } from '../tasks/timeIntervals.ts'
import type { DaySegment } from './dayPlan.ts'

const pixelsPerMinute = 1.6
const minimumCardHeight = 48
const minimumPointHeight = 52
const minimumLaneWidth = 128

export function createTimeScale(start: number, end: number) {
  return {
    start,
    end,
    height: (end - start) * pixelsPerMinute,
    offset: (minute: number) => (minute - start) * pixelsPerMinute,
    minuteAt: (offset: number) => Math.min(end - 1, Math.max(start, Math.round(start + offset / pixelsPerMinute))),
  }
}

export type TimeScale = ReturnType<typeof createTimeScale>

interface Box extends Interval {
  segment: DaySegment
}

interface Slot extends Box {
  lane: number
  lanes: number
  laneSpan: number
}

export function layoutTimeline(entries: readonly DaySegment[], scale: TimeScale) {
  const boxes = entries.map((segment): Box => {
    const start = scale.offset(segment.start)
    const minimumHeight = segment.entry.duration === null ? minimumPointHeight : minimumCardHeight
    return { segment, start, end: Math.max(scale.offset(segment.end), start + minimumHeight) }
  }).sort((a, b) => a.start - b.start || b.end - a.end)

  const slots: Slot[] = []
  let group: Array<Box & { lane: number }> = []
  let lanes: Box[][] = []
  let groupEnd = 0
  let maxLanes = 1

  function appendGroup() {
    maxLanes = Math.max(maxLanes, lanes.length)
    for (const box of group) {
      let right = box.lane + 1
      while (right < lanes.length && !lanes[right].some((other) => intersects(box, other))) right++
      slots.push({ ...box, lanes: lanes.length, laneSpan: right - box.lane })
    }
    group = []
    lanes = []
    groupEnd = 0
  }

  for (const box of boxes) {
    if (box.start >= groupEnd) appendGroup()
    const available = lanes.findIndex((items) => items[items.length - 1].end <= box.start)
    const lane = available < 0 ? lanes.length : available
    if (available < 0) lanes.push([box])
    else lanes[lane].push(box)
    group.push({ ...box, lane })
    groupEnd = Math.max(groupEnd, box.end)
  }
  appendGroup()

  return {
    slots,
    minWidth: maxLanes * minimumLaneWidth,
    // Leave room below the final time line without stretching the scale or adding free time.
    height: boxes.reduce((height, box) => Math.max(height, box.end), scale.height),
  }
}

export type TimelineLayout = ReturnType<typeof layoutTimeline>
