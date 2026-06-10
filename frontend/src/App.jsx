import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import Chart from './components/Chart';
import ReplayControls from './components/ReplayControls';
import DrawingToolbar from './components/DrawingToolbar';
import TradePanel from './components/TradePanel';
import TradeJournal from './components/TradeJournal';
import SystematicTester from './components/SystematicTester';
import './index.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000/api';

const getAggregatedData = (candles1m, tf, limitIndex) => {
  if (!candles1m || candles1m.length === 0) return [];
  
  const tfSecondsMap = {
    "1m": 60,
    "3m": 180,
    "5m": 300,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
    "4h": 14400,
    "1d": 86400,
    "1w": 604800
  };
  
  const bucketSize = tfSecondsMap[tf] || 60;
  const visible1m = candles1m.slice(0, limitIndex);
  if (visible1m.length === 0) return [];
  
  const aggregated = [];
  let currentBucket = null;
  
  for (let i = 0; i < visible1m.length; i++) {
    const candle = visible1m[i];
    const bucketTime = candle.time - (candle.time % bucketSize);
    
    if (!currentBucket || currentBucket.time !== bucketTime) {
      if (currentBucket) {
        aggregated.push(currentBucket);
      }
      currentBucket = {
        time: bucketTime,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close
      };
    } else {
      currentBucket.high = Math.max(currentBucket.high, candle.high);
      currentBucket.low = Math.min(currentBucket.low, candle.low);
      currentBucket.close = candle.close;
    }
  }
  
  if (currentBucket) {
    aggregated.push(currentBucket);
  }
  
  return aggregated;
};

const SPREAD = 0.20; // Constant spread of 20 cents
const LEVERAGE = 100;

const getSlippage = (timestamp) => {
  if (!timestamp) return 0.01;
  const date = new Date(timestamp * 1000);
  const hour = date.getUTCHours();
  const isOverlap = hour >= 12 && hour <= 16;
  const baseSlippage = isOverlap ? 0.02 : 0.01;
  const randomSlippage = Math.random() * (isOverlap ? 0.08 : 0.03);
  return baseSlippage + randomSlippage;
};

