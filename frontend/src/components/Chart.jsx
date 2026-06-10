import { useEffect, useRef, useImperativeHandle, forwardRef, useState, useMemo } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import { ZoomIn, ZoomOut, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';

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
    showSessions
}, ref) => {
    const chartContainerRef = useRef(null);
    const canvasRef = useRef(null);
    const chartInstance = useRef(null);
    const candlestickSeries = useRef(null);
    const ema9Series = useRef(null);
    const ema15Series = useRef(null);

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

    // Replay hover guides
    const [hoverBarX, setHoverBarX] = useState(null);

    // Drawing interaction states
    const [drawingState, setDrawingState] = useState({
        isDrawing: false,
        startPoint: null,
        currentPoint: null
    });

    const [selectedId, setSelectedId] = useState(null);
    const [hoverState, setHoverState] = useState(null); // { type: 'line'|'p1'|'p2'|'sl'|'tp'|'limit'|'pendingSl'|'pendingTp', drawingId|positionId|pendingOrderId }
    const [dragState, setDragState] = useState(null); 

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
        if (time === undefined || time === null || price === undefined || price === null || isNaN(price)) return null;
        const y = candlestickSeries.current.priceToCoordinate(price);
        let x = chartInstance.current.timeScale().timeToCoordinate(time);
        
        if (x === null && time !== null) {
            const metrics = getSpacingAndLastBar();
            if (metrics && time > metrics.lastTime) {
                const futureBars = (time - metrics.lastTime) / metrics.timeframeSeconds;
                x = metrics.lastX + futureBars * metrics.spacing;
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
                        const minX = Math.min(pt1.x, pt2.x);
                        const maxX = Math.max(pt1.x, pt2.x);
                        const minY = Math.min(pt1.y, pt2.y);
                        const maxY = Math.max(pt1.y, pt2.y);
                        
                        const nearLeft = Math.abs(x - minX) < 6 && y >= minY && y <= maxY;
                        const nearRight = Math.abs(x - maxX) < 6 && y >= minY && y <= maxY;
                        const nearTop = Math.abs(y - minY) < 6 && x >= minX && x <= maxX;
                        const nearBottom = Math.abs(y - maxY) < 6 && x >= minX && x <= maxX;
                        
                        if (nearLeft || nearRight || nearTop || nearBottom) {
                            return { drawingId: d.id, type: 'line' };
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
                    ctx.fillText(`Limit Order (Drag): ${order.entryPrice.toFixed(2)}`, 10, entryY - 4);
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
                        ctx.fillText(`Limit SL (Drag): ${order.sl.toFixed(2)}`, 10, slY - 4);
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
                        ctx.fillText(`Limit TP (Drag): ${order.tp.toFixed(2)}`, 10, tpY - 4);
                    }
                }
            });
        }

        // Draw active positions SL/TP levels
        if (positions && positions.length > 0 && candlestickSeries.current) {
            const currentPrice = data && data.length > 0 ? data[data.length - 1].close : 0;

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
                ctx.textAlign = 'left'; // Reset to default
            };

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
                    
                    const pnl = (isBuy ? (currentPrice - pos.entryPrice) : (pos.entryPrice - currentPrice)) * pos.lots * 100;
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

                        const slPnl = (isBuy ? (pos.sl - pos.entryPrice) : (pos.entryPrice - pos.sl)) * pos.lots * 100;
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

                        const tpPnl = (isBuy ? (pos.tp - pos.entryPrice) : (pos.entryPrice - pos.tp)) * pos.lots * 100;
                        const badgeText = `${pos.lots.toFixed(2)} | ${tpPnl >= 0 ? '+' : ''}${tpPnl.toFixed(2)} USD`;
                        drawBadge(badgeText, tpY, '#26a69a', '#ffffff');
                    }
                }
            });
        }

        // Draw finalized drawings
        if (drawings) {
            drawings.forEach(d => {
                const isSelected = selectedId === d.id;
                drawShape(ctx, d, isSelected);
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
        } else if (type === 'fib') {
            const priceDiff = pt2.y - pt1.y;
            const priceValDiff = p2.price - p1.price;
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
            
            fibLevels.forEach(item => {
                if (item.enabled === false) return;
                const lvl = item.lvl;
                const y = pt1.y + priceDiff * lvl;
                const lvlPrice = p1.price + priceValDiff * lvl;
                
                ctx.beginPath();
                ctx.moveTo(Math.min(pt1.x, pt2.x), y);
                ctx.lineTo(Math.max(pt1.x, pt2.x), y);
                
                const drawColor = item.color || style.color || '#3b82f6';
                ctx.strokeStyle = isSelected ? '#ffffff' : drawColor;
                ctx.lineWidth = lineWidth;
                ctx.stroke();

                ctx.fillStyle = isSelected ? '#ffffff' : drawColor;
                ctx.font = '10px sans-serif';
                ctx.fillText(`${(lvl * 100).toFixed(1)}% (${lvlPrice.toFixed(2)})`, Math.min(pt1.x, pt2.x) + 5, y - 4);
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
            
            const textLine1 = `${isUp ? '+' : ''}${priceDiffVal.toFixed(2)} USD (${isUp ? '+' : ''}${percent}%)`;
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

            if (slPt && tpPt) {
                // Target Zone
                ctx.beginPath();
                ctx.rect(pt1.x, Math.min(pt1.y, tpPt.y), pt2.x - pt1.x, Math.abs(pt1.y - tpPt.y));
                ctx.fillStyle = hexToRgba(style.tpColor || '#26a69a', opacity);
                ctx.fill();
                ctx.strokeStyle = isSelected ? '#ffffff' : (style.tpColor || '#26a69a');
                ctx.stroke();

                // Stop Loss Zone
                ctx.beginPath();
                ctx.rect(pt1.x, Math.min(pt1.y, slPt.y), pt2.x - pt1.x, Math.abs(pt1.y - slPt.y));
                ctx.fillStyle = hexToRgba(style.slColor || '#ef5350', opacity);
                ctx.fill();
                ctx.strokeStyle = isSelected ? '#ffffff' : (style.slColor || '#ef5350');
                ctx.stroke();

                // Details Text
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 11px sans-serif';
                ctx.fillText(`Target (TP): ${tpPrice.toFixed(2)}`, pt1.x + 5, Math.min(pt1.y, tpPt.y) + 14);
                ctx.fillText(`Risk (SL): ${slPrice.toFixed(2)}`, pt1.x + 5, Math.max(pt1.y, slPt.y) - 6);

                // Dynamic R:R calculation
                const riskVal = Math.abs(p1.price - slPrice);
                const rewardVal = Math.abs(tpPrice - p1.price);
                const targetRR = riskVal > 0 ? rewardVal / riskVal : 0;

                const midX = pt1.x + (pt2.x - pt1.x) / 2;
                const midY = pt1.y;
                ctx.fillStyle = 'rgba(30, 34, 45, 0.95)';
                ctx.strokeStyle = '#434651';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.roundRect(midX - 55, midY - 12, 110, 24, 4);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.font = 'bold 11px sans-serif';
                ctx.fillText(`R:R Ratio: ${targetRR.toFixed(2)}`, midX, midY + 4);
                ctx.textAlign = 'left';
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
                        ctx.fillText(`VAH: ${vahPrice.toFixed(2)}`, pt1.x + 5, vahY - 3);
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
                        ctx.fillText(`VAL: ${valPrice.toFixed(2)}`, pt1.x + 5, valY - 3);
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
                        ctx.fillText(`POC: ${pocPrice.toFixed(2)}`, pt1.x + 5, pocY - 3);
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
                drawAnchor(ctx, pt2.x, pt1.y, isWidthHovered);
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

        const chart = createChart(chartContainerRef.current, {
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
            layout: {
                background: { color: '#131722' },
                textColor: '#d1d4dc',
            },
            grid: {
                vertLines: { color: '#1f2933' },
                horzLines: { color: '#1f2933' },
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
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: false,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
        });
        
        candlestickSeries.current = series;

        const e9 = chart.addLineSeries({
            color: 'rgba(255, 82, 82, 0.1)',
            lineWidth: 1.5,
            title: '9 EMA',
        });
        ema9Series.current = e9;

        const e15 = chart.addLineSeries({
            color: 'rgba(33, 150, 243, 0.1)',
            lineWidth: 1.5,
            title: '15 EMA',
        });
        ema15Series.current = e15;

        if (data && data.length > 0) {
            series.setData(data);
        }

        if (canvasRef.current) {
            canvasRef.current.width = chartContainerRef.current.clientWidth;
            canvasRef.current.height = chartContainerRef.current.clientHeight;
        }

        const handleTimeScaleChange = () => {
            if (drawAllRef.current) drawAllRef.current();
        };

        chart.timeScale().subscribeVisibleLogicalRangeChange(handleTimeScaleChange);
        chart.timeScale().subscribeVisibleTimeRangeChange(handleTimeScaleChange);

        window.addEventListener('resize', handleResize);

        const handleKeyDown = (e) => {
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

            candlestickSeries.current.setData(data);
            
            if (ema9Series.current) {
                const ema9Data = calculateEMA(data, 9);
                ema9Series.current.setData(ema9Data);
            }
            if (ema15Series.current) {
                const ema15Data = calculateEMA(data, 15);
                ema15Series.current.setData(ema15Data);
            }
            
            if (timeScale && prevTimeRange && prevTimeRange.from && prevTimeRange.to) {
                timeScale.setVisibleRange(prevTimeRange);
            }

            drawAll();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]);

    // Redraw on updates
    useEffect(() => {
        drawAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drawings, positions, pendingOrders, drawingState, selectedId, hoverBarX, isSelectingStartBar, hoverState]);

    useImperativeHandle(ref, () => ({
        updateCandle: (candle) => {
            if (candlestickSeries.current) {
                candlestickSeries.current.update(candle);
                drawAll();
            }
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
            if (['sl', 'tp', 'limit', 'pendingSl', 'pendingTp'].includes(hoverState.type)) {
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
            
            // Pass-through click to the chart underneath for panning
            if (canvasRef.current) {
                canvasRef.current.style.pointerEvents = 'none';
                
                // Programmatically dispatch mousedown to the element below
                const elBelow = document.elementFromPoint(e.clientX, e.clientY);
                if (elBelow) {
                    const passEvent = new MouseEvent('mousedown', {
                        bubbles: true,
                        cancelable: true,
                        clientX: e.clientX,
                        clientY: e.clientY,
                        screenX: e.screenX,
                        screenY: e.screenY,
                        button: e.button,
                        buttons: e.buttons
                    });
                    elBelow.dispatchEvent(passEvent);
                }

                // Restore pointerEvents: 'auto' on mouseup
                const handleGlobalMouseUp = () => {
                    if (canvasRef.current) {
                        canvasRef.current.style.pointerEvents = 'auto';
                    }
                    window.removeEventListener('mouseup', handleGlobalMouseUp);
                };
                window.addEventListener('mouseup', handleGlobalMouseUp);
            }
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
            } else if (dragState.type === 'line') {
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
            onUpdateDrawing(updatedDrawing, false);
            return;
        }

        if (activeTool === 'cursor') {
            const hover = detectHover(coords.x, coords.y);
            setHoverState(hover);
            
            if (canvasRef.current) {
                if (hover) {
                    if (hover.type === 'p1' || hover.type === 'p2') {
                        canvasRef.current.style.cursor = 'crosshair';
                    } else if (['sl', 'tp', 'limit', 'pendingSl', 'pendingTp'].includes(hover.type)) {
                        canvasRef.current.style.cursor = 'ns-resize';
                    } else {
                        canvasRef.current.style.cursor = 'move';
                    }
                } else {
                    canvasRef.current.style.cursor = 'default';
                    // Forward event to lightweight-charts below to enable native crosshair and tooltips
                    canvasRef.current.style.pointerEvents = 'none';
                    const elBelow = document.elementFromPoint(e.clientX, e.clientY);
                    if (elBelow) {
                        const passEvent = new MouseEvent('mousemove', {
                            bubbles: true,
                            cancelable: true,
                            clientX: e.clientX,
                            clientY: e.clientY,
                            movementX: e.movementX,
                            movementY: e.movementY,
                            buttons: e.buttons
                        });
                        elBelow.dispatchEvent(passEvent);
                    }
                    canvasRef.current.style.pointerEvents = 'auto';
                }
            }
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
                    onAddDrawing({
                        id: String(Date.now()),
                        type: activeTool,
                        p1: drawingState.startPoint,
                        p2: { time: chartCoords.time, price: chartCoords.price }
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
                        const drawing = drawings.find(d => d.id === dragState.drawingId);
                        if (drawing) {
                            // Send final coordinates to database
                            onUpdateDrawing(drawing, true);
                        }
                    }
                }
            }
            setDragState(null);
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

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', flex: 1, minHeight: 0 }}>
            <div 
                ref={chartContainerRef} 
                style={{ width: '100%', height: '100%' }}
            />
            <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onDoubleClick={handleDoubleClick}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'auto',
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
                    <div style={{
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

                        {/* Fills Opacity for Rectangle & Risk Reward */}
                        {['rectangle', 'risk_reward'].includes(selectedDrawing.type) && (
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
