from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Response, status

from app.core.deps import CurrentUser, SessionDep
from app.models.task import Task
from app.repositories import tasks as tasks_repo
from app.schemas.errors import ErrorResponse
from app.schemas.task import TaskResponse, TaskWrite
from app.services.task_plans import ensure_fixed_slot

router = APIRouter(prefix="/tasks", tags=["tasks"], responses={401: {"model": ErrorResponse}})
_MISSING = {404: {"model": ErrorResponse}}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_task(body: TaskWrite, user: CurrentUser, session: SessionDep) -> TaskResponse:
    await tasks_repo.lock_writes(session, user.id)
    task = Task(
        user_id=user.id,
        title=body.title,
        task_type=body.task_type.value,
        scheduled_date=body.scheduled_date,
        duration_minutes=body.duration_minutes,
        priority=body.priority,
    )
    session.add(task)
    await session.commit()
    return TaskResponse.model_validate(task)


@router.get("")
async def list_tasks(
    user: CurrentUser,
    session: SessionDep,
    target: Annotated[date | None, Query(alias="date")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[TaskResponse]:
    tasks = await tasks_repo.list_owned(session, user.id, target=target, limit=limit, offset=offset)
    return [TaskResponse.model_validate(task) for task in tasks]


@router.get("/{task_id}", responses=_MISSING)
async def get_task(task_id: UUID, user: CurrentUser, session: SessionDep) -> TaskResponse:
    return TaskResponse.model_validate(await tasks_repo.get_owned(session, user.id, task_id))


@router.put("/{task_id}", responses={**_MISSING, 409: {"model": ErrorResponse}})
async def update_task(
    task_id: UUID, body: TaskWrite, user: CurrentUser, session: SessionDep
) -> TaskResponse:
    await tasks_repo.lock_writes(session, user.id)
    task = await tasks_repo.get_owned(session, user.id, task_id)
    if task.scheduled_date != body.scheduled_date:
        task.fixed_start_minute = None
    elif task.fixed_start_minute is not None and task.duration_minutes != body.duration_minutes:
        tasks = await tasks_repo.list_owned(session, user.id, target=task.scheduled_date)
        ensure_fixed_slot(tasks, task.id, task.fixed_start_minute, body.duration_minutes)
    task.title = body.title
    task.task_type = body.task_type.value
    task.scheduled_date = body.scheduled_date
    task.duration_minutes = body.duration_minutes
    task.priority = body.priority
    await session.commit()
    return TaskResponse.model_validate(task)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT, responses=_MISSING)
async def delete_task(task_id: UUID, user: CurrentUser, session: SessionDep) -> Response:
    await tasks_repo.lock_writes(session, user.id)
    task = await tasks_repo.get_owned(session, user.id, task_id)
    await session.delete(task)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
