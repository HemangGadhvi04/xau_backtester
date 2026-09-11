from backend.worker import app
from backend.data_service import get_market_data
import pandas as pd
import hashlib
import json

@app.task(bind=True)
def run_backtest_task(self, req_dict: dict):
    from strategies.advanced_smc_strategy import AdvancedSMCStrategy
    from strategies.geometric_range import GeometricRangeStrategy
    from strategies.smc_ema_strategy import SMCEmaStrategy
    from strategies.trend_pullback import TrendPullbackStrategy
    from core.engine import BacktestEngine
    
    try:
        self.update_state(state='PROGRESS', meta={'progress': 10})
        
        norm_symbol = req_dict["symbol"].replace("/", "").upper()
        # Fetch 1m data for backtesting (using limit if specified, otherwise full range)
        start_ts = None
        end_ts = None
        if req_dict.get("start_date"):
            start_ts = pd.to_datetime(req_dict["start_date"]).timestamp()
        if req_dict.get("end_date"):
            end_ts = pd.to_datetime(req_dict["end_date"]).timestamp()
            
        candles = get_market_data(symbol=norm_symbol, timeframe="1m", start_ts=start_ts, end_ts=end_ts)
        self.update_state(state='PROGRESS', meta={'progress': 50})
        
        engine = BacktestEngine(
            initial_balance=req_dict.get("initial_balance", 10000.0), 
            leverage=100, 
            symbol=norm_symbol,
            use_random_slippage=req_dict.get("use_random_slippage", True)
        )
        engine.load_data(candles)
        
        strategy_name = req_dict.get("strategy", "ema_cross")
        if strategy_name == "advanced_smc":
            strategy = AdvancedSMCStrategy(
                lots=req_dict.get("lots", 0.1),
                lookback_candles=5000
            )
            strategy.set_historical_data(pd.DataFrame(candles))
        elif strategy_name == "geometric_range":
            strategy = GeometricRangeStrategy(
                lots=req_dict.get("lots", 0.1),
                sl_pips=req_dict.get("sl_pips", 35),
                tp_pips=req_dict.get("tp_pips", 100)
            )
        elif strategy_name == "ema_cross" or strategy_name == "smc_ema":
            strategy = SMCEmaStrategy(
                lots=req_dict.get("lots", 0.1),
                strict_mode=req_dict.get("strict_confluences", True),
                sl_pips=req_dict.get("sl_pips", 20),
                tp_pips=req_dict.get("tp_pips", 40)
            )
        elif strategy_name == "trend_pullback":
            strategy = TrendPullbackStrategy(
                lots=req_dict.get("lots", 0.1),
                strict_mode=req_dict.get("strict_confluences", True),
                sl_pips=req_dict.get("sl_pips", 20),
                tp_pips=req_dict.get("tp_pips", 40)
            )
            
        # Inject Risk Sizing config directly onto the BaseStrategy instance
        strategy.is_lot_mode = req_dict.get("is_lot_mode", True)
        strategy.risk_percent = req_dict.get("risk_percent", 1.0)
        
        self.update_state(state='PROGRESS', meta={'progress': 70})
        engine.run(strategy)
        self.update_state(state='PROGRESS', meta={'progress': 90})
        
        metrics = engine.calculate_metrics()
        
        # Downsample equity curve to max 2000 points for async result
        eq_curve = engine.equity_curve[1:] if len(engine.equity_curve) > len(engine.timestamps) else engine.equity_curve
        timestamps = engine.timestamps
        n = min(len(eq_curve), len(timestamps))
        
        if n > 2000:
            step = n // 2000
            sampled_curve = [eq_curve[i] for i in range(0, n, step)]
            sampled_times = [timestamps[i] for i in range(0, n, step)]
            if (n - 1) % step != 0:
                sampled_curve.append(eq_curve[-1])
                sampled_times.append(timestamps[-1])
        else:
            sampled_curve = eq_curve[:n]
            sampled_times = timestamps[:n]
            
        equity_data = [{"time": t, "value": v} for t, v in zip(sampled_times, sampled_curve)]
        
        # We can safely return JSON serializable data to Redis backend
        return {
            "status": "completed",
            "progress": 100,
            "result": {
                "trades": engine.trade_history,
                "metrics": metrics,
                "equity_curve": equity_data
            }
        }
        
    except Exception as e:
        return {
            "status": "failed",
            "error": str(e)
        }
