from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BeforeValidator

from app.core.clock import today_in
from app.core.deps import CacheDep, ClockDep, ProfileDep
from app.core.enums import Chronotype
from app.schemas.errors import ErrorResponse
from app.schemas.recommendations import RecommendationResponse
from app.services import reports
from app.services.cache import recommendation_key
from app.services.periods import ensure_not_before_birth

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


def _parse_date(value: str) -> date:
    parsed = date.fromisoformat(value)
    if parsed.isoformat() != value:
        raise ValueError("Ожидается дата в формате YYYY-MM-DD")
    return parsed


QueryDate = Annotated[date, BeforeValidator(_parse_date)]


@router.get(
    "",
    response_model=RecommendationResponse,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
async def get_recommendations(
    profile: ProfileDep,
    clock: ClockDep,
    cache: CacheDep,
    target_date: Annotated[
        QueryDate | None, Query(alias="date", description="Дата в формате YYYY-MM-DD")
    ] = None,
) -> RecommendationResponse:
    """Рекомендации на дату. По умолчанию — сегодня в часовом поясе профиля."""
    if target_date is None:
        target_date = today_in(profile.timezone, clock())
    birth_date = profile.birth_date
    ensure_not_before_birth(birth_date, target_date)
    chronotype = Chronotype(profile.chronotype)
    return await cache.get_or_compute(
        recommendation_key(birth_date, chronotype, target_date),
        RecommendationResponse,
        lambda: reports.recommendation_report(birth_date, target_date, chronotype),
    )
