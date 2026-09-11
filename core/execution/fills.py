import hashlib
from typing import Dict, Any, Tuple, Optional
from core.execution.models import OrderDirection, OrderType


def hash_seed_material(seed_str: str) -> float:
    """
    Deterministically hash a seed string into a float in the range [0.0, 1.0).
    """
    digest = hashlib.sha256(seed_str.encode("utf-8")).hexdigest()
    # Take first 8 bytes (16 hex chars) as unsigned int
    val = int(digest[:16], 16)
    max_val = 0xFFFFFFFFFFFFFFFF
    return val / max_val


def calculate_deterministic_slippage(
    session_id: str,
    order_id: str,
    timestamp: int,
    execution_type: str,
    pip_size: float = 0.1
) -> float:
    """
    Calculates deterministic slippage based on stable seed material:
    session_id + order_id + timestamp + execution_type.
    """
    seed_str = f"{session_id}:{order_id}:{timestamp}:{execution_type}"
    rand_ratio = hash_seed_material(seed_str)
    
    # Hour of day (UTC)
    hour = (timestamp % 86400) // 3600
    is_overlap = (12 <= hour <= 16)
    
    base_pips = 0.2 if is_overlap else 0.1
    max_random_pips = 0.8 if is_overlap else 0.3
    
    random_pips = rand_ratio * max_random_pips
    return (base_pips + random_pips) * pip_size


def calculate_market_fill(
    direction: OrderDirection,
    bid_price: float,
    spread: float,
    slippage: float
) -> Tuple[float, float]:
    """
    Calculates market order fill price and effective spread/slippage.
    BUY fills at Ask = Bid + Spread + Slippage
    SELL fills at Bid = Bid - Slippage
    """
    if direction == "BUY":
        fill_price = bid_price + spread + slippage
    else:
        fill_price = bid_price - slippage
    return fill_price, slippage


def check_limit_order_trigger(
    direction: OrderDirection,
    target_price: float,
    candle: Dict[str, Any],
    spread: float,
    slippage: float
) -> Tuple[bool, Optional[float]]:
    """
    Checks if a Limit order is triggered by candle data and returns fill price.
    """
    if direction == "BUY":
        # Limit BUY triggers if candle Low (Bid) <= target_price
        if candle['low'] <= target_price:
            fill_price = target_price + spread + slippage
            return True, fill_price
    else:
        # Limit SELL triggers if Ask High (candle['high'] + spread) >= target_price
        ask_high = candle['high'] + spread
        if ask_high >= target_price:
            fill_price = target_price - slippage
            return True, fill_price
            
    return False, None


def check_stop_order_trigger(
    direction: OrderDirection,
    target_price: float,
    candle: Dict[str, Any],
    spread: float,
    slippage: float
) -> Tuple[bool, Optional[float]]:
    """
    Checks if a Stop order is triggered by candle data (handling gap-open fills).
    """
    if direction == "BUY":
        # Stop BUY triggers if candle High >= target_price
        if candle['high'] >= target_price:
            # Handle gap up on candle open
            trigger_base = max(target_price, candle['open'])
            fill_price = trigger_base + spread + slippage
            return True, fill_price
    else:
        # Stop SELL triggers if Ask Low (candle['low'] + spread) <= target_price
        ask_low = candle['low'] + spread
        if ask_low <= target_price:
            # Handle gap down on candle open
            trigger_base = min(target_price, candle['open'] + spread)
            fill_price = trigger_base - slippage
            return True, fill_price

    return False, None
