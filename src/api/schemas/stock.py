from pydantic import BaseModel


class StockCreate(BaseModel):
    symbol: str
    name: str


class StockRead(BaseModel):
    id: int
    symbol: str
    name: str

    model_config = {"from_attributes": True}
