from fastapi import APIRouter

from app.core.deps import CurrentUser, SessionDep
from app.repositories import profiles, settings
from app.schemas.errors import ErrorResponse
from app.schemas.settings import SettingsResponse, SettingsWrite
from app.services.email_reminders import format_reminder_time, reminder_minute

router = APIRouter(prefix="/settings", tags=["settings"], responses={401: {"model": ErrorResponse}})


@router.get("")
async def get_settings(user: CurrentUser, session: SessionDep) -> SettingsResponse:
    """Возвращает настройки уведомлений и часовой пояс, по которому идёт отправка."""
    profile = await profiles.get(session, user.id)
    timezone = profile.timezone if profile else "UTC"
    preferences = await settings.get(session, user.id)
    if preferences is None:
        return SettingsResponse(timezone=timezone)
    return SettingsResponse(
        email_notifications_enabled=preferences.email_notifications_enabled,
        email_reminder_time=format_reminder_time(preferences.reminder_minute),
        timezone=timezone,
    )


@router.put("")
async def put_settings(
    body: SettingsWrite, user: CurrentUser, session: SessionDep
) -> SettingsResponse:
    """Заменяет настройки уведомлений текущего пользователя."""
    profile = await profiles.get(session, user.id)
    await settings.upsert(
        session,
        user.id,
        enabled=body.email_notifications_enabled,
        minute=reminder_minute(body.email_reminder_time),
    )
    return SettingsResponse(**body.model_dump(), timezone=profile.timezone if profile else "UTC")
