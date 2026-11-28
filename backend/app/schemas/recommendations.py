import datetime as dt

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import Chronotype, TaskType
from app.schemas.biorhythm import DISCLAIMER
from app.services.critical import CriticalLevel
from app.services.recommender import Severity


class FocusWindowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    task_type: TaskType
    start_hour: int = Field(ge=0, le=23, description="Начало в местном времени, включительно")
    end_hour: int = Field(ge=1, le=24, description="Конец в местном времени, не включительно")
    score: float = Field(ge=0, le=1)


class RecommendationWarningOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    severity: Severity
    message: str


class RecommendationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: dt.date
    chronotype: Chronotype
    critical_level: CriticalLevel
    rest_recommended: bool
    summary: str
    focus_windows: list[FocusWindowOut]
    warnings: list[RecommendationWarningOut]
    disclaimer: str = DISCLAIMER
