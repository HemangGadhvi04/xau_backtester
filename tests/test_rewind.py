import pytest
from core.replay.engine import ReplayEngine


def generate_sample_candles(count=200):
    candles = []
    base_time = 1700000000
    base_price = 2000.0
    for i in range(count):
        candles.append({
            "time": base_time + (i * 60),
            "open": base_price + (i * 0.1),
            "high": base_price + (i * 0.1) + 2.0,
            "low": base_price + (i * 0.1) - 2.0,
            "close": base_price + (i * 0.1) + 0.5,
            "volume": 100
        })
    return candles


def test_strict_rewind_equivalence():
    """
    CRITICAL ACCEPTANCE TEST:
    Replaying to bar T = Replaying to T + 50 then rewinding to T.
    The resulting observable market and account states MUST match exactly.
    """
    candles = generate_sample_candles(200)

    # Engine A: Steps directly to index 30
    engine_a = ReplayEngine(session_id="session_rewind_test", initial_balance=10000.0)
    engine_a.load_data(candles)
    engine_a.place_order("BUY", "MARKET", 1.0)
    engine_a.step(30)
    state_a = engine_a.get_state()

    # Engine B: Steps to index 30, advances to index 80, then rewinds back to index 30
    engine_b = ReplayEngine(session_id="session_rewind_test", initial_balance=10000.0)
    engine_b.load_data(candles)
    engine_b.place_order("BUY", "MARKET", 1.0)
    engine_b.step(30)
    engine_b.step(50)  # Advanced to index 80
    engine_b.seek_to_index(30)  # Rewound back to index 30
    state_b = engine_b.get_state()

    # Compare key authoritative state properties
    assert state_a["cursor_index"] == state_b["cursor_index"]
    assert state_a["current_time"] == state_b["current_time"]
    assert state_a["account"]["balance"] == state_b["account"]["balance"]
    assert state_a["account"]["equity"] == state_b["account"]["equity"]
    assert len(state_a["positions"]) == len(state_b["positions"])
    if state_a["positions"]:
        assert state_a["positions"][0]["entry_price"] == state_b["positions"][0]["entry_price"]


def test_deterministic_replay_runs():
    """
    STRICT ACCEPTANCE TEST:
    Two separate ReplayEngine instances initialized with the same session_id and
    receiving the same commands must produce byte-for-byte identical state.
    """
    candles = generate_sample_candles(100)

    run1 = ReplayEngine(session_id="det_session", initial_balance=10000.0)
    run1.load_data(candles)
    run1.place_order("BUY", "MARKET", 0.5)
    run1.step(25)
    run1.place_order("SELL", "LIMIT", 1.0, price=2010.0)
    run1.step(25)
    state1 = run1.get_state()

    run2 = ReplayEngine(session_id="det_session", initial_balance=10000.0)
    run2.load_data(candles)
    run2.place_order("BUY", "MARKET", 0.5)
    run2.step(25)
    run2.place_order("SELL", "LIMIT", 1.0, price=2010.0)
    run2.step(25)
    state2 = run2.get_state()

    assert state1["account"] == state2["account"]
    assert state1["positions"] == state2["positions"]
    assert state1["pending_orders"] == state2["pending_orders"]
    assert state1["trade_history"] == state2["trade_history"]
