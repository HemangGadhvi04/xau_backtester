import { useEffect, useState } from 'react';
import axios from 'axios';
import { Play, Activity, ShieldAlert, Award } from 'lucide-react';

const API_BASE = '/api';

const SystematicTester = ({ onBacktestSuccess, onReviewTrade, activeSymbol }) => {
  const [strategy, setStrategy] = useState('ema_cross');
  const [selectedSymbol, setSelectedSymbol] = useState(activeSymbol || 'XAUUSD');
  const [initialBalance, setInitialBalance] = useState(10000);
  const [lots, setLots] = useState(0.1);
  const [isLotMode, setIsLotMode] = useState(false);
  const [riskPercent, setRiskPercent] = useState(1.0);
  const [slPips, setSlPips] = useState(20);
  const [tpPips, setTpPips] = useState(40);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [strictConfluences, setStrictConfluences] = useState(true);
  const [useRandomSlippage, setUseRandomSlippage] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [activeJobId, setActiveJobId] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [equityCurve, setEquityCurve] = useState([]);
  const [tradesList, setTradesList] = useState([]);
  const [error, setError] = useState(null);
  const [dateHint, setDateHint] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const loadDateHint = async () => {
      try {
        const res = await axios.get(`${API_BASE}/candles?symbol=${selectedSymbol}&timeframe=1d&limit=50000`);
        const candles = res.data.candles || [];
        if (!cancelled && candles.length > 0) {
          setDateHint({
            first: new Date(candles[0].time * 1000),
            last: new Date(candles[candles.length - 1].time * 1000)
          });
        }
      } catch {
        if (!cancelled) setDateHint(null);
      }
    };
    loadDateHint();
    return () => {
      cancelled = true;
    };
  }, [selectedSymbol]);

  const applyDatePreset = (days) => {
    if (!days) {
      setStartDate('');
      setEndDate('');
      return;
    }
    const end = dateHint?.last ? new Date(dateHint.last) : new Date();
    const start = new Date();
    start.setTime(end.getTime());
    start.setUTCDate(start.getUTCDate() - days);
    setStartDate(start.toISOString().slice(0, 10));
    setEndDate(end.toISOString().slice(0, 10));
  };

  const handleRunBacktest = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setMetrics(null);
    setEquityCurve([]);
    setTradesList([]);
    setLoadingProgress(0);
    setActiveJobId(null);

    try {
      const runRes = await axios.post(`${API_BASE}/backtest/run`, {
        strategy,
        symbol: selectedSymbol,
        lots: parseFloat(lots),
        sl_pips: parseInt(slPips),
        tp_pips: parseFloat(tpPips),
        start_date: startDate || null,
        end_date: endDate || null,
        strict_confluences: strictConfluences,
        use_random_slippage: useRandomSlippage,
        is_lot_mode: isLotMode,
        risk_percent: parseFloat(riskPercent),
        initial_balance: parseFloat(initialBalance)
      });
      
      const jobId = runRes.data.job_id;
      setActiveJobId(jobId);
      
      // Poll status
      while (true) {
        const statusRes = await axios.get(`${API_BASE}/backtest/status/${jobId}`);
        const job = statusRes.data;
        
        setLoadingProgress(job.progress || 0);
        
        if (job.status === 'completed') {
          setMetrics(job.result.metrics);
          setEquityCurve(job.result.equity_curve || []);
          setTradesList(job.result.trades || []);
          if (onBacktestSuccess) {
            onBacktestSuccess(job.result.trades || []);
          }
          break;
        } else if (job.status === 'failed') {
          throw new Error(job.error || "Backtest failed");
        }
        
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || "Network error. Make sure the backend is active.");
    } finally {
      setIsLoading(false);
      setActiveJobId(null);
    }
  };

  const handleCancel = async () => {
    if (activeJobId) {
      try {
        await axios.post(`${API_BASE}/backtest/cancel/${activeJobId}`);
        setIsLoading(false);
        setActiveJobId(null);
        setError("Backtest cancelled by user.");
      } catch (err) {
        console.error("Failed to cancel", err);
      }
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}><Activity size={20} style={{ marginRight: '8px', color: '#ffd700' }} /> Systematic Python Backtest Engine</h2>
        <span style={styles.subtext}>Run event-driven algorithmic backtests over historical candle data.</span>
      </div>

      <div style={styles.mainGrid}>
        {/* Settings Panel */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Strategy Configuration</h3>
          <form onSubmit={handleRunBacktest} style={styles.form}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Select Python Strategy</label>
              <select 
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
                style={styles.select}
              >
                <option value="tbm_7ema">7 EMA Final Boss Strategy (The Berlin Mindset - TBM)</option>
                <option value="ema_cross">Improved SMC + 9/15 EMA Pullback</option>
                <option value="trend_pullback">9/15 EMA Trend Pullback (Simple)</option>
                <option value="advanced_smc">Advanced SMC (QML/TJL2 + CISD) ⚠️ Lookahead</option>
                <option value="geometric_range">Geometric Range Grid (4.618 Fib)</option>

              </select>
            </div>

            {/* Strategy Entry Criteria Card */}
            <div style={{
                backgroundColor: '#1b1d24',
                border: '1px dashed #434651',
                borderRadius: '6px',
                padding: '10px 12px',
                marginBottom: '14px',
                fontSize: '11px',
                lineHeight: '1.4',
                color: '#b2b5be'
            }}>
                <div style={{ fontWeight: 'bold', color: '#ffd700', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Play size={10} style={{ transform: 'rotate(90deg)', color: '#ffd700' }} /> Strategy Rules & Entry Criteria:
                </div>
                {strategy === 'trend_pullback' && (
                    <ul style={{ paddingLeft: '14px', margin: 0, listStyleType: 'disc' }}>
                        <li><strong>Trend:</strong> Confirm direction with structural Fractal HH/HL (Bullish) or LL/LH (Bearish) and EMA slope (EMA 9 vs 15 crossover).</li>
                        <li><strong>Pullback:</strong> Candle low/high pulls back directly into the 9/15 EMA range zone.</li>
                        <li><strong>Trigger:</strong> Rejection candle closes within the zone (Bullish close for Buy, Bearish close for Sell).</li>
                        <li><strong>Execution:</strong> Buy/Sell Stop order placed 1 pip beyond the rejection candle's extreme.</li>
                        <li><strong>Risk/Reward:</strong> SL placed 2 pips beyond pullback extreme; TP targets previous swing extreme (min 1:2 R:R).</li>
                    </ul>
                )}
                {strategy === 'ema_cross' && (
                    <ul style={{ paddingLeft: '14px', margin: 0, listStyleType: 'disc' }}>
                        <li><strong>Liquidity Sweep:</strong> Detects swing high/low sweeps to mark key high probability setups.</li>
                        <li><strong>Confluence:</strong> Validates sweep rejection with a 9/15 EMA trend crossover direction match.</li>
                        <li><strong>SL/TP:</strong> Parametrized risk settings (default: 20 SL, 40 TP) dynamically scaled per position size.</li>
                    </ul>
                )}
                {strategy === 'advanced_smc' && (
                    <ul style={{ paddingLeft: '14px', margin: 0, listStyleType: 'disc' }}>
                        <li><strong>Structure:</strong> Maps QML (Quasimodo Level), TJL2 (A+ Key Level), and change-of-character (CISD).</li>
                        <li><strong>Execution:</strong> Places passive Limit entries at unmitigated high-probability order blocks.</li>
                        <li><em>Note: uses full historical context lookahead.</em></li>
                    </ul>
                )}
                {strategy === 'geometric_range' && (
                    <ul style={{ paddingLeft: '14px', margin: 0, listStyleType: 'disc' }}>
                        <li><strong>Anchor:</strong> Session range anchored daily at 22:00 UTC using PDH/PDL.</li>
                        <li><strong>Levels:</strong> Computes Fibonacci grid targets at +/- 50%, 75%, and 100% of grid unit.</li>
                        <li><strong>Grid Entry:</strong> Places 3 Body Retracement Limit orders (50%, 67%, 75%) upon close breakout.</li>
                    </ul>
                )}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Instrument Pair</label>
              <select 
                value={selectedSymbol}
                onChange={(e) => setSelectedSymbol(e.target.value)}
                style={styles.select}
              >
                <option value="XAUUSD">XAU/USD</option>
                <option value="EURUSD">EUR/USD</option>
                <option value="BTCUSD">BTC/USD</option>
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Account Balance ($)</label>
              <input 
                type="number"
                step="100"
                min="100"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                style={styles.input}
              />
            </div>

            <div style={{ ...styles.formGroup, backgroundColor: '#20232b', padding: '12px', borderRadius: '8px', border: '1px solid #434651' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ ...styles.label, marginBottom: 0 }}>Position Sizing</label>
                <div style={{ display: 'flex', gap: '8px', background: '#131722', padding: '2px', borderRadius: '6px' }}>
                  <button 
                    type="button"
                    onClick={() => setIsLotMode(false)}
                    style={{
                      background: !isLotMode ? '#2962ff' : 'transparent',
                      color: !isLotMode ? '#fff' : '#787b86',
                      border: 'none',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontWeight: !isLotMode ? 'bold' : 'normal',
                    }}
                  >
                    Risk %
                  </button>
                  <button 
                    type="button"
                    onClick={() => setIsLotMode(true)}
                    style={{
                      background: isLotMode ? '#2962ff' : 'transparent',
                      color: isLotMode ? '#fff' : '#787b86',
                      border: 'none',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontWeight: isLotMode ? 'bold' : 'normal',
                    }}
                  >
                    Fixed Lots
                  </button>
                </div>
              </div>
              
              {!isLotMode ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input 
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="100"
                      value={riskPercent}
                      onChange={(e) => setRiskPercent(e.target.value)}
                      style={{ ...styles.input, flex: 1 }}
                    />
                    <span style={{ color: '#d1d4dc', fontSize: '14px' }}>%</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#787b86', marginTop: '6px' }}>Calculates lots dynamically based on Stop Loss size.</div>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input 
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={lots}
                      onChange={(e) => setLots(e.target.value)}
                      style={{ ...styles.input, flex: 1 }}
                    />
                    <span style={{ color: '#d1d4dc', fontSize: '14px' }}>Lots</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#787b86', marginTop: '6px' }}>Static lot size for every trade.</div>
                </div>
              )}
            </div>

            <div style={styles.formRow}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Stop Loss (Pips)</label>
                <input 
                  type="number"
                  min="1"
                  value={slPips}
                  onChange={(e) => setSlPips(e.target.value)}
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Take Profit (Pips)</label>
                <input 
                  type="number"
                  min="1"
                  value={tpPips}
                  onChange={(e) => setTpPips(e.target.value)}
                  style={styles.input}
                />
              </div>
            </div>

            <div style={styles.formRow}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Start Date (Optional)</label>
                <input 
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>End Date (Optional)</label>
                <input 
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={styles.input}
                />
              </div>
            </div>

            <div style={{...styles.formGroup, flexDirection: 'row', alignItems: 'center', marginTop: '10px', gap: '8px'}}>
              <input 
                type="checkbox" 
                id="strict_conf"
                checked={strictConfluences}
                onChange={(e) => setStrictConfluences(e.target.checked)}
                style={{cursor: 'pointer'}}
              />
              <label htmlFor="strict_conf" style={{...styles.label, marginBottom: 0, cursor: 'pointer'}}>
                Strict SMC Confluences (EMA slope & Session Filters)
              </label>
            </div>

            <div style={{...styles.formGroup, flexDirection: 'row', alignItems: 'center', marginTop: '10px', gap: '8px'}}>
              <input 
                type="checkbox" 
                id="random_slip"
                checked={useRandomSlippage}
                onChange={(e) => setUseRandomSlippage(e.target.checked)}
                style={{cursor: 'pointer'}}
              />
              <label htmlFor="random_slip" style={{...styles.label, marginBottom: 0, cursor: 'pointer'}}>
                Use Randomized Slippage (Deselect for Deterministic)
              </label>
            </div>
            
            {strategy === 'advanced_smc' && (
              <div style={{ backgroundColor: 'rgba(239, 83, 80, 0.1)', border: '1px solid #ef5350', padding: '10px', borderRadius: '4px', marginTop: '15px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <ShieldAlert size={20} color="#ef5350" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '12px', color: '#ef5350' }}>
                  <strong>Warning: Lookahead Bias.</strong> This model precomputes liquidity zones across the full dataset. Do not use this for realistic performance measurement.
                </div>
              </div>
            )}

            <div style={styles.presetRow}>
              <button type="button" style={styles.presetBtn} onClick={() => applyDatePreset(30)}>30D</button>
              <button type="button" style={styles.presetBtn} onClick={() => applyDatePreset(90)}>90D</button>
              <button type="button" style={styles.presetBtn} onClick={() => applyDatePreset(180)}>180D</button>
              <button type="button" style={styles.presetBtn} onClick={() => applyDatePreset(null)}>All</button>
            </div>

            {dateHint && (
              <div style={styles.dateHint}>
                Available: {dateHint.first.toISOString().slice(0, 10)} to {dateHint.last.toISOString().slice(0, 10)}
              </div>
            )}

            <button 
              type="submit" 
              disabled={isLoading}
              style={{
                ...styles.runBtn,
                backgroundColor: isLoading ? '#434651' : '#2962ff',
                cursor: isLoading ? 'not-allowed' : 'pointer'
              }}
            >
              {isLoading ? (
                <>
                  <Activity size={16} className="animate-spin" style={{ marginRight: '8px' }} /> 
                  Running event loop...
                </>
              ) : (
                <>
                  <Play size={16} style={{ marginRight: '8px' }} /> Run Backtest
                </>
              )}
            </button>
          </form>
        </div>

        {/* Results / Performance Reports */}
        <div style={{ ...styles.card, flex: 1.8, display: 'flex', flexDirection: 'column' }}>
          <h3 style={styles.cardTitle}>Performance Results</h3>
          
          {error && (
            <div style={styles.errorBox}>
              <ShieldAlert size={20} style={{ marginRight: '8px' }} /> {error}
            </div>
          )}

          {!metrics && !isLoading && !error && (
            <div style={styles.placeholderBox}>
              Configure your strategy parameters on the left and click **Run Backtest** to simulate execution.
            </div>
          )}

          {isLoading && (
            <div style={styles.loaderBox}>
              <div style={styles.spinner}></div>
              <div style={{ marginTop: '12px', fontWeight: '500', color: '#ffd700' }}>Evaluating Strategy logic...</div>
              
              <div style={{ width: '80%', height: '8px', backgroundColor: '#2b3139', borderRadius: '4px', marginTop: '16px', overflow: 'hidden' }}>
                <div style={{ width: `${loadingProgress}%`, height: '100%', backgroundColor: '#2962ff', transition: 'width 0.3s ease' }}></div>
              </div>
              <div style={{ fontSize: '11px', color: '#787b86', marginTop: '8px' }}>
                {loadingProgress}% - Simulating spreads, slippage, and contract margins candle-by-candle
              </div>

              <button 
                onClick={handleCancel}
                style={{
                  marginTop: '20px',
                  padding: '6px 12px',
                  backgroundColor: 'transparent',
                  color: '#ef5350',
                  border: '1px solid rgba(239, 83, 80, 0.4)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(239, 83, 80, 0.1)';
                  e.currentTarget.style.borderColor = '#ef5350';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.borderColor = 'rgba(239, 83, 80, 0.4)';
                }}
              >
                Cancel Backtest
              </button>
            </div>
          )}

          {metrics && (
            <div style={styles.resultsContainer}>
              <div style={styles.metricsHeader}>
                <div style={styles.metricsHeaderBox}>
                  <div style={styles.mLabel}>Net Profit/Loss</div>
                  <div style={{ 
                    ...styles.mValueLarge, 
                    color: metrics.net_profit >= 0 ? '#26a69a' : '#ef5350' 
                  }}>
                    ${metrics.net_profit.toLocaleString()}
                  </div>
                </div>
                <div style={styles.metricsHeaderBox}>
                  <div style={styles.mLabel}>Win Rate</div>
                  <div style={styles.mValueLarge}>{metrics.win_rate}%</div>
                </div>
                <div style={styles.metricsHeaderBox}>
                  <div style={styles.mLabel}>Profit Factor</div>
                  <div style={styles.mValueLarge}>{metrics.profit_factor}</div>
                </div>
              </div>

              <div style={styles.detailsGrid}>
                <div style={styles.detailItem}>
                  <span style={styles.dLabel}>Total Trades</span>
                  <span style={styles.dValue}>{metrics.total_trades}</span>
                </div>
                <div style={styles.detailItem}>
                  <span style={styles.dLabel}>Max Drawdown</span>
                  <span style={{ ...styles.dValue, color: '#ef5350' }}>${metrics.max_drawdown.toLocaleString()}</span>
                </div>
                <div style={styles.detailItem}>
                  <span style={styles.dLabel}>Gross Profit</span>
                  <span style={{ ...styles.dValue, color: '#26a69a' }}>${metrics.gross_profit.toLocaleString()}</span>
                </div>
                <div style={styles.detailItem}>
                  <span style={styles.dLabel}>Gross Loss</span>
                  <span style={{ ...styles.dValue, color: '#ef5350' }}>${metrics.gross_loss.toLocaleString()}</span>
                </div>
                <div style={styles.detailItem}>
                  <span style={styles.dLabel}>Average Win</span>
                  <span style={{ ...styles.dValue, color: '#26a69a' }}>${metrics.avg_win}</span>
                </div>
                <div style={styles.detailItem}>
                  <span style={styles.dLabel}>Average Loss</span>
                  <span style={{ ...styles.dValue, color: '#ef5350' }}>${metrics.avg_loss}</span>
                </div>
                <div style={styles.detailItem}>
                  <span style={styles.dLabel}>Max Win Streak</span>
                  <span style={{ ...styles.dValue, color: '#26a69a' }}>{metrics.max_winning_streak || 0}</span>
                </div>
                <div style={styles.detailItem}>
                  <span style={styles.dLabel}>Max Loss Streak</span>
                  <span style={{ ...styles.dValue, color: '#ef5350' }}>{metrics.max_losing_streak || 0}</span>
                </div>
                <div style={styles.detailItem}>
                  <span style={styles.dLabel}>Trade Expectancy</span>
                  <span style={{ ...styles.dValue, color: metrics.expectancy > 0 ? '#26a69a' : '#ef5350' }}>${metrics.expectancy || 0}</span>
                </div>
                <div style={styles.detailItem}>
                  <span style={styles.dLabel}>Sharpe Ratio</span>
                  <span style={{ ...styles.dValue, color: metrics.sharpe_ratio > 1 ? '#26a69a' : '#ef5350' }}>{metrics.sharpe_ratio || 0}</span>
                </div>
                <div style={styles.detailItem}>
                  <span style={styles.dLabel}>Average RR</span>
                  <span style={styles.dValue}>1 : {metrics.avg_rr || 0}</span>
                </div>
                <div style={styles.detailItem}>
                  <span style={styles.dLabel}>Avg Duration</span>
                  <span style={styles.dValue}>{metrics.avg_trade_duration || 0} min</span>
                </div>
              </div>

              {/* Equity Growth Curve */}
              {equityCurve && equityCurve.length > 0 && (() => {
                const maxPoints = 300;
                let sampled = [];
                if (equityCurve.length <= maxPoints) {
                  sampled = equityCurve;
                } else {
                  const step = Math.floor(equityCurve.length / maxPoints);
                  for (let i = 0; i < maxPoints; i++) {
                    sampled.push(equityCurve[i * step]);
                  }
                  sampled.push(equityCurve[equityCurve.length - 1]);
                }

                const width = 450;
                const height = 130;
                const padding = 15;

                const sampledValues = sampled.map(pt => pt.value !== undefined ? pt.value : pt);
                const minEq = Math.min(...sampledValues);
                const maxEq = Math.max(...sampledValues);
                const range = maxEq - minEq || 1;

                const points = sampledValues.map((val, i) => {
                  const x = padding + (i / (sampledValues.length - 1)) * (width - padding * 2 - 50);
                  const y = height - padding - ((val - minEq) / range) * (height - padding * 2);
                  return `${x},${y}`;
                }).join(' ');

                const fillPath = `M ${padding},${height - padding} L ${points} L ${width - padding - 50},${height - padding} Z`;

                return (
                  <div style={{ marginTop: '14px', backgroundColor: 'rgba(43, 49, 57, 0.2)', padding: '12px', borderRadius: '6px', border: '1px solid #2b3139' }}>
                    <div style={{ fontSize: '11px', color: '#787b86', marginBottom: '8px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Equity curve ($)</div>
                    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
                      <defs>
                        <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2962ff" stopOpacity="0.4" />
                          <stop offset="100%" stopColor="#2962ff" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      <line x1={padding} y1={padding} x2={width - padding - 50} y2={padding} stroke="#2b3139" strokeWidth="1" strokeDasharray="3,3" />
                      <line x1={padding} y1={height - padding} x2={width - padding - 50} y2={height - padding} stroke="#2b3139" strokeWidth="1" />
                      
                      <text x={width - 45} y={padding + 4} fill="#787b86" fontSize="9" textAnchor="start">${Math.round(maxEq).toLocaleString()}</text>
                      <text x={width - 45} y={height - padding + 4} fill="#787b86" fontSize="9" textAnchor="start">${Math.round(minEq).toLocaleString()}</text>

                      <path d={fillPath} fill="url(#eqGrad)" />
                      <polyline fill="none" stroke="#2962ff" strokeWidth="2" points={points} />
                    </svg>
                  </div>
                );
              })()}

              <div style={styles.modelNote}>
                <Award size={16} style={{ marginRight: '8px', flexShrink: 0, color: '#ffd700' }} />
                <span>
                  <strong>Market Realism Engaged:</strong> Backtest fills use symbol-specific spread, pip size, contract value, NY/London overlap slippage, and 1:100 leverage margin checks. Date ranges keep long runs responsive.
                </span>
              </div>

              {/* Trades List Table */}
              {tradesList && tradesList.length > 0 && (
                <div style={{ marginTop: '20px' }}>
                  <div style={{ fontSize: '12px', color: '#d1d4dc', marginBottom: '10px', fontWeight: 'bold' }}>Trade History ({tradesList.length} trades)</div>
                  <div style={{ 
                    maxHeight: '250px', 
                    overflowY: 'auto', 
                    border: '1px solid #2b3139', 
                    borderRadius: '6px',
                    backgroundColor: 'rgba(30, 34, 45, 0.4)'
                  }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left', color: '#d1d4dc' }}>
                      <thead style={{ position: 'sticky', top: 0, backgroundColor: '#2b3139', zIndex: 1 }}>
                        <tr>
                          <th style={{ padding: '8px 12px', borderBottom: '1px solid #434651' }}>Type</th>
                          <th style={{ padding: '8px 12px', borderBottom: '1px solid #434651' }}>Entry Time</th>
                          <th style={{ padding: '8px 12px', borderBottom: '1px solid #434651' }}>Entry</th>
                          <th style={{ padding: '8px 12px', borderBottom: '1px solid #434651' }}>Exit Time</th>
                          <th style={{ padding: '8px 12px', borderBottom: '1px solid #434651' }}>Exit</th>
                          <th style={{ padding: '8px 12px', borderBottom: '1px solid #434651' }}>Reason</th>
                          <th style={{ padding: '8px 12px', borderBottom: '1px solid #434651', textAlign: 'right' }}>P/L</th>
                          <th style={{ padding: '8px 12px', borderBottom: '1px solid #434651', textAlign: 'center' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tradesList.map((trade, i) => {
                          const isWin = trade.pnl >= 0;
                          const pColor = isWin ? '#26a69a' : '#ef5350';
                          return (
                            <tr key={i} style={{ borderBottom: '1px solid rgba(43, 49, 57, 0.5)' }}>
                              <td style={{ padding: '6px 12px', color: trade.direction === 'BUY' ? '#26a69a' : '#ef5350', fontWeight: 'bold' }}>{trade.direction}</td>
                              <td style={{ padding: '6px 12px' }}>{new Date(trade.entry_time * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                              <td style={{ padding: '6px 12px' }}>{trade.entry_price.toFixed(3)}</td>
                              <td style={{ padding: '6px 12px' }}>{new Date(trade.exit_time * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                              <td style={{ padding: '6px 12px' }}>{trade.exit_price.toFixed(3)}</td>
                              <td style={{ padding: '6px 12px' }}>{trade.outcome}</td>
                              <td style={{ padding: '6px 12px', textAlign: 'right', color: pColor, fontWeight: 'bold' }}>
                                {isWin ? '+' : ''}${trade.pnl.toFixed(2)}
                              </td>
                              <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                                <button 
                                  onClick={() => onReviewTrade && onReviewTrade({
                                    ...trade,
                                    entryPrice: trade.entry_price,
                                    closePrice: trade.exit_price,
                                    entryTime: trade.entry_time
                                  })}
                                  style={{
                                    backgroundColor: 'transparent',
                                    border: '1px solid #434651',
                                    color: '#787b86',
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                    transition: 'all 0.2s'
                                  }}
                                  onMouseEnter={(e) => { e.target.style.color = '#fff'; e.target.style.borderColor = '#2962ff'; }}
                                  onMouseLeave={(e) => { e.target.style.color = '#787b86'; e.target.style.borderColor = '#434651'; }}
                                >
                                  🔍 Review
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    padding: '20px',
    backgroundColor: '#131722',
    color: '#d1d4dc',
    boxSizing: 'border-box',
    overflowY: 'auto',
    height: '100%'
  },
  header: {
    marginBottom: '20px'
  },
  title: {
    margin: '0 0 6px 0',
    fontSize: '20px',
    fontWeight: '600',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center'
  },
  subtext: {
    fontSize: '12px',
    color: '#787b86'
  },
  mainGrid: {
    display: 'flex',
    gap: '20px',
    alignItems: 'stretch'
  },
  card: {
    backgroundColor: '#1e222d',
    border: '1px solid #2b3139',
    borderRadius: '8px',
    padding: '20px',
    boxSizing: 'border-box'
  },
  cardTitle: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#787b86',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    margin: '0 0 16px 0',
    borderBottom: '1px solid rgba(43, 49, 57, 0.4)',
    paddingBottom: '8px'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  formRow: {
    display: 'flex',
    gap: '12px'
  },
  presetRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '8px'
  },
  presetBtn: {
    backgroundColor: '#2b3139',
    border: '1px solid #434651',
    color: '#d1d4dc',
    borderRadius: '4px',
    padding: '7px 0',
    fontSize: '11px',
    cursor: 'pointer',
    fontWeight: '600'
  },
  dateHint: {
    color: '#787b86',
    fontSize: '11px',
    marginTop: '-8px'
  },
  formGroup: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  label: {
    fontSize: '11px',
    color: '#787b86',
    fontWeight: '500'
  },
  select: {
    backgroundColor: '#2b3139',
    border: '1px solid #434651',
    color: '#ffffff',
    borderRadius: '4px',
    padding: '8px',
    fontSize: '13px',
    outline: 'none'
  },
  input: {
    backgroundColor: '#2b3139',
    border: '1px solid #434651',
    color: '#ffffff',
    borderRadius: '4px',
    padding: '8px',
    fontSize: '13px',
    outline: 'none'
  },
  runBtn: {
    border: 'none',
    color: '#ffffff',
    padding: '10px 16px',
    borderRadius: '4px',
    fontSize: '13px',
    fontWeight: 'bold',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: '10px'
  },
  placeholderBox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    color: '#787b86',
    flex: 1,
    padding: '40px',
    fontSize: '13px',
    border: '1px dashed #2b3139',
    borderRadius: '6px',
    lineHeight: '1.6'
  },
  errorBox: {
    backgroundColor: 'rgba(239, 83, 80, 0.1)',
    border: '1px solid rgba(239, 83, 80, 0.2)',
    borderRadius: '6px',
    padding: '12px',
    color: '#ef5350',
    display: 'flex',
    alignItems: 'center',
    fontSize: '13px',
    marginBottom: '16px'
  },
  loaderBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    padding: '40px',
    textAlign: 'center'
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid rgba(255, 215, 0, 0.15)',
    borderTopColor: '#ffd700',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  resultsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    flex: 1
  },
  metricsHeader: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
    backgroundColor: 'rgba(43, 49, 57, 0.4)',
    borderRadius: '6px',
    padding: '16px'
  },
  metricsHeaderBox: {
    textAlign: 'center'
  },
  mLabel: {
    fontSize: '11px',
    color: '#787b86',
    marginBottom: '4px'
  },
  mValueLarge: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#ffffff'
  },
  detailsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px'
  },
  detailItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 12px',
    backgroundColor: 'rgba(43, 49, 57, 0.2)',
    borderRadius: '4px',
    fontSize: '13px'
  },
  dLabel: {
    color: '#787b86'
  },
  dValue: {
    fontWeight: '600',
    color: '#ffffff'
  },
  modelNote: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.05)',
    border: '1px solid rgba(255, 215, 0, 0.1)',
    borderRadius: '6px',
    padding: '12px',
    fontSize: '11px',
    color: '#ffd700',
    lineHeight: '1.5'
  }
};

export default SystematicTester;
