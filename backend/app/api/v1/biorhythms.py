from dataclasses import dataclass
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.clock import today_in
from app.core.deps import CacheDep, ClockDep, ProfileDep, SettingsDep
from app.schemas.biorhythm import CriticalDaysResponse, PeriodResponse, TodayResponse
from app.schemas.errors import ErrorResponse
from app.services import reports
from app.services.cache import biorhythm_key, critical_key
from app.services.periods import ensure_not_before_birth, validate_period

router = APIRouter(prefix="/biorhythms", tags=["biorhythms"])

_ERRORS = {401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}}


@dataclass(frozen=True, slots=True)
class Period:
    date_from: date
    date_to: date


def get_period(
    date_from: date, date_to: date, profile: ProfileDep, settings: SettingsDep
) -> Period:
    """Параметры периода из query; проверяются границы, длина и дата рождения из профиля."""
    validate_period(profile.birth_date, date_from, date_to, settings.max_period_days)
    return Period(date_from=date_from, date_to=date_to)


PeriodDep = Annotated[Period, Depends(get_period)]


@router.get("/today", response_model=TodayResponse, responses=_ERRORS)
async def get_today(profile: ProfileDep, clock: ClockDep, cache: CacheDep) -> TodayResponse:
    """Циклы на сегодня. «Сегодня» определяется в часовом поясе из профиля."""
    birth_date = profile.birth_date
    target = today_in(profile.timezone, clock())
    ensure_not_before_birth(birth_date, target)
    period = await cache.get_or_compute(
        biorhythm_key(birth_date, target, target),
        PeriodResponse,
        lambda: reports.period_report(birth_date, target, target),
    )
    return reports.today_from_period(period)


@router.get("", response_model=PeriodResponse, responses=_ERRORS)
async def get_period_biorhythms(
    profile: ProfileDep, period: PeriodDep, cache: CacheDep
) -> PeriodResponse:
    """Циклы по дням периода (включительно) с отметкой критических дней."""
    birth_date = profile.birth_date
    return await cache.get_or_compute(
        biorhythm_key(birth_date, period.date_from, period.date_to),
        PeriodResponse,
        lambda: reports.period_report(birth_date, period.date_from, period.date_to),
    )


@router.get("/critical-days", response_model=CriticalDaysResponse, responses=_ERRORS)
async def get_critical_days(
    profile: ProfileDep, period: PeriodDep, cache: CacheDep
) -> CriticalDaysResponse:
    """Только критические дни периода (уровень не ниже single)."""
    birth_date = profile.birth_date
    return await cache.get_or_compute(
        critical_key(birth_date, period.date_from, period.date_to),
        CriticalDaysResponse,
        lambda: reports.critical_report(birth_date, period.date_from, period.date_to),
    )
