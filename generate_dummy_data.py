import pandas as pd
import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
import os
from datetime import datetime, timezone, timedelta

def generate_dummy_data():
    os.makedirs('data/raw', exist_ok=True)
    
    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(days=7)
    
    date_rng = pd.date_range(start=start_time, end=end_time, freq='1min', tz=timezone.utc)
    n = len(date_rng)
    
    symbols = {
        'XAUUSD': 2300,
        'BTCUSD': 65000,
        'EURUSD': 1.08
    }

    for symbol, base_price in symbols.items():
        print(f"Generating data for {symbol}...")
        np.random.seed(hash(symbol) % 4294967295)
        
        # Volatility scales with base price
        volatility = base_price * 0.0002
        steps = np.random.normal(0, volatility, n)
        prices = base_price + np.cumsum(steps)
        
        df = pd.DataFrame(index=date_rng)
        df.index.name = 'Datetime'
        
        # Create OHLCV
        df['Open'] = prices
        df['High'] = prices + np.random.uniform(0, volatility*2, n)
        df['Low'] = prices - np.random.uniform(0, volatility*2, n)
        df['Close'] = prices + np.random.normal(0, volatility/2, n)
        df['Volume'] = np.random.randint(100, 1000, n)
        
        # Save Parquet with _1m suffix for the backend!
        table = pa.Table.from_pandas(df.reset_index())
        pq.write_table(table, f'data/raw/{symbol}_bid_1m.parquet')
        pq.write_table(table, f'data/raw/{symbol}_ask_1m.parquet')
        
        print(f"Successfully generated {n} dummy candles for {symbol}.")

if __name__ == '__main__':
    generate_dummy_data()
