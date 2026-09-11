from fastapi import FastAPI, Depends, HTTPException, Query, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
import json
import uuid
import threading
import pandas as pd
import hashlib
import os
import base64
import duckdb

from core.smc_engine import SMCEngine
from core.advanced_smc_engine import AdvancedSMCEngine
from core.msb_ob_mtf import MSBOBMTFEngine
from core.indicator_framework import IndicatorContext, indicator_registry
import core.builtin_indicators  # Registers built-in indicators.
from core.replay.engine import ReplayEngine
from backend.data_service import get_market_data
from backend.config import SYMBOL_CONFIGS
from backend.database import engine, Base, get_db
from backend import models, auth
from fastapi.security import OAuth2PasswordRequestForm

# Active Replay Engine Instances (per user & symbol)
REPLAY_ENGINES: Dict[str, ReplayEngine] = {}

def get_or_create_replay_engine(user_id: int, symbol: str = "XAUUSD") -> ReplayEngine:
    session_key = f"user_{user_id}_{symbol}"
    if session_key not in REPLAY_ENGINES:
        engine = ReplayEngine(session_id=session_key, symbol=symbol)
        candles = get_market_data(symbol=symbol, timeframe="1m")
        if candles:
            engine.load_data(candles)
        REPLAY_ENGINES[session_key] = engine
    return REPLAY_ENGINES[session_key]


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

SCREENSHOTS_DIR = os.getenv(
    "SCREENSHOTS_DIR",
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "screenshots"),
)
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
app.mount("/api/screenshots", StaticFiles(directory=SCREENSHOTS_DIR), name="screenshots")

# ----------------- PYDANTIC SCHEMAS -----------------

class ReplayStepRequest(BaseModel):
    count: int = 1

class ReplaySeekRequest(BaseModel):
    target_index: Optional[int] = None
    target_timestamp: Optional[int] = None

class ReplayOrderRequest(BaseModel):
    direction: str
    order_type: str = "MARKET"
    lots: float = 0.10
    price: Optional[float] = None
    sl: Optional[float] = None
    tp: Optional[float] = None

