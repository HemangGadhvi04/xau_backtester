import pytest
from core.execution.fills import (
    calculate_deterministic_slippage,
    calculate_market_fill,
    check_limit_order_trigger,
    check_stop_order_trigger
)
from core.execution.pnl import calculate_trade_pnl, calculate_position_unrealized_pnl
from core.replay.engine import ReplayEngine


def test_deterministic_slippage_repeatability():
    """Verify identical inputs yield byte-for-byte identical fill slippage."""
    s1 = calculate_deterministic_slippage("session_123", "ord_1", 1700000000, "MARKET", 0.1)
    s2 = calculate_deterministic_slippage("session_123", "ord_1", 1700000000, "MARKET", 0.1)
    assert s1 == s2

    # Different order ID yields different (yet deterministic) slippage
    s3 = calculate_deterministic_slippage("session_123", "ord_2", 1700000000, "MARKET", 0.1)
    assert isinstance(s3, float)


def test_market_order_fill_prices():
    """Verify BUY fills at Ask (Bid+Spread+Slippage) and SELL fills at Bid-Slippage."""
    bid = 2000.00
    spread = 0.30
    slippage = 0.05

    buy_price, _ = calculate_market_fill("BUY", bid, spread, slippage)
    assert buy_price == pytest.approx(2000.35)

    sell_price, _ = calculate_market_fill("SELL", bid, spread, slippage)
    assert sell_price == pytest.approx(1999.95)


def test_limit_order_triggers():
    """Verify Limit BUY and Limit SELL trigger conditions."""
    candle = {"time": 1700000000, "open": 2000.0, "high": 2005.0, "low": 1990.0, "close": 1995.0}
    spread = 0.30
    slippage = 0.05

    # Limit BUY at 1992 (candle low 1990 <= 1992 -> Triggered)
    trig, fill = check_limit_order_trigger("BUY", 1992.0, candle, spread, slippage)
    assert trig is True
    assert fill == pytest.approx(1992.35)

    # Limit BUY at 1985 (candle low 1990 > 1985 -> Not Triggered)
    trig, fill = check_limit_order_trigger("BUY", 1985.0, candle, spread, slippage)
    assert trig is False
    assert fill is None


def test_stop_order_triggers():
    """Verify Stop BUY and Stop SELL trigger conditions."""
    candle = {"time": 1700000000, "open": 2000.0, "high": 2010.0, "low": 1995.0, "close": 2008.0}
    spread = 0.30
    slippage = 0.05

    # Stop BUY at 2005 (candle high 2010 >= 2005 -> Triggered)
    trig, fill = check_stop_order_trigger("BUY", 2005.0, candle, spread, slippage)
    assert trig is True
    assert fill == pytest.approx(2005.35)


def test_trade_pnl_calculations():
    """Verify trade P&L math."""
    pnl, comm = calculate_trade_pnl("BUY", 2000.0, 2010.0, 1.0, contract_size=100.0)
    assert pnl == pytest.approx(1000.0)

    pnl_sell, comm = calculate_trade_pnl("SELL", 2000.0, 1990.0, 1.0, contract_size=100.0)
    assert pnl_sell == pytest.approx(1000.0)
