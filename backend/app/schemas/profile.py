import zoneinfo
from datetime import date, datetime
from functools import lru_cache
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.core.enums import Chronotype

MIN_BIRTH_DATE = date(1900, 1, 1)


@lru_cache
def _timezones() -> frozenset[str]:
    return frozenset(zoneinfo.available_timezones())


class ProfileUpsert(BaseModel):
    """Тело PUT /profile: полная замена профиля, пропущенные поля получают значения по умолчанию."""

    birth_date: date
    chronotype: Chronotype = Chronotype.DOVE
    timezone: str = "UTC"

    @field_validator("timezone")
    @classmethod
    def _known_timezone(cls, value: str) -> str:
        if value not in _timezones():
            raise ValueError("Неизвестный часовой пояс: ожидается IANA-имя, например Europe/Moscow")
        return value

    @model_validator(mode="after")
    def _birth_date_in_range(self) -> "ProfileUpsert":
        if self.birth_date < MIN_BIRTH_DATE:
            raise ValueError("Дата рождения не может быть раньше 1900-01-01")
        if self.birth_date > datetime.now(ZoneInfo(self.timezone)).date():
            raise ValueError("Дата рождения не может быть в будущем")
        return self


class ProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    birth_date: date
    chronotype: Chronotype
    timezone: str
    created_at: datetime
    updated_at: datetime
