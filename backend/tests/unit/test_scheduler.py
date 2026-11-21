from datetime import date
from uuid import UUID

import pytest

from app.core.enums import Chronotype, TaskType
from app.services.scheduler import (
    BreakKind,
    PlacementSource,
    PlanningTask,
    UnscheduledReason,
    build_schedule,
    fixed_slot_is_available,
)

BIRTH = date(2000, 1, 1)
STRONG_DAY = date(2024, 9, 11)


def task(
    number: int,
    kind: TaskType = TaskType.ROUTINE,
    minutes: int = 60,
    priority: int = 3,
    fixed: int | None = None,
) -> PlanningTask:
    return PlanningTask(UUID(int=number), f"Задача {number}", kind, minutes, priority, fixed)


def test_intellectual_work_moves_with_chronotype() -> None:
    tasks = [task(1, TaskType.INTELLECTUAL)]
    early = build_schedule(tasks, BIRTH, STRONG_DAY, Chronotype.LARK).placements[0]
    late = build_schedule(tasks, BIRTH, STRONG_DAY, Chronotype.OWL).placements[0]

    assert 180 <= late.start_minute - early.start_minute <= 240
    assert early.end_minute - early.start_minute == 60


def test_plan_prioritizes_tasks_when_time_is_limited() -> None:
    low = task(1, minutes=500, priority=1)
    high = task(2, minutes=500, priority=5)
    plan = build_schedule([low, high], BIRTH, STRONG_DAY, Chronotype.DOVE)

    assert [item.task_id for item in plan.placements] == [high.id]
    assert [(item.task_id, item.reason) for item in plan.unscheduled] == [
        (low.id, UnscheduledReason.NO_FREE_SLOT)
    ]


def test_critical_physical_work_is_deferred_unless_fixed_manually() -> None:
    critical_day = date(2000, 1, 12)
    deferred = task(1, TaskType.PHYSICAL)
    pinned = task(2, TaskType.PHYSICAL, fixed=600)
    routine = task(3)
    plan = build_schedule([deferred, pinned, routine], BIRTH, critical_day, Chronotype.DOVE)

    assert [(item.task_id, item.reason) for item in plan.unscheduled] == [
        (deferred.id, UnscheduledReason.CRITICAL_CYCLE)
    ]
    assert {item.task_id for item in plan.placements} == {pinned.id, routine.id}
    manual = next(item for item in plan.placements if item.task_id == pinned.id)
    assert (manual.source, manual.start_minute) == (PlacementSource.MANUAL, 600)


def test_plan_respects_manual_placements_lunch_and_breaks() -> None:
    pinned = task(1, minutes=30, fixed=750)
    tasks = [pinned, *(task(i, minutes=55) for i in range(2, 16))]
    plan = build_schedule(tasks, BIRTH, STRONG_DAY, Chronotype.DOVE)

    assert plan == build_schedule(tasks[::-1], BIRTH, STRONG_DAY, Chronotype.DOVE)
    manual = next(item for item in plan.placements if item.task_id == pinned.id)
    assert (manual.start_minute, manual.end_minute) == (750, 780)
    assert {item.task_id for item in plan.placements} | {
        item.task_id for item in plan.unscheduled
    } == {item.id for item in tasks}
    lunch = [(br.start_minute, br.end_minute) for br in plan.breaks if br.kind == BreakKind.LUNCH]
    assert lunch == [(780, 810)]
    for item in plan.placements:
        assert item.start_minute % 5 == item.end_minute % 5 == 0
        assert all(
            item.end_minute <= br.start_minute or br.end_minute <= item.start_minute
            for br in plan.breaks
        )
    for left, right in zip(plan.placements, plan.placements[1:], strict=False):
        assert right.start_minute - left.end_minute >= 10


@pytest.mark.parametrize(
    ("start", "duration", "allowed"),
    [
        (550, 40, True),
        (555, 40, False),
        (640, 30, True),
        (635, 30, False),
        (750, 30, True),
        (750, 35, False),
        (810, 30, True),
        (1435, 10, False),
    ],
)
def test_manual_slot_boundaries(start: int, duration: int, allowed: bool) -> None:
    assert fixed_slot_is_available(start, duration, [(600, 30)]) is allowed
