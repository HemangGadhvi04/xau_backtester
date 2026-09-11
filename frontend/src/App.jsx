import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense, useContext } from 'react';
import axios from 'axios';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";
import Chart from './components/Chart';
import ReplayControls from './components/ReplayControls';
import DrawingToolbar from './components/DrawingToolbar';
import IndicatorManager from './components/IndicatorManager';
import TradePanel from './components/TradePanel';
import TerminalPanel from './components/TerminalPanel';
import AuthPage from './components/AuthPage';
import { AuthContext } from './context/authContextValue';
import { BarChart3, BookOpen, FlaskConical, RefreshCw, X } from 'lucide-react';
import './index.css';

const TradeJournal = lazy(() => import('./components/TradeJournal'));
const SystematicTester = lazy(() => import('./components/SystematicTester'));

const API_BASE = '/api';

const LEVERAGE = 100;

import { getSymbolConfig, updateSymbolConfigs } from './utils/symbolConfig';

const DEFAULT_CHART_SETTINGS = {
  upColor: '#16a085',
  downColor: '#ff3355',
  borderUpColor: '#16a085',
  borderDownColor: '#ff3355',
  wickUpColor: '#16a085',
  wickDownColor: '#ff3355',
  showBody: true,
  showBorders: true,
  showWicks: true,
  backgroundColor: '#0b0d10',
  gridColor: '#1f2933',
  textColor: '#d1d4dc',
  precisionMode: 'default'
};

const MIGRATED_INDICATORS = [
  { instance_id: 'ema-9-default', indicator_id: 'ema', name: '9 EMA', visible: true, settings: { period: 9, source: 'close', color: '#ff5252', line_width: 2 } },
  { instance_id: 'ema-15-default', indicator_id: 'ema', name: '15 EMA', visible: true, settings: { period: 15, source: 'close', color: '#2196f3', line_width: 2 } },
  { instance_id: 'vwap-default', indicator_id: 'vwap', name: 'Session VWAP', visible: true, settings: { color: '#ff9800', line_width: 2 } },
  { instance_id: 'classic-smc-default', indicator_id: 'classic_smc', name: 'Classic SMC', visible: false, settings: { zone_limit: 10 } },
  { instance_id: 'advanced-smc-default', indicator_id: 'advanced_smc', name: 'Advanced SMC', visible: false, settings: { fast_length: 9, slow_length: 21 } },
  { instance_id: 'msb-ob-default', indicator_id: 'msb_ob_mtf', name: 'MSB-OB Multi-Timeframe', visible: false, settings: { zigzag_length: 9, fib_factor: 0.33, fast_length: 50, slow_length: 200, minimum_aligned: 4, filter_by_mtf: false } },
  { instance_id: 'geometric-default', indicator_id: 'geometric_range', name: 'Geometric Range', visible: false, settings: { anchor_hour: 22, divisor: 4.618, minimum_body: 0.2 } },
];

const roundToPrecision = (value, precision) => {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
};

const getSlippage = (timestamp, symbol) => {
  const cfg = getSymbolConfig(symbol);
  if (!timestamp) return 0.1 * cfg.pipSize;
  const date = new Date(timestamp * 1000);
  const hour = date.getUTCHours();
  const isOverlap = hour >= 12 && hour <= 16;
  const basePips = isOverlap ? 0.2 : 0.1;
  const randomPips = Math.random() * (isOverlap ? 0.8 : 0.3);
  return (basePips + randomPips) * cfg.pipSize;
};

const getHeaderTabStyle = (isActive) => ({
  ...headerStyles.tabButton,
  ...(isActive ? headerStyles.tabButtonActive : {})
});

const serializeDrawingPoints = (drawing) => {
  if (drawing.points) return { points: drawing.points };
  return {
    p1: drawing.p1,
    p2: drawing.p2,
    ...(drawing.p3 ? { p3: drawing.p3 } : {})
  };
};

const ChartSettingsModal = ({ settings, onChange, onClose }) => {
  const update = (patch) => onChange(prev => ({ ...prev, ...patch }));
  const toggle = (key) => update({ [key]: !settings[key] });

  return (
    <div style={settingsStyles.backdrop}>
      <div style={settingsStyles.modal}>
        <div style={settingsStyles.header}>
          <h2 style={settingsStyles.title}>Settings</h2>
          <button style={settingsStyles.closeBtn} onClick={onClose}>x</button>
        </div>

        <div style={settingsStyles.body}>
          <div style={settingsStyles.sidebar}>
            {['Symbol', 'Status line', 'Scales and lines', 'Canvas', 'Trading', 'Alerts', 'Events'].map((item, index) => (
              <div key={item} style={{ ...settingsStyles.sideItem, ...(index === 0 ? settingsStyles.sideItemActive : {}) }}>
                <span style={settingsStyles.sideIcon}>{index + 1}</span>
                {item}
              </div>
            ))}
          </div>

          <div style={settingsStyles.panel}>
            <div style={settingsStyles.sectionLabel}>Candles</div>
            <label style={settingsStyles.checkRow}>
              <input type="checkbox" checked={settings.showBody} onChange={() => toggle('showBody')} style={settingsStyles.checkbox} />
              <span>Body</span>
              <input type="color" value={settings.upColor} onChange={(e) => update({ upColor: e.target.value })} style={settingsStyles.colorInput} />
              <input type="color" value={settings.downColor} onChange={(e) => update({ downColor: e.target.value })} style={settingsStyles.colorInput} />
            </label>
            <label style={settingsStyles.checkRow}>
              <input type="checkbox" checked={settings.showBorders} onChange={() => toggle('showBorders')} style={settingsStyles.checkbox} />
              <span>Borders</span>
              <input type="color" value={settings.borderUpColor || settings.upColor} onChange={(e) => update({ borderUpColor: e.target.value })} style={settingsStyles.colorInput} />
              <input type="color" value={settings.borderDownColor || settings.downColor} onChange={(e) => update({ borderDownColor: e.target.value })} style={settingsStyles.colorInput} />
            </label>
            <label style={settingsStyles.checkRow}>
              <input type="checkbox" checked={settings.showWicks} onChange={() => toggle('showWicks')} style={settingsStyles.checkbox} />
              <span>Wick</span>
              <input type="color" value={settings.wickUpColor || settings.upColor} onChange={(e) => update({ wickUpColor: e.target.value })} style={settingsStyles.colorInput} />
              <input type="color" value={settings.wickDownColor || settings.downColor} onChange={(e) => update({ wickDownColor: e.target.value })} style={settingsStyles.colorInput} />
            </label>

            <div style={settingsStyles.sectionLabel}>Canvas</div>
            <div style={settingsStyles.formRow}>
              <span>Background</span>
              <input type="color" value={settings.backgroundColor} onChange={(e) => update({ backgroundColor: e.target.value })} style={settingsStyles.colorInputWide} />
            </div>
            <div style={settingsStyles.formRow}>
              <span>Grid lines</span>
              <input type="color" value={settings.gridColor} onChange={(e) => update({ gridColor: e.target.value })} style={settingsStyles.colorInputWide} />
            </div>
            <div style={settingsStyles.formRow}>
              <span>Precision</span>
              <select value={settings.precisionMode} onChange={(e) => update({ precisionMode: e.target.value })} style={settingsStyles.select}>
                <option value="default">Default</option>
                <option value="compact">Compact</option>
              </select>
            </div>
            <div style={settingsStyles.formRow}>
              <span>Timezone</span>
              <select value="kolkata" disabled style={settingsStyles.select}>
                <option value="kolkata">(UTC+5:30) Kolkata</option>
              </select>
            </div>
          </div>
        </div>

        <div style={settingsStyles.footer}>
          <button style={settingsStyles.templateBtn}>Template ▾</button>
          <div style={settingsStyles.footerActions}>
            <button style={settingsStyles.cancelBtn} onClick={onClose}>Cancel</button>
            <button style={settingsStyles.okBtn} onClick={onClose}>Ok</button>
          </div>
        </div>
      </div>
    </div>
  );
};

