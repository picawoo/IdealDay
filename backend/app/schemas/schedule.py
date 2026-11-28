import datetime as dt

from pydantic import BaseModel, ConfigDict

from app.schemas.biorhythm import DISCLAIMER
from app.schemas.task import StartMinute
from app.services.critical import CriticalLevel
from app.services.scheduler import Break, Placement, UnscheduledTask


class PlacementUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start_minute: StartMinute | None


class ScheduleResponse(BaseModel):
    date: dt.date
    timezone: str
    critical_level: CriticalLevel
    placements: tuple[Placement, ...]
    breaks: tuple[Break, ...]
    unscheduled: tuple[UnscheduledTask, ...]
    disclaimer: str = DISCLAIMER
