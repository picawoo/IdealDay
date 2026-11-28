from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date
from enum import StrEnum
from itertools import accumulate
from uuid import UUID

from app.core.circadian import circadian_level
from app.core.enums import Chronotype, TaskType
from app.services.biorhythm import calculate_day
from app.services.critical import CriticalLevel, analyze_day
from app.services.recommender import CYCLE_FOR_TYPE, active_hours

MINUTE_STEP = 5
DAY_MINUTES = 24 * 60
MIN_TASK_GAP = 10
LUNCH_START = 13 * 60
LUNCH_END = LUNCH_START + 30


class PlacementSource(StrEnum):
    AUTOMATIC = "automatic"
    MANUAL = "manual"


class UnscheduledReason(StrEnum):
    CRITICAL_CYCLE = "critical_cycle"
    NO_FREE_SLOT = "no_free_slot"


class BreakKind(StrEnum):
    LUNCH = "lunch"
    BETWEEN_TASKS = "between_tasks"


@dataclass(frozen=True, slots=True)
class PlanningTask:
    id: UUID
    title: str
    task_type: TaskType
    duration_minutes: int
    priority: int
    fixed_start_minute: int | None = None


@dataclass(frozen=True, slots=True)
class Placement:
    task_id: UUID
    title: str
    task_type: TaskType
    start_minute: int
    end_minute: int
    source: PlacementSource
    reason: str


@dataclass(frozen=True, slots=True)
class Break:
    start_minute: int
    end_minute: int
    kind: BreakKind


@dataclass(frozen=True, slots=True)
class UnscheduledTask:
    task_id: UUID
    reason: UnscheduledReason


@dataclass(frozen=True, slots=True)
class DayPlan:
    critical_level: CriticalLevel
    placements: tuple[Placement, ...]
    breaks: tuple[Break, ...]
    unscheduled: tuple[UnscheduledTask, ...]


def fixed_slot_is_available(
    start: int, duration: int, other_tasks: Iterable[tuple[int, int]]
) -> bool:
    """other_tasks содержит начало и длительность уже закреплённых задач."""
    end = start + duration
    if start < 0 or end > DAY_MINUTES or start % MINUTE_STEP:
        return False
    if start < LUNCH_END and LUNCH_START < end:
        return False
    return all(
        end + MIN_TASK_GAP <= other_start or other_start + other_duration + MIN_TASK_GAP <= start
        for other_start, other_duration in other_tasks
    )


def _subtract(free: list[tuple[int, int]], start: int, end: int) -> list[tuple[int, int]]:
    remaining = []
    for left, right in free:
        if end <= left or right <= start:
            remaining.append((left, right))
            continue
        if left < start:
            remaining.append((left, start))
        if end < right:
            remaining.append((end, right))
    return remaining


def _score_prefixes(
    amplitudes: dict[TaskType, float], chronotype: Chronotype
) -> dict[TaskType, list[float]]:
    slot_midpoints = (
        (minute + MINUTE_STEP / 2) / 60 for minute in range(0, DAY_MINUTES, MINUTE_STEP)
    )
    scores = {task_type: [] for task_type in TaskType}
    for hour in slot_midpoints:
        levels = {
            kind: amplitude * circadian_level(kind, hour, chronotype)
            for kind, amplitude in amplitudes.items()
        }
        for kind in CYCLE_FOR_TYPE:
            scores[kind].append(levels.get(kind, 0.0))
        scores[TaskType.ROUTINE].append(1 - max(levels.values(), default=0.0))
    return {kind: list(accumulate(values, initial=0.0)) for kind, values in scores.items()}


def _best_start(free: list[tuple[int, int]], duration: int, scores: list[float]) -> int | None:
    candidates = (
        start
        for left, right in free
        for start in range(left, right - duration + 1, MINUTE_STEP)
    )

    def quality(start: int) -> float:
        return round(scores[(start + duration) // MINUTE_STEP] - scores[start // MINUTE_STEP], 9)

    return max(candidates, key=quality, default=None)


def _placement(task: PlanningTask, start: int, manual: bool, amplitude: float) -> Placement:
    if manual:
        reason = "Время закреплено вручную."
    elif task.task_type is TaskType.ROUTINE:
        reason = "Свободное окно с низкой расчётной активностью по другим типам задач."
    elif amplitude > 0:
        reason = "Лучшее свободное окно по биоритму и хронотипу на момент размещения."
    else:
        reason = "Первое свободное окно. На этот день выраженный пик отсутствует."
    source = PlacementSource.MANUAL if manual else PlacementSource.AUTOMATIC
    return Placement(
        task_id=task.id,
        title=task.title,
        task_type=task.task_type,
        start_minute=start,
        end_minute=start + task.duration_minutes,
        source=source,
        reason=reason,
    )


def _breaks(placements: Sequence[Placement]) -> tuple[Break, ...]:
    breaks = [Break(LUNCH_START, LUNCH_END, BreakKind.LUNCH)]
    for current in placements[:-1]:
        start = current.end_minute
        if start == LUNCH_START:
            continue
        end = start + MIN_TASK_GAP
        if start < LUNCH_START:
            end = min(end, LUNCH_START)
        breaks.append(Break(start, end, BreakKind.BETWEEN_TASKS))
    return tuple(sorted(breaks, key=lambda item: item.start_minute))


def build_schedule(
    tasks: Sequence[PlanningTask], birth_date: date, target: date, chronotype: Chronotype
) -> DayPlan:
    critical = analyze_day(birth_date, target)
    critical_cycles = {cycle.cycle for cycle in critical.cycles}
    blocked_types = {kind for kind, cycle in CYCLE_FOR_TYPE.items() if cycle in critical_cycles}
    values = {cycle.cycle: cycle.value for cycle in calculate_day(birth_date, target).cycles}
    amplitudes = {
        kind: max(0.0, values[cycle])
        for kind, cycle in CYCLE_FOR_TYPE.items()
        if kind not in blocked_types
    }
    scores = _score_prefixes(amplitudes, chronotype)
    active = active_hours(chronotype)
    free = _subtract([(active.start * 60, active.stop * 60)], LUNCH_START, LUNCH_END)
    placements: list[Placement] = []
    unfixed: list[PlanningTask] = []
    unscheduled: list[UnscheduledTask] = []

    for task in tasks:
        if task.fixed_start_minute is None:
            unfixed.append(task)
            continue
        item = _placement(task, task.fixed_start_minute, manual=True, amplitude=0)
        placements.append(item)
        free = _subtract(free, item.start_minute - MIN_TASK_GAP, item.end_minute + MIN_TASK_GAP)

    for task in sorted(unfixed, key=lambda item: (-item.priority, -item.duration_minutes, item.id)):
        if task.task_type in blocked_types:
            unscheduled.append(UnscheduledTask(task.id, UnscheduledReason.CRITICAL_CYCLE))
            continue
        start = _best_start(free, task.duration_minutes, scores[task.task_type])
        if start is None:
            unscheduled.append(UnscheduledTask(task.id, UnscheduledReason.NO_FREE_SLOT))
            continue
        item = _placement(task, start, manual=False, amplitude=amplitudes.get(task.task_type, 0))
        placements.append(item)
        free = _subtract(free, item.start_minute - MIN_TASK_GAP, item.end_minute + MIN_TASK_GAP)

    placements.sort(key=lambda item: item.start_minute)
    return DayPlan(critical.level, tuple(placements), _breaks(placements), tuple(unscheduled))