function App() {
  const { user, isLoading: authLoading } = useContext(AuthContext);
  const [allCandles, setAllCandles] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [reviewingTrade, setReviewingTrade] = useState(null);
  const [speed, setSpeed] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingTimeframe, setLoadingTimeframe] = useState(null);
  
  const [currentTab, setCurrentTab] = useState('chart');
  // Advanced Replay States
  const [timeframe, setTimeframe] = useState('1m');
  const [loadedTimeframe, setLoadedTimeframe] = useState('1m');
  const [loadedSymbol, setLoadedSymbol] = useState('XAUUSD');
  const [activeSymbol, setActiveSymbol] = useState('XAUUSD');
  const [isSelectingStartBar, setIsSelectingStartBar] = useState(false);

  // Drawing states
  const [activeTool, setActiveTool] = useState('cursor');
  const [drawings, setDrawings] = useState([]);
  const [showSessions, setShowSessions] = useState(false);
  const [isChartSettingsOpen, setIsChartSettingsOpen] = useState(false);
  const [chartSettings, setChartSettings] = useState(DEFAULT_CHART_SETTINGS);
  const [isIndicatorManagerOpen, setIsIndicatorManagerOpen] = useState(false);
  const [indicatorLibrary, setIndicatorLibrary] = useState([]);
  const [indicatorInstances, setIndicatorInstances] = useState(() => {
    try { return JSON.parse(localStorage.getItem('xau-python-indicators') || '[]'); } catch { return []; }
  });
  const [pythonIndicatorResults, setPythonIndicatorResults] = useState([]);

  useEffect(() => {
    if (!localStorage.getItem('xau-indicator-framework-migrated-v2')) {
      setIndicatorInstances(MIGRATED_INDICATORS);
      localStorage.setItem('xau-indicator-framework-migrated-v2', '1');
    }
  }, []);

  // Trade states
  const [account, setAccount] = useState({
    balance: 10000,
    equity: 10000
  });
  const [positions, setPositions] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [tradeHistory, setTradeHistory] = useState([]);
  const [systematicTrades, setSystematicTrades] = useState([]);
  
  // Lifted order creation states for pre-trade preview and draggers
  const [orderType, setOrderType] = useState('MARKET');
  const [limitPrice, setLimitPrice] = useState('');
  const [plannedDirection, setPlannedDirection] = useState(null);
  const [slPips, setSlPips] = useState(20);
  const [tpPips, setTpPips] = useState(40);
  const [riskPercent, setRiskPercent] = useState(1);
  const [customLots, setCustomLots] = useState('');
  const [isLotMode, setIsLotMode] = useState(false);

  // Drag handlers


  const chartRef = useRef(null);
  const playInterval = useRef(null);
  const hasInitialized = useRef(false);
  const currentIndexRef = useRef(0);
  const allCandlesRef = useRef([]);
  const loadRequestRef = useRef(0);
  const savedTimeRef = useRef(0);

  // Sync ref to state on manual index changes
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    allCandlesRef.current = allCandles;
  }, [allCandles]);

  useEffect(() => {
    localStorage.setItem('xau-python-indicators', JSON.stringify(indicatorInstances));
  }, [indicatorInstances]);

  useEffect(() => {
    axios.get(`${API_BASE}/indicator-library`)
      .then(response => setIndicatorLibrary(response.data.indicators || []))
      .catch(error => console.error('Unable to load indicator library:', error));
  }, []);

  useEffect(() => {
    const visibleIndicators = indicatorInstances.filter(instance => instance.visible !== false);
    if (!visibleIndicators.length || !allCandles.length || currentIndex < 1) {
      setPythonIndicatorResults([]);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      axios.post(`${API_BASE}/indicator-library/calculate`, {
        symbol: loadedSymbol,
        timeframe: loadedTimeframe,
        current_time: allCandles[Math.min(currentIndex, allCandles.length) - 1]?.time,
        limit: 5000,
        indicators: visibleIndicators.map(({ instance_id, indicator_id, settings }) => ({ instance_id, indicator_id, settings })),
      }, { signal: controller.signal })
        .then(response => setPythonIndicatorResults(response.data.results || []))
        .catch(error => { if (error.code !== 'ERR_CANCELED') console.error('Indicator calculation failed:', error); });
    }, 120);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [indicatorInstances, allCandles, currentIndex, loadedSymbol, loadedTimeframe]);

  // Auto-exit review mode if we pass the exit time of the trade
  useEffect(() => {
    if (reviewingTrade) {
      const exitTime = reviewingTrade.closeTime || reviewingTrade.exit_time || reviewingTrade.exitTime;
      const currentCandleTime = allCandles[currentIndex - 1]?.time || 0;
      if (exitTime && currentCandleTime > exitTime) {
        setReviewingTrade(null);
      }
    }
  }, [currentIndex, reviewingTrade, allCandles]);

  // Constants
  const BASE_INTERVAL_MS = 1000; // 1x speed = 1 update per second

  const refreshCandlesAndState = async () => {
    setIsLoading(true);
    try {
      const candlesRes = await axios.get(`${API_BASE}/candles?symbol=${activeSymbol}&timeframe=${timeframe}&limit=10000`);
      const data = candlesRes.data.candles;
      if (data && data.length > 0) {
        setAllCandles(data);
        await refreshTradeHistory();
      }
    } catch (error) {
      console.error("Error reloading candles:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoToLatest = () => {
    if (allCandles.length === 0) return;
    setCurrentIndex(allCandles.length);
    saveSessionState(allCandles.length);
  };

  // Fetch historical data and restore state from SQLite database
  useEffect(() => {
    if (!user) return;
    const fetchCandlesAndState = async () => {
      const requestId = loadRequestRef.current + 1;
      loadRequestRef.current = requestId;
      setIsLoading(true);
      setDrawings([]);
      setPositions([]);
      setPendingOrders([]);
      setTradeHistory([]);
      try {
        // Fetch dynamic symbol configurations
        try {
          const symRes = await axios.get(`${API_BASE}/symbols`);
          if (symRes.data) {
            updateSymbolConfigs(symRes.data);
          }
        } catch (symErr) {
          console.error("Could not fetch symbol configs from backend:", symErr);
        }
        
        let activeTf = timeframe;
        let savedTime = 0;
        
        let activeSym = activeSymbol;
        if (!hasInitialized.current) {
          const sessionRes = await axios.get(`${API_BASE}/session`);
          if (requestId !== loadRequestRef.current) return;
          const session = sessionRes.data;
          let stateChanged = false;
          if (session) {
            if (session.playback_speed) setSpeed(session.playback_speed);
            if (session.symbol) {
              let sym = session.symbol;
              if (sym === 'XAUUSD') sym = 'XAU/USD';
              if (sym === 'EURUSD') sym = 'EUR/USD';
              if (sym === 'BTCUSD') sym = 'BTC/USD';
              activeSym = sym;
              if (sym !== activeSymbol) {
                setActiveSymbol(sym);
                stateChanged = true;
              }
            }
            if (session.timeframe) {
              activeTf = session.timeframe;
              if (session.timeframe !== timeframe) {
                setTimeframe(session.timeframe);
                stateChanged = true;
              }
            }
            if (session.current_time > 0) {
              savedTime = session.current_time;
            }
          }
          hasInitialized.current = true;
          if (stateChanged) {
            savedTimeRef.current = savedTime;
            return; // Abort fetch; next effect will run with correct state
          }
        } else {
          // Consume savedTimeRef if it was set during a state update abortion
          if (savedTimeRef.current > 0) {
            savedTime = savedTimeRef.current;
            savedTimeRef.current = 0;
          }
        }

        // 2. Fetch candles aggregated to the active timeframe from the backend
        let targetTime = null;
        if (!hasInitialized.current && savedTime > 0) {
          targetTime = savedTime;
        } else if (hasInitialized.current && allCandlesRef.current.length > 0 && currentIndexRef.current > 0) {
          targetTime = allCandlesRef.current[currentIndexRef.current - 1]?.time;
        }

        let url = `${API_BASE}/candles?symbol=${activeSym}&timeframe=${activeTf}&limit=20000`;
        if (targetTime) {
          const tfMinutes = activeTf === '1m' ? 1 : activeTf === '5m' ? 5 : activeTf === '15m' ? 15 : activeTf === '30m' ? 30 : activeTf === '1h' ? 60 : activeTf === '4h' ? 240 : 1440;
          const toTs = targetTime + (2000 * tfMinutes * 60);
          url += `&to_ts=${toTs}`;
        }
        
        const candlesRes = await axios.get(url);
        if (requestId !== loadRequestRef.current) return;
        const data = candlesRes.data.candles;
        if (!data || data.length === 0) return;

        // 3. Restore session index or preserve current candle time on timeframe switch
        if (savedTime > 0) {
          const matchIndex = data.findIndex(c => c.time >= savedTime);
          if (matchIndex !== -1) {
            setCurrentIndex(matchIndex + 1);
          } else {
            setCurrentIndex(Math.floor(data.length * 0.8));
          }
        } else {
          // If timeframe changed, preserve current candle time if possible
          const currentCandles = allCandlesRef.current;
          const cIndex = currentIndexRef.current;
          
          if (currentCandles.length > 0 && cIndex > 0) {
            const lastTime = currentCandles[cIndex - 1]?.time || 0;
            const matchIndex = data.findIndex(c => c.time >= lastTime);
            if (matchIndex !== -1) {
              setCurrentIndex(matchIndex + 1);
            } else {
              setCurrentIndex(Math.floor(data.length * 0.8));
            }
          } else {
            setCurrentIndex(Math.floor(data.length * 0.8));
          }
        }

        setAllCandles(data);
        setLoadedTimeframe(activeTf);
        setLoadedSymbol(activeSym);

        // 4. Load drawings from SQLite for the active symbol
        const drawingsRes = await axios.get(`${API_BASE}/drawings?symbol=${activeSym}`);
        if (requestId !== loadRequestRef.current) return;
        const dbDrawings = drawingsRes.data.map(d => {
          const parsedPoints = JSON.parse(d.points_json);
          return {
            id: d.id,
            type: d.type,
            timeframe: d.timeframe,
            p1: parsedPoints.p1,
            p2: parsedPoints.p2,
            p3: parsedPoints.p3,
            points: parsedPoints.points,
            style: d.style_json ? JSON.parse(d.style_json) : {}
          };
        });
        setDrawings(dbDrawings);

        // 5. Load trades and journal history from SQLite for the active symbol
        const tradesRes = await axios.get(`${API_BASE}/trades?symbol=${activeSym}`);
        if (requestId !== loadRequestRef.current) return;
        const dbTrades = tradesRes.data;
        
        setPositions(dbTrades.filter(t => t.status === 'OPEN').map(t => ({
          id: Number(t.id),
          symbol: t.symbol,
          type: t.direction,
          lots: t.lots,
          entryPrice: t.entry_price,
          entryTime: t.entry_time,
          sl: t.sl,
          tp: t.tp,
          timestamp: t.entry_time
        })));

        setPendingOrders(dbTrades.filter(t => t.status === 'PENDING').map(t => ({
          id: Number(t.id),
          symbol: t.symbol,
          type: t.direction,
          lots: t.lots,
          entryPrice: t.entry_price,
          entryTime: t.entry_time,
          sl: t.sl,
          tp: t.tp,
          timestamp: t.entry_time
        })));

        setTradeHistory(dbTrades.filter(t => t.status === 'CLOSED').map(t => ({
          id: Number(t.id),
          symbol: t.symbol,
          type: t.direction,
          lots: t.lots,
          entryPrice: t.entry_price,
          entryTime: t.entry_time,
          sl: t.sl,
          tp: t.tp,
          closePrice: t.exit_price,
          closeTime: t.exit_time,
          pnl: t.pnl,
          notes: t.notes,
          journal_note: t.journal_note,
          tags: t.tags
        })));

      } catch (error) {
        console.error("Error loading workspace data:", error);
      } finally {
        if (requestId === loadRequestRef.current) {
          setIsLoading(false);
          setLoadingTimeframe(null);
        }
      }
    };

    fetchCandlesAndState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe, activeSymbol]);

  // Sync Replay Clock session bookmark to SQLite database
  const saveSessionState = useCallback(async (currentIndexVal) => {
    if (allCandles.length === 0 || currentIndexVal === 0) return;
    const currentCandleTime = allCandles[currentIndexVal - 1]?.time || 0;
    try {
      await axios.post(`${API_BASE}/session`, {
        symbol: activeSymbol,
        timeframe,
        current_time: currentCandleTime,
        playback_speed: speed
      });
    } catch (e) {
      console.error("Error saving session bookmark:", e);
    }
  }, [timeframe, activeSymbol, speed, allCandles]);

  // Save session when pause/play trigger
  const handleTogglePlay = () => {
    setIsPlaying(prev => {
      const nextPlay = !prev;
      if (!nextPlay) {
        saveSessionState(currentIndex);
      }
      return nextPlay;
    });
  };

  // Update unrealized P&L & Equity when current price changes
  const currentPrice = allCandles[currentIndex - 1]?.close || 0;

  const unrealizedPnl = useMemo(() => {
    const cfg = getSymbolConfig(activeSymbol);
    return positions.reduce((total, pos) => {
      const isBuy = pos.type === 'BUY';
      const priceDiff = isBuy ? (currentPrice - pos.entryPrice) : (pos.entryPrice - currentPrice);
      return total + (priceDiff * pos.lots * cfg.contractSize);
    }, 0);
  }, [positions, currentPrice, activeSymbol]);

  const derivedAccount = useMemo(() => ({
    ...account,
    equity: account.balance + unrealizedPnl
  }), [account, unrealizedPnl]);

  // Authoritative Replay Engine Helper
  const syncReplayState = async () => {
    try {
      const res = await axios.get(`${API_BASE}/replay/state?symbol=${activeSymbol}`);
      if (res.data) {
        setPositions((res.data.positions || []).map(p => ({
          id: p.id,
          type: p.direction,
          lots: p.lots,
          entryPrice: p.entry_price,
          sl: p.sl,
          tp: p.tp,
          timestamp: p.entry_time
        })));
        setPendingOrders((res.data.pending_orders || []).map(o => ({
          id: o.id,
          type: o.direction,
          lots: o.lots,
          entryPrice: o.price,
          sl: o.sl,
          tp: o.tp,
          timestamp: o.created_time
        })));
        setTradeHistory((res.data.trade_history || []).map(t => ({
          id: t.id,
          type: t.direction,
          lots: t.lots,
          entryPrice: t.entry_price,
          entryTime: t.entry_time,
          closePrice: t.exit_price,
          closeTime: t.exit_time,
          pnl: t.pnl,
          sl: t.sl,
          tp: t.tp
        })));
        if (res.data.account) {
          setAccount(prev => ({
            ...prev,
            balance: res.data.account.balance,
            equity: res.data.account.equity
          }));
        }
      }
    } catch (e) {
      console.error("Error fetching authoritative replay state:", e);
    }
  };

  // Order Placement (Delegated to Authoritative Replay Engine)
  const handlePlaceOrder = async (type, lots, entryPrice, sl, tp, isLimit) => {
    try {
      await axios.post(`${API_BASE}/replay/order?symbol=${activeSymbol}`, {
        direction: type,
        order_type: isLimit ? 'LIMIT' : 'MARKET',
        lots,
        price: isLimit ? entryPrice : null,
        sl: sl || null,
        tp: tp || null
      });
      await syncReplayState();
    } catch (e) {
      console.error("Error placing order via ReplayEngine:", e);
    }
  };

  const saveTradeScreenshot = async (tradeId) => {
    return;
  };

  // Close Position Manually (Delegated to Authoritative Replay Engine)
  const handleClosePosition = async (id) => {
    try {
      await axios.post(`${API_BASE}/replay/position/${id}/close?symbol=${activeSymbol}`);
      await syncReplayState();
    } catch (e) {
      console.error("Error closing position via ReplayEngine:", e);
    }
  };

  const handleCancelPendingOrder = async (id) => {
    try {
      await axios.delete(`${API_BASE}/replay/order/${id}?symbol=${activeSymbol}`);
      await syncReplayState();
    } catch (e) {
      console.error("Error canceling pending order via ReplayEngine:", e);
    }
  };


  // Replay tick execution check
  const checkPendingAndPositions = useCallback((candle) => {
    const timestamp = candle.time;
    const slippage = getSlippage(timestamp, activeSymbol);
    const cfg = getSymbolConfig(activeSymbol);

    // 1. Process Pending Limit Orders
    setPendingOrders(prevPending => {
      const triggered = [];
      const remaining = [];

      prevPending.forEach(order => {
        let isTriggered = false;
        let finalEntryPrice = order.entryPrice;

        if (order.type === 'BUY') {
          // BUY Limit triggers when Ask (Bid + spread) <= limitPrice
          if (candle.low + cfg.defaultSpread <= order.entryPrice) {
            isTriggered = true;
            finalEntryPrice = order.entryPrice + slippage; // fill at limit price + slippage
          }
        } else {
          // SELL Limit triggers when Bid >= limitPrice
          if (candle.high >= order.entryPrice) {
            isTriggered = true;
            finalEntryPrice = order.entryPrice - slippage; // fill at limit price - slippage
          }
        }

        if (isTriggered) {
          // Persist trigger state change to DB
          axios.patch(`${API_BASE}/trades/${order.id}`, {
            status: 'OPEN',
            entry_price: finalEntryPrice,
            entry_time: candle.time
          }).catch(err => console.error("Error triggering limit order in DB:", err));

          triggered.push({
            ...order,
            entryPrice: finalEntryPrice,
            timestamp: candle.time
          });
        } else {
          remaining.push(order);
        }
      });

      if (triggered.length > 0) {
        setPositions(prevPos => [...prevPos, ...triggered]);
      }

      return remaining;
    });

    // 2. Process active positions' SL/TP hits (Pessimistic: SL is assumed to hit first)
    setPositions(prevPositions => {
      const remaining = [];
      
      prevPositions.forEach(pos => {
        let hitSL = false;
        let hitTP = false;

        if (pos.type === 'BUY') {
          // BUY exits at Bid.
          if (pos.sl && candle.low <= pos.sl) hitSL = true;
          if (pos.tp && candle.high >= pos.tp) hitTP = true;
        } else {
          // SELL exits at Ask (Bid + spread).
          if (pos.sl && candle.high + cfg.defaultSpread >= pos.sl) hitSL = true;
          if (pos.tp && candle.low + cfg.defaultSpread <= pos.tp) hitTP = true;
        }

        if (hitSL || hitTP) {
          // Pessimistic resolution: if both SL & TP are hit in same candle, assume SL hit
          const resolvedSL = hitSL;
          
          let closePrice;
          if (pos.type === 'BUY') {
            closePrice = resolvedSL ? (pos.sl - slippage) : (pos.tp - slippage);
          } else {
            closePrice = resolvedSL ? (pos.sl + slippage) : (pos.tp + slippage);
          }

          const isBuy = pos.type === 'BUY';
          const priceDiff = isBuy ? (closePrice - pos.entryPrice) : (pos.entryPrice - closePrice);
          const pnl = priceDiff * pos.lots * cfg.contractSize;

          axios.patch(`${API_BASE}/trades/${pos.id}`, {
            status: 'CLOSED',
            exit_price: closePrice,
            exit_time: candle.time,
            pnl
          }).catch(err => console.error("Error auto-closing position in DB:", err));

          const closedTrade = {
            ...pos,
            closePrice,
            pnl,
            closeTime: candle.time,
            outcome: resolvedSL ? 'SL' : 'TP'
          };

          setTradeHistory(history => [closedTrade, ...history]);
          saveTradeScreenshot(pos.id);
          setAccount(acc => ({
            ...acc,
            balance: acc.balance + pnl
          }));
        } else {
          remaining.push(pos);
        }
      });

      return remaining;
    });
  }, [activeSymbol]);

  // Handle Drag-to-Adjust line updates (updates local state instantly)
  const handleDragUpdateLine = (type, id, newPrice) => {
    const formattedPrice = roundToPrecision(newPrice, getSymbolConfig(activeSymbol).precision);
    
    if (type === 'sl' || type === 'tp') {
      setPositions(prev => prev.map(pos => {
        if (pos.id === id) {
          return { ...pos, [type]: formattedPrice };
        }
        return pos;
      }));
    } else if (type === 'limit' || type === 'pendingSl' || type === 'pendingTp') {
      setPendingOrders(prev => prev.map(order => {
        if (order.id === id) {
          if (type === 'limit') return { ...order, entryPrice: formattedPrice };
          if (type === 'pendingSl') return { ...order, sl: formattedPrice };
          if (type === 'pendingTp') return { ...order, tp: formattedPrice };
        }
        return order;
      }));
    }
  };

  // Persist drag changes to SQLite database on drag release
  const handleDragEndLine = async (type, id, finalPrice) => {
    const formattedPrice = roundToPrecision(finalPrice, getSymbolConfig(activeSymbol).precision);
    let payload = {};
    if (type === 'sl') payload = { sl: formattedPrice };
    if (type === 'tp') payload = { tp: formattedPrice };
    if (type === 'limit') payload = { entry_price: formattedPrice };
    if (type === 'pendingSl') payload = { sl: formattedPrice };
    if (type === 'pendingTp') payload = { tp: formattedPrice };

    try {
      await axios.patch(`${API_BASE}/trades/${id}`, payload);
    } catch (e) {
      console.error("Error updating trade line in DB on drag release:", e);
    }
  };

  // Replay playback loop
  useEffect(() => {
    if (isPlaying) {
      const intervalMs = BASE_INTERVAL_MS / speed;
      
      // Ensure local ref matches current state initially
      currentIndexRef.current = currentIndex;
      
      playInterval.current = setInterval(() => {
        const nextIdx = currentIndexRef.current + 1;
        if (nextIdx > allCandles.length) {
          setIsPlaying(false);
          return;
        }
        
        currentIndexRef.current = nextIdx;
        const nextCandle = allCandles[nextIdx - 1];
        if (chartRef.current) {
          chartRef.current.updateCandle(nextCandle);
        }
        checkPendingAndPositions(nextCandle);
      }, intervalMs);

      // Throttled UI state updater (runs at 5Hz to avoid choking the React rendering engine)
      const uiInterval = setInterval(() => {
        setCurrentIndex(currentIndexRef.current);
      }, 200);

      // Save on page unload
      const handleBeforeUnload = () => {
        saveSessionState(currentIndexRef.current);
      };
      window.addEventListener('beforeunload', handleBeforeUnload);

      return () => {
        if (playInterval.current) clearInterval(playInterval.current);
        clearInterval(uiInterval);
        window.removeEventListener('beforeunload', handleBeforeUnload);
        
        // Sync final settled state to React UI on pause
        setCurrentIndex(currentIndexRef.current);
        // Save session state to DB immediately on pause
        saveSessionState(currentIndexRef.current);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, speed, allCandles, checkPendingAndPositions, saveSessionState]);

  // Step next candle (Syncs session bookmark)
  const handleNextCandle = useCallback(() => {
    if (currentIndex < allCandles.length) {
      const nextCandle = allCandles[currentIndex];
      if (chartRef.current) {
        chartRef.current.updateCandle(nextCandle);
      }
      checkPendingAndPositions(nextCandle);
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      saveSessionState(nextIdx);
    }
  }, [currentIndex, allCandles, checkPendingAndPositions, saveSessionState]);

  // Set Replay Start Bar
  const handleSelectStartBar = (time) => {
    const targetIndex = allCandles.findIndex(candle => candle.time === time);
    if (targetIndex !== -1) {
      const nextIdx = targetIndex + 1;
      setCurrentIndex(nextIdx);
      saveSessionState(nextIdx);
    }
    setIsSelectingStartBar(false);
    setSystematicTrades([]);
  };

  // Drawings callbacks (Syncs to SQLite)
  const handleAddDrawing = async (drawing) => {
    try {
      const pointsObj = serializeDrawingPoints(drawing);
      await axios.post(`${API_BASE}/drawings`, {
        id: drawing.id,
        session_id: 'default',
        symbol: activeSymbol,
        type: drawing.type,
        points_json: JSON.stringify(pointsObj),
        style_json: drawing.style ? JSON.stringify(drawing.style) : null,
        timeframe
      });
      setDrawings(prev => [...prev, drawing]);
      setActiveTool('cursor');
    } catch (e) {
      console.error("Error creating drawing in DB:", e);
    }
  };

  // Update drawing: if isFinal is true, write to SQLite database. Otherwise just update local state.
  const handleUpdateDrawing = async (updatedDrawing, isFinal = false) => {
    setDrawings(prev => prev.map(d => d.id === updatedDrawing.id ? updatedDrawing : d));
    
    if (isFinal) {
      try {
        const pointsObj = serializeDrawingPoints(updatedDrawing);
        await axios.patch(`${API_BASE}/drawings/${updatedDrawing.id}`, {
          points_json: JSON.stringify(pointsObj),
          style_json: updatedDrawing.style ? JSON.stringify(updatedDrawing.style) : null
        });
      } catch (e) {
        console.error("Error updating drawing coords and style in DB:", e);
      }
    }
  };

  const handleDeleteDrawing = async (id) => {
    try {
      await axios.delete(`${API_BASE}/drawings/${id}`);
      setDrawings(prev => prev.filter(d => d.id !== id));
    } catch (e) {
      console.error("Error deleting drawing from DB:", e);
    }
  };

  const handleClearDrawings = async () => {
    try {
      await axios.delete(`${API_BASE}/drawings/all/clear`);
      setDrawings([]);
    } catch (e) {
      console.error("Error clearing drawings in DB:", e);
    }
  };

  const refreshTradeHistory = async () => {
    try {
      const tradesRes = await axios.get(`${API_BASE}/trades?symbol=${activeSymbol}`);
      const dbTrades = tradesRes.data;
      
      setPositions(dbTrades.filter(t => t.status === 'OPEN').map(t => ({
        id: Number(t.id),
        symbol: t.symbol,
        type: t.direction,
        lots: t.lots,
        entryPrice: t.entry_price,
        entryTime: t.entry_time,
        sl: t.sl,
        tp: t.tp,
        timestamp: t.entry_time
      })));

      setPendingOrders(dbTrades.filter(t => t.status === 'PENDING').map(t => ({
        id: Number(t.id),
        symbol: t.symbol,
        type: t.direction,
        lots: t.lots,
        entryPrice: t.entry_price,
        entryTime: t.entry_time,
        sl: t.sl,
        tp: t.tp,
        timestamp: t.entry_time
      })));

      setTradeHistory(dbTrades.filter(t => t.status === 'CLOSED').map(t => ({
        id: Number(t.id),
        symbol: t.symbol,
        type: t.direction,
        lots: t.lots,
        entryPrice: t.entry_price,
        entryTime: t.entry_time,
        sl: t.sl,
        tp: t.tp,
        closePrice: t.exit_price,
        closeTime: t.exit_time,
        pnl: t.pnl,
        notes: t.notes,
        journal_note: t.journal_note,
        tags: t.tags
      })));
    } catch (e) {
      console.error("Error refreshing trade history:", e);
    }
  };

  // Interactive State Restoration: Click on journal trade, snaps replay engine back in time!
  const handleJournalTradeReview = (trade) => {
    // Snap replay clock index to the trade entry time
    const entryTime = trade.entryTime || trade.entry_time || trade.timestamp || 0;
    if (entryTime > 0) {
      const matchIndex = allCandles.findIndex(c => c.time >= entryTime);
      if (matchIndex !== -1) {
        const nextIdx = matchIndex + 1;
        setCurrentIndex(nextIdx);
        saveSessionState(nextIdx);
        setReviewingTrade(trade);
        setCurrentTab('chart'); // Switch tab back to Chart workspace!
      }
    }
  };

  const initialChartData = useMemo(() => {
    if (!allCandles || allCandles.length === 0) return [];
    return allCandles.slice(0, currentIndex);
  }, [allCandles, currentIndex]);

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0e14', color: '#ffd700' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div className="spinner" style={{ width: '30px', height: '30px', border: '3px solid rgba(255, 215, 0, 0.2)', borderTopColor: '#ffd700', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          <div style={{ fontWeight: 500 }}>Initializing Market Replay...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#0b0e14', color: '#d1d4dc', overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}>
      {/* Header bar with Navigation Tabs */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#1c2030',
        padding: '8px 16px',
        borderBottom: '1px solid #2b3139',
        height: '48px',
        boxSizing: 'border-box',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 'bold', color: '#ffd700', fontSize: '15px', letterSpacing: '0.5px' }}>Market Replay Simulator</span>
          <span style={{ backgroundColor: 'rgba(255, 215, 0, 0.15)', color: '#ffd700', fontSize: '10px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '10px' }}>Institution-Grade</span>
        </div>
        <div style={headerStyles.actions}>
          <button 
            onClick={refreshCandlesAndState}
            className="header-sync-btn"
            style={headerStyles.syncButton}
          >
            <RefreshCw size={14} />
            Sync Data
          </button>
          <div style={headerStyles.tabGroup}>
            {[
              { id: 'chart', label: 'Replay Chart', icon: BarChart3 },
              { id: 'journal', label: 'Trade Journal', icon: BookOpen },
              { id: 'backtest', label: 'Strategy Tester', icon: FlaskConical }
            ].map(({ id, label, icon: Icon }) => {
              const isActive = currentTab === id;
              return (
                <button
                  key={id}
                  onClick={() => setCurrentTab(id)}
                  style={getHeaderTabStyle(isActive)}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.07)';
                      e.currentTarget.style.color = '#ffffff';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = '#aeb6c4';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }
                  }}
                >
                  <Icon size={15} strokeWidth={2.2} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

	        {currentTab === 'chart' ? (
	        <>
	          <ReplayControls 
            isPlaying={isPlaying}
            onTogglePlay={handleTogglePlay}
            speed={speed}
            onSpeedChange={(newSpeed) => {
              setSpeed(newSpeed);
              axios.post(`${API_BASE}/session`, { symbol: activeSymbol, timeframe, playback_speed: newSpeed });
            }}
            onNextCandle={handleNextCandle}
	            timeframe={timeframe}
	            isLoading={isLoading}
	            loadingTimeframe={loadingTimeframe}
	            onTimeframeChange={(newTf) => {
	              setLoadingTimeframe(newTf);
	              setTimeframe(newTf);
	              setSystematicTrades([]);
	              axios.post(`${API_BASE}/session`, { symbol: activeSymbol, timeframe: newTf });
            }}
            isSelectingStartBar={isSelectingStartBar}
            onToggleSelectStartBar={() => setIsSelectingStartBar(!isSelectingStartBar)}
            activeSymbol={activeSymbol}
	            onSymbolChange={(newSymbol) => {
	              setLoadingTimeframe(null);
	              setActiveSymbol(newSymbol);
	              setSystematicTrades([]);
	              axios.post(`${API_BASE}/session`, { symbol: newSymbol, timeframe });
            }}
          />
          
	          {isLoading && allCandles.length === 0 ? (
	            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d1d4dc' }}>
	              <h2>Loading {timeframe} historical data...</h2>
	            </div>
	          ) : (
	            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
	              {isLoading && allCandles.length > 0 && (
	                <div style={transitionStyles.overlay}>
	                  <div style={transitionStyles.loader}>Loading {timeframe}</div>
	                </div>
	              )}
	              <PanelGroup orientation="vertical" style={{ flex: 1 }}>
                  <Panel minSize={30}>
	                  <div style={{ display: 'flex', height: '100%', minHeight: 0, overflow: 'hidden' }}>
                      <DrawingToolbar 
                        activeTool={activeTool} 
                        onChangeTool={setActiveTool} 
                        onClearDrawings={handleClearDrawings} 
                        showSessions={showSessions}
                        onToggleSessions={() => setShowSessions(!showSessions)}
                        onOpenSettings={() => setIsChartSettingsOpen(true)}
                        onOpenIndicators={() => setIsIndicatorManagerOpen(true)}
                      />
                      
                      <PanelGroup orientation="horizontal" style={{ flex: 1 }}>
                        <Panel minSize={30}>
                          <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
                            {reviewingTrade && (
                              <div style={{ position: 'absolute', top: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: 50, backgroundColor: '#f59e0b', color: '#1e222d', padding: '6px 16px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
                                <span>Reviewing Trade #{String(reviewingTrade.id).slice(-4)}</span>
                                <button onClick={() => setReviewingTrade(null)} style={{ background: 'rgba(0,0,0,0.15)', border: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: '2px' }} title="Exit Review Mode">
                                  <X size={14} color="#1e222d" />
                                </button>
                              </div>
                            )}
                            <Chart 
                            ref={chartRef} 
                            data={initialChartData}
                            activeTool={activeTool}
                            drawings={drawings}
                            onAddDrawing={handleAddDrawing}
                            onUpdateDrawing={handleUpdateDrawing}
                            onDeleteDrawing={handleDeleteDrawing}
                            positions={positions}
                            pendingOrders={pendingOrders}
                            onDragUpdateLine={handleDragUpdateLine}
                            onDragEndLine={handleDragEndLine}
                            isSelectingStartBar={isSelectingStartBar}
                            onSelectStartBar={handleSelectStartBar}
                            onGoToLatest={handleGoToLatest}
                            timeframe={loadedTimeframe}
                            activeSymbol={loadedSymbol}
                            chartSettings={chartSettings}
                            showSessions={showSessions}
                            systematicTrades={systematicTrades}
                            reviewingTrade={reviewingTrade}
                            pythonIndicators={pythonIndicatorResults}
                            pythonIndicatorInstances={indicatorInstances}
                            plannedOrder={plannedDirection ? {
                              direction: plannedDirection,
                              orderType: orderType,
                              limitPrice: orderType === 'LIMIT' ? parseFloat(limitPrice) || currentPrice : currentPrice,
                              slPips: slPips,
                              tpPips: tpPips,
                              lots: isLotMode ? (parseFloat(customLots) || 0.01) : (() => {
                                const cfg = getSymbolConfig(activeSymbol);
                                const riskAmount = (derivedAccount.balance * (riskPercent / 100));
                                const calculatedLots = riskAmount / (slPips * cfg.pipSize * cfg.contractSize);
                                return Math.max(0.01, Math.round(calculatedLots * 100) / 100);
                              })()
                            } : null}
                            onUpdatePlannedOrder={(fields) => {
                              if (fields.slPips !== undefined) setSlPips(fields.slPips);
                              if (fields.tpPips !== undefined) setTpPips(fields.tpPips);
                              if (fields.limitPrice !== undefined) {
                                setLimitPrice(fields.limitPrice.toFixed(getSymbolConfig(activeSymbol).precision));
                                setOrderType('LIMIT');
                              }
                            }}
                            chartSettings={chartSettings}
                            showSessions={showSessions}
                          />
                          </div>
                        </Panel>

                        <PanelResizeHandle style={{ width: '4px', cursor: 'col-resize', backgroundColor: '#2b3139', flexShrink: 0, zIndex: 10, position: 'relative' }} />
                        
                        <Panel defaultSize={22} minSize={15}>
                          <div style={{ height: '100%', overflowY: 'auto' }}>
                            <TradePanel 
                              account={derivedAccount}
                              currentPrice={currentPrice}
                              activeSymbol={activeSymbol}
                              onPlaceOrder={handlePlaceOrder}
                              orderType={orderType}
                              setOrderType={setOrderType}
                              limitPrice={limitPrice}
                              setLimitPrice={setLimitPrice}
                              plannedDirection={plannedDirection}
                              setPlannedDirection={setPlannedDirection}
                              slPips={slPips}
                              setSlPips={setSlPips}
                              tpPips={tpPips}
                              setTpPips={setTpPips}
                              riskPercent={riskPercent}
                              setRiskPercent={setRiskPercent}
                              customLots={customLots}
                              setCustomLots={setCustomLots}
                              isLotMode={isLotMode}
                              setIsLotMode={setIsLotMode}
                            />
                          </div>
                        </Panel>
                      </PanelGroup>
                    </div>
                  </Panel>

                  <PanelResizeHandle style={{ height: '4px', cursor: 'row-resize', backgroundColor: '#2b3139', flexShrink: 0, zIndex: 10, position: 'relative' }} />

                  <Panel defaultSize={25} minSize={10} style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
                      <TerminalPanel 
                        account={derivedAccount}
                        positions={positions}
                        onClosePosition={handleClosePosition}
                        pendingOrders={pendingOrders}
                        onCancelPendingOrder={handleCancelPendingOrder}
                        history={tradeHistory}
                        currentPrice={currentPrice}
                        onReviewTrade={handleJournalTradeReview}
                        activeSymbol={activeSymbol}
                      />
                    </div>
                  </Panel>
                </PanelGroup>
            </div>
          )}
        </>
      ) : currentTab === 'journal' ? (
        <Suspense fallback={<div style={{ padding: '20px', color: '#ffd700' }}>Loading Journal...</div>}>
          <TradeJournal 
            history={tradeHistory}
            onReviewTrade={handleJournalTradeReview}
            onRefreshData={refreshTradeHistory}
            activeSymbol={activeSymbol}
          />
        </Suspense>
      ) : (
        <Suspense fallback={<div style={{ padding: '20px', color: '#ffd700' }}>Loading Strategy Tester...</div>}>
          <SystematicTester 
            key={activeSymbol}
            activeSymbol={activeSymbol}
            onReviewTrade={handleJournalTradeReview}
            onBacktestSuccess={(trades) => {
              setSystematicTrades(trades);
              if (trades && trades.length > 0) {
                const lastTrade = trades[trades.length - 1];
                const lastTime = lastTrade.exit_time || lastTrade.entry_time;
                if (lastTime) {
                  const matchIndex = allCandles.findIndex(c => c.time >= lastTime);
                  if (matchIndex !== -1) {
                    setCurrentIndex(matchIndex + 1);
                    saveSessionState(matchIndex + 1);
                  }
                }
              }
            }} 
          />
        </Suspense>
      )}
      {isChartSettingsOpen && (
        <ChartSettingsModal
          settings={chartSettings}
          onChange={setChartSettings}
          onClose={() => setIsChartSettingsOpen(false)}
        />
      )}
      {isIndicatorManagerOpen && (
        <IndicatorManager
          library={indicatorLibrary}
          instances={indicatorInstances}
          onChange={setIndicatorInstances}
          onClose={() => setIsIndicatorManagerOpen(false)}
        />
      )}
    </div>
  );
}

const settingsStyles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#d1d4dc'
  },
  modal: {
    width: 'min(1120px, calc(100vw - 72px))',
    height: 'min(820px, calc(100vh - 72px))',
    backgroundColor: '#1f1f1f',
    borderRadius: '8px',
    border: '1px solid #2c2c2c',
    boxShadow: '0 24px 80px rgba(0, 0, 0, 0.45)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden'
  },
  header: {
    height: '116px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 40px',
    boxSizing: 'border-box'
  },
  title: {
    margin: 0,
    fontSize: '34px',
    fontWeight: 700,
    color: '#e6e6e6'
  },
  closeBtn: {
    background: 'transparent',
    color: '#e6e6e6',
    border: 'none',
    fontSize: '52px',
    lineHeight: 1,
    cursor: 'pointer',
    fontWeight: 200
  },
  body: {
    display: 'grid',
    gridTemplateColumns: '360px 1fr',
    gap: '40px',
    flex: 1,
    padding: '0 40px 32px 40px',
    boxSizing: 'border-box',
    minHeight: 0
  },
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    paddingTop: '16px'
  },
  sideItem: {
    height: '64px',
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    padding: '0 28px',
    borderRadius: '12px',
    color: '#d7d7d7',
    fontSize: '25px'
  },
  sideItemActive: {
    backgroundColor: '#2d2d2d',
    color: '#ffffff',
    fontWeight: 700
  },
  sideIcon: {
    width: '36px',
    textAlign: 'center',
    color: '#f0f0f0'
  },
  panel: {
    paddingTop: '42px',
    display: 'flex',
    flexDirection: 'column',
    gap: '28px',
    minWidth: 0
  },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: '1px',
    color: '#8d8d8d',
    fontSize: '18px',
    marginTop: '4px'
  },
  checkRow: {
    display: 'grid',
    gridTemplateColumns: '44px 140px 72px 72px',
    alignItems: 'center',
    gap: '18px',
    fontSize: '26px',
    color: '#e0e0e0'
  },
  checkbox: {
    width: '32px',
    height: '32px',
    accentColor: '#eeeeee'
  },
  colorInput: {
    width: '56px',
    height: '56px',
    padding: '6px',
    backgroundColor: '#2a2a2a',
    border: '2px solid #555',
    borderRadius: '10px',
    cursor: 'pointer'
  },
  colorInputWide: {
    width: '96px',
    height: '44px',
    padding: '5px',
    backgroundColor: '#2a2a2a',
    border: '1px solid #555',
    borderRadius: '8px',
    cursor: 'pointer'
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '180px 300px',
    alignItems: 'center',
    gap: '14px',
    fontSize: '24px',
    color: '#e0e0e0'
  },
  select: {
    height: '54px',
    backgroundColor: '#202020',
    border: '1px solid #555',
    color: '#e0e0e0',
    borderRadius: '10px',
    padding: '0 16px',
    fontSize: '22px'
  },
  footer: {
    height: '108px',
    borderTop: '1px solid #444',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 40px',
    boxSizing: 'border-box'
  },
  templateBtn: {
    height: '56px',
    padding: '0 18px',
    borderRadius: '10px',
    border: '1px solid #555',
    backgroundColor: '#222',
    color: '#e0e0e0',
    fontSize: '24px',
    cursor: 'pointer'
  },
  footerActions: {
    display: 'flex',
    gap: '20px'
  },
  cancelBtn: {
    height: '56px',
    padding: '0 24px',
    borderRadius: '10px',
    border: '2px solid #f2f2f2',
    backgroundColor: 'transparent',
    color: '#ffffff',
    fontSize: '24px',
    cursor: 'pointer'
  },
  okBtn: {
    height: '56px',
    padding: '0 26px',
    borderRadius: '10px',
    border: 'none',
    backgroundColor: '#eeeeee',
    color: '#111111',
    fontSize: '24px',
    cursor: 'pointer'
  }
};

const headerStyles = {
  actions: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center'
  },
  syncButton: {
    height: '32px',
    padding: '0 12px',
    backgroundColor: 'rgba(255, 215, 0, 0.08)',
    color: '#ffd700',
    border: '1px solid rgba(255, 215, 0, 0.34)',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '700',
    fontSize: '12px',
    transition: 'background-color 0.18s ease, border-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.07)'
  },
  tabGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    padding: '3px',
    borderRadius: '8px',
    backgroundColor: 'rgba(8, 12, 20, 0.72)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 8px 20px rgba(0, 0, 0, 0.16)'
  },
  tabButton: {
    height: '30px',
    padding: '0 12px',
    backgroundColor: 'transparent',
    color: '#aeb6c4',
    border: '1px solid transparent',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '650',
    fontSize: '12px',
    transition: 'background-color 0.18s ease, color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '7px',
    whiteSpace: 'nowrap'
  },
  tabButtonActive: {
    backgroundColor: '#2962ff',
    color: '#ffffff',
    borderColor: 'rgba(255, 255, 255, 0.18)',
    boxShadow: '0 8px 18px rgba(41, 98, 255, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.22)'
  }
};

const transitionStyles = {
  overlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 30,
    pointerEvents: 'none',
    backgroundColor: 'rgba(8, 10, 14, 0.38)',
    backdropFilter: 'saturate(0.7)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: '18px',
    boxSizing: 'border-box'
  },
  loader: {
    backgroundColor: 'rgba(19, 23, 34, 0.86)',
    border: '1px solid rgba(67, 70, 81, 0.9)',
    borderRadius: '999px',
    color: '#d1d4dc',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.4px',
    padding: '8px 14px',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.28)'
  }
};

export default App;