function App() {
  const [allCandles, setAllCandles] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  
  const [currentTab, setCurrentTab] = useState('chart');
  // Advanced Replay States
  const [timeframe, setTimeframe] = useState('1m');
  const [isSelectingStartBar, setIsSelectingStartBar] = useState(false);

  // Drawing states
  const [activeTool, setActiveTool] = useState('cursor');
  const [drawings, setDrawings] = useState([]);
  const [showSessions, setShowSessions] = useState(false);

  // Trade states
  const [account, setAccount] = useState({
    balance: 10000,
    equity: 10000
  });
  const [positions, setPositions] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [tradeHistory, setTradeHistory] = useState([]);
  
  const chartRef = useRef(null);
  const playInterval = useRef(null);
  const hasInitialized = useRef(false);

  // Constants
  const INITIAL_CANDLES_COUNT = 150;
  const BASE_INTERVAL_MS = 1000; // 1x speed = 1 update per second

  const refreshCandlesAndState = async () => {
    setIsLoading(true);
    try {
      const candlesRes = await axios.get(`${API_BASE}/candles?timeframe=1m`);
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

  // Fetch historical data and restore state from SQLite database on mount
  useEffect(() => {
    const fetchCandlesAndState = async () => {
      setIsLoading(true);
      try {
        // 1. Fetch candles (always 1m data for client aggregation & replay ticks)
        const candlesRes = await axios.get(`${API_BASE}/candles?timeframe=1m`);
        const data = candlesRes.data.candles;
        if (!data || data.length === 0) return;
        setAllCandles(data);

        // 2. Load SQLite session bookmark
        const sessionRes = await axios.get(`${API_BASE}/session`);
        const session = sessionRes.data;
        
        if (session) {
          if (session.playback_speed) setSpeed(session.playback_speed);
          if (session.current_time > 0) {
            // Find index matching saved current_time in 1m data
            const matchIndex = data.findIndex(c => c.time === session.current_time);
            if (matchIndex !== -1) {
              setCurrentIndex(matchIndex + 1);
            } else {
              setCurrentIndex(Math.min(INITIAL_CANDLES_COUNT, data.length));
            }
          } else {
            setCurrentIndex(Math.min(INITIAL_CANDLES_COUNT, data.length));
          }
        } else {
          setCurrentIndex(Math.min(INITIAL_CANDLES_COUNT, data.length));
        }

        // Only load drawings and trades once on initial mount to avoid state clashing
        if (!hasInitialized.current) {
          // 3. Load drawings from SQLite
          const drawingsRes = await axios.get(`${API_BASE}/drawings`);
          const dbDrawings = drawingsRes.data.map(d => {
            const parsedPoints = JSON.parse(d.points_json);
            return {
              id: d.id,
              type: d.type,
              timeframe: d.timeframe,
              p1: parsedPoints.p1,
              p2: parsedPoints.p2,
              points: parsedPoints.points,
              style: d.style_json ? JSON.parse(d.style_json) : {}
            };
          });
          setDrawings(dbDrawings);

          // 4. Load trades and journal history from SQLite
          const tradesRes = await axios.get(`${API_BASE}/trades`);
          const dbTrades = tradesRes.data;
          
          setPositions(dbTrades.filter(t => t.status === 'OPEN').map(t => ({
            id: Number(t.id),
            type: t.direction,
            lots: t.lots,
            entryPrice: t.entry_price,
            sl: t.sl,
            tp: t.tp,
            timestamp: t.entry_time
          })));

          setPendingOrders(dbTrades.filter(t => t.status === 'PENDING').map(t => ({
            id: Number(t.id),
            type: t.direction,
            lots: t.lots,
            entryPrice: t.entry_price,
            sl: t.sl,
            tp: t.tp,
            timestamp: t.entry_time
          })));

          setTradeHistory(dbTrades.filter(t => t.status === 'CLOSED').map(t => ({
            id: Number(t.id),
            type: t.direction,
            lots: t.lots,
            entryPrice: t.entry_price,
            sl: t.sl,
            tp: t.tp,
            closePrice: t.exit_price,
            closeTime: t.exit_time,
            pnl: t.pnl,
            notes: t.notes,
            journal_note: t.journal_note,
            tags: t.tags
          })));

          hasInitialized.current = true;
        }

      } catch (error) {
        console.error("Error loading workspace data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCandlesAndState();
  }, []);

  // Sync Replay Clock session bookmark to SQLite database
  const saveSessionState = useCallback(async (currentIndexVal) => {
    if (allCandles.length === 0 || currentIndexVal === 0) return;
    const currentCandleTime = allCandles[currentIndexVal - 1]?.time || 0;
    try {
      await axios.post(`${API_BASE}/session`, {
        symbol: 'XAUUSD',
        timeframe,
        current_time: currentCandleTime,
        playback_speed: speed
      });
    } catch (e) {
      console.error("Error saving session bookmark:", e);
    }
  }, [timeframe, speed, allCandles]);

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
    return positions.reduce((total, pos) => {
      const isBuy = pos.type === 'BUY';
      const priceDiff = isBuy ? (currentPrice - pos.entryPrice) : (pos.entryPrice - currentPrice);
      return total + (priceDiff * pos.lots * 100);
    }, 0);
  }, [positions, currentPrice]);

  const derivedAccount = useMemo(() => ({
    ...account,
    equity: account.balance + unrealizedPnl
  }), [account, unrealizedPnl]);

  // Order Placement (Persists directly to SQLite)
  const handlePlaceOrder = async (type, lots, entryPrice, sl, tp, isLimit) => {
    // 1. Leverage Margin Check
    const usedMargin = positions.reduce((total, pos) => total + (pos.entryPrice * pos.lots * 100) / LEVERAGE, 0);
    const freeMargin = derivedAccount.equity - usedMargin;
    const requiredMargin = (entryPrice * lots * 100) / LEVERAGE;

    if (requiredMargin > freeMargin) {
      alert(`Margin Call / Insufficient Margin! Required Margin: $${requiredMargin.toFixed(2)}, Available Free Margin: $${freeMargin.toFixed(2)}`);
      return;
    }

    const timestamp = allCandles[currentIndex - 1]?.time;
    let finalEntryPrice = entryPrice;

    // Apply spread & slippage for market orders
    if (!isLimit) {
      const slippage = getSlippage(timestamp);
      if (type === 'BUY') {
        finalEntryPrice = entryPrice + SPREAD + slippage;
      } else {
        finalEntryPrice = entryPrice - slippage;
      }
    }

    const id = Date.now();
    const newOrder = {
      id,
      type,
      lots,
      entryPrice: finalEntryPrice,
      sl: sl ? Math.round(sl * 100) / 100 : null,
      tp: tp ? Math.round(tp * 100) / 100 : null,
      timestamp
    };

    try {
      await axios.post(`${API_BASE}/trades`, {
        id: String(id),
        session_id: 'default_session',
        direction: type,
        lots,
        entry_price: finalEntryPrice,
        entry_time: timestamp,
        sl: newOrder.sl,
        tp: newOrder.tp,
        status: isLimit ? 'PENDING' : 'OPEN'
      });

      if (isLimit) {
        setPendingOrders(prev => [...prev, newOrder]);
      } else {
        setPositions(prev => [...prev, newOrder]);
      }
    } catch (e) {
      console.error("Error saving placed order to DB:", e);
    }
  };

  // Close Position Manually (Syncs to SQLite)
  const handleClosePosition = async (id, closePrice) => {
    const pos = positions.find(p => p.id === id);
    if (!pos) return;

    const timestamp = allCandles[currentIndex - 1]?.time;
    const slippage = getSlippage(timestamp);
    
    // Apply spread & slippage to exit
    const finalClosePrice = pos.type === 'BUY'
      ? closePrice - slippage // BUY exits at Bid (closePrice is Bid) - slippage
      : closePrice + SPREAD + slippage; // SELL exits at Ask (closePrice + SPREAD) + slippage

    const isBuy = pos.type === 'BUY';
    const priceDiff = isBuy ? (finalClosePrice - pos.entryPrice) : (pos.entryPrice - finalClosePrice);
    const pnl = priceDiff * pos.lots * 100;

    try {
      await axios.patch(`${API_BASE}/trades/${id}`, {
        status: 'CLOSED',
        exit_price: finalClosePrice,
        exit_time: timestamp,
        pnl
      });

      const closedTrade = {
        ...pos,
        closePrice: finalClosePrice,
        pnl,
        closeTime: timestamp
      };

      setTradeHistory(prev => [closedTrade, ...prev]);
      setPositions(prev => prev.filter(p => p.id !== id));
      setAccount(prev => ({
        ...prev,
        balance: prev.balance + pnl,
        equity: prev.balance + pnl
      }));
    } catch (e) {
      console.error("Error updating closed position in DB:", e);
    }
  };

  // Cancel Pending Limit Order (Syncs to SQLite)
  const handleCancelPendingOrder = async (id) => {
    try {
      await axios.delete(`${API_BASE}/trades/${id}`);
      setPendingOrders(prev => prev.filter(order => order.id !== id));
    } catch (e) {
      console.error("Error deleting pending order in DB:", e);
    }
  };

  // Replay tick execution check
  const checkPendingAndPositions = useCallback((candle) => {
    const timestamp = candle.time;
    const slippage = getSlippage(timestamp);

    // 1. Process Pending Limit Orders
    setPendingOrders(prevPending => {
      const triggered = [];
      const remaining = [];

      prevPending.forEach(order => {
        let isTriggered = false;
        let finalEntryPrice = order.entryPrice;

        if (order.type === 'BUY') {
          // BUY Limit triggers when Ask (Bid + SPREAD) <= limitPrice
          if (candle.low + SPREAD <= order.entryPrice) {
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
          const freshId = Date.now() + Math.random();
          // Persist trigger state change to DB
          axios.patch(`${API_BASE}/trades/${order.id}`, {
            status: 'OPEN',
            entry_price: finalEntryPrice,
            entry_time: candle.time
          }).catch(err => console.error("Error triggering limit order in DB:", err));

          triggered.push({
            ...order,
            id: freshId, // local fresh ID
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
          // SELL exits at Ask (Bid + SPREAD).
          if (pos.sl && candle.high + SPREAD >= pos.sl) hitSL = true;
          if (pos.tp && candle.low + SPREAD <= pos.tp) hitTP = true;
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
          const pnl = priceDiff * pos.lots * 100;

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
  }, []);

  // Handle Drag-to-Adjust line updates (updates local state instantly)
  const handleDragUpdateLine = (type, id, newPrice) => {
    const formattedPrice = Math.round(newPrice * 100) / 100;
    
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
    const formattedPrice = Math.round(finalPrice * 100) / 100;
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
      
      playInterval.current = setInterval(() => {
        setCurrentIndex(prev => {
          if (prev >= allCandles.length) {
            setIsPlaying(false);
            return prev;
          }
          const nextCandle = allCandles[prev];
          if (chartRef.current) {
            chartRef.current.updateCandle(nextCandle);
          }
          checkPendingAndPositions(nextCandle);
          return prev + 1;
        });
      }, intervalMs);
    } else {
      if (playInterval.current) {
        clearInterval(playInterval.current);
      }
    }

    return () => {
      if (playInterval.current) {
        clearInterval(playInterval.current);
      }
    };
  }, [isPlaying, speed, allCandles, checkPendingAndPositions]);

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
  };

  // Drawings callbacks (Syncs to SQLite)
  const handleAddDrawing = async (drawing) => {
    try {
      const pointsObj = drawing.points ? { points: drawing.points } : { p1: drawing.p1, p2: drawing.p2 };
      await axios.post(`${API_BASE}/drawings`, {
        id: drawing.id,
        session_id: 'default_session',
        type: drawing.type,
        points_json: JSON.stringify(pointsObj),
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
        const pointsObj = updatedDrawing.points ? { points: updatedDrawing.points } : { p1: updatedDrawing.p1, p2: updatedDrawing.p2 };
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
      const tradesRes = await axios.get(`${API_BASE}/trades`);
      const dbTrades = tradesRes.data;
      
      setPositions(dbTrades.filter(t => t.status === 'OPEN').map(t => ({
        id: Number(t.id),
        type: t.direction,
        lots: t.lots,
        entryPrice: t.entry_price,
        sl: t.sl,
        tp: t.tp,
        timestamp: t.entry_time
      })));

      setPendingOrders(dbTrades.filter(t => t.status === 'PENDING').map(t => ({
        id: Number(t.id),
        type: t.direction,
        lots: t.lots,
        entryPrice: t.entry_price,
        sl: t.sl,
        tp: t.tp,
        timestamp: t.entry_time
      })));

      setTradeHistory(dbTrades.filter(t => t.status === 'CLOSED').map(t => ({
        id: Number(t.id),
        type: t.direction,
        lots: t.lots,
        entryPrice: t.entry_price,
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
    const entryTime = trade.closeTime ? trade.timestamp : 0; // standard entry timestamp
    if (entryTime > 0) {
      const matchIndex = allCandles.findIndex(c => c.time === entryTime);
      if (matchIndex !== -1) {
        const nextIdx = matchIndex + 1;
        setCurrentIndex(nextIdx);
        saveSessionState(nextIdx);
        setCurrentTab('chart'); // Switch tab back to Chart workspace!
      }
    }
  };

  const initialChartData = getAggregatedData(allCandles, timeframe, currentIndex);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', backgroundColor: '#131722', overflow: 'hidden' }}>
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
          <span style={{ fontWeight: 'bold', color: '#ffd700', fontSize: '15px', letterSpacing: '0.5px' }}>XAUUSD Replay Engine</span>
          <span style={{ backgroundColor: 'rgba(255, 215, 0, 0.15)', color: '#ffd700', fontSize: '10px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '10px' }}>Institution-Grade</span>
        </div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button 
            onClick={refreshCandlesAndState}
            style={{
              padding: '6px 12px',
              backgroundColor: 'rgba(255, 215, 0, 0.1)',
              color: '#ffd700',
              border: '1px solid rgba(255, 215, 0, 0.4)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '12px',
              marginRight: '8px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 215, 0, 0.2)';
              e.currentTarget.style.borderColor = '#ffd700';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 215, 0, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(255, 215, 0, 0.4)';
            }}
          >
            Sync Data
          </button>
          <button 
            onClick={() => setCurrentTab('chart')}
            style={{
              padding: '6px 16px',
              backgroundColor: currentTab === 'chart' ? '#2962ff' : 'transparent',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '12px',
              transition: 'background-color 0.2s'
            }}
          >
            Replay Chart
          </button>
          <button 
            onClick={() => setCurrentTab('journal')}
            style={{
              padding: '6px 16px',
              backgroundColor: currentTab === 'journal' ? '#2962ff' : 'transparent',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '12px',
              transition: 'background-color 0.2s'
            }}
          >
            Trade Journal
          </button>
          <button 
            onClick={() => setCurrentTab('backtest')}
            style={{
              padding: '6px 16px',
              backgroundColor: currentTab === 'backtest' ? '#2962ff' : 'transparent',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '12px',
              transition: 'background-color 0.2s'
            }}
          >
            Strategy Tester
          </button>
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
              axios.post(`${API_BASE}/session`, { symbol: 'XAUUSD', timeframe, playback_speed: newSpeed });
            }}
            onNextCandle={handleNextCandle}
            timeframe={timeframe}
            onTimeframeChange={(newTf) => {
              setTimeframe(newTf);
              axios.post(`${API_BASE}/session`, { symbol: 'XAUUSD', timeframe: newTf });
            }}
            isSelectingStartBar={isSelectingStartBar}
            onToggleSelectStartBar={() => setIsSelectingStartBar(!isSelectingStartBar)}
          />
          
          {isLoading ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d1d4dc' }}>
              <h2>Loading {timeframe} historical data...</h2>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
              <DrawingToolbar 
                activeTool={activeTool} 
                onChangeTool={setActiveTool} 
                onClearDrawings={handleClearDrawings} 
                showSessions={showSessions}
                onToggleSessions={() => setShowSessions(!showSessions)}
              />
              
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
                timeframe={timeframe}
                showSessions={showSessions}
              />
              
              <TradePanel 
                account={derivedAccount}
                positions={positions}
                pendingOrders={pendingOrders}
                history={tradeHistory}
                currentPrice={currentPrice}
                onPlaceOrder={handlePlaceOrder}
                onClosePosition={handleClosePosition}
                onCancelPendingOrder={handleCancelPendingOrder}
                onReviewTrade={handleJournalTradeReview}
              />
            </div>
          )}
        </>
      ) : currentTab === 'journal' ? (
        <TradeJournal 
          history={tradeHistory}
          onReviewTrade={handleJournalTradeReview}
          onRefreshData={refreshTradeHistory}
        />
      ) : (
        <SystematicTester />
      )}
    </div>
  );
}

export default App;
