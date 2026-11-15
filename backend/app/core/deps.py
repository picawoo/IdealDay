from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import OAuth2PasswordBearer
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.core.clock import Clock, get_clock
from app.core.config import Settings, get_settings
from app.core.errors import ProfileNotFoundError, UnauthorizedError
from app.core.security import decode_access_token
from app.models.profile import UserProfile
from app.models.user import User
from app.repositories import profiles as profiles_repo
from app.repositories import users as users_repo
from app.services.cache import CacheService

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def get_engine(request: Request) -> AsyncEngine:
    return request.app.state.engine


def get_redis(request: Request) -> Redis:
    return request.app.state.redis


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    async with request.app.state.session_factory() as session:
        yield session


EngineDep = Annotated[AsyncEngine, Depends(get_engine)]
RedisDep = Annotated[Redis, Depends(get_redis)]
SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
ClockDep = Annotated[Clock, Depends(get_clock)]


async def get_current_user(
    token: Annotated[str | None, Depends(oauth2_scheme)],
    session: SessionDep,
    settings: SettingsDep,
) -> User:
    if token is None:
        raise UnauthorizedError()
    user = await users_repo.get_by_id(session, decode_access_token(token, settings))
    if user is None:
        raise UnauthorizedError()
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_current_profile(user: CurrentUser, session: SessionDep) -> UserProfile:
    profile = await profiles_repo.get(session, user.id)
    if profile is None:
        raise ProfileNotFoundError()
    return profile


ProfileDep = Annotated[UserProfile, Depends(get_current_profile)]


def get_cache(redis: RedisDep, settings: SettingsDep) -> CacheService:
    return CacheService(
        redis,
        enabled=settings.cache_enabled,
        default_ttl=settings.cache_ttl_seconds,
        timeout=settings.redis_timeout_seconds,
    )


CacheDep = Annotated[CacheService, Depends(get_cache)]
