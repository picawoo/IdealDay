from typing import Literal

from pydantic import BaseModel

ComponentStatus = Literal["ok", "unavailable"]


class HealthComponents(BaseModel):
    database: ComponentStatus
    redis: ComponentStatus


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded", "down"]
    components: HealthComponents
