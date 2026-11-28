from typing import Annotated

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, SessionDep
from app.repositories.notifications import history
from app.schemas.errors import ErrorResponse
from app.schemas.notifications import NotificationResponse

router = APIRouter(
    prefix="/notifications", tags=["notifications"], responses={401: {"model": ErrorResponse}}
)


@router.get("")
async def list_notifications(
    user: CurrentUser,
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> list[NotificationResponse]:
    """Возвращает историю ежедневных писем текущего пользователя, новые даты первыми."""
    deliveries = await history(session, user.id, limit)
    return [NotificationResponse.model_validate(delivery) for delivery in deliveries]
