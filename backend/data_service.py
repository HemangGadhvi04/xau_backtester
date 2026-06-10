import duckdb
import os
import pandas as pd

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "raw")

_data_cache = {}

def get_xauusd_data(timeframe="1m"):
    """
    Loads 1-minute XAUUSD bid data from Parquet, or falls back to CSV,
    and aggregates it into the requested timeframe using DuckDB.
    Returns a list of dictionaries formatted for Lightweight Charts:
    { time: timestamp, open: O, high: H, low: L, close: C }
    """
    global _data_cache
    if timeframe in _data_cache:
        return _data_cache[timeframe]

    parquet_path = os.path.join(DATA_DIR, "XAUUSD_bid_1m.parquet")
    csv_path = os.path.join(DATA_DIR, "XAUUSD_bid_1m.csv")
    
    source = None
    if os.path.exists(parquet_path):
        source = f"read_parquet('{parquet_path}')"
    elif os.path.exists(csv_path):
        source = f"read_csv_auto('{csv_path}')"
        
    if not source:
        return []

    # Timeframe mapping to DuckDB intervals
    timeframe_map = {
        "1m": "1 minute",
        "3m": "3 minutes",
        "5m": "5 minutes",
        "15m": "15 minutes",
        "30m": "30 minutes",
        "1h": "1 hour",
        "4h": "4 hours",
        "1d": "1 day",
        "1w": "7 days"
    }
    interval = timeframe_map.get(timeframe, "1 minute")

    con = duckdb.connect(database=':memory:')
    try:
        # Create temporary view to fetch schema details easily
        con.execute(f"CREATE OR REPLACE TEMP VIEW raw_data AS SELECT * FROM {source}")
        
        cols_info = con.execute("PRAGMA table_info('raw_data')").fetchall()
        col_names = [c[1] for c in cols_info]
        
        # Find time column
        time_col = None
        for candidate in ["Etc/UTC", "Datetime", "datetime", "time"]:
            if candidate in col_names:
                time_col = candidate
                break
        if time_col is None:
            time_col = col_names[0]
            
        # Find OHLC columns case-insensitively
        open_col = next((c for c in col_names if c.lower() == "open"), "Open")
        high_col = next((c for c in col_names if c.lower() == "high"), "High")
        low_col = next((c for c in col_names if c.lower() == "low"), "Low")
        close_col = next((c for c in col_names if c.lower() == "close"), "Close")
        
        # Aggregate using time_bucket and epoch conversion
        query = f"""
            SELECT 
                epoch(time_bucket(INTERVAL '{interval}', CAST("{time_col}" AS TIMESTAMP WITH TIME ZONE))) AS time,
                first("{open_col}" ORDER BY "{time_col}") AS open,
                max("{high_col}") AS high,
                min("{low_col}") AS low,
                last("{close_col}" ORDER BY "{time_col}") AS close
            FROM raw_data
            GROUP BY time
            ORDER BY time
        """
        
        df = con.execute(query).df()
        
        # Convert df to dictionary records
        chart_data = df.to_dict(orient="records")
        _data_cache[timeframe] = chart_data
        return chart_data
        
    except Exception as e:
        print(f"DuckDB aggregation query failed: {e}")
        return []
    finally:
        con.close()