class UserCreate(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str

class SessionUpdate(BaseModel):
    symbol: Optional[str] = None
    timeframe: Optional[str] = None
    current_time: Optional[int] = None
    playback_speed: Optional[float] = None

class DrawingCreate(BaseModel):
    id: str
    session_id: str
    symbol: Optional[str] = "XAUUSD"
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
    symbol: Optional[str] = "XAUUSD"
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
    screenshot_data: Optional[str] = None

class BacktestRequest(BaseModel):
    strategy: str
    symbol: str = "XAUUSD"
    lots: float = 0.1
    sl_pips: int = 20
    tp_pips: int = 40
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    strict_confluences: Optional[bool] = True
    use_random_slippage: Optional[bool] = True
    is_lot_mode: Optional[bool] = False
    risk_percent: Optional[float] = 1.0
    initial_balance: Optional[float] = 10000.0

class IndicatorInstanceRequest(BaseModel):
    instance_id: str
    indicator_id: str
    settings: Dict[str, Any] = Field(default_factory=dict)

class IndicatorBatchRequest(BaseModel):
    symbol: str = "XAUUSD"
    timeframe: str = "1m"
    current_time: Optional[int] = None
    limit: int = 5000
    indicators: List[IndicatorInstanceRequest]

# ----------------- ENDPOINTS -----------------

@app.post("/api/auth/register", response_model=Token)
def register(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
        
    user_id = str(uuid.uuid4())
    hashed_password = auth.get_password_hash(user.password)
    new_user = models.User(id=user_id, username=user.username, hashed_password=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    access_token = auth.create_access_token(data={"sub": new_user.id})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/auth/token", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED if hasattr(status, 'HTTP_401_UNAUTHORIZED') else 401,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = auth.create_access_token(data={"sub": user.id})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/candles")
def get_candles(symbol: str = "XAUUSD", timeframe: str = "1m", from_ts: Optional[int] = None, to_ts: Optional[int] = None, limit: Optional[int] = None):
    """
    Returns historical OHLC candles for the selected symbol from precomputed Parquet.
    """
    # Standardize common frontend names
    norm_symbol = symbol.replace("/", "").upper()
    data = get_market_data(symbol=norm_symbol, timeframe=timeframe, start_ts=from_ts, end_ts=to_ts, limit=limit)
    return {"candles": data}

@app.get("/api/indicators/smc")
def get_smc_indicator(symbol: str = "XAUUSD", timeframe: str = "1m", from_ts: Optional[int] = None, to_ts: Optional[int] = None, limit: Optional[int] = 5000):
    """
    Computes and returns the SMC MTF indicator arrays (FVGs, OBs) for the frontend chart.
    """
    norm_symbol = symbol.replace("/", "").upper()
    # Fetch base data. We might need extra history (e.g., 5000 limit) to accurately calculate HTF structure.
    data = get_market_data(symbol=norm_symbol, timeframe=timeframe, start_ts=from_ts, end_ts=to_ts, limit=limit)
    if not data or len(data) < 5:
        return {"base": {}, "htf_1h": {}, "htf_4h": {}}
        
    df = pd.DataFrame(data)
    engine = SMCEngine(df)
    smc_data = engine.run_mtf_analysis()
    
    return smc_data

@app.get("/api/indicator-library")
def get_indicator_library():
    return {"indicators": list(indicator_registry.schemas())}

@app.post("/api/indicator-library/calculate")
def calculate_registered_indicators(request: IndicatorBatchRequest):
    norm_symbol = request.symbol.replace("/", "").upper()
    data = get_market_data(
        symbol=norm_symbol,
        timeframe=request.timeframe,
        end_ts=request.current_time,
        limit=min(max(request.limit, 1), 20000),
    )
    context = IndicatorContext(norm_symbol, request.timeframe, data, request.current_time, get_market_data)
    results = []
    for instance in request.indicators:
        try:
            indicator = indicator_registry.get(instance.indicator_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        results.append({
            "instance_id": instance.instance_id,
            "indicator_id": instance.indicator_id,
            "result": indicator.calculate(context, instance.settings),
        })
    return {"current_time": request.current_time, "results": results}

@app.get("/api/indicators/advanced-smc")
def get_advanced_smc_indicator(symbol: str = "XAUUSD", timeframe: str = "1m", from_ts: Optional[int] = None, to_ts: Optional[int] = None, limit: Optional[int] = 5000):
    """
    Computes and returns the Advanced QML/RBS/SBS SMC indicator zones.
    """
    norm_symbol = symbol.replace("/", "").upper()
    data = get_market_data(symbol=norm_symbol, timeframe=timeframe, start_ts=from_ts, end_ts=to_ts, limit=limit)
    if not data or len(data) < 5:
        return []
        
    df = pd.DataFrame(data)
    engine = AdvancedSMCEngine(df)
    zones = engine.process_candles()
    
    return zones

@app.get("/api/indicators/msb-ob-mtf")
def get_msb_ob_mtf_indicator(symbol: str = "XAUUSD", timeframe: str = "1m", limit: int = 5000):
    norm_symbol = symbol.replace("/", "").upper()
    data = get_market_data(symbol=norm_symbol, timeframe=timeframe, limit=limit)
    if not data or len(data) < 20:
        return {"emas": {"fast": [], "slow": []}, "swings": [], "events": [], "zones": [], "dashboard": {}}

    trend_timeframes = [("5m", "5m"), ("15m", "15m"), ("1H", "1h"), ("4H", "4h"), ("1D", "1d")]
    trends = {}
    for label, tf in trend_timeframes:
        tf_data = get_market_data(symbol=norm_symbol, timeframe=tf, limit=500)
        trends[label] = MSBOBMTFEngine.trend_for(tf_data)

    return MSBOBMTFEngine(data).run(trends)

@app.get("/api/indicators/geometric")
def get_geometric_indicator(symbol: str = "XAUUSD", timeframe: str = "1m", from_ts: Optional[int] = None, to_ts: Optional[int] = None, limit: Optional[int] = 5000):
    norm_symbol = symbol.replace("/", "").upper()
    data = get_market_data(symbol=norm_symbol, timeframe=timeframe, start_ts=from_ts, end_ts=to_ts, limit=limit)
    if not data or len(data) < 5:
        return {"anchors": [], "boxes": []}

    from datetime import datetime, timezone
    
    anchors = []
    boxes = []
    
    current_day_high = None
    current_day_low = None
    
    grid_unit = None
    anchor_price = None
    grid_levels = []
    broken_levels = set()
    prev_candle = None
    
    for c in data:
        dt = datetime.fromtimestamp(c['time'], tz=timezone.utc)
        
        # update range
        if current_day_high is None or c['high'] > current_day_high:
            current_day_high = c['high']
        if current_day_low is None or c['low'] < current_day_low:
            current_day_low = c['low']
            
        if dt.hour == 22 and dt.minute == 0:
            pdh = current_day_high
            pdl = current_day_low
            anchor_price = c['open']
            
            # Reset
            current_day_high = c['high']
            current_day_low = c['low']
            
            if pdh is not None and pdl is not None:
                grid_unit = (pdh - pdl) / 4.618
                anchors.append({
                    'time': c['time'],
                    'anchor': anchor_price,
                    'unit': grid_unit
                })
                grid_levels = [
                    {'price': anchor_price + (grid_unit * 1.00), 'id': 'UP_100'},
                    {'price': anchor_price + (grid_unit * 0.75), 'id': 'UP_75'},
                    {'price': anchor_price + (grid_unit * 0.50), 'id': 'UP_50'},
                    {'price': anchor_price - (grid_unit * 0.50), 'id': 'DN_50'},
                    {'price': anchor_price - (grid_unit * 0.75), 'id': 'DN_75'},
                    {'price': anchor_price - (grid_unit * 1.00), 'id': 'DN_100'},
                ]
                broken_levels.clear()
        
        if grid_unit is not None and prev_candle is not None:
            curr_close = c['close']
            prev_close = prev_candle['close']
            for level in grid_levels:
                lvl_price = level['price']
                lvl_id = level['id']
                if lvl_id in broken_levels:
                    continue
                is_breakout = False
                direction = None
                if curr_close > lvl_price and prev_close <= lvl_price:
                    is_breakout = True
                    direction = 'BUY'
                elif curr_close < lvl_price and prev_close >= lvl_price:
                    is_breakout = True
                    direction = 'SELL'
                
                if is_breakout:
                    broken_levels.add(lvl_id)
                    body = abs(c['close'] - c['open'])
                    if body >= 0.2:
                        top = max(c['open'], c['close'])
                        bot = min(c['open'], c['close'])
                        boxes.append({
                            'time': c['time'],
                            'top': top,
                            'bottom': bot,
                            'direction': direction
                        })
        prev_candle = c

    return {"anchors": anchors, "boxes": boxes}

@app.get("/api/status")
def status():
    return {"status": "ok"}

@app.get("/api/symbols")
def get_symbols():
    return SYMBOL_CONFIGS

# ----------------- AUTHORITATIVE REPLAY ENGINE API -----------------

@app.get("/api/replay/state")
def get_replay_state(symbol: str = "XAUUSD", current_user: models.User = Depends(auth.get_current_user)):
    engine = get_or_create_replay_engine(current_user.id, symbol)
    return engine.get_state()

@app.post("/api/replay/step")
def step_replay(req: ReplayStepRequest, symbol: str = "XAUUSD", current_user: models.User = Depends(auth.get_current_user)):
    engine = get_or_create_replay_engine(current_user.id, symbol)
    return engine.step(req.count)

@app.post("/api/replay/seek")
def seek_replay(req: ReplaySeekRequest, symbol: str = "XAUUSD", current_user: models.User = Depends(auth.get_current_user)):
    engine = get_or_create_replay_engine(current_user.id, symbol)
    if req.target_index is not None:
        return engine.seek_to_index(req.target_index)
    elif req.target_timestamp is not None:
        return engine.seek_to_timestamp(req.target_timestamp)
    raise HTTPException(status_code=400, detail="Must provide target_index or target_timestamp")

@app.post("/api/replay/order")
def place_replay_order(req: ReplayOrderRequest, symbol: str = "XAUUSD", current_user: models.User = Depends(auth.get_current_user)):
    engine = get_or_create_replay_engine(current_user.id, symbol)
    result = engine.place_order(
        direction=req.direction.upper(),
        order_type=req.order_type.upper(),
        lots=req.lots,
        price=req.price,
        sl=req.sl,
        tp=req.tp
    )
    return result

@app.delete("/api/replay/order/{order_id}")
def cancel_replay_order(order_id: str, symbol: str = "XAUUSD", current_user: models.User = Depends(auth.get_current_user)):
    engine = get_or_create_replay_engine(current_user.id, symbol)
    success = engine.cancel_order(order_id)
    if not success:
        raise HTTPException(status_code=404, detail="Order not found")
    return {"status": "cancelled", "order_id": order_id}

@app.post("/api/replay/position/{position_id}/close")
def close_replay_position(position_id: str, symbol: str = "XAUUSD", current_user: models.User = Depends(auth.get_current_user)):
    engine = get_or_create_replay_engine(current_user.id, symbol)
    closed = engine.close_position(position_id, reason="MANUAL")
    if not closed:
        raise HTTPException(status_code=404, detail="Position not found")
    return {"status": "closed", "trade": closed}


# Replay Session State
@app.get("/api/session")
def get_session(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    session_id = f"session_{current_user.id}"
    session = db.query(models.ReplaySession).filter(
        models.ReplaySession.id == session_id,
        models.ReplaySession.user_id == current_user.id
    ).first()
    if not session:
        session = models.ReplaySession(
            id=session_id,
            user_id=current_user.id,
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
def update_session(data: SessionUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    session_id = f"session_{current_user.id}"
    session = db.query(models.ReplaySession).filter(
        models.ReplaySession.id == session_id,
        models.ReplaySession.user_id == current_user.id
    ).first()
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
def get_drawings(timeframe: Optional[str] = None, symbol: Optional[str] = None, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    query = db.query(models.Drawing).filter(models.Drawing.user_id == current_user.id)
    if timeframe:
        query = query.filter(models.Drawing.timeframe == timeframe)
    if symbol:
        query = query.filter(models.Drawing.symbol == symbol)
    return query.all()

@app.post("/api/drawings")
def create_drawing(drawing: DrawingCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    existing = db.query(models.Drawing).filter(models.Drawing.id == drawing.id, models.Drawing.user_id == current_user.id).first()
    if existing:
        existing.points_json = drawing.points_json
        existing.style_json = drawing.style_json
        existing.timeframe = drawing.timeframe
        existing.symbol = drawing.symbol
        db.commit()
        db.refresh(existing)
        return existing

    db_drawing = models.Drawing(
        id=drawing.id,
        user_id=current_user.id,
        session_id=drawing.session_id,
        symbol=drawing.symbol,
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
def update_drawing(id: str, drawing: DrawingUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_drawing = db.query(models.Drawing).filter(models.Drawing.id == id, models.Drawing.user_id == current_user.id).first()
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
def delete_drawing(id: str, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_drawing = db.query(models.Drawing).filter(models.Drawing.id == id, models.Drawing.user_id == current_user.id).first()
    if not db_drawing:
        raise HTTPException(status_code=404, detail="Drawing not found")
    db.delete(db_drawing)
    db.commit()
    return {"status": "deleted"}

@app.delete("/api/drawings/all/clear")
def clear_all_drawings(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    db.query(models.Drawing).filter(models.Drawing.user_id == current_user.id).delete()
    db.commit()
    return {"status": "cleared"}

# Trades & Orders Journal
@app.get("/api/trades")
def get_trades(symbol: Optional[str] = None, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    query = db.query(models.Trade).filter(models.Trade.user_id == current_user.id)
    if symbol:
        query = query.filter(models.Trade.symbol == symbol)
    trades = query.all()
    result = []
    for t in trades:
        note = db.query(models.TradeNote).filter(models.TradeNote.trade_id == t.id).first()
        tags = db.query(models.TradeTag).filter(models.TradeTag.trade_id == t.id).all()
        
        result.append({
            "id": t.id,
            "session_id": t.session_id,
            "symbol": t.symbol,
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
                "screenshot_url": note.screenshot_url if note else "",
            } if note else {"setup_name": "", "mistake_type": "", "emotion": "", "lesson": "", "screenshot_url": ""},
            "tags": [{"category": tag.tag_category, "value": tag.tag_value} for tag in tags]
        })
    return result

@app.post("/api/trades/{id}/journal")
def update_trade_journal(id: str, data: JournalUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    trade = db.query(models.Trade).filter(models.Trade.id == id, models.Trade.user_id == current_user.id).first()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
        
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
        
    # Handle screenshot saving
    if data.screenshot_data:
        try:
            # Format is usually 'data:image/png;base64,...'
            header, encoded = data.screenshot_data.split(",", 1)
            file_data = base64.b64decode(encoded)
            file_path = os.path.join(SCREENSHOTS_DIR, f"{id}.png")
            with open(file_path, "wb") as f:
                f.write(file_data)
            note.screenshot_url = f"/api/screenshots/{id}.png"
        except Exception as e:
            print(f"Error saving screenshot: {e}")
            
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
def create_trade(trade: TradeCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_trade = models.Trade(
        id=trade.id,
        user_id=current_user.id,
        session_id=trade.session_id,
        symbol=trade.symbol,
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
def update_trade(id: str, trade: TradeUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_trade = db.query(models.Trade).filter(models.Trade.id == id, models.Trade.user_id == current_user.id).first()
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
def delete_trade(id: str, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_trade = db.query(models.Trade).filter(models.Trade.id == id, models.Trade.user_id == current_user.id).first()
    if not db_trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    db.delete(db_trade)
    db.commit()
    return {"status": "deleted"}

from backend.tasks import run_backtest_task
from backend.worker import app as celery_app

@app.post("/api/backtest/cancel/{job_id}")
def cancel_backtest(job_id: str):
    res = celery_app.AsyncResult(job_id)
    res.revoke(terminate=True)
    return {"status": "cancelled"}


@app.post("/api/backtest/run")
def start_backtest(req: BacktestRequest):
    # Dispatch Celery task
    task = run_backtest_task.delay(req.dict())
    return {"job_id": task.id}

@app.get("/api/backtest/status/{job_id}")
def get_backtest_status(job_id: str):
    res = celery_app.AsyncResult(job_id)
    
    if res.state == 'PENDING':
        return {"status": "pending", "progress": 0}
    elif res.state == 'PROGRESS':
        return {"status": "running", "progress": res.info.get('progress', 0)}
    elif res.state == 'SUCCESS':
        # Result dict format matches what the frontend expects
        return res.result
    elif res.state == 'FAILURE':
        return {"status": "failed", "error": str(res.info)}
    elif res.state == 'REVOKED':
        return {"status": "failed", "error": "Cancelled by user"}
        
    return {"status": "running", "progress": 50}

@app.post("/api/backtest")
def run_systematic_backtest(req: BacktestRequest):
    # Normalize symbol
    norm_symbol = req.symbol.replace("/", "").upper()
    
    # 1. Load Data
    candles = get_market_data(symbol=norm_symbol, timeframe="1m")
    if not candles:
        raise HTTPException(status_code=400, detail=f"No historical data found for {norm_symbol}. Please run the data downloader.")
    
    original_candles = candles
    # Filter candles by date range if provided
    if req.start_date:
        try:
            start_ts = int(pd.to_datetime(req.start_date, utc=True).timestamp())
            candles = [c for c in candles if c['time'] >= start_ts]
        except Exception as e:
            print(f"Failed to parse start_date: {e}")
            
    if req.end_date:
        try:
            # Make end_date inclusive of the whole day (23:59:59)
            end_dt = pd.to_datetime(req.end_date, utc=True) + pd.Timedelta(days=1, seconds=-1)
            end_ts = int(end_dt.timestamp())
            candles = [c for c in candles if c['time'] <= end_ts]
        except Exception as e:
            print(f"Failed to parse end_date: {e}")

    if not candles:
        if original_candles:
            first_date = pd.to_datetime(original_candles[0]['time'], unit='s', utc=True).strftime('%Y-%m-%d')
            last_date = pd.to_datetime(original_candles[-1]['time'], unit='s', utc=True).strftime('%Y-%m-%d')
            raise HTTPException(status_code=400, detail=f"No data matches selected dates. {norm_symbol} data is available from {first_date} to {last_date}.")
        else:
            raise HTTPException(status_code=400, detail="No historical data matches the selected date range filter.")
    
    # 2. Setup engine
    from core.engine import BacktestEngine
    engine = BacktestEngine(initial_balance=10000, leverage=100, symbol=norm_symbol)
    engine.load_data(candles)
    
    # 3. Instantiate strategy
    if req.strategy == "tbm_7ema":
        from strategies.tbm_7ema_strategy import TBM7EMAStrategy
        strategy = TBM7EMAStrategy(ema_fast=7, ema_slow=30, rr_ratio=3.0, lots=req.lots)
    elif req.strategy == "ema_cross":
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
    
    # Downsample equity curve to max 2000 points
    # equity_curve has initial balance so it is 1 longer than timestamps
    eq_curve = engine.equity_curve[1:] if len(engine.equity_curve) > len(engine.timestamps) else engine.equity_curve
    timestamps = engine.timestamps
    n = min(len(eq_curve), len(timestamps))
    
    if n > 2000:
        step = n // 2000
        sampled_curve = [eq_curve[i] for i in range(0, n, step)]
        sampled_times = [timestamps[i] for i in range(0, n, step)]
        # Make sure to include the last element
        if (n - 1) % step != 0:
            sampled_curve.append(eq_curve[-1])
            sampled_times.append(timestamps[-1])
    else:
        sampled_curve = eq_curve[:n]
        sampled_times = timestamps[:n]
        
    return {
        "status": "success",
        "metrics": metrics,
        "trades": engine.trade_history,
        "equity_curve": [{"time": t, "value": v} for t, v in zip(sampled_times, sampled_curve)]
    }
