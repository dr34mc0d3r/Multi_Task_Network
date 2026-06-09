from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TrainingConfigCreate(BaseModel):
    name: str
    symbol: str
    timeframe: str
    feed: str
    adjustment: str
    config_json: str


class TrainingConfigUpdate(BaseModel):
    config_json: str
    name: str | None = None


class TrainingConfigRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    symbol: str
    timeframe: str
    feed: str
    adjustment: str
    config_json: str
    created_at: datetime
