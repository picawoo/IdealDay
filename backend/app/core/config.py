from functools import lru_cache

from pydantic import Field
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
