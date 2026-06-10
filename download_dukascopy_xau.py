import os
import lzma
import struct
import requests
import pandas as pd
from datetime import datetime, timedelta, timezone
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE_URL = "https://datafeed.dukascopy.com/datafeed"
SYMBOL = "XAUUSD"
START_DEFAULT = datetime(2024, 6, 3, tzinfo=timezone.utc)
END = datetime(2026, 6, 3, tzinfo=timezone.utc)

OUT_DIR = "data/raw"
os.makedirs(OUT_DIR, exist_ok=True)

bid_csv = f"{OUT_DIR}/XAUUSD_bid_1m.csv"
ask_csv = f"{OUT_DIR}/XAUUSD_ask_1m.csv"
bid_parquet = f"{OUT_DIR}/XAUUSD_bid_1m.parquet"
ask_parquet = f"{OUT_DIR}/XAUUSD_ask_1m.parquet"

def dukascopy_url(symbol, dt):
    year = dt.year
    month = dt.month - 1
    day = dt.day
    hour = dt.hour
    return f"{BASE_URL}/{symbol}/{year}/{month:02d}/{day:02d}/{hour:02d}h_ticks.bi5"

@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type((requests.exceptions.RequestException, TimeoutError))
)
def fetch_url(url):
    return requests.get(url, timeout=15)

def download_hour(dt):
    url = dukascopy_url(SYMBOL, dt)
    try:
        r = fetch_url(url)
    except Exception as e:
        print(f"Failed to download {url} after retries: {e}")
        return dt, pd.DataFrame()

    if r.status_code != 200 or len(r.content) == 0:
        # 404 is common for weekend hours when market is closed
        return dt, pd.DataFrame()

    try:
        raw = lzma.decompress(r.content)
    except Exception:
        return dt, pd.DataFrame()

    records = []
    row_size = 20

    for i in range(0, len(raw), row_size):
        chunk = raw[i:i + row_size]
        if len(chunk) < row_size:
            continue

        ms, ask, bid, ask_vol, bid_vol = struct.unpack(">IIIff", chunk)
        timestamp = dt + timedelta(milliseconds=ms)
        
        # XAUUSD prices are divided by 1000 in Dukascopy tick format
        ask_price = ask / 1000
        bid_price = bid / 1000

        records.append({
            "Datetime": timestamp,
            "Bid": bid_price,
            "Ask": ask_price,
            "BidVolume": bid_vol,
            "AskVolume": ask_vol,
        })

    return dt, pd.DataFrame(records)

def ticks_to_ohlcv(df, side):
    price_col = "Bid" if side == "bid" else "Ask"
    vol_col = "BidVolume" if side == "bid" else "AskVolume"

    ohlc = df[price_col].resample("1min").ohlc()
    vol = df[vol_col].resample("1min").sum()

    out = pd.concat([ohlc, vol], axis=1)
    out.columns = ["Open", "High", "Low", "Close", "Volume"]
    out = out.dropna()
    return out

def get_last_saved_time():
    """Reads the existing CSV to find the last processed minute timestamp."""
    if os.path.exists(bid_csv) and os.path.getsize(bid_csv) > 1000:
        try:
            df = pd.read_csv(bid_csv, index_col=0, nrows=10)
            if not df.empty:
                # Read final line by loading tail
                df_tail = pd.read_csv(bid_csv, index_col=0).tail(1)
                last_dt = pd.to_datetime(df_tail.index[0])
                if last_dt.tzinfo is None:
                    last_dt = last_dt.replace(tzinfo=timezone.utc)
                print(f"Resuming from last saved timestamp: {last_dt}")
                # Start downloading from the beginning of that hour
                return last_dt.replace(minute=0, second=0, microsecond=0)
        except Exception as e:
            print(f"Error reading existing CSV: {e}. Starting fresh.")
    return START_DEFAULT

def save_batch(new_ticks):
    if not new_ticks:
        return

    print("Resampling and appending batch to disk...")
    # Combine and sort ticks
    ticks_df = pd.concat(new_ticks).set_index("Datetime").sort_index()
    
    # Resample
    batch_bid = ticks_to_ohlcv(ticks_df, "bid")
    batch_ask = ticks_to_ohlcv(ticks_df, "ask")

    # Load existing bid/ask data
    if os.path.exists(bid_csv) and os.path.getsize(bid_csv) > 1000:
        existing_bid = pd.read_csv(bid_csv, index_col=0, parse_dates=True)
        existing_ask = pd.read_csv(ask_csv, index_col=0, parse_dates=True)
        
        # Combine
        combined_bid = pd.concat([existing_bid, batch_bid])
        combined_ask = pd.concat([existing_ask, batch_ask])
    else:
        combined_bid = batch_bid
        combined_ask = batch_ask

    # De-duplicate and sort
    combined_bid = combined_bid[~combined_bid.index.duplicated(keep="last")].sort_index()
    combined_ask = combined_ask[~combined_ask.index.duplicated(keep="last")].sort_index()

    # Save to CSV
    combined_bid.to_csv(bid_csv)
    combined_ask.to_csv(ask_csv)

    # Save to Parquet
    combined_bid.to_parquet(bid_parquet)
    combined_ask.to_parquet(ask_parquet)

    print(f"Successfully saved. Current data range: {combined_bid.index.min()} to {combined_bid.index.max()} ({len(combined_bid)} total candles)")

def main():
    start_time = get_last_saved_time()
    current = start_time
    
    print(f"Starting ingestion: {current} to {END}")
    
    batch_ticks = []
    batch_hours = []
    
    # Process in chunks of 7 days (168 hours) concurrently
    chunk_size = 168 
    
    while current < END:
        chunk_hours = []
        for _ in range(chunk_size):
            if current >= END:
                break
            chunk_hours.append(current)
            current += timedelta(hours=1)
            
        print(f"\nDownloading batch: {chunk_hours[0].strftime('%Y-%m-%d')} to {chunk_hours[-1].strftime('%Y-%m-%d')} ({len(chunk_hours)} hours)...")
        
        chunk_ticks = []
        # Download concurrently
        with ThreadPoolExecutor(max_workers=16) as executor:
            future_to_hour = {executor.submit(download_hour, h): h for h in chunk_hours}
            
            for future in as_completed(future_to_hour):
                hour = future_to_hour[future]
                try:
                    _, df = future.result()
                    if not df.empty:
                        chunk_ticks.append(df)
                except Exception as e:
                    print(f"Error executing download for hour {hour}: {e}")
                    
        # Save chunk
        if chunk_ticks:
            save_batch(chunk_ticks)
            
    print("\nALL DOWNLOADS AND PERSISTENCE COMPLETED SUCCESSFULLY!")

if __name__ == "__main__":
    main()
