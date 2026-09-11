import { useEffect, useRef, useImperativeHandle, forwardRef, useState, useMemo } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import { ZoomIn, ZoomOut, ChevronLeft, ChevronRight, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { getSymbolConfig } from '../utils/symbolConfig';

const Chart = forwardRef(({ 
    data, 
    activeTool, 
    drawings, 
    onAddDrawing, 
    onUpdateDrawing, 
    onDeleteDrawing, 
    positions, 
    pendingOrders, 
    onDragUpdateLine, 
    onDragEndLine, 
    isSelectingStartBar, 
    onSelectStartBar,
    onGoToLatest,
    showSessions,
    timeframe,
    activeSymbol,
    chartSettings = {},
    systematicTrades = [],
    plannedOrder = null,
    reviewingTrade = null,
    smcData = null,
    showSMC = false,
    advancedSmcData = null,
    showAdvancedSMC = false,
    msbObMtfData = null,
    showMsbObMtf = false,
    pythonIndicators = [],
    pythonIndicatorInstances = [],
    onUpdatePlannedOrder = () => {}
}, ref) => {
    const chartContainerRef = useRef(null);
    const canvasRef = useRef(null);
    const chartInstance = useRef(null);
    const candlestickSeries = useRef(null);
    const pythonIndicatorSeries = useRef(new Map());
    
    const prevDataLengthRef = useRef(0);
    const cfg = getSymbolConfig(activeSymbol);
    const settings = {
        upColor: '#26a69a',
        downColor: '#ef5350',
        showBody: true,
        showBorders: false,
        showWicks: true,
        backgroundColor: '#131722',
        gridColor: '#1f2933',
        textColor: '#d1d4dc',
        precisionMode: 'default',
        ...chartSettings
    };
    const pricePrecision = settings.precisionMode === 'compact' ? Math.min(cfg.precision, 2) : cfg.precision;
    const minMove = 1 / Math.pow(10, pricePrecision);
    const candleSeriesOptions = {
        upColor: settings.showBody ? settings.upColor : 'rgba(0, 0, 0, 0)',
        downColor: settings.showBody ? settings.downColor : 'rgba(0, 0, 0, 0)',
        borderVisible: settings.showBorders,
        borderUpColor: settings.borderUpColor || settings.upColor,
        borderDownColor: settings.borderDownColor || settings.downColor,
        wickVisible: settings.showWicks,
        wickUpColor: settings.wickUpColor || settings.upColor,
        wickDownColor: settings.wickDownColor || settings.downColor,
        priceFormat: {
            type: 'price',
            precision: pricePrecision,
            minMove,
        },
    };

    const calculateEMA = (data, period) => {
        if (!data || data.length < period) return [];
        const emaData = [];
        const k = 2 / (period + 1);
        
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += data[i].close;
        }
        let ema = sum / period;
        
        emaData.push({ time: data[period - 1].time, value: ema });
        
        for (let i = period; i < data.length; i++) {
            ema = (data[i].close * k) + (ema * (1 - k));
            emaData.push({ time: data[i].time, value: ema });
        }
        return emaData;
    };

    const calculateVWAP = (data) => {
        if (!data || data.length === 0) return [];
        const vwapData = [];
        let cumVol = 0;
        let cumVolTyp = 0;
        let currentDay = null;

        for (let i = 0; i < data.length; i++) {
            const candle = data[i];
            const dateObj = new Date(candle.time * 1000);
            const dateStr = dateObj.getUTCDate();
            
            // Reset at new day
            if (currentDay !== dateStr) {
                currentDay = dateStr;
                cumVol = 0;
                cumVolTyp = 0;
            }
            const typPrice = (candle.high + candle.low + candle.close) / 3;
            // Handle missing volume by assuming volume = 1
            const vol = candle.volume !== undefined ? candle.volume : 1;

            cumVol += vol;
            cumVolTyp += (typPrice * vol);

            vwapData.push({ time: candle.time, value: cumVolTyp / cumVol });
        }
        return vwapData;
    };


    // Replay hover guides
    const [hoverBarX, setHoverBarX] = useState(null);

    // Indicator & Strategy legends overlay state
    const [hoveredValues, setHoveredValues] = useState(null);
    const [showStrategyTrades, setShowStrategyTrades] = useState(true);

    const activeValues = useMemo(() => {
        if (hoveredValues) return hoveredValues;
        if (!data || data.length === 0) return null;
        
        const lastCandle = data[data.length - 1];
        const ema9Data = calculateEMA(data, 9);
        const ema15Data = calculateEMA(data, 15);
        
        return {
            time: lastCandle.time,
            open: lastCandle.open,
            high: lastCandle.high,
            low: lastCandle.low,
            close: lastCandle.close,
            ema9: ema9Data.length > 0 ? ema9Data[ema9Data.length - 1]?.value : null,
            ema15: ema15Data.length > 0 ? ema15Data[ema15Data.length - 1]?.value : null
        };
    }, [hoveredValues, data]);

    // Drawing interaction states
    const [drawingState, setDrawingState] = useState({
        isDrawing: false,
        startPoint: null,
        currentPoint: null
    });

    const [selectedId, setSelectedId] = useState(null);
    const [hoverState, setHoverState] = useState(null); // { type: 'line'|'p1'|'p2'|'sl'|'tp'|'limit'|'pendingSl'|'pendingTp', drawingId|positionId|pendingOrderId }
    const [dragState, setDragState] = useState(null); 
    const [localDraggedDrawing, setLocalDraggedDrawing] = useState(null); 
    const [interactionCursor, setInteractionCursor] = useState('default');

    const sessionsCache = useMemo(() => {
        if (!data || data.length === 0) return [];
        const list = [];
        let currentSession = null;
        let startCandle = null;

        data.forEach((candle, idx) => {
            const date = new Date(candle.time * 1000);
            const hour = date.getUTCHours();
            let sessionType = null;
            if (hour >= 0 && hour < 4) {
                sessionType = 'asian';
            } else if (hour >= 7 && hour < 10) {
                sessionType = 'london';
            } else if (hour >= 12 && hour < 15) {
                sessionType = 'ny';
            }

            if (currentSession !== sessionType) {
                if (currentSession && startCandle) {
                    list.push({
                        type: currentSession,
                        startTime: startCandle.time,
                        endTime: data[idx - 1].time
                    });
                }
                currentSession = sessionType;
                startCandle = sessionType ? candle : null;
            }
        });

        if (currentSession && startCandle) {
            list.push({
                type: currentSession,
                startTime: startCandle.time,
                endTime: data[data.length - 1].time
            });
        }
        return list;
    }, [data]); 

    // Helper: Convert client coordinates to canvas-relative coordinates
    const getCanvasCoords = (clientX, clientY) => {
        if (!canvasRef.current) return null;
        const rect = canvasRef.current.getBoundingClientRect();
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    // Helper: Calculate spacing metrics to project coordinates/times in the future
    const getSpacingAndLastBar = () => {
        if (!chartInstance.current || !data || data.length < 2) return null;
        const timeScale = chartInstance.current.timeScale();
        const lastCandle = data[data.length - 1];
        const prevCandle = data[data.length - 2];
        const lastX = timeScale.timeToCoordinate(lastCandle.time);
        const prevX = timeScale.timeToCoordinate(prevCandle.time);
        if (lastX === null || prevX === null) return null;
        return {
            lastTime: lastCandle.time,
            lastX,
            spacing: Math.abs(lastX - prevX),
            timeframeSeconds: Math.abs(lastCandle.time - prevCandle.time)
        };
    };

    // Helper: Convert pixel coordinates to chart data values
    const getChartCoords = (x, y) => {
        if (!chartInstance.current || !candlestickSeries.current) return null;
        const price = candlestickSeries.current.coordinateToPrice(y);
        let time = chartInstance.current.timeScale().coordinateToTime(x);
        
        if (time === null && x !== null) {
            const metrics = getSpacingAndLastBar();
            if (metrics && x > metrics.lastX) {
                const futureBars = (x - metrics.lastX) / metrics.spacing;
                time = Math.round(metrics.lastTime + futureBars * metrics.timeframeSeconds);
            }
        }
        return { time, price };
    };
    // Helper: Convert chart data values to pixel coordinates
    const getPixelCoords = (time, price) => {
        if (!chartInstance.current || !candlestickSeries.current) return null;
        return getPointCoords({ time, price });
    };

    // Helper: Safely resolve time to X coordinate (handles missing times from setData rebuilds)
    const getPointCoords = (pt) => {
        if (!pt) return null;
        let { time, price } = pt;
        if (time === undefined || time === null || price === undefined || price === null || isNaN(price)) return null;
        const y = candlestickSeries.current.priceToCoordinate(price);
        let x = chartInstance.current.timeScale().timeToCoordinate(time);
        
        if (x === null && time !== null) {
            const metrics = getSpacingAndLastBar();
            if (metrics && data && data.length > 0) {
                if (time > metrics.lastTime) {
                    // Future bars
                    const futureBars = (time - metrics.lastTime) / metrics.timeframeSeconds;
                    x = metrics.lastX + futureBars * metrics.spacing;
                } else {
                    // Past/Interpolated bars: find closest candle
                    const closestCandle = data.reduce((prev, curr) => Math.abs(curr.time - time) < Math.abs(prev.time - time) ? curr : prev);
                    const closestX = chartInstance.current.timeScale().timeToCoordinate(closestCandle.time);
                    if (closestX !== null) {
                        const offsetBars = (time - closestCandle.time) / metrics.timeframeSeconds;
                        x = closestX + offsetBars * metrics.spacing;
                    }
                }
            }
        }
        if (x === null || y === null) return null;
        return { x, y };
    };

    // Distance formulas for selection
    const getDist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
    
    const getDistToSegment = (px, py, x1, y1, x2, y2) => {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const l2 = dx * dx + dy * dy;
        if (l2 === 0) return getDist(px, py, x1, y1);
        let t = ((px - x1) * dx + (py - y1) * dy) / l2;
        t = Math.max(0, Math.min(1, t));
        return getDist(px, py, x1 + t * dx, y1 + t * dy);
    };

    // Detect hover over drawings or trade levels
    const detectHover = (x, y) => {
        if (!candlestickSeries.current) return null;

        // 1. Check active positions' SL & TP lines
        if (positions && positions.length > 0) {
            for (let pos of positions) {
                if (pos.sl) {
                    const slY = candlestickSeries.current.priceToCoordinate(pos.sl);
                    if (slY !== null && Math.abs(y - slY) < 6) {
                        return { type: 'sl', positionId: pos.id };
                    }
                }
                if (pos.tp) {
                    const tpY = candlestickSeries.current.priceToCoordinate(pos.tp);
                    if (tpY !== null && Math.abs(y - tpY) < 6) {
                        return { type: 'tp', positionId: pos.id };
                    }
                }
            }
        }

        // 2. Check pending limit orders' Entry, SL, and TP lines
        if (pendingOrders && pendingOrders.length > 0) {
            for (let order of pendingOrders) {
                const entryY = candlestickSeries.current.priceToCoordinate(order.entryPrice);
                if (entryY !== null && Math.abs(y - entryY) < 6) {
                    return { type: 'limit', pendingOrderId: order.id };
                }
                if (order.sl) {
                    const slY = candlestickSeries.current.priceToCoordinate(order.sl);
                    if (slY !== null && Math.abs(y - slY) < 6) {
                        return { type: 'pendingSl', pendingOrderId: order.id };
                    }
                }
                if (order.tp) {
                    const tpY = candlestickSeries.current.priceToCoordinate(order.tp);
                    if (tpY !== null && Math.abs(y - tpY) < 6) {
                        return { type: 'pendingTp', pendingOrderId: order.id };
                    }
                }
            }
        }

        // 2b. Check Planned Order Preview levels
        if (plannedOrder && data && data.length > 0) {
            const cfg = getSymbolConfig(activeSymbol);
            const currentPrice = data[data.length - 1].close;
            const entryPrice = plannedOrder.limitPrice || currentPrice;
            const isBuy = plannedOrder.direction === 'BUY';
            const slPrice = isBuy ? (entryPrice - plannedOrder.slPips * cfg.pipSize) : (entryPrice + plannedOrder.slPips * cfg.pipSize);
            const tpPrice = isBuy ? (entryPrice + plannedOrder.tpPips * cfg.pipSize) : (entryPrice - plannedOrder.tpPips * cfg.pipSize);

            const entryY = candlestickSeries.current.priceToCoordinate(entryPrice);
            if (entryY !== null && Math.abs(y - entryY) < 6) {
                return { type: 'plannedEntry', price: entryPrice };
            }

            const slY = candlestickSeries.current.priceToCoordinate(slPrice);
            if (slY !== null && Math.abs(y - slY) < 6) {
                return { type: 'plannedSl', price: slPrice };
            }

            const tpY = candlestickSeries.current.priceToCoordinate(tpPrice);
            if (tpY !== null && Math.abs(y - tpY) < 6) {
                return { type: 'plannedTp', price: tpPrice };
            }
        }

        // 3. Check drawings
        if (drawings && drawings.length > 0) {
            for (let i = drawings.length - 1; i >= 0; i--) {
                const d = drawings[i];
                
                // Path tool detection
                if (d.type === 'path') {
                    if (d.points && d.points.length > 0) {
                        for (let j = 0; j < d.points.length; j++) {
                            const vPt = getPixelCoords(d.points[j].time, d.points[j].price);
                            if (vPt && getDist(x, y, vPt.x, vPt.y) < 8) {
                                return { drawingId: d.id, type: `path_point_${j}` };
                            }
                        }
                        for (let j = 0; j < d.points.length - 1; j++) {
                            const ptA = getPixelCoords(d.points[j].time, d.points[j].price);
                            const ptB = getPixelCoords(d.points[j + 1].time, d.points[j + 1].price);
                            if (ptA && ptB && getDistToSegment(x, y, ptA.x, ptA.y, ptB.x, ptB.y) < 6) {
                                return { drawingId: d.id, type: 'line' };
                            }
                        }
                    }
                    continue;
                }

                const pt1 = getPixelCoords(d.p1.time, d.p1.price);
                const pt2 = d.p2 ? getPixelCoords(d.p2.time, d.p2.price) : null;

                if (!pt1) continue;

                if (d.type === 'risk_reward') {
                    if (!pt1 || !pt2 || !d.p1 || !d.p2) continue;
                    const slPrice = d.p2.price;
                    const isLong = (d.style && d.style.isLong !== undefined) ? d.style.isLong : (d.p2.price < d.p1.price);
                    const tpPrice = d.p3 && d.p3.price !== undefined ? d.p3.price : (isLong ? d.p1.price + Math.abs(d.p1.price - slPrice) * 2 : d.p1.price - Math.abs(d.p1.price - slPrice) * 2);
                    const tpPt = getPixelCoords(d.p3 && d.p3.time !== undefined ? d.p3.time : d.p1.time, tpPrice);

                    if (getDist(x, y, pt1.x, pt1.y) < 8) {
                        return { drawingId: d.id, type: 'p1' };
                    }
                    if (getDist(x, y, pt1.x, pt2.y) < 8) {
                        return { drawingId: d.id, type: 'p2' };
                    }
                    if (tpPt && getDist(x, y, pt1.x, tpPt.y) < 8) {
                        return { drawingId: d.id, type: 'p3' };
                    }
                    if (getDist(x, y, pt2.x, pt1.y) < 8) {
                        return { drawingId: d.id, type: 'p2_width' };
                    }
                } else {
                    // Anchor 1
                    if (getDist(x, y, pt1.x, pt1.y) < 8) {
                        return { drawingId: d.id, type: 'p1' };
                    }

                    // Anchor 2
                    if (pt2 && getDist(x, y, pt2.x, pt2.y) < 8) {
                        return { drawingId: d.id, type: 'p2' };
                    }
                }

                // Line or boundary hover
                if (d.type === 'horizontal') {
                    if (Math.abs(y - pt1.y) < 6) {
                        return { drawingId: d.id, type: 'line' };
                    }
                } else if (d.type === 'horizontal_ray') {
                    if (x >= pt1.x && Math.abs(y - pt1.y) < 6) {
                        return { drawingId: d.id, type: 'line' };
                    }
                } else if (d.type === 'vertical_ray') {
                    if (y >= pt1.y && Math.abs(x - pt1.x) < 6) {
                        return { drawingId: d.id, type: 'line' };
                    }
                } else if (pt2) {
                    if (d.type === 'trendline' || d.type === 'fib' || d.type === 'scale') {
                        if (getDistToSegment(x, y, pt1.x, pt1.y, pt2.x, pt2.y) < 6) {
                            return { drawingId: d.id, type: 'line' };
                        }
                    } else if (d.type === 'rectangle' || d.type === 'risk_reward' || d.type === 'volume_profile') {
                        let minX = Math.min(pt1.x, pt2.x);
                        let maxX = Math.max(pt1.x, pt2.x);
                        let minY = Math.min(pt1.y, pt2.y);
                        let maxY = Math.max(pt1.y, pt2.y);
                        
                        if (d.type === 'risk_reward') {
                            const slPrice = d.p2.price;
                            const isLong = (d.style && d.style.isLong !== undefined) ? d.style.isLong : (d.p2.price < d.p1.price);
                            const tpPrice = d.p3 && d.p3.price !== undefined ? d.p3.price : (isLong ? d.p1.price + Math.abs(d.p1.price - slPrice) * 2 : d.p1.price - Math.abs(d.p1.price - slPrice) * 2);
                            const tpPt = getPixelCoords(d.p3 && d.p3.time !== undefined ? d.p3.time : d.p1.time, tpPrice);
                            if (tpPt) {
                                minY = Math.min(minY, tpPt.y);
                                maxY = Math.max(maxY, tpPt.y);
                            }
                        }

                        const nearLeft = Math.abs(x - minX) < 6 && y >= minY && y <= maxY;
                        const nearRight = Math.abs(x - maxX) < 6 && y >= minY && y <= maxY;
                        const nearTop = Math.abs(y - minY) < 6 && x >= minX && x <= maxX;
                        const nearBottom = Math.abs(y - maxY) < 6 && x >= minX && x <= maxX;
                        
                        if (nearLeft || nearRight || nearTop || nearBottom) {
                            return { drawingId: d.id, type: 'line' };
                        }
                        
                        if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
                            return { drawingId: d.id, type: 'area' };
                        }
                    }
                }
            }
        }
        return null;
    };

    // Draw canvas drawings & trade levels
    const drawAll = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw ICT Session Background Shading (Asian: Purple, London: Blue, NY: Red/Orange)
        if (showSessions && sessionsCache.length > 0 && chartInstance.current) {
            const timeScale = chartInstance.current.timeScale();
            let barWidth = 6;
            if (data && data.length > 1) {
                const x0 = timeScale.timeToCoordinate(data[0].time);
                const x1 = timeScale.timeToCoordinate(data[1].time);
                if (x0 !== null && x1 !== null) {
                    barWidth = Math.abs(x1 - x0);
                }
            }

            sessionsCache.forEach(session => {
                const xStart = timeScale.timeToCoordinate(session.startTime);
                const xEnd = timeScale.timeToCoordinate(session.endTime);
                if (xStart === null && xEnd === null) return;

                const x0 = xStart !== null ? xStart : 0;
                const x1 = xEnd !== null ? xEnd : canvas.width;

                let sessionColor = null;
                if (session.type === 'asian') {
                    sessionColor = 'rgba(147, 51, 234, 0.06)';
                } else if (session.type === 'london') {
                    sessionColor = 'rgba(59, 130, 246, 0.06)';
                } else if (session.type === 'ny') {
                    sessionColor = 'rgba(239, 68, 68, 0.06)';
                }

                if (sessionColor) {
                    ctx.fillStyle = sessionColor;
                    const drawX = Math.min(x0, x1) - barWidth / 2;
                    const drawWidth = Math.abs(x1 - x0) + barWidth;
                    ctx.fillRect(drawX, 0, drawWidth, canvas.height);
                }
            });
        }

        // Draw MTF SMC Zones (Order Blocks and FVGs)
        if (showSMC && smcData && chartInstance.current) {
            const timeScale = chartInstance.current.timeScale();
            const priceScale = candlestickSeries.current;

            const drawSMCZone = (zone, zoneType, tfLabel) => {
                if (!zone || !zone.is_active) return; // Only draw active (unmitigated) zones
                
                // We draw the zone starting from its creation time, extending off to the right edge of the chart (since it's unmitigated)
                const xStart = timeScale.timeToCoordinate(zone.time);
                if (xStart === null) return;
                
                const yTop = priceScale.priceToCoordinate(zone.top);
                const yBottom = priceScale.priceToCoordinate(zone.bottom);
                const yCE = priceScale.priceToCoordinate(zone.ce);
                
                if (yTop === null || yBottom === null) return;
                
                const height = Math.abs(yBottom - yTop);
                const startY = Math.min(yTop, yBottom);
                
                // Determine colors based on zoneType (bullish = green tint, bearish = red tint)
                let bgColor = zone.type === 'bullish' ? 'rgba(38, 166, 154, 0.15)' : 'rgba(239, 83, 80, 0.15)';
                let borderColor = zone.type === 'bullish' ? 'rgba(38, 166, 154, 0.8)' : 'rgba(239, 83, 80, 0.8)';
                
                // Differentiate FVG vs OB visually (OB can be slightly more opaque or have dashed borders)
                if (zoneType === 'OB') {
                    bgColor = zone.type === 'bullish' ? 'rgba(38, 166, 154, 0.25)' : 'rgba(239, 83, 80, 0.25)';
                }
                
                // Draw shaded box to the right edge
                ctx.fillStyle = bgColor;
                ctx.fillRect(xStart, startY, canvas.width - xStart, height);
                
                // Draw top/bottom borders
                ctx.beginPath();
                ctx.moveTo(xStart, yTop);
                ctx.lineTo(canvas.width, yTop);
                ctx.moveTo(xStart, yBottom);
                ctx.lineTo(canvas.width, yBottom);
                ctx.strokeStyle = borderColor;
                if (zoneType === 'OB') {
                    ctx.setLineDash([4, 4]); // Dashed for OB
                } else {
                    ctx.setLineDash([]); // Solid for FVG
                }
                ctx.lineWidth = 1;
                ctx.stroke();
                
                // Draw CE (50% midpoint) line lightly
                if (yCE !== null) {
                    ctx.beginPath();
                    ctx.moveTo(xStart, yCE);
                    ctx.lineTo(canvas.width, yCE);
                    ctx.strokeStyle = zone.type === 'bullish' ? 'rgba(38, 166, 154, 0.4)' : 'rgba(239, 83, 80, 0.4)';
                    ctx.setLineDash([2, 4]);
                    ctx.stroke();
                }
                ctx.setLineDash([]); // Reset dash
                
                // Draw Label
                ctx.fillStyle = borderColor;
                ctx.font = '10px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'bottom';
                ctx.fillText(`${tfLabel} ${zone.type === 'bullish' ? '+B' : '-B'} ${zoneType}`, xStart + 4, startY - 2);
            };

            // Iterate through the MTF hierarchies (HTF first so LTF draws over top)
            if (smcData.htf_4h) {
                if (smcData.htf_4h.obs) smcData.htf_4h.obs.forEach(ob => drawSMCZone(ob, 'OB', '4H'));
                if (smcData.htf_4h.fvgs) smcData.htf_4h.fvgs.forEach(fvg => drawSMCZone(fvg, 'FVG', '4H'));
            }
            if (smcData.htf_1h) {
                if (smcData.htf_1h.obs) smcData.htf_1h.obs.forEach(ob => drawSMCZone(ob, 'OB', '1H'));
                if (smcData.htf_1h.fvgs) smcData.htf_1h.fvgs.forEach(fvg => drawSMCZone(fvg, 'FVG', '1H'));
            }
            if (smcData.base) {
                if (smcData.base.obs) smcData.base.obs.forEach(ob => drawSMCZone(ob, 'OB', timeframe));
                if (smcData.base.fvgs) smcData.base.fvgs.forEach(fvg => drawSMCZone(fvg, 'FVG', timeframe));
            }
        }

        // Draw MSB-OB structure, zigzag, and active order blocks.
        if (showMsbObMtf && msbObMtfData && chartInstance.current) {
            const timeScale = chartInstance.current.timeScale();
            const priceScale = candlestickSeries.current;
            const visibleUntil = data?.[data.length - 1]?.time ?? Infinity;
            const swings = [...(msbObMtfData.swings || [])].filter(item => item.time <= visibleUntil).sort((a, b) => a.time - b.time);

            ctx.beginPath();
            let started = false;
            swings.forEach(swing => {
                const x = timeScale.timeToCoordinate(swing.time);
                const y = priceScale.priceToCoordinate(swing.price);
                if (x === null || y === null) return;
                if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
            });
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            ctx.stroke();

            (msbObMtfData.zones || []).filter(zone => zone.active && zone.created_at <= visibleUntil).forEach(zone => {
                const x = timeScale.timeToCoordinate(zone.time);
                const yTop = priceScale.priceToCoordinate(zone.top);
                const yBottom = priceScale.priceToCoordinate(zone.bottom);
                if (x === null || yTop === null || yBottom === null) return;
                const bullish = zone.direction === 'bullish';
                const top = Math.min(yTop, yBottom);
                const height = Math.abs(yBottom - yTop);
                ctx.fillStyle = bullish ? 'rgba(34, 197, 94, 0.20)' : 'rgba(239, 68, 68, 0.20)';
                ctx.strokeStyle = bullish ? '#22c55e' : '#ef4444';
                ctx.fillRect(x, top, canvas.width - x, height);
                ctx.strokeRect(x, top, canvas.width - x, height);
                ctx.fillStyle = bullish ? '#4ade80' : '#f87171';
                ctx.font = 'bold 10px sans-serif';
                ctx.fillText(`${bullish ? 'Bu' : 'Be'}-${zone.type}`, x + 4, top + 12);
            });

            (msbObMtfData.events || []).filter(event => event.time <= visibleUntil).forEach(event => {
                const x = timeScale.timeToCoordinate(event.time);
                const y = priceScale.priceToCoordinate(event.price);
                if (x === null || y === null) return;
                const bullish = event.direction === 'bullish';
                ctx.beginPath();
                ctx.moveTo(Math.max(0, x - 45), y);
                ctx.lineTo(x, y);
                ctx.strokeStyle = bullish ? '#22c55e' : '#ef4444';
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.fillStyle = bullish ? '#4ade80' : '#f87171';
                ctx.font = 'bold 10px sans-serif';
                ctx.fillText('MSB', Math.max(2, x - 42), y - 4);
            });
        }

        // Generic overlays emitted by registered Python indicators.
        if (chartInstance.current && pythonIndicators.length) {
            const timeScale = chartInstance.current.timeScale();
            const priceScale = candlestickSeries.current;
            pythonIndicators.forEach(instanceResult => {
                const instance = pythonIndicatorInstances.find(item => item.instance_id === instanceResult.instance_id);
                if (instance?.visible === false) return;
                const result = instanceResult.result || {};
                (result.zones || []).filter(zone => zone.active !== false).forEach(zone => {
                    const x = timeScale.timeToCoordinate(zone.time ?? zone.created_at);
                    const yTop = priceScale.priceToCoordinate(zone.top);
                    const yBottom = priceScale.priceToCoordinate(zone.bottom);
                    if (x === null || yTop === null || yBottom === null) return;
                    const bullish = ['bullish', 'buy'].includes(String(zone.direction).toLowerCase());
                    const color = bullish ? '#22c55e' : '#ef4444';
                    const top = Math.min(yTop, yBottom);
                    ctx.fillStyle = bullish ? 'rgba(34,197,94,.16)' : 'rgba(239,68,68,.16)';
                    ctx.strokeStyle = color;
                    ctx.fillRect(x, top, canvas.width - x, Math.abs(yBottom - yTop));
                    ctx.strokeRect(x, top, canvas.width - x, Math.abs(yBottom - yTop));
                    ctx.fillStyle = color;
                    ctx.font = 'bold 10px sans-serif';
                    ctx.fillText(`${zone.timeframe ? `${zone.timeframe} ` : ''}${zone.type || 'Zone'}`, x + 4, top + 12);
                });
                (result.lines || []).forEach(line => {
                    if (line.type === 'zigzag') {
                        ctx.beginPath();
                        let started = false;
                        (line.points || []).forEach(point => {
                            const x = timeScale.timeToCoordinate(point.time);
                            const y = priceScale.priceToCoordinate(point.price);
                            if (x === null || y === null) return;
                            if (started) ctx.lineTo(x, y); else { ctx.moveTo(x, y); started = true; }
                        });
                        ctx.strokeStyle = 'rgba(148,163,184,.65)'; ctx.lineWidth = 1; ctx.stroke();
                    } else if (line.type === 'horizontal_ray') {
                        const x = timeScale.timeToCoordinate(line.time);
                        const y = priceScale.priceToCoordinate(line.price);
                        if (x === null || y === null) return;
                        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(canvas.width, y);
                        ctx.strokeStyle = '#9c27b0'; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
                        ctx.fillStyle = '#ce93d8'; ctx.font = '10px sans-serif'; ctx.fillText(line.label || '', x + 4, y - 3);
                    }
                });
                (result.markers || []).forEach(marker => {
                    const x = timeScale.timeToCoordinate(marker.time);
                    const y = priceScale.priceToCoordinate(marker.price);
                    if (x === null || y === null) return;
                    ctx.fillStyle = marker.direction === 'bullish' ? '#4ade80' : '#f87171';
                    ctx.font = 'bold 10px sans-serif'; ctx.fillText(marker.label || 'Signal', x + 3, y - 5);
                });
            });
        }

        // Draw Advanced SMC Zones (QML, RBS, SBS, TJL)
        if (showAdvancedSMC && Array.isArray(advancedSmcData) && chartInstance.current) {
            const timeScale = chartInstance.current.timeScale();
            const priceScale = candlestickSeries.current;

            advancedSmcData.forEach(zone => {
                if (!zone || !zone.active) return; // Only draw active, untouched zones
                
                const xStart = timeScale.timeToCoordinate(zone.created_at);
                if (xStart === null) return;
                
                const yTop = priceScale.priceToCoordinate(zone.top);
                const yBottom = priceScale.priceToCoordinate(zone.bottom);
                
                if (yTop === null || yBottom === null) return;
                
                const height = Math.abs(yBottom - yTop);
                const startY = Math.min(yTop, yBottom);
                
                // Color palette for Advanced Zones
                let bgColor = zone.direction === 'BUY' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)';
                let borderColor = zone.direction === 'BUY' ? 'rgba(76, 175, 80, 0.9)' : 'rgba(244, 67, 54, 0.9)';
                
                // Special styling for QML zones (gold tint)
                if (zone.type === 'QML') {
                    bgColor = zone.direction === 'BUY' ? 'rgba(255, 193, 7, 0.2)' : 'rgba(255, 152, 0, 0.2)';
                    borderColor = zone.direction === 'BUY' ? 'rgba(255, 193, 7, 0.9)' : 'rgba(255, 152, 0, 0.9)';
                } else if (zone.type && zone.type.startsWith('TJL2')) {
                    // TJL2 A+ Zones (blue tint)
                    bgColor = zone.direction === 'BUY' ? 'rgba(33, 150, 243, 0.2)' : 'rgba(156, 39, 176, 0.2)';
                    borderColor = zone.direction === 'BUY' ? 'rgba(33, 150, 243, 0.9)' : 'rgba(156, 39, 176, 0.9)';
                } else if (zone.type && zone.type.startsWith('TJL1')) {
                    // TJL1 Lower probability (grey/transparent)
                    bgColor = 'rgba(158, 158, 158, 0.1)';
                    borderColor = 'rgba(158, 158, 158, 0.6)';
                }

                // Draw shaded box to the right edge
                ctx.fillStyle = bgColor;
                ctx.fillRect(xStart, startY, canvas.width - xStart, height);
                
                // Draw top/bottom borders
                ctx.beginPath();
                ctx.moveTo(xStart, yTop);
                ctx.lineTo(canvas.width, yTop);
                ctx.moveTo(xStart, yBottom);
                ctx.lineTo(canvas.width, yBottom);
                ctx.strokeStyle = borderColor;
                ctx.setLineDash([2, 2]); // Dotted to distinguish from classic SMC
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.setLineDash([]);
                
                // Draw Label
                ctx.fillStyle = borderColor;
                ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'bottom';
                ctx.fillText(`[${zone.type}] ${zone.direction}`, xStart + 4, startY - 2);
            });
        }

        // Draw pending limit orders
        if (pendingOrders && pendingOrders.length > 0 && candlestickSeries.current) {
            pendingOrders.forEach(order => {
                const entryY = candlestickSeries.current.priceToCoordinate(order.entryPrice);
                if (entryY !== null) {
                    ctx.beginPath();
                    ctx.setLineDash([6, 3]);
                    ctx.moveTo(0, entryY);
                    ctx.lineTo(canvas.width, entryY);
                    ctx.strokeStyle = '#f59e0b';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.fillStyle = '#f59e0b';
                    ctx.font = '10px sans-serif';
                    ctx.fillText(`Limit Order (Drag): ${order.entryPrice.toFixed(cfg.precision)}`, 10, entryY - 4);
                }

                if (order.sl) {
                    const slY = candlestickSeries.current.priceToCoordinate(order.sl);
                    if (slY !== null) {
                        ctx.beginPath();
                        ctx.setLineDash([2, 2]);
                        ctx.moveTo(0, slY);
                        ctx.lineTo(canvas.width, slY);
                        ctx.strokeStyle = 'rgba(239, 83, 80, 0.6)';
                        ctx.lineWidth = 1.5;
                        ctx.stroke();
                        ctx.setLineDash([]);
                        ctx.fillStyle = 'rgba(239, 83, 80, 0.8)';
                        ctx.fillText(`Limit SL (Drag): ${order.sl.toFixed(cfg.precision)}`, 10, slY - 4);
                    }
                }

                if (order.tp) {
                    const tpY = candlestickSeries.current.priceToCoordinate(order.tp);
                    if (tpY !== null) {
                        ctx.beginPath();
                        ctx.setLineDash([2, 2]);
                        ctx.moveTo(0, tpY);
                        ctx.lineTo(canvas.width, tpY);
                        ctx.strokeStyle = 'rgba(38, 166, 154, 0.6)';
                        ctx.lineWidth = 1.5;
                        ctx.stroke();
                        ctx.setLineDash([]);
                        ctx.fillStyle = 'rgba(38, 166, 154, 0.8)';
                        ctx.fillText(`Limit TP (Drag): ${order.tp.toFixed(cfg.precision)}`, 10, tpY - 4);
                    }
                }
            });
        }

        const drawBadge = (text, y, bgColor, textColor) => {
            ctx.font = 'bold 10px sans-serif';
            const textWidth = ctx.measureText(text).width;
            const paddingX = 8;
            const paddingY = 4;
            const badgeWidth = textWidth + paddingX * 2;
            const badgeHeight = 14 + paddingY * 2;
            const badgeX = canvas.width / 2 - badgeWidth / 2;
            const badgeY = y - badgeHeight / 2;

            ctx.fillStyle = bgColor;
            if (ctx.roundRect) {
                ctx.beginPath();
                ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 4);
                ctx.fill();
            } else {
                ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
            }

            ctx.fillStyle = textColor;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.fillText(text, canvas.width / 2, y);
            ctx.textAlign = 'left';
        };

        // Draw active positions SL/TP levels
        if (positions && positions.length > 0 && candlestickSeries.current) {
            const currentPrice = data && data.length > 0 ? data[data.length - 1].close : 0;

            positions.forEach(pos => {
                const isBuy = pos.type === 'BUY';
                const entryY = candlestickSeries.current.priceToCoordinate(pos.entryPrice);
                if (entryY !== null) {
                    ctx.beginPath();
                    ctx.setLineDash([4, 4]);
                    ctx.moveTo(0, entryY);
                    ctx.lineTo(canvas.width, entryY);
                    ctx.strokeStyle = '#3b82f6';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                    ctx.setLineDash([]);
                    
                    const pnl = (isBuy ? (currentPrice - pos.entryPrice) : (pos.entryPrice - currentPrice)) * pos.lots * cfg.contractSize;
                    const pnlText = `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USD`;
                    const badgeText = `${isBuy ? '' : '-'}${pos.lots.toFixed(2)} | ${pnlText}`;
                    drawBadge(badgeText, entryY, pnl >= 0 ? '#26a69a' : '#ef5350', '#ffffff');
                }

                if (pos.sl) {
                    const slY = candlestickSeries.current.priceToCoordinate(pos.sl);
                    if (slY !== null) {
                        ctx.beginPath();
                        ctx.setLineDash([2, 2]);
                        ctx.moveTo(0, slY);
                        ctx.lineTo(canvas.width, slY);
                        ctx.strokeStyle = '#ef5350';
                        ctx.lineWidth = 1.5;
                        ctx.stroke();
                        ctx.setLineDash([]);

                        const slPnl = (isBuy ? (pos.sl - pos.entryPrice) : (pos.entryPrice - pos.sl)) * pos.lots * cfg.contractSize;
                        const badgeText = `${pos.lots.toFixed(2)} | ${slPnl >= 0 ? '+' : ''}${slPnl.toFixed(2)} USD`;
                        drawBadge(badgeText, slY, '#f59e0b', '#ffffff');
                    }
                }

                if (pos.tp) {
                    const tpY = candlestickSeries.current.priceToCoordinate(pos.tp);
                    if (tpY !== null) {
                        ctx.beginPath();
                        ctx.setLineDash([2, 2]);
                        ctx.moveTo(0, tpY);
                        ctx.lineTo(canvas.width, tpY);
                        ctx.strokeStyle = '#26a69a';
                        ctx.lineWidth = 1.5;
                        ctx.stroke();
                        ctx.setLineDash([]);

                        const tpPnl = (isBuy ? (pos.tp - pos.entryPrice) : (pos.entryPrice - pos.tp)) * pos.lots * cfg.contractSize;
                        const badgeText = `${pos.lots.toFixed(2)} | ${tpPnl >= 0 ? '+' : ''}${tpPnl.toFixed(2)} USD`;
                        drawBadge(badgeText, tpY, '#26a69a', '#ffffff');
                    }
                }
            });
        }

        // Draw Reviewing Trade levels (Historical Trade Review)
        if (reviewingTrade && candlestickSeries.current) {
            const entryY = candlestickSeries.current.priceToCoordinate(reviewingTrade.entryPrice);
            if (entryY !== null) {
                ctx.beginPath();
                ctx.setLineDash([4, 4]);
                ctx.moveTo(0, entryY);
                ctx.lineTo(canvas.width, entryY);
                ctx.strokeStyle = '#9c27b0'; 
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.setLineDash([]);
                drawBadge(`Review Entry: ${reviewingTrade.entryPrice.toFixed(cfg.precision)}`, entryY, '#9c27b0', '#ffffff');
            }

            if (reviewingTrade.sl) {
                const slY = candlestickSeries.current.priceToCoordinate(reviewingTrade.sl);
                if (slY !== null) {
                    ctx.beginPath();
                    ctx.setLineDash([2, 2]);
                    ctx.moveTo(0, slY);
                    ctx.lineTo(canvas.width, slY);
                    ctx.strokeStyle = '#ef5350';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    ctx.setLineDash([]);
                    drawBadge(`Review SL: ${reviewingTrade.sl.toFixed(cfg.precision)}`, slY, '#ef5350', '#ffffff');
                }
            }

            if (reviewingTrade.tp) {
                const tpY = candlestickSeries.current.priceToCoordinate(reviewingTrade.tp);
                if (tpY !== null) {
                    ctx.beginPath();
                    ctx.setLineDash([2, 2]);
                    ctx.moveTo(0, tpY);
                    ctx.lineTo(canvas.width, tpY);
                    ctx.strokeStyle = '#26a69a';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    ctx.setLineDash([]);
                    drawBadge(`Review TP: ${reviewingTrade.tp.toFixed(cfg.precision)}`, tpY, '#26a69a', '#ffffff');
                }
            }
            
            if (reviewingTrade.closePrice) {
                const closeY = candlestickSeries.current.priceToCoordinate(reviewingTrade.closePrice);
                if (closeY !== null) {
                    ctx.beginPath();
                    ctx.setLineDash([2, 2]);
                    ctx.moveTo(0, closeY);
                    ctx.lineTo(canvas.width, closeY);
                    ctx.strokeStyle = '#f59e0b';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                    ctx.setLineDash([]);
                    drawBadge(`Review Exit (${reviewingTrade.pnl > 0 ? 'Win' : 'Loss'}): ${reviewingTrade.closePrice.toFixed(cfg.precision)}`, closeY, '#f59e0b', '#ffffff');
                }
            }
        }

        // Draw Planned Order levels (Pre-trade preview)
        if (plannedOrder && candlestickSeries.current && data && data.length > 0) {
            const cfg = getSymbolConfig(activeSymbol);
            const currentPrice = data[data.length - 1].close;
            const entryPrice = plannedOrder.limitPrice || currentPrice;
            const lots = plannedOrder.lots || 0.01;
            const isBuy = plannedOrder.direction === 'BUY';
            
            // Calculate SL and TP prices
            const slPrice = isBuy ? (entryPrice - plannedOrder.slPips * cfg.pipSize) : (entryPrice + plannedOrder.slPips * cfg.pipSize);
            const tpPrice = isBuy ? (entryPrice + plannedOrder.tpPips * cfg.pipSize) : (entryPrice - plannedOrder.tpPips * cfg.pipSize);

            // Compute coordinates
            const entryY = candlestickSeries.current.priceToCoordinate(entryPrice);
            const slY = candlestickSeries.current.priceToCoordinate(slPrice);
            const tpY = candlestickSeries.current.priceToCoordinate(tpPrice);

            const drawPlannedBadge = (text, y, bgColor, textColor) => {
                ctx.font = 'bold 10px sans-serif';
                const textWidth = ctx.measureText(text).width;
                const paddingX = 8;
                const paddingY = 4;
                const badgeWidth = textWidth + paddingX * 2;
                const badgeHeight = 14 + paddingY * 2;
                const badgeX = canvas.width / 4 - badgeWidth / 2;
                const badgeY = y - badgeHeight / 2;

                ctx.fillStyle = bgColor;
                if (ctx.roundRect) {
                    ctx.beginPath();
                    ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 4);
                    ctx.fill();
                } else {
                    ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
                }

                ctx.fillStyle = textColor;
                ctx.textBaseline = 'middle';
                ctx.textAlign = 'center';
                ctx.fillText(text, canvas.width / 4, y);
                ctx.textAlign = 'left';
            };

            // 1. Draw Planned Entry Line
            if (entryY !== null) {
                ctx.beginPath();
                ctx.setLineDash([6, 3]);
                ctx.moveTo(0, entryY);
                ctx.lineTo(canvas.width, entryY);
                ctx.strokeStyle = '#ffd700'; // gold color for planned entry
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.setLineDash([]);
                
                const label = `${plannedOrder.orderType === 'LIMIT' ? 'Limit ' : ''}Entry (Drag): ${entryPrice.toFixed(cfg.precision)} (${lots.toFixed(2)} Lots)`;
                drawPlannedBadge(label, entryY, 'rgba(255, 215, 0, 0.2)', '#ffd700');
            }

            // 2. Draw Planned SL Line
            if (slY !== null) {
                ctx.beginPath();
                ctx.setLineDash([4, 4]);
                ctx.moveTo(0, slY);
                ctx.lineTo(canvas.width, slY);
                ctx.strokeStyle = '#ff9800'; // orange for SL
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.setLineDash([]);

                const slUSD = plannedOrder.slPips * cfg.pipSize * cfg.contractSize * lots;
                const label = `SL (Drag): ${slPrice.toFixed(cfg.precision)} (-$${slUSD.toFixed(2)})`;
                drawPlannedBadge(label, slY, 'rgba(239, 83, 80, 0.2)', '#ef5350');
            }

            // 3. Draw Planned TP Line
            if (tpY !== null) {
                ctx.beginPath();
                ctx.setLineDash([4, 4]);
                ctx.moveTo(0, tpY);
                ctx.lineTo(canvas.width, tpY);
                ctx.strokeStyle = '#4caf50'; // green for TP
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.setLineDash([]);

                const tpUSD = plannedOrder.tpPips * cfg.pipSize * cfg.contractSize * lots;
                const label = `TP (Drag): ${tpPrice.toFixed(cfg.precision)} (+$${tpUSD.toFixed(2)})`;
                drawPlannedBadge(label, tpY, 'rgba(38, 166, 154, 0.2)', '#26a69a');
            }
        }

        // Draw finalized drawings
        if (drawings) {
            drawings.forEach(d => {
                const isSelected = selectedId === d.id;
                const shapeToDraw = (localDraggedDrawing && localDraggedDrawing.id === d.id) ? localDraggedDrawing : d;
                drawShape(ctx, shapeToDraw, isSelected);
            });
        }

        // Draw preview drawing
        if (drawingState.isDrawing) {
            if (activeTool === 'path') {
                if (drawingState.points && drawingState.points.length > 0) {
                    ctx.beginPath();
                    let started = false;
                    drawingState.points.forEach(pt => {
                        const pixelPt = getPixelCoords(pt.time, pt.price);
                        if (pixelPt) {
                            if (!started) {
                                ctx.moveTo(pixelPt.x, pixelPt.y);
                                started = true;
                            } else {
                                ctx.lineTo(pixelPt.x, pixelPt.y);
                            }
                        }
                    });
                    ctx.strokeStyle = 'rgba(59, 130, 246, 0.7)';
                    ctx.lineWidth = 2;
                    ctx.stroke();

                    // Draw dashed line from last point to current cursor position
                    const lastPt = drawingState.points[drawingState.points.length - 1];
                    const lastPixel = getPixelCoords(lastPt.time, lastPt.price);
                    const currentPixel = drawingState.currentPoint ? getPixelCoords(drawingState.currentPoint.time, drawingState.currentPoint.price) : null;
                    if (lastPixel && currentPixel) {
                        ctx.beginPath();
                        ctx.setLineDash([4, 4]);
                        ctx.moveTo(lastPixel.x, lastPixel.y);
                        ctx.lineTo(currentPixel.x, currentPixel.y);
                        ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
                        ctx.lineWidth = 1.5;
                        ctx.stroke();
                        ctx.setLineDash([]);
                    }
                }
            } else if (drawingState.startPoint && drawingState.currentPoint) {
                const preview = {
                    type: activeTool,
                    p1: drawingState.startPoint,
                    p2: drawingState.currentPoint
                };
                drawShape(ctx, preview, false);
            }
        }

        // Draw bar selection vertical guideline
        if (isSelectingStartBar && hoverBarX !== null) {
            ctx.beginPath();
            ctx.setLineDash([5, 5]);
            ctx.moveTo(hoverBarX, 0);
            ctx.lineTo(hoverBarX, canvas.height);
            ctx.strokeStyle = '#2962ff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.setLineDash([]);
            
            ctx.fillStyle = '#2962ff';
            ctx.font = 'bold 11px sans-serif';
            ctx.fillText("Click to Set Replay Start Bar", hoverBarX + 8, 20);
        }
    };

    const hexToRgba = (hex, alpha) => {
        if (!hex) return `rgba(59, 130, 246, ${alpha})`;
        if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
        let r = 0, g = 0, b = 0;
        if (hex.length === 4) {
            r = parseInt(hex[1] + hex[1], 16);
            g = parseInt(hex[2] + hex[2], 16);
            b = parseInt(hex[3] + hex[3], 16);
        } else if (hex.length === 7) {
            r = parseInt(hex.substring(1, 3), 16);
            g = parseInt(hex.substring(3, 5), 16);
            b = parseInt(hex.substring(5, 7), 16);
        }
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    const drawShape = (ctx, shape, isSelected) => {
        const { type, p1, p2, p3, style = {} } = shape;
        const baseColor = style.color || '#3b82f6';
        const lineWidth = style.lineWidth || (isSelected ? 3 : 2);
        const opacity = style.opacity !== undefined ? style.opacity : 0.15;

        ctx.lineWidth = lineWidth;

        if (type === 'path') {
            if (!shape.points || shape.points.length === 0) return;
            ctx.beginPath();
            let started = false;
            shape.points.forEach(pt => {
                const pixelPt = getPixelCoords(pt.time, pt.price);
                if (pixelPt) {
                    if (!started) {
                        ctx.moveTo(pixelPt.x, pixelPt.y);
                        started = true;
                    } else {
                        ctx.lineTo(pixelPt.x, pixelPt.y);
                    }
                }
            });
            ctx.strokeStyle = isSelected ? '#ffffff' : baseColor;
            ctx.stroke();
            
            if (isSelected) {
                shape.points.forEach((pt, index) => {
                    const pixelPt = getPixelCoords(pt.time, pt.price);
                    if (pixelPt) {
                        const isPointHovered = hoverState && hoverState.drawingId === shape.id && hoverState.type === `path_point_${index}`;
                        drawAnchor(ctx, pixelPt.x, pixelPt.y, isPointHovered);
                    }
                });
            }
            return;
        }

        if (!p1) return;
        const pt1 = getPixelCoords(p1.time, p1.price);
        if (!pt1) return;

        if (type === 'horizontal') {
            ctx.beginPath();
            ctx.moveTo(0, pt1.y);
            ctx.lineTo(canvasRef.current.width, pt1.y);
            ctx.strokeStyle = isSelected ? '#ffffff' : baseColor;
            ctx.stroke();
            
            if (isSelected) {
                drawAnchor(ctx, pt1.x, pt1.y);
            }
            return;
        }

        if (type === 'horizontal_ray') {
            ctx.beginPath();
            ctx.moveTo(pt1.x, pt1.y);
            ctx.lineTo(canvasRef.current.width, pt1.y);
            ctx.strokeStyle = isSelected ? '#ffffff' : baseColor;
            ctx.stroke();
            
            // Draw a rightward arrow at the end
            ctx.beginPath();
            ctx.moveTo(canvasRef.current.width - 8, pt1.y - 4);
            ctx.lineTo(canvasRef.current.width - 2, pt1.y);
            ctx.lineTo(canvasRef.current.width - 8, pt1.y + 4);
            ctx.strokeStyle = isSelected ? '#ffffff' : baseColor;
            ctx.stroke();

            if (isSelected) {
                drawAnchor(ctx, pt1.x, pt1.y);
            }
            return;
        }

        if (type === 'vertical_ray') {
            ctx.beginPath();
            ctx.moveTo(pt1.x, pt1.y);
            ctx.lineTo(pt1.x, canvasRef.current.height);
            ctx.strokeStyle = isSelected ? '#ffffff' : baseColor;
            ctx.stroke();
            
            // Draw downward arrow at the bottom
            ctx.beginPath();
            ctx.moveTo(pt1.x - 4, canvasRef.current.height - 8);
            ctx.lineTo(pt1.x, canvasRef.current.height - 2);
            ctx.lineTo(pt1.x + 4, canvasRef.current.height - 8);
            ctx.strokeStyle = isSelected ? '#ffffff' : baseColor;
            ctx.stroke();

            if (isSelected) {
                drawAnchor(ctx, pt1.x, pt1.y);
            }
            return;
        }

        const pt2 = p2 ? getPixelCoords(p2.time, p2.price) : null;
        if (!pt2) return;

        if (type === 'trendline') {
            ctx.beginPath();
            ctx.moveTo(pt1.x, pt1.y);
            ctx.lineTo(pt2.x, pt2.y);
            ctx.strokeStyle = isSelected ? '#ffffff' : baseColor;
            ctx.stroke();
        } else if (type === 'rectangle') {
            ctx.beginPath();
            ctx.rect(pt1.x, pt1.y, pt2.x - pt1.x, pt2.y - pt1.y);
            ctx.fillStyle = hexToRgba(baseColor, opacity);
            ctx.fill();
            ctx.strokeStyle = isSelected ? '#ffffff' : baseColor;
            ctx.stroke();

            // Draw Zone Template & Timeframe Label if specified
            const zoneText = style.zoneTemplate ? style.zoneTemplate.toUpperCase() : '';
            const tfText = style.timeframe ? style.timeframe.toUpperCase() : '';
            const labelText = [tfText, zoneText].filter(Boolean).join(' ');

            if (labelText) {
                ctx.fillStyle = isSelected ? '#ffffff' : baseColor;
                ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                // Put it slightly inside the top-left of the rectangle
                const labelX = Math.min(pt1.x, pt2.x) + 6;
                const labelY = Math.min(pt1.y, pt2.y) + 4;
                ctx.fillText(labelText, labelX, labelY);
            }
        } else if (type === 'fib') {
            const priceDiff = pt1.y - pt2.y;
            const priceValDiff = p1.price - p2.price;
            
            ctx.beginPath();
            ctx.setLineDash([4, 4]);
            ctx.moveTo(pt1.x, pt1.y);
            ctx.lineTo(pt2.x, pt2.y);
            ctx.strokeStyle = style.color || '#787b86';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.setLineDash([]);

            const fibLevels = style.fibLevels || [
                { lvl: 0, color: '#787b86', enabled: true },
                { lvl: 0.236, color: '#f44336', enabled: false },
                { lvl: 0.382, color: '#ff9800', enabled: false },
                { lvl: 0.5, color: '#4caf50', enabled: true },
                { lvl: 0.618, color: '#00b0ff', enabled: true },
                { lvl: 0.71, color: '#3f51b5', enabled: true },
                { lvl: 0.79, color: '#00e5ff', enabled: true },
                { lvl: 0.89, color: '#ff1744', enabled: true },
                { lvl: 1.0, color: '#787b86', enabled: true }
            ];

            const enabledLevels = fibLevels.filter(item => item.enabled !== false).sort((a, b) => a.lvl - b.lvl);

            // Draw shaded background zones between consecutive Fibonacci levels
            if (opacity > 0 && enabledLevels.length > 1) {
                for (let j = 0; j < enabledLevels.length - 1; j++) {
                    const lA = enabledLevels[j];
                    const lB = enabledLevels[j + 1];
                    const yA = pt2.y + priceDiff * lA.lvl;
                    const yB = pt2.y + priceDiff * lB.lvl;
                    
                    ctx.fillStyle = hexToRgba(lA.color || style.color || '#3b82f6', opacity);
                    ctx.fillRect(Math.min(pt1.x, pt2.x), Math.min(yA, yB), Math.abs(pt2.x - pt1.x), Math.abs(yB - yA));
                }
            }
            
            fibLevels.forEach(item => {
                if (item.enabled === false) return;
                const lvl = item.lvl;
                const y = pt2.y + priceDiff * lvl;
                const lvlPrice = p2.price + priceValDiff * lvl;
                
                ctx.beginPath();
                ctx.moveTo(Math.min(pt1.x, pt2.x), y);
                ctx.lineTo(Math.max(pt1.x, pt2.x), y);
                
                const drawColor = item.color || style.color || '#3b82f6';
                ctx.strokeStyle = isSelected ? '#ffffff' : drawColor;
                ctx.lineWidth = lineWidth;
                ctx.stroke();

                ctx.fillStyle = isSelected ? '#ffffff' : drawColor;
                ctx.font = '10px sans-serif';
                ctx.fillText(`${lvl} (${lvlPrice.toFixed(cfg.precision)})`, Math.min(pt1.x, pt2.x) + 5, y - 4);
            });
        } else if (type === 'scale') {
            const priceDiffVal = p2.price - p1.price;
            const isUp = priceDiffVal >= 0;
            const fillBg = isUp ? 'rgba(38, 166, 154, 0.15)' : 'rgba(239, 83, 80, 0.15)';
            const borderCol = isUp ? '#26a69a' : '#ef5350';
            
            ctx.beginPath();
            ctx.rect(pt1.x, pt1.y, pt2.x - pt1.x, pt2.y - pt1.y);
            ctx.fillStyle = fillBg;
            ctx.fill();
            ctx.strokeStyle = borderCol;
            ctx.lineWidth = 1;
            ctx.stroke();

            // Inner cross-lines with arrowheads
            const midX = pt1.x + (pt2.x - pt1.x) / 2;
            const midY = pt1.y + (pt2.y - pt1.y) / 2;

            // Horizontal cross line
            ctx.beginPath();
            ctx.moveTo(pt1.x, midY);
            ctx.lineTo(pt2.x, midY);
            ctx.strokeStyle = borderCol;
            ctx.lineWidth = 1;
            ctx.stroke();

            // Horizontal arrow
            const hArrowDir = pt2.x >= pt1.x ? 1 : -1;
            ctx.beginPath();
            ctx.moveTo(pt2.x - 6 * hArrowDir, midY - 4);
            ctx.lineTo(pt2.x, midY);
            ctx.lineTo(pt2.x - 6 * hArrowDir, midY + 4);
            ctx.strokeStyle = borderCol;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Vertical cross line
            ctx.beginPath();
            ctx.moveTo(midX, pt1.y);
            ctx.lineTo(midX, pt2.y);
            ctx.strokeStyle = borderCol;
            ctx.lineWidth = 1;
            ctx.stroke();

            // Vertical arrow
            const vArrowDir = pt2.y >= pt1.y ? 1 : -1;
            ctx.beginPath();
            ctx.moveTo(midX - 4, pt2.y - 6 * vArrowDir);
            ctx.lineTo(midX, pt2.y);
            ctx.lineTo(midX + 4, pt2.y - 6 * vArrowDir);
            ctx.strokeStyle = borderCol;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            
            const percent = ((priceDiffVal / p1.price) * 100).toFixed(2);
            const pips = (priceDiffVal * 10).toFixed(1);
            
            let barCount = 0;
            let timeText = '';
            if (data && data.length > 0) {
                const idx1 = data.findIndex(c => c.time === p1.time);
                const idx2 = data.findIndex(c => c.time === p2.time);
                if (idx1 !== -1 && idx2 !== -1) {
                    barCount = Math.abs(idx2 - idx1);
                }
                const secDiff = Math.abs(p2.time - p1.time);
                const hrs = Math.floor(secDiff / 3600);
                const mins = Math.floor((secDiff % 3600) / 60);
                const days = Math.floor(hrs / 24);
                if (days > 0) {
                    timeText = `${days}d ${hrs % 24}h`;
                } else if (hrs > 0) {
                    timeText = `${hrs}h ${mins}m`;
                } else {
                    timeText = `${mins}m`;
                }
            }
            
            const textLine1 = `${isUp ? '+' : ''}${priceDiffVal.toFixed(cfg.precision)} USD (${isUp ? '+' : ''}${percent}%)`;
            const textLine2 = `${isUp ? '+' : ''}${pips} Pips | ${barCount} bars (${timeText})`;
            
            ctx.fillStyle = 'rgba(30, 34, 45, 0.9)';
            ctx.strokeStyle = borderCol;
            ctx.lineWidth = 1;
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(midX - 80, midY - 20, 160, 40, 4);
            } else {
                ctx.rect(midX - 80, midY - 20, 160, 40);
            }
            ctx.fill();
            ctx.stroke();
            
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.font = 'bold 10px sans-serif';
            ctx.fillText(textLine1, midX, midY - 4);
            ctx.fillText(textLine2, midX, midY + 12);
            ctx.textAlign = 'left';
        } else if (type === 'risk_reward') {
            if (!p1 || !p2 || p1.price === undefined || p2.price === undefined) return;
            const isLong = style.isLong !== undefined ? style.isLong : (p2.price < p1.price);
            const slPrice = p2.price;
            const tpPrice = p3 && p3.price !== undefined ? p3.price : (isLong ? p1.price + Math.abs(p1.price - slPrice) * 2 : p1.price - Math.abs(p1.price - slPrice) * 2);

            const slPt = getPixelCoords(p2.time, slPrice);
            const tpPt = getPixelCoords(p3 && p3.time !== undefined ? p3.time : p1.time, tpPrice);

            // Get current point for tracking line
            let currentPt = null;
            let currentPriceForPnL = p1.price;
            let pnlStatus = "Open";
            
            if (data && data.length > 0) {
                const startIndex = data.findIndex(c => c.time >= p1.time);
                if (startIndex !== -1) {
                    let hitTP = false;
                    let hitSL = false;
                    let hitCandle = null;
                    
                    const maxTime = Math.min(p2.time, data[data.length - 1].time);
                    const endIndex = data.findIndex(c => c.time > maxTime);
                    const maxIndex = endIndex !== -1 ? endIndex : data.length;
                    
                    for (let i = startIndex; i < maxIndex; i++) {
                        const c = data[i];
                        if (isLong) {
                            if (c.low <= slPrice) { hitSL = true; hitCandle = c; break; }
                            if (c.high >= tpPrice) { hitTP = true; hitCandle = c; break; }
                        } else {
                            if (c.high >= slPrice) { hitSL = true; hitCandle = c; break; }
                            if (c.low <= tpPrice) { hitTP = true; hitCandle = c; break; }
                        }
                    }
                    
                    if (hitTP || hitSL) {
                        currentPt = getPixelCoords(hitCandle.time, hitTP ? tpPrice : slPrice);
                        currentPriceForPnL = hitTP ? tpPrice : slPrice;
                        pnlStatus = hitTP ? "Hit TP" : "Hit SL";
                    } else {
                        const lastValidCandle = data[maxIndex - 1];
                        if (lastValidCandle) {
                            currentPt = getPixelCoords(lastValidCandle.time, lastValidCandle.close);
                            currentPriceForPnL = lastValidCandle.close;
                            pnlStatus = (maxIndex - 1 === data.length - 1 && lastValidCandle.time <= p2.time) ? "Open" : "Closed";
                        }
                    }
                }
            }

            if (slPt && tpPt && pt2) {
                const tpColor = style.tpColor || '#089981';
                const slColor = style.slColor || '#f23645';
                
                // Target Zone
                ctx.beginPath();
                ctx.rect(pt1.x, Math.min(pt1.y, tpPt.y), pt2.x - pt1.x, Math.abs(pt1.y - tpPt.y));
                ctx.fillStyle = hexToRgba(tpColor, opacity || 0.2);
                ctx.fill();
                ctx.strokeStyle = isSelected ? '#ffffff' : hexToRgba(tpColor, 0.4);
                ctx.lineWidth = 1;
                ctx.stroke();

                // Stop Loss Zone
                ctx.beginPath();
                ctx.rect(pt1.x, Math.min(pt1.y, slPt.y), pt2.x - pt1.x, Math.abs(pt1.y - slPt.y));
                ctx.fillStyle = hexToRgba(slColor, opacity || 0.2);
                ctx.fill();
                ctx.strokeStyle = isSelected ? '#ffffff' : hexToRgba(slColor, 0.4);
                ctx.stroke();
                
                // Entry Line (middle)
                ctx.beginPath();
                ctx.moveTo(pt1.x, pt1.y);
                ctx.lineTo(pt2.x, pt1.y);
                ctx.strokeStyle = '#787b86';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Tracking Line
                if (currentPt && currentPt.x > pt1.x && currentPt.x <= pt2.x) {
                    ctx.beginPath();
                    ctx.moveTo(pt1.x, pt1.y);
                    ctx.lineTo(currentPt.x, currentPt.y);
                    ctx.strokeStyle = '#b2b5be';
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([4, 4]);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }

                // Dynamic R:R calculation
                const riskVal = Math.abs(p1.price - slPrice);
                const rewardVal = Math.abs(tpPrice - p1.price);
                const targetRR = riskVal > 0 ? rewardVal / riskVal : 0;
                
                const currentPnL = isLong ? (currentPriceForPnL - p1.price) : (p1.price - currentPriceForPnL);

                // Info Badges (Only visible on hover or select)
                const isHovered = hoverState && hoverState.drawingId === shape.id;
                if (isSelected || isHovered) {
                    // Setup font for badges
                    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif';

                    // Top Target Text Box
                    const targetText = `Target: ${rewardVal.toFixed(cfg.precision)} (${(rewardVal/p1.price*100).toFixed(3)}%)`;
                    const tpMetrics = ctx.measureText(targetText);
                    const tpx = pt1.x + (pt2.x - pt1.x)/2 - tpMetrics.width/2 - 8;
                    const tpy = Math.min(pt1.y, tpPt.y) - 10;
                    
                    ctx.fillStyle = tpColor;
                    ctx.beginPath();
                    if (ctx.roundRect) ctx.roundRect(tpx, tpy, tpMetrics.width + 16, 20, 4);
                    else ctx.rect(tpx, tpy, tpMetrics.width + 16, 20);
                    ctx.fill();
                    
                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'center';
                    ctx.fillText(targetText, pt1.x + (pt2.x - pt1.x)/2, tpy + 14);
                    
                    // Bottom Stop Text Box
                    const stopText = `Stop: ${riskVal.toFixed(cfg.precision)} (${(riskVal/p1.price*100).toFixed(3)}%)`;
                    const slMetrics = ctx.measureText(stopText);
                    const slx = pt1.x + (pt2.x - pt1.x)/2 - slMetrics.width/2 - 8;
                    const sly = Math.max(pt1.y, slPt.y) - 10;
                    
                    ctx.fillStyle = slColor;
                    ctx.beginPath();
                    if (ctx.roundRect) ctx.roundRect(slx, sly, slMetrics.width + 16, 20, 4);
                    else ctx.rect(slx, sly, slMetrics.width + 16, 20);
                    ctx.fill();
                    
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(stopText, pt1.x + (pt2.x - pt1.x)/2, sly + 14);

                    // Middle PnL Box
                    const pnlLine1 = `${pnlStatus} PnL: ${currentPnL > 0 ? '+' : ''}${currentPnL.toFixed(cfg.precision)}`;
                    const pnlLine2 = `Risk/reward ratio: ${targetRR.toFixed(2)}`;
                    const midMetrics1 = ctx.measureText(pnlLine1);
                    const midMetrics2 = ctx.measureText(pnlLine2);
                    const maxMidWidth = Math.max(midMetrics1.width, midMetrics2.width);
                    
                    const midX = pt1.x + (pt2.x - pt1.x)/2;
                    const midY = pt1.y;
                    
                    const boxX = midX - maxMidWidth/2 - 10;
                    const boxY = midY - 18;
                
                    let midBg = currentPnL > 0 ? tpColor : (currentPnL < 0 ? slColor : '#787b86');
                    
                    ctx.fillStyle = midBg;
                    ctx.beginPath();
                    if (ctx.roundRect) ctx.roundRect(boxX, boxY, maxMidWidth + 20, 36, 4);
                    else ctx.rect(boxX, boxY, maxMidWidth + 20, 36);
                    ctx.fill();
                    
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1;
                    ctx.stroke();

                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(pnlLine1, midX, midY - 2);
                    ctx.fillText(pnlLine2, midX, midY + 12);
                    
                    ctx.textAlign = 'left';
                }
            }
        } else if (type === 'volume_profile') {
            // Volume profile rendering
            ctx.beginPath();
            ctx.rect(pt1.x, pt1.y, pt2.x - pt1.x, pt2.y - pt1.y);
            ctx.fillStyle = 'rgba(20, 24, 35, 0.45)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.setLineDash([]);

            const tMin = Math.min(p1.time, p2.time);
            const tMax = Math.max(p1.time, p2.time);
            const rangeCandles = data ? data.filter(c => c.time >= tMin && c.time <= tMax) : [];

            if (rangeCandles.length > 0) {
                let low = Infinity;
                let high = -Infinity;
                rangeCandles.forEach(c => {
                    if (c.low < low) low = c.low;
                    if (c.high > high) high = c.high;
                });

                if (high > low) {
                    const numBins = 30;
                    const binSize = (high - low) / numBins;
                    const bins = Array.from({ length: numBins }, (_, idx) => ({
                        idx,
                        priceLow: low + idx * binSize,
                        priceHigh: low + (idx + 1) * binSize,
                        upVol: 0,
                        downVol: 0,
                        totalVol: 0
                    }));

                    rangeCandles.forEach(c => {
                        const cVol = c.volume || 1;
                        const isUp = c.close >= c.open;
                        const overlapBins = bins.filter(b => b.priceHigh >= c.low && b.priceLow <= c.high);
                        if (overlapBins.length > 0) {
                            const volPerBin = cVol / overlapBins.length;
                            overlapBins.forEach(b => {
                                if (isUp) {
                                    b.upVol += volPerBin;
                                } else {
                                    b.downVol += volPerBin;
                                }
                                b.totalVol += volPerBin;
                            });
                        }
                    });

                    let maxVol = 0;
                    let pocBin = null;
                    let totalVolume = 0;
                    bins.forEach(b => {
                        totalVolume += b.totalVol;
                        if (b.totalVol > maxVol) {
                            maxVol = b.totalVol;
                            pocBin = b;
                        }
                    });

                    let valueAreaVolume = 0;
                    const valueAreaBins = new Set();
                    if (pocBin) {
                        valueAreaBins.add(pocBin.idx);
                        valueAreaVolume += pocBin.totalVol;
                        let left = pocBin.idx - 1;
                        let right = pocBin.idx + 1;
                        const targetVol = totalVolume * 0.7;

                        while (valueAreaVolume < targetVol && (left >= 0 || right < numBins)) {
                            let leftVol = left >= 0 ? bins[left].totalVol : -1;
                            let rightVol = right < numBins ? bins[right].totalVol : -1;

                            if (leftVol > rightVol) {
                                valueAreaBins.add(left);
                                valueAreaVolume += leftVol;
                                left--;
                            } else if (rightVol >= 0) {
                                valueAreaBins.add(right);
                                valueAreaVolume += rightVol;
                                right++;
                            } else {
                                break;
                            }
                        }
                    }

                    const vaIndices = Array.from(valueAreaBins).sort((a, b) => a - b);
                    const valIdx = vaIndices.length > 0 ? vaIndices[0] : 0;
                    const vahIdx = vaIndices.length > 0 ? vaIndices[vaIndices.length - 1] : numBins - 1;

                    const valPrice = bins[valIdx].priceLow;
                    const vahPrice = bins[vahIdx].priceHigh;
                    const pocPrice = pocBin ? (pocBin.priceLow + pocBin.priceHigh) / 2 : (low + high) / 2;

                    const maxBarWidth = Math.abs(pt2.x - pt1.x) * 0.45;
                    const binHeight = Math.abs(pt2.y - pt1.y) / numBins;

                    bins.forEach(b => {
                        const yTop = Math.min(pt1.y, pt2.y) + (numBins - 1 - b.idx) * binHeight;
                        const barLenTotal = maxVol > 0 ? (b.totalVol / maxVol) * maxBarWidth : 0;
                        const upRatio = b.totalVol > 0 ? b.upVol / b.totalVol : 0.5;
                        const barLenUp = barLenTotal * upRatio;
                        const barLenDown = barLenTotal - barLenUp;
                        const isInsideVA = valueAreaBins.has(b.idx);

                        const upColor = isInsideVA ? 'rgba(38, 166, 154, 0.65)' : 'rgba(38, 166, 154, 0.22)';
                        const downColor = isInsideVA ? 'rgba(239, 83, 80, 0.65)' : 'rgba(239, 83, 80, 0.22)';

                        ctx.fillStyle = upColor;
                        ctx.fillRect(pt1.x, yTop + 1, barLenUp, binHeight - 1);

                        ctx.fillStyle = downColor;
                        ctx.fillRect(pt1.x + barLenUp, yTop + 1, barLenDown, binHeight - 1);
                    });

                    const vahY = candlestickSeries.current.priceToCoordinate(vahPrice);
                    if (vahY !== null && vahY >= Math.min(pt1.y, pt2.y) && vahY <= Math.max(pt1.y, pt2.y)) {
                        ctx.beginPath();
                        ctx.moveTo(pt1.x, vahY);
                        ctx.lineTo(pt2.x, vahY);
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 1.5;
                        ctx.stroke();

                        ctx.fillStyle = '#ffffff';
                        ctx.font = '9px sans-serif';
                        ctx.fillText(`VAH: ${vahPrice.toFixed(cfg.precision)}`, pt1.x + 5, vahY - 3);
                    }

                    const valY = candlestickSeries.current.priceToCoordinate(valPrice);
                    if (valY !== null && valY >= Math.min(pt1.y, pt2.y) && valY <= Math.max(pt1.y, pt2.y)) {
                        ctx.beginPath();
                        ctx.moveTo(pt1.x, valY);
                        ctx.lineTo(pt2.x, valY);
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 1.5;
                        ctx.stroke();

                        ctx.fillStyle = '#ffffff';
                        ctx.font = '9px sans-serif';
                        ctx.fillText(`VAL: ${valPrice.toFixed(cfg.precision)}`, pt1.x + 5, valY - 3);
                    }

                    const pocY = candlestickSeries.current.priceToCoordinate(pocPrice);
                    if (pocY !== null && pocY >= Math.min(pt1.y, pt2.y) && pocY <= Math.max(pt1.y, pt2.y)) {
                        ctx.beginPath();
                        ctx.moveTo(pt1.x, pocY);
                        ctx.lineTo(pt2.x, pocY);
                        ctx.strokeStyle = '#ffd700';
                        ctx.lineWidth = 2.5;
                        ctx.stroke();

                        ctx.fillStyle = '#ffd700';
                        ctx.font = 'bold 9px sans-serif';
                        ctx.fillText(`POC: ${pocPrice.toFixed(cfg.precision)}`, pt1.x + 5, pocY - 3);
                    }
                }
            }
        }

        if (isSelected) {
            if (type === 'risk_reward') {
                const slPrice = p2.price;
                const isLong = style.isLong !== undefined ? style.isLong : (p2.price < p1.price);
                const tpPrice = p3 && p3.price !== undefined ? p3.price : (isLong ? p1.price + Math.abs(p1.price - slPrice) * 2 : p1.price - Math.abs(p1.price - slPrice) * 2);
                
                const slPt = getPixelCoords(p2.time, slPrice);
                const tpPt = getPixelCoords(p3 && p3.time !== undefined ? p3.time : p1.time, tpPrice);
                
                const isP1Hovered = hoverState && hoverState.drawingId === shape.id && hoverState.type === 'p1';
                const isP2Hovered = hoverState && hoverState.drawingId === shape.id && hoverState.type === 'p2';
                const isP3Hovered = hoverState && hoverState.drawingId === shape.id && hoverState.type === 'p3';
                const isWidthHovered = hoverState && hoverState.drawingId === shape.id && hoverState.type === 'p2_width';

                drawAnchor(ctx, pt1.x, pt1.y, isP1Hovered);
                if (slPt) drawAnchor(ctx, pt1.x, slPt.y, isP2Hovered);
                if (tpPt) drawAnchor(ctx, pt1.x, tpPt.y, isP3Hovered);
                if (pt2) drawAnchor(ctx, pt2.x, pt1.y, isWidthHovered);
            } else {
                const isP1Hovered = hoverState && hoverState.drawingId === shape.id && hoverState.type === 'p1';
                const isP2Hovered = hoverState && hoverState.drawingId === shape.id && hoverState.type === 'p2';
                drawAnchor(ctx, pt1.x, pt1.y, isP1Hovered);
                if (pt2) drawAnchor(ctx, pt2.x, pt2.y, isP2Hovered);
            }
        }
    };

    const drawAnchor = (ctx, x, y, isHovered) => {
        ctx.beginPath();
        if (isHovered) {
            // Draw soft pulsing halo outer ring
            ctx.arc(x, y, 9, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(41, 98, 255, 0.3)';
            ctx.fill();
            ctx.beginPath();
            
            ctx.arc(x, y, 5, 0, 2 * Math.PI);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.strokeStyle = '#2962ff';
            ctx.lineWidth = 2.5;
            ctx.stroke();
        } else {
            ctx.arc(x, y, 5, 0, 2 * Math.PI);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.strokeStyle = '#2962ff';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    };



    const selectedIdRef = useRef(selectedId);
    useEffect(() => {
        selectedIdRef.current = selectedId;
    }, [selectedId]);

    const onDeleteDrawingRef = useRef(onDeleteDrawing);
    useEffect(() => {
        onDeleteDrawingRef.current = onDeleteDrawing;
    }, [onDeleteDrawing]);

    const drawAllRef = useRef(null);
    useEffect(() => {
        drawAllRef.current = drawAll;
    });

    // Create Chart Instance on Mount
    useEffect(() => {
        if (!chartContainerRef.current) return;

        const handleResize = () => {
            if (chartInstance.current && chartContainerRef.current) {
                chartInstance.current.applyOptions({
                    width: chartContainerRef.current.clientWidth,
                    height: chartContainerRef.current.clientHeight,
                });
            }
            if (canvasRef.current && chartContainerRef.current) {
                canvasRef.current.width = chartContainerRef.current.clientWidth;
                canvasRef.current.height = chartContainerRef.current.clientHeight;
            }
            if (drawAllRef.current) drawAllRef.current();
        };

        const initialWidth = chartContainerRef.current.clientWidth || 800;
        const initialHeight = chartContainerRef.current.clientHeight || 400;

        const chart = createChart(chartContainerRef.current, {
            width: initialWidth,
            height: initialHeight,
            layout: {
                background: { color: settings.backgroundColor },
                textColor: settings.textColor,
            },
            grid: {
                vertLines: { color: settings.gridColor },
                horzLines: { color: settings.gridColor },
            },
            crosshair: {
                mode: CrosshairMode.Normal,
            },
            rightPriceScale: {
                borderColor: '#2b3139',
            },
            timeScale: {
                borderColor: '#2b3139',
                timeVisible: true,
                secondsVisible: false,
            },
        });

        chartInstance.current = chart;

        const series = chart.addCandlestickSeries({
            ...candleSeriesOptions,
        });
        
        candlestickSeries.current = series;

        if (data && data.length > 0) {
            series.setData(data);
        }

        if (canvasRef.current) {
            canvasRef.current.width = chartContainerRef.current.clientWidth;
            canvasRef.current.height = chartContainerRef.current.clientHeight;
        }

        // Subscribe to crosshair moves to display indicators and OHLC values dynamically
        chart.subscribeCrosshairMove((param) => {
            if (!param || !param.time || param.point === undefined) {
                setHoveredValues(null);
                return;
            }
            
            const dataMap = param.seriesData || param.seriesPrices;
            if (!dataMap) return;

            const priceData = dataMap.get(series);
            const ema9Val = dataMap.get(e9);
            const ema15Val = dataMap.get(e15);

            if (priceData) {
                setHoveredValues({
                    time: param.time,
                    open: priceData.open,
                    high: priceData.high,
                    low: priceData.low,
                    close: priceData.close,
                    ema9: ema9Val ? (ema9Val.value !== undefined ? ema9Val.value : ema9Val) : null,
                    ema15: ema15Val ? (ema15Val.value !== undefined ? ema15Val.value : ema15Val) : null,
                    vwap: dataMap.get(vwap) ? (dataMap.get(vwap).value !== undefined ? dataMap.get(vwap).value : dataMap.get(vwap)) : null
                });
            }
        });

        const handleTimeScaleChange = () => {
            if (drawAllRef.current) drawAllRef.current();
        };

        chart.timeScale().subscribeVisibleLogicalRangeChange(handleTimeScaleChange);
        chart.timeScale().subscribeVisibleTimeRangeChange(handleTimeScaleChange);

        const resizeObserver = new ResizeObserver(() => {
            handleResize();
        });
        
        if (chartContainerRef.current) {
            resizeObserver.observe(chartContainerRef.current);
        }
        
        window.addEventListener('resize', handleResize);

        // ResizeObserver automatically handles layout changes from react-resizable-panels

        const handleKeyDown = (e) => {
            // Ignore Backspace/Delete if user is editing inside an input/textarea
            if (document.activeElement && (
                document.activeElement.tagName === 'INPUT' || 
                document.activeElement.tagName === 'TEXTAREA' ||
                document.activeElement.isContentEditable
            )) {
                return;
            }
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdRef.current) {
                if (onDeleteDrawingRef.current) {
                    onDeleteDrawingRef.current(selectedIdRef.current);
                }
                setSelectedId(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        const handleWheel = (e) => {
            if (canvasRef.current) {
                canvasRef.current.style.pointerEvents = 'none';
                const elBelow = document.elementFromPoint(e.clientX, e.clientY);
                if (elBelow) {
                    const passEvent = new WheelEvent('wheel', {
                        bubbles: true,
                        cancelable: true,
                        clientX: e.clientX,
                        clientY: e.clientY,
                        deltaX: e.deltaX,
                        deltaY: e.deltaY,
                        deltaZ: e.deltaZ,
                        deltaMode: e.deltaMode
                    });
                    elBelow.dispatchEvent(passEvent);
                }
                canvasRef.current.style.pointerEvents = 'auto';
            }
        };

        const canvasEl = canvasRef.current;
        if (canvasEl) {
            canvasEl.addEventListener('wheel', handleWheel, { passive: true });
        }

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('keydown', handleKeyDown);
            if (canvasEl) {
                canvasEl.removeEventListener('wheel', handleWheel);
            }
            if (chartInstance.current) {
                chartInstance.current.remove();
                chartInstance.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
	    }, []);

    useEffect(() => {
        if (chartInstance.current) {
            chartInstance.current.applyOptions({
                layout: {
                    background: { color: settings.backgroundColor },
                    textColor: settings.textColor,
                },
                grid: {
                    vertLines: { color: settings.gridColor },
                    horzLines: { color: settings.gridColor },
                },
            });
        }
        if (candlestickSeries.current) {
            candlestickSeries.current.applyOptions(candleSeriesOptions);
        }
        const linePriceFormat = {
            type: 'price',
            precision: pricePrecision,
            minMove,
        };
        pythonIndicatorSeries.current.forEach(series => series.applyOptions({ priceFormat: linePriceFormat }));
        drawAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        settings.upColor,
        settings.downColor,
        settings.showBody,
        settings.showBorders,
        settings.showWicks,
        settings.backgroundColor,
        settings.gridColor,
        settings.textColor,
        pricePrecision,
        minMove
    ]);

    useEffect(() => {
        if (!chartInstance.current) return;
        const activeKeys = new Set();
        pythonIndicators.forEach(instanceResult => {
            const instance = pythonIndicatorInstances.find(item => item.instance_id === instanceResult.instance_id);
            (instanceResult.result?.plots || []).forEach(plot => {
                if (plot.type !== 'line') return;
                const key = `${instanceResult.instance_id}:${plot.id}`;
                activeKeys.add(key);
                let series = pythonIndicatorSeries.current.get(key);
                if (!series) {
                    series = chartInstance.current.addLineSeries({
                        color: plot.color || '#ffd700', lineWidth: plot.line_width || 2,
                        title: plot.name || instanceResult.indicator_id,
                        priceFormat: { type: 'price', precision: pricePrecision, minMove },
                    });
                    pythonIndicatorSeries.current.set(key, series);
                }
                series.applyOptions({
                    color: plot.color || '#ffd700', lineWidth: plot.line_width || 2,
                    title: plot.name || instanceResult.indicator_id, visible: instance?.visible !== false,
                });
                series.setData(plot.data || []);
            });
        });
        pythonIndicatorSeries.current.forEach((series, key) => {
            if (!activeKeys.has(key)) {
                chartInstance.current.removeSeries(series);
                pythonIndicatorSeries.current.delete(key);
            }
        });
        drawAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pythonIndicators, pythonIndicatorInstances, pricePrecision, minMove]);

    // Disable chart panning when drawing or dragging
    useEffect(() => {
        if (chartInstance.current) {
            const isDrawingToolActive = activeTool && activeTool !== 'cursor';
            const isActivelyDragging = !!dragState;
            const isActivelyDrawing = drawingState.isDrawing;
            const shouldDisablePan = isDrawingToolActive || isActivelyDragging || isActivelyDrawing;
            
            chartInstance.current.applyOptions({
                handleScroll: {
                    pressedMouseMove: !shouldDisablePan,
                    horzTouchDrag: !shouldDisablePan,
                    vertTouchDrag: !shouldDisablePan,
                },
                handleScale: {
                    axisPressedMouseMove: !shouldDisablePan,
                }
            });
        }
    }, [activeTool, dragState, drawingState.isDrawing]);

	    const prevSymbolRef = useRef(activeSymbol);
    const prevTimeframeRef = useRef(timeframe);

    // Update data when it changes
    useEffect(() => {
        if (candlestickSeries.current && data && data.length > 0) {
            const timeScale = chartInstance.current?.timeScale();
            let prevTimeRange = null;
            if (timeScale) {
                const logicalRange = timeScale.getVisibleLogicalRange();
                // If user is scrolled left, preserve their time-based scroll position
                if (logicalRange && logicalRange.to < data.length - 2) {
                    prevTimeRange = timeScale.getVisibleRange();
                }
            }

            const hasSymbolChanged = prevSymbolRef.current !== activeSymbol;
            const hasTimeframeChanged = prevTimeframeRef.current !== timeframe;
            prevSymbolRef.current = activeSymbol;
            prevTimeframeRef.current = timeframe;

            // Single replay candles are already applied by updateCandle.
            if (data.length !== prevDataLengthRef.current + 1 || hasSymbolChanged || hasTimeframeChanged) {
                candlestickSeries.current.setData(data);
            }

            prevDataLengthRef.current = data.length;
            
            if (timeScale && prevTimeRange && prevTimeRange.from && prevTimeRange.to) {
                timeScale.setVisibleRange(prevTimeRange);
            }

            drawAll();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, activeSymbol, timeframe]);

    // Render Systematic Backtest Markers
    useEffect(() => {
        if (!candlestickSeries.current) return;
        if (!showStrategyTrades || !systematicTrades || systematicTrades.length === 0) {
            candlestickSeries.current.setMarkers([]);
            return;
        }

        const markers = [];
        systematicTrades.forEach(trade => {
            if (trade.entry_time) {
                markers.push({
                    time: trade.entry_time,
                    position: trade.direction === 'BUY' ? 'belowBar' : 'aboveBar',
                    color: trade.direction === 'BUY' ? '#26a69a' : '#ef5350',
                    shape: trade.direction === 'BUY' ? 'arrowUp' : 'arrowDown',
                    text: `${trade.direction === 'BUY' ? 'Long' : 'Short'} Entry`,
                    size: 1.5
                });
            }
            if (trade.exit_time) {
                markers.push({
                    time: trade.exit_time,
                    position: trade.direction === 'BUY' ? 'aboveBar' : 'belowBar',
                    color: trade.pnl >= 0 ? '#26a69a' : '#ef5350',
                    shape: 'circle',
                    text: `Exit ($${Math.round(trade.pnl)})`,
                    size: 1.2
                });
            }
        });

        const lastTime = data && data.length > 0 ? data[data.length - 1].time : 0;
        
        // 1. Filter out future markers and snap to existing data times
        const snappedMarkers = markers
            .filter(m => m.time <= lastTime)
            .map(m => {
                let snappedTime = m.time;
                if (data && data.length > 0) {
                    // Binary search or simple linear scan for nearest time
                    let nearest = data[0].time;
                    let minDiff = Math.abs(m.time - nearest);
                    for (let i = 1; i < data.length; i++) {
                        const diff = Math.abs(m.time - data[i].time);
                        if (diff < minDiff) {
                            minDiff = diff;
                            nearest = data[i].time;
                        } else if (diff > minDiff) {
                            break; // Data is sorted ascending
                        }
                    }
                    snappedTime = nearest;
                }
                return { ...m, time: snappedTime };
            })
            .sort((a, b) => a.time - b.time);
            
        // 2. Deduplicate markers sharing the exact same timestamp
        const validMarkers = [];
        const seenTimes = new Set();
        snappedMarkers.forEach(m => {
            if (!seenTimes.has(m.time)) {
                seenTimes.add(m.time);
                validMarkers.push(m);
            }
        });
            
        try {
            candlestickSeries.current.setMarkers(validMarkers);
        } catch (e) {
            console.error("Error setting markers:", e);
        }
    }, [systematicTrades, showStrategyTrades, data]);

    // Redraw on updates
    useEffect(() => {
        drawAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drawings, positions, pendingOrders, drawingState, selectedId, hoverBarX, isSelectingStartBar, hoverState, localDraggedDrawing, plannedOrder, reviewingTrade]);

    useImperativeHandle(ref, () => ({
        updateCandle: (candle) => {
            if (candlestickSeries.current) {
                candlestickSeries.current.update(candle);
                drawAll();
            }
        },
        captureScreenshot: () => {
            if (!chartInstance.current || !canvasRef.current) return null;
            
            // Get base lightweight-charts canvas image
            const lwCanvas = chartInstance.current.takeScreenshot();
            
            // Create a merged canvas
            const mergedCanvas = document.createElement('canvas');
            mergedCanvas.width = lwCanvas.width;
            mergedCanvas.height = lwCanvas.height;
            const ctx = mergedCanvas.getContext('2d');
            
            // Draw lightweight charts
            ctx.drawImage(lwCanvas, 0, 0);
            
            // Draw custom drawings overlay
            ctx.drawImage(canvasRef.current, 0, 0);
            
            return mergedCanvas.toDataURL('image/png');
        }
    }));

    // Mouse Interaction Handlers
    const handleMouseDown = (e) => {
        const coords = getCanvasCoords(e.clientX, e.clientY);
        if (!coords) return;

        if (isSelectingStartBar) {
            const chartCoords = getChartCoords(coords.x, coords.y);
            if (chartCoords && chartCoords.time) {
                onSelectStartBar(chartCoords.time);
            }
            return;
        }

        if (activeTool && activeTool !== 'cursor') {
            const chartCoords = getChartCoords(coords.x, coords.y);
            if (!chartCoords || chartCoords.time === null || chartCoords.price === null) return;

            if (activeTool === 'horizontal' || activeTool === 'horizontal_ray' || activeTool === 'vertical_ray') {
                onAddDrawing({
                    id: String(Date.now()),
                    type: activeTool,
                    p1: { time: chartCoords.time, price: chartCoords.price }
                });
                return;
            }

            if (activeTool === 'path') {
                if (!drawingState.isDrawing) {
                    setDrawingState({
                        isDrawing: true,
                        points: [{ time: chartCoords.time, price: chartCoords.price }],
                        currentPoint: { time: chartCoords.time, price: chartCoords.price }
                    });
                } else {
                    setDrawingState(prev => ({
                        ...prev,
                        points: [...prev.points, { time: chartCoords.time, price: chartCoords.price }],
                        currentPoint: { time: chartCoords.time, price: chartCoords.price }
                    }));
                }
                return;
            }

            setDrawingState({
                isDrawing: true,
                startPoint: { time: chartCoords.time, price: chartCoords.price },
                currentPoint: { time: chartCoords.time, price: chartCoords.price }
            });
            return;
        }

        if (hoverState) {
            const chartCoords = getChartCoords(coords.x, coords.y);
            if (['sl', 'tp', 'limit', 'pendingSl', 'pendingTp', 'plannedEntry', 'plannedSl', 'plannedTp'].includes(hoverState.type)) {
                // Dragging trade levels
                setDragState({
                    type: hoverState.type,
                    id: hoverState.positionId || hoverState.pendingOrderId,
                    startPrice: chartCoords.price
                });
                return;
            }

            const drawing = drawings.find(d => d.id === hoverState.drawingId);
            if (!drawing) return;

            setSelectedId(drawing.id);
            
            setDragState({
                type: hoverState.type,
                drawingId: drawing.id,
                startP1: drawing.p1 ? { ...drawing.p1 } : null,
                startP2: drawing.p2 ? { ...drawing.p2 } : null,
                startP3: drawing.p3 ? { ...drawing.p3 } : null,
                startPoints: drawing.points ? drawing.points.map(pt => ({ ...pt })) : null,
                startPrice: chartCoords.price,
                startTime: chartCoords.time
            });
        } else {
            setSelectedId(null);
        }
    };

    const handleMouseMove = (e) => {
        const coords = getCanvasCoords(e.clientX, e.clientY);
        if (!coords) return;

        if (isSelectingStartBar) {
            setHoverBarX(coords.x);
            return;
        }

        if (drawingState.isDrawing) {
            const chartCoords = getChartCoords(coords.x, coords.y);
            if (!chartCoords || chartCoords.time === null || chartCoords.price === null) return;

            setDrawingState(prev => ({
                ...prev,
                currentPoint: { time: chartCoords.time, price: chartCoords.price }
            }));
            return;
        }

        if (dragState) {
            const chartCoords = getChartCoords(coords.x, coords.y);
            if (!chartCoords) return;
 
            if (['sl', 'tp', 'limit', 'pendingSl', 'pendingTp'].includes(dragState.type)) {
                // Call callback to update SL/TP/Limit order in parent state
                onDragUpdateLine(dragState.type, dragState.id, chartCoords.price);
                return;
            }

            if (['plannedEntry', 'plannedSl', 'plannedTp'].includes(dragState.type) && plannedOrder) {
                const newPrice = chartCoords.price;
                const currentPriceVal = data && data.length > 0 ? data[data.length - 1].close : 0;
                const entryPrice = plannedOrder.limitPrice || currentPriceVal;
                const isBuy = plannedOrder.direction === 'BUY';

                if (dragState.type === 'plannedEntry') {
                    onUpdatePlannedOrder({ limitPrice: newPrice });
                } else if (dragState.type === 'plannedSl') {
                    const diff = isBuy ? (entryPrice - newPrice) : (newPrice - entryPrice);
                    const pips = Math.max(1, Math.round(diff * 10));
                    onUpdatePlannedOrder({ slPips: pips });
                } else if (dragState.type === 'plannedTp') {
                    const diff = isBuy ? (newPrice - entryPrice) : (entryPrice - newPrice);
                    const pips = Math.max(1, Math.round(diff * 10));
                    onUpdatePlannedOrder({ tpPips: pips });
                }
                return;
            }

            const deltaPrice = chartCoords.price - dragState.startPrice;
            const deltaTime = chartCoords.time - dragState.startTime;

            const drawing = drawings.find(d => d.id === dragState.drawingId);
            if (!drawing) return;

            let updatedDrawing = { ...drawing };

            if (dragState.type === 'p1') {
                updatedDrawing.p1 = {
                    time: dragState.startP1.time + deltaTime,
                    price: dragState.startP1.price + deltaPrice
                };
            } else if (dragState.type === 'p2' && updatedDrawing.p2) {
                updatedDrawing.p2 = {
                    time: dragState.startP2.time + deltaTime,
                    price: dragState.startP2.price + deltaPrice
                };
            } else if (dragState.type === 'p2_width' && updatedDrawing.p2) {
                updatedDrawing.p2 = {
                    ...updatedDrawing.p2,
                    time: dragState.startP2.time + deltaTime
                };
            } else if (dragState.type === 'p3') {
                if (!updatedDrawing.p3) {
                    const slPrice = updatedDrawing.p2.price;
                    const isLong = (updatedDrawing.style && updatedDrawing.style.isLong !== undefined) ? updatedDrawing.style.isLong : (updatedDrawing.p2.price < updatedDrawing.p1.price);
                    const tpPrice = isLong ? updatedDrawing.p1.price + Math.abs(updatedDrawing.p1.price - slPrice) * 2 : updatedDrawing.p1.price - Math.abs(updatedDrawing.p1.price - slPrice) * 2;
                    updatedDrawing.p3 = { time: updatedDrawing.p1.time, price: tpPrice };
                }
                const startP3 = dragState.startP3 || { time: updatedDrawing.p1.time, price: updatedDrawing.p3.price };
                updatedDrawing.p3 = {
                    time: startP3.time + deltaTime,
                    price: startP3.price + deltaPrice
                };
            } else if (dragState.type.startsWith('path_point_')) {
                const ptIndex = parseInt(dragState.type.split('_')[2]);
                if (updatedDrawing.points && updatedDrawing.points[ptIndex] && dragState.startPoints && dragState.startPoints[ptIndex]) {
                    const updatedPoints = [...updatedDrawing.points];
                    const startPt = dragState.startPoints[ptIndex];
                    updatedPoints[ptIndex] = {
                        time: startPt.time + deltaTime,
                        price: startPt.price + deltaPrice
                    };
                    updatedDrawing.points = updatedPoints;
                }
            } else if (dragState.type === 'line' || dragState.type === 'area') {
                if (updatedDrawing.type === 'path' && updatedDrawing.points && dragState.startPoints) {
                    updatedDrawing.points = updatedDrawing.points.map((pt, j) => {
                        const startPt = dragState.startPoints[j];
                        return {
                            time: startPt.time + deltaTime,
                            price: startPt.price + deltaPrice
                        };
                    });
                } else {
                    if (updatedDrawing.p1 && dragState.startP1) {
                        updatedDrawing.p1 = {
                            time: dragState.startP1.time + deltaTime,
                            price: dragState.startP1.price + deltaPrice
                        };
                    }
                    if (updatedDrawing.p2 && dragState.startP2) {
                        updatedDrawing.p2 = {
                            time: dragState.startP2.time + deltaTime,
                            price: dragState.startP2.price + deltaPrice
                        };
                    }
                    if (updatedDrawing.type === 'risk_reward') {
                        if (updatedDrawing.p3 || dragState.startP3) {
                            const startP3 = dragState.startP3 || { time: dragState.startP1.time, price: updatedDrawing.p1.price + Math.abs(updatedDrawing.p1.price - updatedDrawing.p2.price) * 2.0 };
                            updatedDrawing.p3 = {
                                time: startP3.time + deltaTime,
                                price: startP3.price + deltaPrice
                            };
                        }
                    }
                }
            }

            // Local state updates instantly
            setLocalDraggedDrawing(updatedDrawing);
            return;
        }

        const hover = detectHover(coords.x, coords.y);
        setHoverState(hover);

        if (hover) {
            if (hover.type === 'p1' || hover.type === 'p2' || hover.type === 'p3' || hover.type?.startsWith('path_point_')) {
                setInteractionCursor('nwse-resize');
            } else if (['sl', 'tp', 'limit', 'pendingSl', 'pendingTp', 'plannedEntry', 'plannedSl', 'plannedTp'].includes(hover.type)) {
                setInteractionCursor('ns-resize');
            } else {
                setInteractionCursor('move');
            }
        } else if (activeTool && activeTool !== 'cursor') {
            setInteractionCursor('crosshair');
        } else {
            setInteractionCursor('default');
        }
    };

    const handleMouseUp = (e) => {
        if (drawingState.isDrawing) {
            if (activeTool === 'path') {
                return; // Let double click handle completing the path tool
            }
            const coords = getCanvasCoords(e.clientX, e.clientY);
            if (coords) {
                const chartCoords = getChartCoords(coords.x, coords.y);
                if (chartCoords && chartCoords.time && chartCoords.price) {
                    const p1 = drawingState.startPoint;
                    const p2 = { time: chartCoords.time, price: chartCoords.price };
                    let extraProps = {};
                    if (activeTool === 'risk_reward') {
                        const isLong = p2.price < p1.price;
                        extraProps.p3 = {
                            time: p1.time,
                            price: isLong ? p1.price + Math.abs(p1.price - p2.price) * 2 : p1.price - Math.abs(p1.price - p2.price) * 2
                        };
                    }
                    onAddDrawing({
                        id: String(Date.now()),
                        type: activeTool,
                        p1: p1,
                        p2: p2,
                        ...extraProps
                    });
                }
            }
            setDrawingState({ isDrawing: false, startPoint: null, currentPoint: null });
            return;
        }
        
        if (dragState) {
            const coords = getCanvasCoords(e.clientX, e.clientY);
            if (coords) {
                const chartCoords = getChartCoords(coords.x, coords.y);
                if (chartCoords) {
                    if (['sl', 'tp', 'limit', 'pendingSl', 'pendingTp'].includes(dragState.type)) {
                        // Drag end line calls database persistence
                        onDragEndLine(dragState.type, dragState.id, chartCoords.price);
                    } else if (dragState.drawingId) {
                        if (localDraggedDrawing) {
                            // Send final coordinates to database
                            onUpdateDrawing(localDraggedDrawing, true);
                        }
                    }
                }
            }
            setDragState(null);
            setLocalDraggedDrawing(null);
        }
    };

    const handleDoubleClick = () => {
        if (activeTool === 'path' && drawingState.isDrawing && drawingState.points && drawingState.points.length > 1) {
            onAddDrawing({
                id: String(Date.now()),
                type: 'path',
                points: drawingState.points
            });
            setDrawingState({ isDrawing: false, startPoint: null, currentPoint: null, points: null });
        }
    };

    const handleMouseLeave = () => {
        setHoverState(null);
        setHoverBarX(null);
        setInteractionCursor('default');
    };

    return (
        <div 
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onDoubleClick={handleDoubleClick}
            style={{ position: 'relative', width: '100%', height: '100%', flex: 1, minHeight: 0, cursor: interactionCursor }}
        >
            {/* Chart Legend Box */}
            {activeValues && (
                <div style={{
                    position: 'absolute',
                    top: '12px',
                    left: '12px',
                    zIndex: 10,
                    backgroundColor: `${settings.backgroundColor}dd`,
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${settings.gridColor}`,
                    color: settings.textColor,
                    fontFamily: 'sans-serif',
                    fontSize: '11px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    pointerEvents: 'auto',
                    userSelect: 'none',
                    backdropFilter: 'blur(4px)',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
                }}>
                    {/* Header: Symbol / Timeframe */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', color: '#ffffff', marginBottom: '2px' }}>
                        <span>{cfg.displayName}</span>
                        <span style={{ backgroundColor: '#2b3139', padding: '1px 4px', borderRadius: '3px', fontSize: '9px', color: '#ffd700' }}>{timeframe || '1m'}</span>
                    </div>

                    {/* OHLC values */}
                    <div style={{ display: 'flex', gap: '8px', color: '#787b86', fontSize: '10px', marginBottom: '4px' }}>
                        <span>O <span style={{ color: activeValues.close >= activeValues.open ? settings.upColor : settings.downColor }}>{activeValues.open.toFixed(pricePrecision)}</span></span>
                        <span>H <span style={{ color: activeValues.close >= activeValues.open ? settings.upColor : settings.downColor }}>{activeValues.high.toFixed(pricePrecision)}</span></span>
                        <span>L <span style={{ color: activeValues.close >= activeValues.open ? settings.upColor : settings.downColor }}>{activeValues.low.toFixed(pricePrecision)}</span></span>
                        <span>C <span style={{ color: activeValues.close >= activeValues.open ? settings.upColor : settings.downColor }}>{activeValues.close.toFixed(pricePrecision)}</span></span>
                    </div>

                    {/* Indicators list */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid rgba(43, 49, 57, 0.3)', paddingTop: '4px' }}>
                        {/* Systematic Strategy (if active) */}
                        {systematicTrades && systematicTrades.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', borderTop: '1px solid rgba(43, 49, 57, 0.2)', paddingTop: '4px', marginTop: '2px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ color: '#ffd700', fontWeight: 'bold' }}>★</span>
                                    <span>Systematic Strategy Trades</span>
                                </div>
                                <button 
                                    onClick={() => setShowStrategyTrades(!showStrategyTrades)}
                                    style={{ background: 'none', border: 'none', color: showStrategyTrades ? '#d1d4dc' : '#787b86', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
                                    title={showStrategyTrades ? "Hide Strategy Markers" : "Show Strategy Markers"}
                                >
                                    {showStrategyTrades ? <Eye size={12} /> : <EyeOff size={12} />}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showMsbObMtf && msbObMtfData?.dashboard?.timeframes && (
                <div style={{
                    position: 'absolute', top: '12px', right: '72px', zIndex: 11,
                    background: `${settings.backgroundColor}ee`, border: `1px solid ${settings.gridColor}`,
                    borderRadius: '6px', overflow: 'hidden', color: settings.textColor,
                    font: '11px sans-serif', boxShadow: '0 4px 10px rgba(0,0,0,.3)'
                }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '62px 74px', fontWeight: 'bold', background: '#0b0f17' }}>
                        <span style={{ padding: '6px' }}>Timeframe</span><span style={{ padding: '6px' }}>Trend</span>
                    </div>
                    {msbObMtfData.dashboard.timeframes.map(row => (
                        <div key={row.timeframe} style={{ display: 'grid', gridTemplateColumns: '62px 74px', borderTop: `1px solid ${settings.gridColor}` }}>
                            <span style={{ padding: '5px 6px' }}>{row.timeframe}</span>
                            <span style={{ padding: '5px 6px', color: '#fff', background: row.trend === 1 ? '#15803d' : row.trend === -1 ? '#b91c1c' : '#4b5563' }}>{row.label}</span>
                        </div>
                    ))}
                    <div style={{ display: 'grid', gridTemplateColumns: '62px 74px', borderTop: `1px solid ${settings.gridColor}`, fontWeight: 'bold' }}>
                        <span style={{ padding: '6px' }}>Overall</span>
                        <span style={{ padding: '6px', color: '#fff', background: msbObMtfData.dashboard.bias === 'bullish' ? '#15803d' : msbObMtfData.dashboard.bias === 'bearish' ? '#b91c1c' : '#4b5563' }}>
                            {msbObMtfData.dashboard.bias.toUpperCase()}
                        </span>
                    </div>
                </div>
            )}

            {(() => {
                const item = pythonIndicators.find(result => {
                    const instance = pythonIndicatorInstances.find(candidate => candidate.instance_id === result.instance_id);
                    return instance?.visible !== false && result.result?.dashboard?.timeframes;
                });
                if (!item) return null;
                const dashboard = item.result.dashboard;
                return <div style={{ position: 'absolute', top: '12px', right: '72px', zIndex: 12, background: `${settings.backgroundColor}f2`, border: `1px solid ${settings.gridColor}`, borderRadius: '6px', overflow: 'hidden', color: settings.textColor, font: '11px sans-serif' }}>
                    <div style={{ padding: '6px 9px', fontWeight: 'bold', background: '#0b0f17' }}>Multi-Timeframe Bias</div>
                    {dashboard.timeframes.map(row => <div key={row.timeframe} style={{ display: 'grid', gridTemplateColumns: '55px 72px', borderTop: `1px solid ${settings.gridColor}` }}><span style={{ padding: '5px' }}>{row.timeframe}</span><span style={{ padding: '5px', color: '#fff', background: row.trend === 1 ? '#15803d' : row.trend === -1 ? '#b91c1c' : '#4b5563' }}>{row.label}</span></div>)}
                    <div style={{ padding: '6px', fontWeight: 'bold', color: '#fff', background: dashboard.bias === 'bullish' ? '#15803d' : dashboard.bias === 'bearish' ? '#b91c1c' : '#4b5563' }}>{dashboard.bias.toUpperCase()}</div>
                </div>;
            })()}

            <div 
                ref={chartContainerRef} 
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />
            <canvas
                ref={canvasRef}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    zIndex: 10,
                }}
            />

            {/* Chart Control Buttons overlay (Zoom/Scroll/Go to Latest) */}
            <div style={{
                position: 'absolute',
                bottom: '15px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: '8px',
                zIndex: 25,
                backgroundColor: '#1e222d',
                border: '1px solid #434651',
                borderRadius: '6px',
                padding: '4px 6px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
            }}>
                <button
                    onClick={() => chartInstance.current?.timeScale().zoomOut()}
                    title="Zoom Out (-)"
                    style={{
                        backgroundColor: '#2b3139',
                        border: '1px solid #434651',
                        borderRadius: '4px',
                        color: '#d1d4dc',
                        width: '28px',
                        height: '28px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        outline: 'none'
                    }}
                >
                    <ZoomOut size={15} />
                </button>
                <button
                    onClick={() => chartInstance.current?.timeScale().zoomIn()}
                    title="Zoom In (+)"
                    style={{
                        backgroundColor: '#2b3139',
                        border: '1px solid #434651',
                        borderRadius: '4px',
                        color: '#d1d4dc',
                        width: '28px',
                        height: '28px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        outline: 'none'
                    }}
                >
                    <ZoomIn size={15} />
                </button>
                <button
                    onClick={() => {
                        const ts = chartInstance.current?.timeScale();
                        if (ts) {
                            const range = ts.getVisibleLogicalRange();
                            if (range) {
                                const shift = Math.round((range.to - range.from) * 0.15) || 5;
                                ts.setVisibleLogicalRange({
                                    from: range.from - shift,
                                    to: range.to - shift
                                });
                            }
                        }
                    }}
                    title="Scroll Left (<)"
                    style={{
                        backgroundColor: '#2b3139',
                        border: '1px solid #434651',
                        borderRadius: '4px',
                        color: '#d1d4dc',
                        width: '28px',
                        height: '28px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        outline: 'none'
                    }}
                >
                    <ChevronLeft size={15} />
                </button>
                <button
                    onClick={() => {
                        const ts = chartInstance.current?.timeScale();
                        if (ts) {
                            const range = ts.getVisibleLogicalRange();
                            if (range) {
                                const shift = Math.round((range.to - range.from) * 0.15) || 5;
                                ts.setVisibleLogicalRange({
                                    from: range.from + shift,
                                    to: range.to + shift
                                });
                            }
                        }
                    }}
                    title="Scroll Right (>)"
                    style={{
                        backgroundColor: '#2b3139',
                        border: '1px solid #434651',
                        borderRadius: '4px',
                        color: '#d1d4dc',
                        width: '28px',
                        height: '28px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        outline: 'none'
                    }}
                >
                    <ChevronRight size={15} />
                </button>
                <button
                    onClick={() => {
                        if (onGoToLatest) onGoToLatest();
                        chartInstance.current?.timeScale().scrollToRealTime();
                    }}
                    title="Get Back to Latest Available Data"
                    style={{
                        backgroundColor: '#2b3139',
                        border: '1px solid #434651',
                        borderRadius: '4px',
                        color: '#ffd700',
                        width: '28px',
                        height: '28px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        outline: 'none'
                    }}
                >
                    <RotateCcw size={15} />
                </button>
            </div>
            
            {/* Drawing Style Customization Toolbar Overlay */}
            {selectedId && (() => {
                const selectedDrawing = drawings.find(d => d.id === selectedId);
                if (!selectedDrawing) return null;
                
                const style = selectedDrawing.style || {};
                
                return (
                    <div 
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onPointerUp={(e) => e.stopPropagation()}
                        style={{
                            position: 'absolute',
                        top: '12px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        backgroundColor: 'rgba(30, 34, 45, 0.95)',
                        border: '1px solid #434651',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        zIndex: 100,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                        backdropFilter: 'blur(8px)',
                        color: '#d1d4dc',
                        fontSize: '12px'
                    }}>
                        <div style={{ fontWeight: 'bold', textTransform: 'capitalize' }}>
                            {selectedDrawing.type} Style:
                        </div>
                        
                        {/* Main Color Picker */}
                        {['trendline', 'horizontal', 'rectangle', 'fib'].includes(selectedDrawing.type) && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span>Color:</span>
                                <input 
                                    type="color"
                                    value={style.color || '#3b82f6'}
                                    onChange={(e) => {
                                        const updated = {
                                            ...selectedDrawing,
                                            style: { ...style, color: e.target.value }
                                        };
                                        onUpdateDrawing(updated, true);
                                    }}
                                    style={{ border: 'none', width: '22px', height: '22px', borderRadius: '4px', cursor: 'pointer', backgroundColor: 'transparent' }}
                                />
                            </div>
                        )}

                        {/* Fibonacci Retracement Levels toggles and adder */}
                        {selectedDrawing.type === 'fib' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>Levels:</span>
                                <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', maxWidth: '300px', paddingBottom: '2px' }}>
                                    {(style.fibLevels || [
                                        { lvl: 0, enabled: true },
                                        { lvl: 0.236, enabled: false },
                                        { lvl: 0.382, enabled: false },
                                        { lvl: 0.5, enabled: true },
                                        { lvl: 0.618, enabled: true },
                                        { lvl: 0.71, enabled: true },
                                        { lvl: 0.79, enabled: true },
                                        { lvl: 0.89, enabled: true },
                                        { lvl: 1.0, enabled: true }
                                    ]).map((item, idx, arr) => (
                                        <label key={item.lvl} style={{ display: 'flex', alignItems: 'center', gap: '2px', backgroundColor: 'rgba(255,255,255,0.06)', padding: '2px 4px', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', whiteSpace: 'nowrap' }}>
                                            <input 
                                                type="checkbox"
                                                checked={item.enabled !== false}
                                                onChange={(e) => {
                                                    const newLevels = arr.map(l => l.lvl === item.lvl ? { ...l, enabled: e.target.checked } : l);
                                                    onUpdateDrawing({
                                                        ...selectedDrawing,
                                                        style: { ...style, fibLevels: newLevels }
                                                    }, true);
                                                }}
                                                style={{ cursor: 'pointer', width: '10px', height: '10px' }}
                                            />
                                            {item.lvl}
                                        </label>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <input 
                                        id="custom-fib-input"
                                        type="number"
                                        step="0.001"
                                        placeholder="0.786"
                                        style={{ width: '50px', height: '20px', backgroundColor: '#131722', border: '1px solid #2b3139', color: '#ffffff', borderRadius: '4px', fontSize: '10px', padding: '0 4px' }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                const val = parseFloat(e.target.value);
                                                if (!isNaN(val)) {
                                                    const currentLevels = style.fibLevels || [
                                                        { lvl: 0, enabled: true },
                                                        { lvl: 0.236, enabled: false },
                                                        { lvl: 0.382, enabled: false },
                                                        { lvl: 0.5, enabled: true },
                                                        { lvl: 0.618, enabled: true },
                                                        { lvl: 0.71, enabled: true },
                                                        { lvl: 0.79, enabled: true },
                                                        { lvl: 0.89, enabled: true },
                                                        { lvl: 1.0, enabled: true }
                                                    ];
                                                    if (!currentLevels.some(l => l.lvl === val)) {
                                                        const newLevels = [...currentLevels, { lvl: val, enabled: true }].sort((a,b) => a.lvl - b.lvl);
                                                        onUpdateDrawing({
                                                            ...selectedDrawing,
                                                            style: { ...style, fibLevels: newLevels }
                                                        }, true);
                                                        e.target.value = '';
                                                    }
                                                }
                                            }
                                        }}
                                    />
                                    <button 
                                        onClick={() => {
                                            const input = document.getElementById('custom-fib-input');
                                            const val = parseFloat(input?.value);
                                            if (!isNaN(val)) {
                                                const currentLevels = style.fibLevels || [
                                                    { lvl: 0, enabled: true },
                                                    { lvl: 0.236, enabled: false },
                                                    { lvl: 0.382, enabled: false },
                                                    { lvl: 0.5, enabled: true },
                                                    { lvl: 0.618, enabled: true },
                                                    { lvl: 0.71, enabled: true },
                                                    { lvl: 0.79, enabled: true },
                                                    { lvl: 0.89, enabled: true },
                                                    { lvl: 1.0, enabled: true }
                                                ];
                                                if (!currentLevels.some(l => l.lvl === val)) {
                                                    const newLevels = [...currentLevels, { lvl: val, enabled: true }].sort((a,b) => a.lvl - b.lvl);
                                                    onUpdateDrawing({
                                                        ...selectedDrawing,
                                                        style: { ...style, fibLevels: newLevels }
                                                    }, true);
                                                    if (input) input.value = '';
                                                }
                                            }
                                        }}
                                        style={{ backgroundColor: '#3b82f6', border: 'none', color: '#ffffff', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Fills Opacity for Rectangle, Risk Reward & Fib */}
                        {['rectangle', 'risk_reward', 'fib'].includes(selectedDrawing.type) && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>Opacity:</span>
                                <input 
                                    type="range"
                                    min="0.05"
                                    max="0.80"
                                    step="0.05"
                                    value={style.opacity !== undefined ? style.opacity : 0.18}
                                    onChange={(e) => {
                                        const updated = {
                                            ...selectedDrawing,
                                            style: { ...style, opacity: parseFloat(e.target.value) }
                                        };
                                        onUpdateDrawing(updated, true);
                                    }}
                                    style={{ width: '60px', cursor: 'pointer' }}
                                />
                            </div>
                        )}

                        {/* Rectangle templates: Zone type and Timeframe toggle */}
                        {selectedDrawing.type === 'rectangle' && (
                            <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span>Zone:</span>
                                    <select
                                        value={style.zoneTemplate || ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            const updatedColor = {
                                                'sbs': '#9333ea',
                                                'rbs': '#f97316',
                                                'tjl': '#3b82f6',
                                                'a+': '#fbbf24'
                                            }[val] || style.color || '#3b82f6';
                                            const updated = {
                                                ...selectedDrawing,
                                                style: { 
                                                    ...style, 
                                                    zoneTemplate: val,
                                                    color: updatedColor
                                                }
                                            };
                                            onUpdateDrawing(updated, true);
                                        }}
                                        style={{ backgroundColor: '#2b3139', border: '1px solid #434651', color: '#fff', borderRadius: '4px', padding: '2px 4px', fontSize: '11px', outline: 'none' }}
                                    >
                                        <option value="">None</option>
                                        <option value="sbs">SBS</option>
                                        <option value="rbs">RBS</option>
                                        <option value="tjl">TJL</option>
                                        <option value="a+">A+</option>
                                    </select>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span>TF:</span>
                                    <div style={{ display: 'flex', gap: '2px', backgroundColor: '#131722', padding: '2px', borderRadius: '4px' }}>
                                        {['1m', '5m', '15m', '1h', '4h', '1d'].map(tf => {
                                            const isActive = style.timeframe === tf;
                                            return (
                                                <button
                                                    key={tf}
                                                    type="button"
                                                    onClick={() => {
                                                        const updated = {
                                                            ...selectedDrawing,
                                                            style: { ...style, timeframe: isActive ? '' : tf }
                                                        };
                                                        onUpdateDrawing(updated, true);
                                                    }}
                                                    style={{
                                                        background: isActive ? '#2962ff' : 'transparent',
                                                        color: isActive ? '#fff' : '#787b86',
                                                        border: 'none',
                                                        padding: '2px 5px',
                                                        borderRadius: '3px',
                                                        fontSize: '10px',
                                                        cursor: 'pointer',
                                                        fontWeight: isActive ? 'bold' : 'normal'
                                                    }}
                                                >
                                                    {tf}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </>
                        )}

                        {/* R:R specific settings */}
                        {selectedDrawing.type === 'risk_reward' && (
                            <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span>Target R:R:</span>
                                    <input 
                                        type="number"
                                        step="0.1"
                                        min="0.1"
                                        value={style.targetRR !== undefined ? style.targetRR : 2.0}
                                        onChange={(e) => {
                                            const val = Math.max(0.1, parseFloat(e.target.value) || 2.0);
                                            const updated = {
                                                ...selectedDrawing,
                                                style: { ...style, targetRR: val }
                                            };
                                            onUpdateDrawing(updated, true);
                                        }}
                                        style={{ width: '45px', backgroundColor: '#2b3139', border: '1px solid #434651', color: '#fff', borderRadius: '4px', padding: '2px 4px' }}
                                    />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span>Type:</span>
                                    <select
                                        value={style.isLong !== undefined ? (style.isLong ? 'long' : 'short') : (selectedDrawing.p2.price < selectedDrawing.p1.price ? 'long' : 'short')}
                                        onChange={(e) => {
                                            const updated = {
                                                ...selectedDrawing,
                                                style: { ...style, isLong: e.target.value === 'long' }
                                            };
                                            onUpdateDrawing(updated, true);
                                        }}
                                        style={{ backgroundColor: '#2b3139', border: '1px solid #434651', color: '#fff', borderRadius: '4px', padding: '2px 4px', fontSize: '11px' }}
                                    >
                                        <option value="long">Long</option>
                                        <option value="short">Short</option>
                                    </select>
                                </div>
                            </>
                        )}

                        {/* Delete Button */}
                        <button 
                            onClick={() => {
                                onDeleteDrawing(selectedId);
                                setSelectedId(null);
                            }}
                            style={{
                                backgroundColor: 'rgba(239, 83, 80, 0.2)',
                                color: '#ef5350',
                                border: 'none',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                fontSize: '11px'
                            }}
                        >
                            Delete
                        </button>
                    </div>
                );
            })()}
        </div>
    );
});

export default Chart;
