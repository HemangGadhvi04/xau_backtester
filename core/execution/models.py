import time
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any, Literal

OrderType = Literal["MARKET", "LIMIT", "STOP"]
OrderDirection = Literal["BUY", "SELL"]
OrderStatus = Literal["PENDING", "FILLED", "CANCELLED", "REJECTED"]
PositionStatus = Literal["OPEN", "CLOSED"]
CloseReason = Literal["MANUAL", "SL", "TP", "MARGIN_CALL", "END_OF_SESSION"]


@dataclass
class Order:
    id: str
    session_id: str
    symbol: str
    direction: OrderDirection
    order_type: OrderType
    lots: float
    price: Optional[float] = None
    sl: Optional[float] = None
    tp: Optional[float] = None
    created_at: int = field(default_factory=lambda: int(time.time()))
    status: OrderStatus = "PENDING"


@dataclass
class Fill:
    id: str
    order_id: str
    session_id: str
    symbol: str
    direction: OrderDirection
    lots: float
    fill_price: float
    slippage: float
    spread: float
    timestamp: int
    execution_type: OrderType


@dataclass
class Position:
    id: str
    order_id: str
    session_id: str
    symbol: str
    direction: OrderDirection
    lots: float
    entry_price: float
    entry_time: int
    sl: Optional[float] = None
    tp: Optional[float] = None
    status: PositionStatus = "OPEN"
    exit_price: Optional[float] = None
    exit_time: Optional[float] = None
    pnl: float = 0.0
    commission: float = 0.0
    close_reason: Optional[CloseReason] = None


@dataclass
class AccountState:
    initial_balance: float = 10000.0
    balance: float = 10000.0
    equity: float = 10000.0
    used_margin: float = 0.0
    free_margin: float = 10000.0
    leverage: float = 100.0
    realized_pnl: float = 0.0
    unrealized_pnl: float = 0.0


@dataclass
class ReplaySnapshot:
    session_id: str
    cursor_index: int
    current_time: int
    account: AccountState
    positions: List[Dict[str, Any]]
    pending_orders: List[Dict[str, Any]]
    trade_history: List[Dict[str, Any]]
    drawings: List[Dict[str, Any]] = field(default_factory=list)
