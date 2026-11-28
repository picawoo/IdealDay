from datetime import date

from app.core.enums import Chronotype
from app.schemas.biorhythm import (
    CriticalCycleOut,
    CriticalDayOut,
    CriticalDaysResponse,
    CriticalSummary,
    CycleOut,
    DayResponse,
    PeriodResponse,
    TodayResponse,
)
from app.schemas.recommendations import RecommendationResponse
from app.services.biorhythm import calculate_day, iter_days
from app.services.critical import CriticalDay, analyze_day, find_critical_days
from app.services.recommender import recommend


def _critical_cycles(critical: CriticalDay) -> list[CriticalCycleOut]:
    return [CriticalCycleOut.model_validate(c) for c in critical.cycles]


def _day_fields(birth_date: date, target_date: date) -> dict:
    biorhythm = calculate_day(birth_date, target_date)
    critical = analyze_day(birth_date, target_date)
    return {
        "date": target_date,
        "cycles": [CycleOut.model_validate(c) for c in biorhythm.cycles],
        "critical": CriticalSummary(level=critical.level, cycles=_critical_cycles(critical)),
    }


def day_report(birth_date: date, target_date: date) -> DayResponse:
    return DayResponse(**_day_fields(birth_date, target_date))


def today_from_period(period: PeriodResponse) -> TodayResponse:
    """Ответ /today из периода в один день: так /today и /biorhythms делят одну запись кэша."""
    return TodayResponse(**period.days[0].model_dump())


def period_report(birth_date: date, date_from: date, date_to: date) -> PeriodResponse:
    return PeriodResponse(
        date_from=date_from,
        date_to=date_to,
        days=[day_report(birth_date, day) for day in iter_days(date_from, date_to)],
    )


def critical_report(birth_date: date, date_from: date, date_to: date) -> CriticalDaysResponse:
    return CriticalDaysResponse(
        date_from=date_from,
        date_to=date_to,
        critical_days=[
            CriticalDayOut(date=day.date, level=day.level, cycles=_critical_cycles(day))
            for day in find_critical_days(birth_date, date_from, date_to)
        ],
    )


def recommendation_report(
    birth_date: date, target_date: date, chronotype: Chronotype
) -> RecommendationResponse:
    return RecommendationResponse.model_validate(recommend(birth_date, target_date, chronotype))
