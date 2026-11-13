import datetime as dt

from pydantic import BaseModel, ConfigDict

from app.services.biorhythm import CycleName, Sign, Trend
from app.services.critical import CriticalLevel, Transition

DISCLAIMER = (
    "Расчёт основан на теории биоритмов, не имеющей научного подтверждения. "
    "Информация носит справочный характер."
)


class CycleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    cycle: CycleName
    period: int
    day_in_cycle: int
    value: float
    percent: int
    sign: Sign
    trend: Trend


class CriticalCycleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    cycle: CycleName
    transition: Transition


class CriticalSummary(BaseModel):
    level: CriticalLevel
    cycles: list[CriticalCycleOut]


class DayResponse(BaseModel):
    date: dt.date
    cycles: list[CycleOut]
    critical: CriticalSummary


class TodayResponse(DayResponse):
    disclaimer: str = DISCLAIMER


class PeriodResponse(BaseModel):
    date_from: dt.date
    date_to: dt.date
    days: list[DayResponse]
    disclaimer: str = DISCLAIMER


class CriticalDayOut(BaseModel):
    date: dt.date
    level: CriticalLevel
    cycles: list[CriticalCycleOut]


class CriticalDaysResponse(BaseModel):
    date_from: dt.date
    date_to: dt.date
    critical_days: list[CriticalDayOut]
    disclaimer: str = DISCLAIMER
