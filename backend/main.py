from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
import json

from backend.data_service import get_xauusd_data
from backend.database import engine, Base, get_db
from backend import models

# Initialize Database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="XAUUSD Replay Platform Backend")

# Allow CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- PYDANTIC SCHEMAS -----------------

class SessionUpdate(BaseModel):
    symbol: Optional[str] = None
    timeframe: Optional[str] = None
    current_time: Optional[int] = None
    playback_speed: Optional[float] = None

class DrawingCreate(BaseModel):
    id: str
    session_id: str
    type: str
    points_json: str
    style_json: Optional[str] = None
    timeframe: str

class DrawingUpdate(BaseModel):
    points_json: Optional[str] = None
    style_json: Optional[str] = None

class TradeCreate(BaseModel):
    id: str
    session_id: str
    direction: str
    lots: float
    entry_price: float
    entry_time: int
    sl: Optional[float] = None
    tp: Optional[float] = None
    status: str = "OPEN"

class TradeUpdate(BaseModel):
    entry_price: Optional[float] = None
    entry_time: Optional[int] = None
    sl: Optional[float] = None
    tp: Optional[float] = None
    exit_price: Optional[float] = None
    exit_time: Optional[int] = None
    status: Optional[str] = None
    pnl: Optional[float] = None
    notes: Optional[str] = None

class JournalUpdate(BaseModel):
    setup_name: Optional[str] = None
    mistake_type: Optional[str] = None
    emotion: Optional[str] = None
    lesson: Optional[str] = None
    tags: Optional[List[dict]] = None

class BacktestRequest(BaseModel):
    strategy: str
    lots: float = 0.1
    sl_pips: int = 20
    tp_pips: int = 40

# ----------------- ENDPOINTS -----------------

@app.get("/api/candles")
def get_candles(timeframe: str = "1m"):
    """
    Returns historical OHLC candles for XAUUSD aggregated to the requested timeframe.
    """
    data = get_xauusd_data(timeframe=timeframe)
    return {"candles": data}

@app.get("/api/status")
def status():
    return {"status": "ok"}

# Replay Session State
@app.get("/api/session")
def get_session(db: Session = Depends(get_db)):
    # Default session for single-user environment
    session_id = "default_session"
    session = db.query(models.ReplaySession).filter(models.ReplaySession.id == session_id).first()
    if not session:
        session = models.ReplaySession(
            id=session_id,
            symbol="XAUUSD",
            timeframe="1m",
            current_time=0,
            playback_speed=1.0
        )
        db.add(session)
        db.commit()
        db.refresh(session)
    return session

