from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine
from .models import Base  # importing the package triggers all model registrations
from .routers import stocks, bars, alpaca, features, training_data, training

# Create all lstm_2_* ORM tables on startup if they don't exist
Base.metadata.create_all(bind=engine)

app = FastAPI(title="lstm-2 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stocks.router)
app.include_router(bars.router)
app.include_router(alpaca.router)
app.include_router(features.router)
app.include_router(training_data.router)
app.include_router(training.router)


@app.get("/health")
def health():
    return {"status": "ok"}
