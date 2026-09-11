from typing import Any, Dict

import pandas as pd

from core.indicator_framework import BaseIndicator, IndicatorContext, empty_result, indicator_registry
from core.smc_engine import SMCEngine
from core.advanced_smc_engine import AdvancedSMCEngine
from core.msb_ob_mtf import MSBOBMTFEngine
from core.geometric_range_indicator import GeometricRangeEngine


@indicator_registry.register
class EMAIndicator(BaseIndicator):
    id = "ema"
    name = "Exponential Moving Average"
    category = "Trend"
    description = "An exponential moving average calculated from closed candles."
    inputs = {
        "period": {"type": "integer", "default": 50, "min": 1, "max": 1000, "label": "Length"},
        "source": {"type": "select", "default": "close", "options": ["open", "high", "low", "close"], "label": "Source"},
        "color": {"type": "color", "default": "#ff9800", "label": "Color"},
        "line_width": {"type": "integer", "default": 2, "min": 1, "max": 4, "label": "Line width"},
    }

    def calculate(self, context: IndicatorContext, settings: Dict[str, Any]) -> Dict[str, Any]:
        df = context.frame()
        result = empty_result()
        if df.empty:
            return result
        period = int(settings.get("period", self.inputs["period"]["default"]))
        source = settings.get("source", "close")
        if source not in {"open", "high", "low", "close"}:
            source = "close"
        values = df[source].astype(float).ewm(span=period, adjust=False).mean()
        result["plots"].append({
            "id": "ema", "name": f"EMA {period}", "type": "line",
            "color": settings.get("color", "#ff9800"),
            "line_width": int(settings.get("line_width", 2)),
            "data": [{"time": int(df.at[i, "time"]), "value": float(values.iat[i])} for i in range(len(df))],
        })
        return result


@indicator_registry.register
class VWAPIndicator(BaseIndicator):
    id = "vwap"
    name = "Session VWAP"
    category = "Volume"
    description = "UTC daily VWAP using typical price and available volume."
    inputs = {
        "color": {"type": "color", "default": "#ff9800", "label": "Color"},
        "line_width": {"type": "integer", "default": 2, "min": 1, "max": 4, "label": "Line width"},
    }

    def calculate(self, context: IndicatorContext, settings: Dict[str, Any]) -> Dict[str, Any]:
        df = context.frame()
        result = empty_result()
        if df.empty:
            return result
        timestamps = pd.to_datetime(df["time"], unit="s", utc=True)
        volume = df["volume"].astype(float) if "volume" in df else pd.Series(1.0, index=df.index)
        volume = volume.where(volume > 0, 1.0)
        typical = (df["high"].astype(float) + df["low"].astype(float) + df["close"].astype(float)) / 3
        day = timestamps.dt.floor("D")
        cumulative_volume = volume.groupby(day).cumsum()
        cumulative_value = (typical * volume).groupby(day).cumsum()
        values = cumulative_value / cumulative_volume
        result["plots"].append({
            "id": "vwap", "name": "Session VWAP", "type": "line",
            "color": settings.get("color", "#ff9800"),
            "line_width": int(settings.get("line_width", 2)),
            "data": [{"time": int(df.at[i, "time"]), "value": float(values.iat[i])} for i in range(len(df))],
        })
        return result


@indicator_registry.register
class ClassicSMCIndicator(BaseIndicator):
    id = "classic_smc"
    name = "Classic SMC"
    category = "Market Structure"
    description = "Active order blocks and fair value gaps across the chart, 1H and 4H timeframes."
    inputs = {"zone_limit": {"type": "integer", "default": 10, "min": 1, "max": 50, "label": "Zones per group"}}

    def calculate(self, context, settings):
        df = context.frame()
        result = empty_result()
        if len(df) < 5:
            return result
        analysis = SMCEngine(df).run_mtf_analysis()
        for group, label in (("htf_4h", "4H"), ("htf_1h", "1H"), ("base", context.timeframe)):
            for zone_type, key in (("OB", "obs"), ("FVG", "fvgs")):
                for zone in analysis.get(group, {}).get(key, []):
                    result["zones"].append({
                        "time": int(zone["time"]), "created_at": int(zone["time"]),
                        "top": float(zone["top"]), "bottom": float(zone["bottom"]),
                        "direction": zone["type"], "type": zone_type, "timeframe": label,
                        "active": zone.get("is_active", True), "ce": float(zone["ce"]),
                    })
        return result


