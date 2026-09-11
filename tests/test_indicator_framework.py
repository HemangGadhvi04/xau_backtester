import unittest

from core.builtin_indicators import EMAIndicator, VWAPIndicator
from core.indicator_framework import IndicatorContext, indicator_registry


def candles(count=30):
    return [
        {
            "time": 1_700_000_000 + i * 60,
            "open": 100 + i,
            "high": 102 + i,
            "low": 99 + i,
            "close": 101 + i,
            "volume": i + 1,
        }
        for i in range(count)
    ]


class IndicatorFrameworkTests(unittest.TestCase):
    def test_registry_contains_builtins(self):
        ids = {schema["id"] for schema in indicator_registry.schemas()}
        self.assertTrue({"ema", "vwap", "classic_smc", "advanced_smc", "msb_ob_mtf", "geometric_range"}.issubset(ids))

    def test_ema_never_returns_future_values(self):
        data = candles()
        cutoff = data[14]["time"]
        result = EMAIndicator().calculate(
            IndicatorContext("XAUUSD", "1m", data, cutoff), {"period": 5}
        )
        plot = result["plots"][0]["data"]
        self.assertEqual(len(plot), 15)
        self.assertLessEqual(max(point["time"] for point in plot), cutoff)

    def test_future_candles_do_not_change_ema_history(self):
        data = candles()
        cutoff = data[14]["time"]
        settings = {"period": 5}
        full = EMAIndicator().calculate(IndicatorContext("XAUUSD", "1m", data, cutoff), settings)
        truncated = EMAIndicator().calculate(IndicatorContext("XAUUSD", "1m", data[:15], cutoff), settings)
        self.assertEqual(full["plots"][0]["data"], truncated["plots"][0]["data"])

    def test_vwap_respects_cutoff(self):
        data = candles()
        cutoff = data[9]["time"]
        result = VWAPIndicator().calculate(IndicatorContext("BTCUSD", "1m", data, cutoff), {})
        self.assertEqual(len(result["plots"][0]["data"]), 10)

    def test_mtf_loader_always_receives_replay_cutoff(self):
        data = candles(250)
        cutoff = data[199]["time"]
        calls = []

        def loader(**kwargs):
            calls.append(kwargs)
            return data[:200]

        context = IndicatorContext("XAUUSD", "1m", data, cutoff, loader)
        indicator_registry.get("msb_ob_mtf").calculate(context, {})
        self.assertEqual(len(calls), 5)
        self.assertTrue(all(call["end_ts"] == cutoff for call in calls))

    def test_complex_indicator_outputs_do_not_cross_cutoff(self):
        data = candles(250)
        cutoff = data[199]["time"]
        context = IndicatorContext("XAUUSD", "1m", data, cutoff, lambda **kwargs: data[:200])
        for indicator_id in ("classic_smc", "advanced_smc", "msb_ob_mtf", "geometric_range"):
            result = indicator_registry.get(indicator_id).calculate(context, {})
            times = []
            for zone in result["zones"]:
                times.append(zone.get("created_at", zone.get("time")))
            for marker in result["markers"]:
                times.append(marker["time"])
            self.assertTrue(all(value <= cutoff for value in times), indicator_id)


if __name__ == "__main__":
    unittest.main()
