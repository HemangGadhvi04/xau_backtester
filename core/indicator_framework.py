from dataclasses import dataclass
from typing import Any, Callable, Dict, Iterable, List, Optional, Type

import pandas as pd


@dataclass(frozen=True)
class IndicatorContext:
    symbol: str
    timeframe: str
    candles: List[Dict[str, Any]]
    current_time: Optional[int] = None
    data_loader: Optional[Callable[..., List[Dict[str, Any]]]] = None

    def frame(self) -> pd.DataFrame:
        df = pd.DataFrame(self.candles)
        if df.empty:
            return df
        df = df.sort_values("time").drop_duplicates("time", keep="last")
        if self.current_time is not None:
            df = df[df["time"] <= self.current_time]
        return df.reset_index(drop=True)

    def load_timeframe(self, timeframe: str, limit: int = 5000) -> List[Dict[str, Any]]:
        if timeframe == self.timeframe:
            return self.frame().to_dict(orient="records")[-limit:]
        if self.data_loader is None:
            return []
        return self.data_loader(
            symbol=self.symbol,
            timeframe=timeframe,
            end_ts=self.current_time,
            limit=limit,
        )


class BaseIndicator:
    id = ""
    name = ""
    category = "Custom"
    description = ""
    overlay = True
    inputs: Dict[str, Dict[str, Any]] = {}

    def schema(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "description": self.description,
            "overlay": self.overlay,
            "inputs": self.inputs,
        }

    def calculate(self, context: IndicatorContext, settings: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError


class IndicatorRegistry:
    def __init__(self):
        self._indicators: Dict[str, Type[BaseIndicator]] = {}

    def register(self, indicator: Type[BaseIndicator]) -> Type[BaseIndicator]:
        if not indicator.id:
            raise ValueError("Indicator id is required")
        self._indicators[indicator.id] = indicator
        return indicator

    def get(self, indicator_id: str) -> BaseIndicator:
        try:
            return self._indicators[indicator_id]()
        except KeyError as exc:
            raise KeyError(f"Unknown indicator: {indicator_id}") from exc

    def schemas(self) -> Iterable[Dict[str, Any]]:
        return [self.get(key).schema() for key in sorted(self._indicators)]


indicator_registry = IndicatorRegistry()


def empty_result() -> Dict[str, Any]:
    return {"plots": [], "zones": [], "markers": [], "lines": [], "dashboard": None, "alerts": []}