@app.post("/api/session")
def update_session(data: SessionUpdate, db: Session = Depends(get_db)):
    session_id = "default_session"
    session = db.query(models.ReplaySession).filter(models.ReplaySession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if data.symbol is not None:
        session.symbol = data.symbol
    if data.timeframe is not None:
        session.timeframe = data.timeframe
    if data.current_time is not None:
        session.current_time = data.current_time
    if data.playback_speed is not None:
        session.playback_speed = data.playback_speed
        
    db.commit()
    db.refresh(session)
    return session

# Drawings Persistence
@app.get("/api/drawings")
def get_drawings(timeframe: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(models.Drawing)
    if timeframe:
        query = query.filter(models.Drawing.timeframe == timeframe)
    return query.all()

@app.post("/api/drawings")
def create_drawing(drawing: DrawingCreate, db: Session = Depends(get_db)):
    # If drawing already exists, overwrite it (prevents duplicate key errors)
    existing = db.query(models.Drawing).filter(models.Drawing.id == drawing.id).first()
    if existing:
        existing.points_json = drawing.points_json
        existing.style_json = drawing.style_json
        existing.timeframe = drawing.timeframe
        db.commit()
        db.refresh(existing)
        return existing

    db_drawing = models.Drawing(
        id=drawing.id,
        session_id=drawing.session_id,
        type=drawing.type,
        points_json=drawing.points_json,
        style_json=drawing.style_json,
        timeframe=drawing.timeframe
    )
    db.add(db_drawing)
    db.commit()
    db.refresh(db_drawing)
    return db_drawing

@app.patch("/api/drawings/{id}")
def update_drawing(id: str, drawing: DrawingUpdate, db: Session = Depends(get_db)):
    db_drawing = db.query(models.Drawing).filter(models.Drawing.id == id).first()
    if not db_drawing:
        raise HTTPException(status_code=404, detail="Drawing not found")
    
    if drawing.points_json is not None:
        db_drawing.points_json = drawing.points_json
    if drawing.style_json is not None:
        db_drawing.style_json = drawing.style_json
        
    db.commit()
    db.refresh(db_drawing)
    return db_drawing

@app.delete("/api/drawings/{id}")
def delete_drawing(id: str, db: Session = Depends(get_db)):
    db_drawing = db.query(models.Drawing).filter(models.Drawing.id == id).first()
    if not db_drawing:
        raise HTTPException(status_code=404, detail="Drawing not found")
    db.delete(db_drawing)
    db.commit()
    return {"status": "deleted"}

@app.delete("/api/drawings/all/clear")
def clear_all_drawings(db: Session = Depends(get_db)):
    db.query(models.Drawing).delete()
    db.commit()
    return {"status": "cleared"}

# Trades & Orders Journal
@app.get("/api/trades")
def get_trades(db: Session = Depends(get_db)):
    trades = db.query(models.Trade).all()
    result = []
    for t in trades:
        note = db.query(models.TradeNote).filter(models.TradeNote.trade_id == t.id).first()
        tags = db.query(models.TradeTag).filter(models.TradeTag.trade_id == t.id).all()
        
        result.append({
            "id": t.id,
            "session_id": t.session_id,
            "direction": t.direction,
            "lots": t.lots,
            "entry_price": t.entry_price,
            "entry_time": t.entry_time,
            "sl": t.sl,
            "tp": t.tp,
            "exit_price": t.exit_price,
            "exit_time": t.exit_time,
            "status": t.status,
            "pnl": t.pnl,
            "notes": t.notes,
            "journal_note": {
                "setup_name": note.setup_name if note else "",
                "mistake_type": note.mistake_type if note else "",
                "emotion": note.emotion if note else "",
                "lesson": note.lesson if note else "",
            } if note else {"setup_name": "", "mistake_type": "", "emotion": "", "lesson": ""},
            "tags": [{"category": tag.tag_category, "value": tag.tag_value} for tag in tags]
        })
    return result

@app.post("/api/trades/{id}/journal")
def update_trade_journal(id: str, data: JournalUpdate, db: Session = Depends(get_db)):
    # Find note or create one
    note = db.query(models.TradeNote).filter(models.TradeNote.trade_id == id).first()
    if not note:
        note = models.TradeNote(trade_id=id)
        db.add(note)
    
    if data.setup_name is not None:
        note.setup_name = data.setup_name
    if data.mistake_type is not None:
        note.mistake_type = data.mistake_type
    if data.emotion is not None:
        note.emotion = data.emotion
    if data.lesson is not None:
        note.lesson = data.lesson
        
    # Update tags if provided
    if data.tags is not None:
        # Delete existing tags for this trade
        db.query(models.TradeTag).filter(models.TradeTag.trade_id == id).delete()
        # Insert new tags
        for t in data.tags:
            tag = models.TradeTag(
                trade_id=id,
                tag_category=t.get("category"),
                tag_value=t.get("value")
            )
            db.add(tag)
            
    db.commit()
    return {"status": "success"}

@app.post("/api/trades")
def create_trade(trade: TradeCreate, db: Session = Depends(get_db)):
    db_trade = models.Trade(
        id=trade.id,
        session_id=trade.session_id,
        direction=trade.direction,
        lots=trade.lots,
        entry_price=trade.entry_price,
        entry_time=trade.entry_time,
        sl=trade.sl,
        tp=trade.tp,
        status=trade.status
    )
    db.add(db_trade)
    db.commit()
    db.refresh(db_trade)
    return db_trade

@app.patch("/api/trades/{id}")
def update_trade(id: str, trade: TradeUpdate, db: Session = Depends(get_db)):
    db_trade = db.query(models.Trade).filter(models.Trade.id == id).first()
    if not db_trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    if trade.entry_price is not None:
        db_trade.entry_price = trade.entry_price
    if trade.entry_time is not None:
        db_trade.entry_time = trade.entry_time
    if trade.sl is not None:
        db_trade.sl = trade.sl
    if trade.tp is not None:
        db_trade.tp = trade.tp
    if trade.exit_price is not None:
        db_trade.exit_price = trade.exit_price
    if trade.exit_time is not None:
        db_trade.exit_time = trade.exit_time
    if trade.status is not None:
        db_trade.status = trade.status
    if trade.pnl is not None:
        db_trade.pnl = trade.pnl
    if trade.notes is not None:
        db_trade.notes = trade.notes
        
    db.commit()
    db.refresh(db_trade)
    return db_trade

@app.delete("/api/trades/{id}")
def delete_trade(id: str, db: Session = Depends(get_db)):
    db_trade = db.query(models.Trade).filter(models.Trade.id == id).first()
    if not db_trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    db.delete(db_trade)
    db.commit()
    return {"status": "deleted"}

@app.post("/api/backtest")
def run_systematic_backtest(req: BacktestRequest):
    # 1. Load candles via DuckDB
    candles = get_xauusd_data(timeframe="1m")
    if not candles:
        raise HTTPException(status_code=400, detail="No historical data found. Please run the data downloader.")
    
    # 2. Setup engine
    from core.engine import BacktestEngine
    engine = BacktestEngine(initial_balance=10000, leverage=100, spread=0.20)
    engine.load_data(candles)
    
    # 3. Instantiate strategy
    if req.strategy == "ema_cross":
        from strategies.ema_cross import EMACrossoverStrategy
        strategy = EMACrossoverStrategy(
            lots=req.lots,
            sl_pips=req.sl_pips,
            tp_pips=req.tp_pips
        )
    else:
        from strategies.ema_cross import EMACrossoverStrategy
        strategy = EMACrossoverStrategy(
            lots=req.lots,
            sl_pips=req.sl_pips,
            tp_pips=req.tp_pips
        )
        
    # 4. Run backtest
    engine.run(strategy)
    
    # 5. Return metrics
    metrics = engine.calculate_metrics()
    return {
        "status": "success",
        "metrics": metrics
    }
