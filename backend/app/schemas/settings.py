from pydantic import BaseModel, ConfigDict, Field

from app.services.email_reminders import DEFAULT_REMINDER_TIME


class SettingsWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email_notifications_enabled: bool = Field(strict=True)
    email_reminder_time: str = Field(pattern=r"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")


class SettingsResponse(BaseModel):
    email_notifications_enabled: bool = False
    email_reminder_time: str = DEFAULT_REMINDER_TIME
    timezone: str
