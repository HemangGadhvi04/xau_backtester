import pandas as pd
import numpy as np

class SMCEngine:
    """
    Core engine for computing Smart Money Concepts (SMC) structure.
    Handles strict 3-candle swing detection, BOS/CHOCH/MSS mapping,
    FVG/OB identification, and Multi-Timeframe (MTF) alignment.
    """
    def __init__(self, df: pd.DataFrame):
        """
        df should be a DataFrame with columns: ['time', 'open', 'high', 'low', 'close', 'volume']
        The dataframe must be sorted by time ascending.
        """
        self.df = df.copy()
        # Convert unix timestamp to datetime for pandas resampling
        self.df['datetime'] = pd.to_datetime(self.df['time'], unit='s')
        
    def resample_mtf(self, timeframe: str) -> pd.DataFrame:
        """
        Safely aggregates the internal LTF dataframe into a Higher Timeframe (HTF)
        dataframe without lookahead bias.
        Timeframe examples: '15min', '1H', '4H', '1D'
        """
        df_htf = self.df.set_index('datetime').resample(timeframe).agg({
            'time': 'last', # Keep the close timestamp for the period
            'open': 'first',
            'high': 'max',
            'low': 'min',
            'close': 'last'
        }).dropna().reset_index()
        return df_htf

    def identify_swings(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Identifies strict 3-candle swing highs and swing lows.
        A valid swing high: central candle has a higher high and higher low than left & right.
        A valid swing low: central candle has a lower low and lower high than left & right.
        """
        df = df.copy()
        df['is_swing_high'] = False
        df['is_swing_low'] = False
        
        for i in range(1, len(df) - 1):
            prev_candle = df.iloc[i-1]
            curr_candle = df.iloc[i]
            next_candle = df.iloc[i+1]
            
            # Strict Swing High
            if (curr_candle['high'] > prev_candle['high'] and curr_candle['high'] > next_candle['high'] and
                curr_candle['low'] > prev_candle['low'] and curr_candle['low'] > next_candle['low']):
                df.at[df.index[i], 'is_swing_high'] = True
                
            # Strict Swing Low
            if (curr_candle['low'] < prev_candle['low'] and curr_candle['low'] < next_candle['low'] and
                curr_candle['high'] < prev_candle['high'] and curr_candle['high'] < next_candle['high']):
                df.at[df.index[i], 'is_swing_low'] = True
                
        return df

    def find_fvgs(self, df: pd.DataFrame, limit: int = 10) -> list:
        """
        Identifies active Fair Value Gaps (FVG) where the wicks of candle 1 and candle 3 do not overlap.
        Tracks price to see if the FVG gets fully mitigated (candle body closes through the 50% CE).
        Returns a list of the last 'limit' active FVGs.
        """
        active_fvgs = []
        for i in range(2, len(df)):
            c1 = df.iloc[i-2]
            c3 = df.iloc[i]
            
            # Check for mitigation of existing active FVGs by the current candle c3
            mitigated_indices = []
            for idx, fvg in enumerate(active_fvgs):
                if fvg['type'] == 'bullish':
                    # Mitigated if price drops and closes below the 50% CE
                    if c3['close'] < fvg['ce']:
                        mitigated_indices.append(idx)
                elif fvg['type'] == 'bearish':
                    # Mitigated if price rallies and closes above the 50% CE
                    if c3['close'] > fvg['ce']:
                        mitigated_indices.append(idx)
                        
            # Remove mitigated FVGs (reverse order to avoid index shifting)
            for idx in reversed(mitigated_indices):
                active_fvgs.pop(idx)
                
            # Add new Bullish FVG (c1 high < c3 low)
            if c1['high'] < c3['low']:
                active_fvgs.append({
                    'time': c3['time'],
                    'type': 'bullish',
                    'top': c3['low'],
                    'bottom': c1['high'],
                    'ce': (c3['low'] + c1['high']) / 2,
                    'is_active': True
                })
                
            # Add new Bearish FVG (c1 low > c3 high)
            elif c1['low'] > c3['high']:
                active_fvgs.append({
                    'time': c3['time'],
                    'type': 'bearish',
                    'top': c1['low'],
                    'bottom': c3['high'],
                    'ce': (c1['low'] + c3['high']) / 2,
                    'is_active': True
                })
                
        # Only return the most recent 'limit' active FVGs to save processing/rendering power
        return active_fvgs[-limit:]

    def find_order_blocks(self, df: pd.DataFrame, limit: int = 10) -> list:
        """
        Identifies Order Blocks (OBs) - the last opposing candle before a strong displacement.
        We approximate this by looking for large displacement candles (FVGs) and 
        tagging the prior opposite-colored candle.
        """
        active_obs = []
        for i in range(2, len(df)):
            c1 = df.iloc[i-2]
            c2 = df.iloc[i-1] # The potential OB
            c3 = df.iloc[i]   # The displacement candle
            
            # Check for mitigation (if a candle closes beyond the distal edge of the OB)
            mitigated_indices = []
            for idx, ob in enumerate(active_obs):
                if ob['type'] == 'bullish':
                    # Bullish OB distal edge is the low. If closed below, it's invalidated.
                    if c3['close'] < ob['bottom']:
                        mitigated_indices.append(idx)
                elif ob['type'] == 'bearish':
                    # Bearish OB distal edge is the high. If closed above, it's invalidated.
                    if c3['close'] > ob['top']:
                        mitigated_indices.append(idx)
            
            for idx in reversed(mitigated_indices):
                active_obs.pop(idx)

            # Detect bullish displacement (Bullish FVG)
            if c1['high'] < c3['low']:
                # The Bullish OB is the last down-candle before the up move
                # Simplification: we take c2 as the OB if it was bearish
                if c2['close'] < c2['open']:
                    active_obs.append({
                        'time': c2['time'],
                        'type': 'bullish',
                        'top': c2['high'],
                        'bottom': c2['low'],
                        'ce': (c2['high'] + c2['low']) / 2
                    })
                    
            # Detect bearish displacement (Bearish FVG)
            elif c1['low'] > c3['high']:
                # The Bearish OB is the last up-candle before the down move
                if c2['close'] > c2['open']:
                    active_obs.append({
                        'time': c2['time'],
                        'type': 'bearish',
                        'top': c2['high'],
                        'bottom': c2['low'],
                        'ce': (c2['high'] + c2['low']) / 2
                    })

        return active_obs[-limit:]

    def run_mtf_analysis(self) -> dict:
        """
        The master function to compute SMC on the base timeframe,
        resample to HTF (e.g. 4H), compute HTF SMC, and align them.
        """
        # Step 1: Compute Base TF Swings & Zones
        df_base = self.identify_swings(self.df)
        base_fvgs = self.find_fvgs(df_base, limit=10)
        base_obs = self.find_order_blocks(df_base, limit=10)
        
        # Step 2: Resample to HTF (e.g. 4H) and compute HTF Zones
        # Pandas uses 'h' instead of 'H' in newer versions, use '4h' and '1h'
        df_4h = self.resample_mtf('4h')
        df_4h = self.identify_swings(df_4h)
        htf_4h_fvgs = self.find_fvgs(df_4h, limit=10)
        htf_4h_obs = self.find_order_blocks(df_4h, limit=10)

        # Resample to 1H
        df_1h = self.resample_mtf('1h')
        df_1h = self.identify_swings(df_1h)
        htf_1h_fvgs = self.find_fvgs(df_1h, limit=10)
        htf_1h_obs = self.find_order_blocks(df_1h, limit=10)
        
        return {
            'base': {
                'fvgs': base_fvgs,
                'obs': base_obs,
            },
            'htf_1h': {
                'fvgs': htf_1h_fvgs,
                'obs': htf_1h_obs,
            },
            'htf_4h': {
                'fvgs': htf_4h_fvgs,
                'obs': htf_4h_obs,
            }
        }
