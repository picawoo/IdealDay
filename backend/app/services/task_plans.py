from collections.abc import Sequence
from datetime import date
from uuid import UUID

from app.core.enums import Chronotype, TaskType
from app.core.errors import ScheduleConflictError
from app.models.profile import UserProfile
from app.models.task import Task
from app.schemas.schedule import ScheduleResponse
from app.services.scheduler import PlanningTask, build_schedule, fixed_slot_is_available


def ensure_fixed_slot(
    tasks: Sequence[Task], task_id: UUID, start_minute: int, duration_minutes: int
) -> None:
    occupied = (
        (task.fixed_start_minute, task.duration_minutes)
        for task in tasks
        if task.id != task_id and task.fixed_start_minute is not None
    )
    if not fixed_slot_is_available(start_minute, duration_minutes, occupied):
        raise ScheduleConflictError()


def make_schedule(tasks: Sequence[Task], profile: UserProfile, target: date) -> ScheduleResponse:
    planning_tasks = [
        PlanningTask(
            id=task.id,
            title=task.title,
            task_type=TaskType(task.task_type),
            duration_minutes=task.duration_minutes,
            priority=task.priority,
            fixed_start_minute=task.fixed_start_minute,
        )
        for task in tasks
    ]
    chronotype = Chronotype(profile.chronotype)
    plan = build_schedule(planning_tasks, profile.birth_date, target, chronotype)
    return ScheduleResponse(
        date=target,
        timezone=profile.timezone,
        critical_level=plan.critical_level,
        placements=plan.placements,
        breaks=plan.breaks,
        unscheduled=plan.unscheduled,
    )
