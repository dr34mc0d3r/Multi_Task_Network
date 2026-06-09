from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models.stock import Stock
from ..schemas.stock import StockCreate, StockRead

router = APIRouter(prefix="/api/stocks", tags=["stocks"])


@router.get("/", response_model=List[StockRead])
def list_stocks(db: Session = Depends(get_db)):
    return db.query(Stock).all()


@router.get("/{stock_id}", response_model=StockRead)
def get_stock(stock_id: int, db: Session = Depends(get_db)):
    stock = db.query(Stock).filter(Stock.id == stock_id).first()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")
    return stock


@router.post("/", response_model=StockRead, status_code=201)
def create_stock(payload: StockCreate, db: Session = Depends(get_db)):
    stock = Stock(symbol=payload.symbol.upper(), name=payload.name)
    db.add(stock)
    db.commit()
    db.refresh(stock)
    return stock


@router.delete("/{stock_id}", status_code=204)
def delete_stock(stock_id: int, db: Session = Depends(get_db)):
    stock = db.query(Stock).filter(Stock.id == stock_id).first()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")
    db.delete(stock)
    db.commit()