@indicator_registry.register
class AdvancedSMCIndicator(BaseIndicator):
    id = "advanced_smc"
    name = "Advanced SMC"
    category = "Market Structure"
    description = "Non-repainting QML, RBS, SBS/SBR and TJL zones."
    inputs = {
        "fast_length": {"type": "integer", "default": 9, "min": 1, "max": 200, "label": "Fast EMA"},
        "slow_length": {"type": "integer", "default": 21, "min": 2, "max": 500, "label": "Slow EMA"},
    }

    def calculate(self, context, settings):
        df = context.frame()
        result = empty_result()
        if len(df) < 5:
            return result
        zones = AdvancedSMCEngine(df, int(settings.get("fast_length", 9)), int(settings.get("slow_length", 21))).process_candles()
        for zone in zones:
            result["zones"].append({
                "id": zone["id"], "time": int(zone["origin_at"]), "created_at": int(zone["created_at"]),
                "top": float(zone["top"]), "bottom": float(zone["bottom"]),
                "direction": zone["direction"].lower(), "type": zone["type"],
                "timeframe": zone["timeframe"], "active": zone["active"],
            })
        return result


@indicator_registry.register
class MSBOBMTFIndicator(BaseIndicator):
    id = "msb_ob_mtf"
    name = "MSB-OB Multi-Timeframe"
    category = "Market Structure"
    description = "Market-structure breaks, order blocks, breaker blocks and five-timeframe EMA bias."
    inputs = {
        "zigzag_length": {"type": "integer", "default": 9, "min": 2, "max": 50, "label": "Zigzag length"},
        "fib_factor": {"type": "decimal", "default": 0.33, "min": 0, "max": 1, "step": 0.01, "label": "Breakout factor"},
        "fast_length": {"type": "integer", "default": 50, "min": 1, "max": 500, "label": "Fast EMA"},
        "slow_length": {"type": "integer", "default": 200, "min": 2, "max": 1000, "label": "Slow EMA"},
        "minimum_aligned": {"type": "integer", "default": 4, "min": 1, "max": 5, "label": "Aligned timeframes"},
        "filter_by_mtf": {"type": "boolean", "default": False, "label": "Filter MSB by bias"},
    }

    def calculate(self, context, settings):
        fast_len, slow_len = int(settings.get("fast_length", 50)), int(settings.get("slow_length", 200))
        trends = {}
        for label, timeframe in (("5m", "5m"), ("15m", "15m"), ("1H", "1h"), ("4H", "4h"), ("1D", "1d")):
            trends[label] = MSBOBMTFEngine.trend_for(context.load_timeframe(timeframe, max(500, slow_len + 20)), fast_len, slow_len)
        engine = MSBOBMTFEngine(context.frame(), int(settings.get("zigzag_length", 9)), float(settings.get("fib_factor", .33)), fast_len, slow_len)
        analysis = engine.run(trends, int(settings.get("minimum_aligned", 4)), bool(settings.get("filter_by_mtf", False)))
        result = empty_result()
        result["plots"] = [
            {"id": "fast_ema", "name": f"EMA {fast_len}", "type": "line", "color": "#ff9800", "line_width": 2, "data": analysis["emas"]["fast"]},
            {"id": "slow_ema", "name": f"EMA {slow_len}", "type": "line", "color": "#2196f3", "line_width": 2, "data": analysis["emas"]["slow"]},
        ]
        result["zones"] = analysis["zones"]
        result["markers"] = analysis["events"]
        result["lines"] = [{"points": analysis["swings"], "type": "zigzag"}]
        result["dashboard"] = analysis["dashboard"]
        return result


@indicator_registry.register
class GeometricRangeIndicator(BaseIndicator):
    id = "geometric_range"
    name = "Geometric Range"
    category = "Volatility"
    description = "Daily geometric grid anchored from the previous range."
    inputs = {
        "anchor_hour": {"type": "integer", "default": 22, "min": 0, "max": 23, "label": "Anchor hour (UTC)"},
        "divisor": {"type": "decimal", "default": 4.618, "min": 0.1, "max": 20, "step": 0.001, "label": "Range divisor"},
        "minimum_body": {"type": "decimal", "default": 0.2, "min": 0, "max": 1000, "step": 0.01, "label": "Minimum body"},
    }

    def calculate(self, context, settings):
        result = empty_result()
        analysis = GeometricRangeEngine(context.frame().to_dict(orient="records"), int(settings.get("anchor_hour", 22)), float(settings.get("divisor", 4.618)), float(settings.get("minimum_body", .2))).run()
        for anchor in analysis["anchors"]:
            for multiplier, name in ((1, "UP 100"), (.75, "UP 75"), (.5, "UP 50"), (-.5, "DN 50"), (-.75, "DN 75"), (-1, "DN 100")):
                result["lines"].append({"time": int(anchor["time"]), "price": float(anchor["anchor"] + anchor["unit"] * multiplier), "type": "horizontal_ray", "label": name})
        for box in analysis["boxes"]:
            result["zones"].append({"time": int(box["time"]), "created_at": int(box["time"]), "top": float(box["top"]), "bottom": float(box["bottom"]), "direction": box["direction"].lower(), "type": "Breakout", "active": True})
        return result
