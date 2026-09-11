from datetime import datetime, timezone


class GeometricRangeEngine:
    def __init__(self, candles, anchor_hour=22, divisor=4.618, minimum_body=0.2):
        self.candles = sorted(candles, key=lambda candle: candle["time"])
        self.anchor_hour = anchor_hour
        self.divisor = divisor
        self.minimum_body = minimum_body

    def run(self):
        anchors, boxes = [], []
        current_high = current_low = None
        levels, broken, previous = [], set(), None
        for candle in self.candles:
            current_high = candle["high"] if current_high is None else max(current_high, candle["high"])
            current_low = candle["low"] if current_low is None else min(current_low, candle["low"])
            dt = datetime.fromtimestamp(candle["time"], tz=timezone.utc)
            if dt.hour == self.anchor_hour and dt.minute == 0:
                if current_high is not None and current_low is not None:
                    unit = (current_high - current_low) / self.divisor
                    anchor = candle["open"]
                    anchors.append({"time": candle["time"], "anchor": anchor, "unit": unit})
                    levels = [
                        {"price": anchor + unit, "id": "UP_100"}, {"price": anchor + unit * .75, "id": "UP_75"},
                        {"price": anchor + unit * .5, "id": "UP_50"}, {"price": anchor - unit * .5, "id": "DN_50"},
                        {"price": anchor - unit * .75, "id": "DN_75"}, {"price": anchor - unit, "id": "DN_100"},
                    ]
                    broken.clear()
                current_high, current_low = candle["high"], candle["low"]
            if levels and previous:
                for level in levels:
                    if level["id"] in broken:
                        continue
                    direction = "BUY" if candle["close"] > level["price"] >= previous["close"] else "SELL" if candle["close"] < level["price"] <= previous["close"] else None
                    if direction:
                        broken.add(level["id"])
                        if abs(candle["close"] - candle["open"]) >= self.minimum_body:
                            boxes.append({"time": candle["time"], "top": max(candle["open"], candle["close"]), "bottom": min(candle["open"], candle["close"]), "direction": direction})
            previous = candle
        return {"anchors": anchors, "boxes": boxes}
