from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.services.email_reminders import DeliveryStatus


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    local_date: date
    status: DeliveryStatus
    attempts: int
    sent_at: datetime | None
