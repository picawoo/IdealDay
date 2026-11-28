from fastapi import APIRouter

from app.core.deps import CurrentUser, ProfileDep, SessionDep
from app.repositories import profiles as profiles_repo
from app.schemas.errors import ErrorResponse
from app.schemas.profile import ProfileResponse, ProfileUpsert

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get(
    "",
    response_model=ProfileResponse,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
async def get_profile(profile: ProfileDep) -> ProfileResponse:
    return ProfileResponse.model_validate(profile)


@router.put("", response_model=ProfileResponse, responses={401: {"model": ErrorResponse}})
async def put_profile(
    body: ProfileUpsert, user: CurrentUser, session: SessionDep
) -> ProfileResponse:
    """Создаёт профиль или полностью заменяет существующий."""
    profile = await profiles_repo.upsert(session, user.id, body)
    return ProfileResponse.model_validate(profile)
