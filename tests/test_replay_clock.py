import pytest
from core.replay.clock import ReplayClock


def test_replay_clock_stepping():
    candles = [
        {"time": 1000, "open": 2000, "high": 2005, "low": 1995, "close": 2002},
        {"time": 1060, "open": 2002, "high": 2010, "low": 2001, "close": 2008},
        {"time": 1120, "open": 2008, "high": 2015, "low": 2005, "close": 2012},
    ]

    clock = ReplayClock()
    clock.load_data(candles)

    assert clock.cursor_index == 0
    assert clock.current_time == 1000

    clock.step(1)
    assert clock.cursor_index == 1
    assert clock.current_time == 1060

    clock.step(5)  # Overflow bound check
    assert clock.cursor_index == 2
    assert clock.current_time == 1120
    assert clock.is_end_of_data is True


def test_replay_clock_seek():
    candles = [
        {"time": 1000 + (i * 60), "open": 2000, "high": 2005, "low": 1995, "close": 2002}
        for i in range(100)
    ]

    clock = ReplayClock()
    clock.load_data(candles)

    clock.seek_to_index(42)
    assert clock.cursor_index == 42
    assert clock.current_time == 1000 + (42 * 60)

    clock.seek_to_timestamp(1000 + (75 * 60))
    assert clock.cursor_index == 75
