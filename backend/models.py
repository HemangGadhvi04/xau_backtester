from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from backend.database import Base
import datetime

class ReplaySession(Base):
    __tablename__ = "replay_sessions"

    id = Column(String, primary_key=True, index=True)
    symbol = Column(String, default="XAUUSD")
    timeframe = Column(String, default="1m")
    current_time = Column(Integer, default=0)
    playback_speed = Column(Float, default=1.0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class Drawing(Base):
    __tablename__ = "drawings"

    id = Column(String, primary_key=True, index=True)
    session_id = Column(String, index=True)
    type = Column(String, nullable=False)
    points_json = Column(String, nullable=False)  # Serialized JSON points list: [{"time": ..., "price": ...}]
    style_json = Column(String, nullable=True)   # Serialized style parameters
    timeframe = Column(String, default="1m")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class Trade(Base):
    __tablename__ = "trades"

    id = Column(String, primary_key=True, index=True)
    session_id = Column(String, index=True)
    direction = Column(String, nullable=False)     # BUY or SELL
    lots = Column(Float, nullable=False)
    entry_price = Column(Float, nullable=False)
    entry_time = Column(Integer, nullable=False)    # Unix timestamp
    sl = Column(Float, nullable=True)
    tp = Column(Float, nullable=True)
    exit_price = Column(Float, nullable=True)
    exit_time = Column(Integer, nullable=True)      # Unix timestamp
    status = Column(String, default="OPEN")         # OPEN, CLOSED, or PENDING
    pnl = Column(Float, default=0.0)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class TradeTag(Base):
    __tablename__ = "trade_tags"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    trade_id = Column(String, ForeignKey("trades.id", ondelete="CASCADE"), index=True)
    tag_category = Column(String, nullable=False)   # Setup, Confluence, Error, etc.
    tag_value = Column(String, nullable=False)      # e.g., "OTE", "FVG Sweep", "Early Entry"

class TradeNote(Base):
    __tablename__ = "trade_notes"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    trade_id = Column(String, ForeignKey("trades.id", ondelete="CASCADE"), index=True)
    setup_name = Column(String, nullable=True)
    mistake_type = Column(String, nullable=True)
    emotion = Column(String, nullable=True)
    lesson = Column(String, nullable=True)
