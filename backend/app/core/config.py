from functools import lru_cache
from typing import Literal, Self

from pydantic import EmailStr, Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Настройки приложения. Значения берутся из переменных окружения (и .env при локальном запуске)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str
    jwt_secret: str = Field(min_length=32)

    test_database_url: str | None = None
    redis_url: str = "redis://localhost:6379/0"
    redis_timeout_seconds: float = 0.2

    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60

    max_period_days: int = Field(default=92, ge=1)

    cache_enabled: bool = True
    cache_ttl_seconds: int = Field(default=86400, gt=0)

    smtp_host: str | None = None
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_from: EmailStr | None = None
    smtp_security: Literal["starttls", "ssl", "plain"] = "starttls"
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_timeout_seconds: float = Field(default=10, gt=0, le=60)
    notification_poll_seconds: int = Field(default=30, ge=1, le=300)

    @model_validator(mode="after")
    def validate_smtp(self) -> Self:
        if bool(self.smtp_host) != bool(self.smtp_from):
            raise ValueError("SMTP_HOST и SMTP_FROM задаются вместе")
        if bool(self.smtp_username) != bool(self.smtp_password):
            raise ValueError("SMTP_USERNAME и SMTP_PASSWORD задаются вместе")
        if self.smtp_security == "plain" and self.smtp_username:
            raise ValueError("Для SMTP с авторизацией нужен TLS")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
