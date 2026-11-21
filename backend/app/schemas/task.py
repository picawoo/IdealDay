import datetime as dt
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.core.enums import TaskType
from app.services.scheduler import DAY_MINUTES, MINUTE_STEP

StartMinute = Annotated[int, Field(ge=0, lt=DAY_MINUTES, multiple_of=MINUTE_STEP, strict=True)]


class TaskWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    task_type: TaskType
    scheduled_date: dt.date
    duration_minutes: int = Field(ge=MINUTE_STEP, le=960, multiple_of=MINUTE_STEP, strict=True)
    priority: int = Field(default=3, ge=1, le=5, strict=True)


class TaskResponse(TaskWrite):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    fixed_start_minute: StartMinute | None
    created_at: dt.datetime
