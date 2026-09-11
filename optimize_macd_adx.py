import os
import sys
import itertools
from core.engine import BacktestEngine
from strategies.macd_adx import MACDADXStrategy
from backend.data_service import get_market_data

def run_optimization():
    print("Loading 5m historical candles...")
    candles = get_market_data(timeframe="5m")
    
    if not candles:
        print("Error loading data.")
        return
        
    print(f"Loaded {len(candles)} candles. Starting grid search...\n")

    # Define Parameter Grid
    fast_lengths = [5, 9, 12]
    slow_lengths = [13, 21, 26]
    signal_lengths = [20, 26, 30] # Maintaining minimum 20 as requested
    adx_thresholds = [20.0, 25.0, 30.0]
    
    combinations = list(itertools.product(fast_lengths, slow_lengths, signal_lengths, adx_thresholds))
    
    results = []
    total_combs = len(combinations)
    
    for i, (f, s, sig, adx) in enumerate(combinations):
        if f >= s:
            continue  # Fast EMA should be less than Slow EMA
            
        print(f"[{i+1}/{total_combs}] Testing: Fast={f}, Slow={s}, Sig={sig}, ADX={adx}")
        
        engine = BacktestEngine(initial_balance=10000, leverage=100, spread=0.20)
        engine.load_data(candles)
        
        strategy = MACDADXStrategy(
            fast_length=f,
            slow_length=s,
            signal_length=sig,
            di_length=10,
            adx_smoothing=14,
            adx_threshold=adx,
            lots=0.1
        )
        
        engine.run(strategy)
        metrics = engine.calculate_metrics()
        
        if metrics and metrics.get('total_trades', 0) > 0:
            results.append({
                'fast': f,
                'slow': s,
                'signal': sig,
                'adx_thresh': adx,
                'net_profit': metrics['net_profit'],
                'win_rate': metrics['win_rate'],
                'profit_factor': metrics['profit_factor'],
                'trades': metrics['total_trades']
            })
            
    # Sort by net profit descending
    results.sort(key=lambda x: x['net_profit'], reverse=True)
    
    print("\n" + "="*60)
    print("TOP 5 PARAMETER COMBINATIONS (Sorted by Net Profit)")
    print("="*60)
    for i, res in enumerate(results[:5]):
        print(f"{i+1}. Fast: {res['fast']:<2} | Slow: {res['slow']:<2} | Sig: {res['signal']:<2} | ADX: {res['adx_thresh']:<4.1f} => "
              f"Profit: ${res['net_profit']:>8.2f} | Win Rate: {res['win_rate']:>5.2f}% | PF: {res['profit_factor']:>4.2f} | Trades: {res['trades']}")
    print("="*60)

if __name__ == "__main__":
    run_optimization()
