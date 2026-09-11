from typing import List, Dict, Any, Tuple
from core.execution.models import OrderDirection, AccountState


def calculate_trade_pnl(
    direction: OrderDirection,
    entry_price: float,
    exit_price: float,
    lots: float,
    contract_size: float = 100.0,
    commission_per_lot: float = 0.0
) -> Tuple[float, float]:
    """
    Calculates realized net P&L and commission for a trade.
    """
    if direction == "BUY":
        price_diff = exit_price - entry_price
    else:
        price_diff = entry_price - exit_price

    gross_pnl = price_diff * lots * contract_size
    commission = lots * commission_per_lot
    net_pnl = gross_pnl - commission
    return net_pnl, commission


def calculate_position_unrealized_pnl(
    direction: OrderDirection,
    entry_price: float,
    current_bid: float,
    spread: float,
    lots: float,
    contract_size: float = 100.0,
    commission_per_lot: float = 0.0
) -> float:
    """
    Calculates unrealized mark-to-market P&L for an open position.
    BUY exits at Bid. SELL exits at Ask = Bid + Spread.
    """
    if direction == "BUY":
        current_exit = current_bid
        price_diff = current_exit - entry_price
    else:
        current_exit = current_bid + spread
        price_diff = entry_price - current_exit

    gross_unrealized = price_diff * lots * contract_size
    commission = lots * commission_per_lot
    return gross_unrealized - commission


def update_account_state(
    account: AccountState,
    positions: List[Dict[str, Any]],
    current_bid: float,
    spread: float,
    contract_size: float = 100.0,
    commission_per_lot: float = 0.0
) -> AccountState:
    """
    Recalculates equity, unrealized P&L, used margin, and free margin.
    """
    unrealized_total = 0.0
    used_margin_total = 0.0

    for pos in positions:
        if pos.get("status", "OPEN") != "OPEN":
            continue
            
        unrealized = calculate_position_unrealized_pnl(
            direction=pos["direction"],
            entry_price=pos["entry_price"],
            current_bid=current_bid,
            spread=spread,
            lots=pos["lots"],
            contract_size=contract_size,
            commission_per_lot=commission_per_lot
        )
        unrealized_total += unrealized
        
        # Calculate used margin for position
        margin = (pos["entry_price"] * pos["lots"] * contract_size) / account.leverage
        used_margin_total += margin

    account.unrealized_pnl = unrealized_total
    account.equity = account.balance + unrealized_total
    account.used_margin = used_margin_total
    account.free_margin = account.equity - used_margin_total
    return account
