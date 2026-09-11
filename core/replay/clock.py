from typing import List, Dict, Any, Optional


class ReplayClock:
    """
    Authoritative clock tracking candle feed progression and timestamps.
    """
    def __init__(self, candles: Optional[List[Dict[str, Any]]] = None):
        self.candles: List[Dict[str, Any]] = candles or []
        self.cursor_index: int = 0

    def load_data(self, candles: List[Dict[str, Any]], start_index: int = 0):
        self.candles = candles
        self.cursor_index = max(0, min(start_index, len(candles) - 1)) if candles else 0

    @property
    def total_bars(self) -> int:
        return len(self.candles)

    @property
    def is_end_of_data(self) -> bool:
        return self.cursor_index >= len(self.candles) - 1 if self.candles else True

    @property
    def current_candle(self) -> Optional[Dict[str, Any]]:
        if self.candles and 0 <= self.cursor_index < len(self.candles):
            return self.candles[self.cursor_index]
        return None

    @property
    def current_time(self) -> int:
        candle = self.current_candle
        return candle['time'] if candle else 0

    def step(self, count: int = 1) -> int:
        """Advance the clock cursor by `count` bars."""
        if not self.candles:
            return 0
        new_index = min(self.cursor_index + count, len(self.candles) - 1)
        self.cursor_index = new_index
        return self.current_time

    def seek_to_index(self, index: int) -> int:
        """Seek directly to a target bar index."""
        if not self.candles:
            return 0
        self.cursor_index = max(0, min(index, len(self.candles) - 1))
        return self.current_time

    def seek_to_timestamp(self, timestamp: int) -> int:
        """Seek to the nearest candle timestamp on or before the target."""
        if not self.candles:
            return 0
        
        # Binary search for matching timestamp
        low, high = 0, len(self.candles) - 1
        best_idx = 0
        while low <= high:
            mid = (low + high) // 2
            if self.candles[mid]['time'] <= timestamp:
                best_idx = mid
                low = mid + 1
            else:
                high = mid - 1
                
        self.cursor_index = best_idx
        return self.current_time
