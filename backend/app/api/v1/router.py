from fastapi import APIRouter

from app.api.v1 import auth, biorhythms, health, profile, recommendations, schedule, tasks

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(profile.router)
api_router.include_router(biorhythms.router)
api_router.include_router(recommendations.router)
api_router.include_router(tasks.router)
api_router.include_router(schedule.router)
