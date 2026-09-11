import pandas as pd
from core.advanced_smc_engine import AdvancedSMCEngine
from strategies.base import BaseStrategy

class AdvancedSMCStrategy(BaseStrategy):
    """
    Automated Execution Strategy for Advanced SMC (QML, RBS, SBS, TJL).
    Uses 1m CISD (Change in State of Delivery) for execution when price touches a HTF Zone.
    """
    def __init__(self, leverage=100, lots=1.0, lookback_candles=5000):
        super().__init__(leverage)
        self.lots = lots
        self.all_zones = []
        
        # State Tracking
        self.in_zone = None
        self.pending_cisd = None # Bearish candle high (for bullish) or Bullish candle low (for bearish)
        
    def set_historical_data(self, df: pd.DataFrame):
        """Precomputes ALL zones for the entire backtest to achieve O(1) tick performance."""
        # Note: We pass the entire dataset (or a large enough chunk) into the engine once.
        # The engine naturally attaches 'created_at', 'touched_at', and 'invalidated_at'
        # to each zone, so we can perfectly simulate real-time without lookahead bias.
        engine = AdvancedSMCEngine(df)
        zones = engine.process_candles()
        
        # Filter for A+ tradable zones (QML, TJL2)
        self.all_zones = [z for z in zones if z['type'] in ['QML', 'TJL2_BUY', 'TJL2_SELL']]

    def get_active_zones(self, current_time):
        """Returns zones that are structurally active at the given tick timestamp."""
        active = []
        for z in self.all_zones:
            # Zone must be created BEFORE or AT current time
            if current_time < z['created_at']:
                continue
            # Zone must not have been touched yet
            if z['touched_at'] is not None and z['touched_at'] < current_time:
                continue
            # Zone must not have been invalidated
            if z['invalidated_at'] is not None and z['invalidated_at'] < current_time:
                continue
            active.append(z)
        return active

    def on_candle(self, candle):
        curr = candle
        current_time = curr['time']
        
        # If we are already in a position, let SL/TP handle it
        if self.engine and len(self.engine.positions) > 0:
            return

        # 1. Check if we entered an active A+ Zone
        if not self.in_zone:
            active_zones = self.get_active_zones(current_time)
            for zone in active_zones:
                if curr['high'] >= zone['bottom'] and curr['low'] <= zone['top']:
                    self.in_zone = zone
                    self.pending_cisd = None
                    break
        else:
            # 2. Check if we left the zone (invalidated or moved away)
            if self.in_zone['direction'] == 'BUY' and curr['close'] < self.in_zone['bottom']:
                self.in_zone = None
                self.pending_cisd = None
                return
            elif self.in_zone['direction'] == 'SELL' and curr['close'] > self.in_zone['top']:
                self.in_zone = None
                self.pending_cisd = None
                return
                
            # 3. Look for CISD (Change in State of Delivery) Execution
            if self.in_zone['direction'] == 'BUY':
                # Track the last institutional down-close candle
                if curr['close'] < curr['open']:
                    self.pending_cisd = curr['high']
                
                # If an up-close candle engulfs/closes above the last down-close high -> EXECUTE
                if self.pending_cisd and curr['close'] > curr['open'] and curr['close'] > self.pending_cisd:
                    # Fire Market Buy!
                    sl = self.in_zone['bottom'] - 0.5 # 0.5 points buffer
                    tp = curr['close'] + ((curr['close'] - sl) * 2) # 1:2 R:R Target
                    
                    self.buy(self.lots, sl=sl, tp=tp)
                    self.in_zone = None # Reset
                    self.pending_cisd = None
                    
            elif self.in_zone['direction'] == 'SELL':
                # Track the last institutional up-close candle
                if curr['close'] > curr['open']:
                    self.pending_cisd = curr['low']
                
                # If a down-close candle closes below the last up-close low -> EXECUTE
                if self.pending_cisd and curr['close'] < curr['open'] and curr['close'] < self.pending_cisd:
                    # Fire Market Sell!
                    sl = self.in_zone['top'] + 0.5
                    tp = curr['close'] - ((sl - curr['close']) * 2)
                    
                    self.sell(self.lots, sl=sl, tp=tp)
                    self.in_zone = None
                    self.pending_cisd = None
