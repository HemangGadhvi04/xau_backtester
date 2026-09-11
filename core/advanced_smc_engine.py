import pandas as pd
import numpy as np

class Zone:
    def __init__(self, id_str, timeframe, zone_type, direction, top, bottom, created_at, origin_at):
        self.id = id_str
        self.timeframe = timeframe
        self.zone_type = zone_type # "QML", "RBS", "SBS", "SBR", "TJL"
        self.direction = direction # "BUY", "SELL"
        self.top = top
        self.bottom = bottom
        self.created_at = created_at
        self.origin_at = origin_at
        self.touched_at = None
        self.invalidated_at = None
        self.active = True

    def to_dict(self):
        return {
            'id': self.id,
            'timeframe': self.timeframe,
            'type': self.zone_type,
            'direction': self.direction,
            'top': self.top,
            'bottom': self.bottom,
            'created_at': self.created_at,
            'origin_at': self.origin_at,
            'touched_at': self.touched_at,
            'invalidated_at': self.invalidated_at,
            'active': self.active,
            'tradable': getattr(self, 'tradable', True)
        }

class AdvancedSMCEngine:
    """
    Strict Non-Repainting SMC Engine for XAUUSD.
    Processes OHLCV sequentially. Never looks ahead.
    Generates QML, RBS, SBS/SBR, and TJL zones.
    """
    def __init__(self, df: pd.DataFrame, fast_len=9, slow_len=21):
        self.df = df.copy()
        if 'time' in self.df.columns and 'datetime' not in self.df.columns:
            self.df['datetime'] = pd.to_datetime(self.df['time'], unit='s')
        
        self.df = self.df.sort_values('datetime').reset_index(drop=True)
        self.fast_len = fast_len
        self.slow_len = slow_len
        self.zones = []

    def _calc_ema(self, series, period):
        return series.ewm(span=period, adjust=False).mean()

    def _calculate_htf_bias(self):
        """
        Resamples strictly to Daily, 4H, 1H to calculate EMA bias.
        To avoid lookahead bias, these EMAs are calculated ON the resampled 
        data, and mapped back to the 1m data using forward fill (so the 1m candle
        only knows the bias of the LAST FULLY CLOSED HTF candle).
        """
        # Ensure we have a datetime index for resampling
        df_dt = self.df[['datetime', 'close']].set_index('datetime')
        
        for tf, name in [('1D', 'D'), ('4h', 'H4'), ('1h', 'H1')]:
            # Resample strictly on closed bars (only need close for EMA bias)
            resampled = df_dt.resample(tf).agg({'close': 'last'}).dropna()
            
            # Shift by 1 to ensure we only look at the LAST closed candle
            resampled['fast'] = self._calc_ema(resampled['close'], self.fast_len).shift(1)
            resampled['slow'] = self._calc_ema(resampled['close'], self.slow_len).shift(1)
            
            resampled[f'{name}_bias'] = np.where(resampled['fast'] > resampled['slow'], 1, -1)
            
            # Map back to original timeframe using merge_asof
            bias_df = resampled[[f'{name}_bias']].reset_index()
            self.df = pd.merge_asof(self.df, bias_df, on='datetime', direction='backward')
            
        # Forward fill any initial NaN biases with 0 (neutral)
        self.df[['D_bias', 'H4_bias', 'H1_bias']] = self.df[['D_bias', 'H4_bias', 'H1_bias']].fillna(0)
            
        return self.df

    def create_tjl1_buy_zone(self, lrm_candle, breakout_candle):
        range_val = lrm_candle['high'] - lrm_candle['low']
        top = lrm_candle['high']
        bottom = max(lrm_candle['open'], lrm_candle['close'])
        if top == bottom:
            bottom = top - (range_val * 0.01 if range_val > 0 else 0.5)
            
        z = Zone(
            id_str=f"tjl1_buy_{breakout_candle['time']}",
            timeframe="1M",
            zone_type="TJL1_BUY",
            direction="BUY",
            top=top,
            bottom=bottom,
            created_at=breakout_candle['time'],
            origin_at=lrm_candle['time']
        )
        z.tradable = False
        return z

    def create_tjl2_buy_zone(self, l2_low_candle, breakout_candle):
        range_val = l2_low_candle['high'] - l2_low_candle['low']
        bottom = l2_low_candle['low']
        top = min(l2_low_candle['open'], l2_low_candle['close'])
        if top == bottom:
            top = bottom + (range_val * 0.01 if range_val > 0 else 0.5)
            
        z = Zone(
            id_str=f"tjl2_buy_{breakout_candle['time']}",
            timeframe="1M",
            zone_type="TJL2_BUY",
            direction="BUY",
            top=top,
            bottom=bottom,
            created_at=breakout_candle['time'],
            origin_at=l2_low_candle['time']
        )
        z.tradable = True
        return z

    def create_tjl1_sell_zone(self, lsm_candle, breakout_candle):
        range_val = lsm_candle['high'] - lsm_candle['low']
        bottom = lsm_candle['low']
        top = min(lsm_candle['open'], lsm_candle['close'])
        if top == bottom:
            top = bottom + (range_val * 0.01 if range_val > 0 else 0.5)
            
        z = Zone(
            id_str=f"tjl1_sell_{breakout_candle['time']}",
            timeframe="1M",
            zone_type="TJL1_SELL",
            direction="SELL",
            top=top,
            bottom=bottom,
            created_at=breakout_candle['time'],
            origin_at=lsm_candle['time']
        )
        z.tradable = False
        return z

    def create_tjl2_sell_zone(self, l2_high_candle, breakout_candle):
        range_val = l2_high_candle['high'] - l2_high_candle['low']
        top = l2_high_candle['high']
        bottom = max(l2_high_candle['open'], l2_high_candle['close'])
        if top == bottom:
            bottom = top - (range_val * 0.01 if range_val > 0 else 0.5)
            
        z = Zone(
            id_str=f"tjl2_sell_{breakout_candle['time']}",
            timeframe="1M",
            zone_type="TJL2_SELL",
            direction="SELL",
            top=top,
            bottom=bottom,
            created_at=breakout_candle['time'],
            origin_at=l2_high_candle['time']
        )
        z.tradable = True
        return z

    def process_candles(self):
        """
        The core single-pass sequential processor.
        """
        df = self._calculate_htf_bias()
        
        # State tracking
        lsm = None # Last Support in Market (price, timestamp)
        lrm = None # Last Resistance in Market (price, timestamp)
        
        bearish_choch_count = 0
        bullish_choch_count = 0
        
        # Structure swings for anchoring
        last_low = None
        last_high = None
        
        # TJL Level 2 Tracking (intermediate extremes before breakout)
        l2_lowest_since_lrm = None
        l2_highest_since_lsm = None
        
        zones = []
        
        swing_len = 15
        for i in range(swing_len * 2, len(df)):
            curr = df.iloc[i]
            prev = df.iloc[i-1]
            
            d_bias = curr['D_bias']
            h4_bias = curr['H4_bias']
            h1_bias = curr['H1_bias']
            
            is_bull_cond1 = (d_bias == 1 and h4_bias == 1 and h1_bias == 1)
            is_bull_cond2 = (d_bias == 1 and h4_bias == 1 and h1_bias == -1)
            is_bear_cond1 = (d_bias == -1 and h4_bias == -1 and h1_bias == -1)
            is_bear_cond2 = (d_bias == -1 and h4_bias == -1 and h1_bias == 1)
            
            # 1. Update Swings to define LSM/LRM using a 15-bar fractal (30m structure)
            pivot_idx = i - swing_len
            pivot_candle = df.iloc[pivot_idx]
            
            window_lows = df['low'].iloc[i - swing_len * 2 : i + 1]
            if pivot_candle['low'] == window_lows.min():
                lsm = (pivot_candle['low'], pivot_candle['time'])
                last_low = pivot_candle
                l2_highest_since_lsm = df.iloc[pivot_idx : i + 1].loc[df['high'].iloc[pivot_idx : i + 1].idxmax()]
            else:
                if l2_highest_since_lsm is not None and curr['high'] > l2_highest_since_lsm['high']:
                    l2_highest_since_lsm = curr

            window_highs = df['high'].iloc[i - swing_len * 2 : i + 1]
            if pivot_candle['high'] == window_highs.max():
                lrm = (pivot_candle['high'], pivot_candle['time'])
                last_high = pivot_candle
                l2_lowest_since_lrm = df.iloc[pivot_idx : i + 1].loc[df['low'].iloc[pivot_idx : i + 1].idxmin()]
            else:
                if l2_lowest_since_lrm is not None and curr['low'] < l2_lowest_since_lrm['low']:
                    l2_lowest_since_lrm = curr

            # 2. Check ChoCh (Body Closes)
            # Bearish ChoCh
            if lsm is not None:
                if curr['close'] < lsm[0] and curr['open'] > curr['close']:
                    bearish_choch_count += 1
                elif bearish_choch_count == 1 and curr['close'] > lsm[0]:
                    bearish_choch_count = 0 # Fakeout
                
                if bearish_choch_count == 2:
                    # Confirmed Bearish ChoCh
                    # Create SBS Zone
                    zones.append(Zone(
                        id_str=f"sbs_{curr['time']}",
                        timeframe="base",
                        zone_type="SBS",
                        direction="SELL",
                        top=lsm[0],
                        bottom=min(prev['low'], curr['low']),
                        created_at=curr['time'],
                        origin_at=lsm[1]
                    ))
                    
                    # Create QML Sell Zone
                    if last_high is not None:
                        depth = (last_high['high'] - last_high['low']) * 0.15
                        zones.append(Zone(
                            id_str=f"qml_sell_{curr['time']}",
                            timeframe="base",
                            zone_type="QML",
                            direction="SELL",
                            top=last_high['high'],
                            bottom=last_high['high'] - depth,
                            created_at=curr['time'],
                            origin_at=last_high['time']
                        ))
                        
                    bearish_choch_count = 0
                    
            # TJL Bearish Breakout
            if lsm is not None and curr['close'] < lsm[0]:
                if is_bear_cond1 or is_bear_cond2:
                    if l2_highest_since_lsm is not None and last_low is not None:
                        zones.append(self.create_tjl1_sell_zone(last_low, curr))
                        zones.append(self.create_tjl2_sell_zone(l2_highest_since_lsm, curr))
                
                lsm = None # Reset after breakout

            # Bullish ChoCh
            if lrm is not None:
                if curr['close'] > lrm[0] and curr['close'] > curr['open']:
                    bullish_choch_count += 1
                elif bullish_choch_count == 1 and curr['close'] < lrm[0]:
                    bullish_choch_count = 0 # Fakeout
                    
                if bullish_choch_count == 2:
                    # Confirmed Bullish ChoCh
                    # Create RBS Zone
                    zones.append(Zone(
                        id_str=f"rbs_{curr['time']}",
                        timeframe="base",
                        zone_type="RBS",
                        direction="BUY",
                        bottom=lrm[0],
                        top=max(prev['high'], curr['high']),
                        created_at=curr['time'],
                        origin_at=lrm[1]
                    ))
                    
                    # Create QML Buy Zone
                    if last_low is not None:
                        depth = (last_low['high'] - last_low['low']) * 0.15
                        zones.append(Zone(
                            id_str=f"qml_buy_{curr['time']}",
                            timeframe="base",
                            zone_type="QML",
                            direction="BUY",
                            bottom=last_low['low'],
                            top=last_low['low'] + depth,
                            created_at=curr['time'],
                            origin_at=last_low['time']
                        ))
                        
                    bullish_choch_count = 0
                    
            # TJL Bullish Breakout
            if lrm is not None and curr['close'] > lrm[0]:
                if is_bull_cond1 or is_bull_cond2:
                    if l2_lowest_since_lrm is not None and last_high is not None:
                        zones.append(self.create_tjl1_buy_zone(last_high, curr))
                        zones.append(self.create_tjl2_buy_zone(l2_lowest_since_lrm, curr))
                        
                lrm = None # Reset after breakout

            # 3. Zone Invalidation (One Level One Trade)
            for z in zones:
                if not z.active:
                    continue
                    
                if z.created_at >= curr['time']:
                    continue # Cannot touch on the same candle it was created
                    
                # Touch rule
                if curr['high'] >= z.bottom and curr['low'] <= z.top:
                    z.touched_at = curr['time']
                    z.active = False
                    
                # Invalidation rules
                if z.direction == 'BUY' and curr['close'] < z.bottom:
                    z.invalidated_at = curr['time']
                    z.active = False
                elif z.direction == 'SELL' and curr['close'] > z.top:
                    z.invalidated_at = curr['time']
                    z.active = False

        self.zones = zones
        return [z.to_dict() for z in zones]
