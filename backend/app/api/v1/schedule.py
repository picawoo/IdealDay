from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query

from app.core.clock import today_in
from app.core.deps import ClockDep, ProfileDep, SessionDep
from app.repositories import tasks as tasks_repo
from app.schemas.errors import ErrorResponse
from app.schemas.schedule import PlacementUpdate, ScheduleResponse
from app.services.periods import ensure_not_before_birth
from app.services.task_plans import ensure_fixed_slot, make_schedule

router = APIRouter(
    prefix="/schedule",
    tags=["schedule"],
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)


@router.get("")
async def get_schedule(
    profile: ProfileDep,
    clock: ClockDep,
    session: SessionDep,
    target: Annotated[date | None, Query(alias="date")] = None,
) -> ScheduleResponse:
    """Рассчитывает план на дату или на сегодня в часовом поясе профиля."""
    target = target if target is not None else today_in(profile.timezone, clock())
    ensure_not_before_birth(profile.birth_date, target)
    tasks = await tasks_repo.list_owned(session, profile.user_id, target=target)
    return make_schedule(tasks, profile, target)


@router.patch("/tasks/{task_id}", responses={409: {"model": ErrorResponse}})
async def set_task_placement(
    task_id: UUID, body: PlacementUpdate, profile: ProfileDep, session: SessionDep
) -> ScheduleResponse:
    """Закрепляет время в минутах от полуночи. null возвращает задачу в автоплан."""
    await tasks_repo.lock_writes(session, profile.user_id)
    task = await tasks_repo.get_owned(session, profile.user_id, task_id)
    target = task.scheduled_date
    ensure_not_before_birth(profile.birth_date, target)
    tasks = await tasks_repo.list_owned(session, profile.user_id, target=target)
    if body.start_minute is not None:
        ensure_fixed_slot(tasks, task.id, body.start_minute, task.duration_minutes)
    task.fixed_start_minute = body.start_minute
    result = make_schedule(tasks, profile, target)
    await session.commit()
    return result
