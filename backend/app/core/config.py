from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Настройки приложения. Значения берутся из переменных окружения (и .env при локальном запуске)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://idealday:idealday@localhost:5432/idealday"
    test_database_url: str = "postgresql+asyncpg://idealday:idealday@localhost:5432/idealday_test"
    redis_url: str = "redis://localhost:6379/0"
    redis_timeout_seconds: float = 0.2


@lru_cache
def get_settings() -> Settings:
    return Settings()
