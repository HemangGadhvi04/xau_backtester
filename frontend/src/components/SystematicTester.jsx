import { useState } from 'react';
import axios from 'axios';
import { Play, Activity, ShieldAlert, Award } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000/api';

const SystematicTester = () => {
  const [strategy, setStrategy] = useState('ema_cross');
  const [lots, setLots] = useState(0.1);
  const [slPips, setSlPips] = useState(20);
  const [tpPips, setTpPips] = useState(40);
  const [isLoading, setIsLoading] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState(null);

  const handleRunBacktest = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setMetrics(null);

    try {
      const res = await axios.post(`${API_BASE}/backtest`, {
        strategy,
        lots: parseFloat(lots),
        sl_pips: parseInt(slPips),
        tp_pips: parseInt(tpPips)
      });
      
      if (res.data.status === 'success') {
        setMetrics(res.data.metrics);
      } else {
        setError("Failed to run backtest.");
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || "Network error. Make sure the backend is active.");
    } finally {
      setIsLoading(false);
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
                <option value="ema_cross">9 / 15 EMA Crossover Strategy</option>
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Position Lot Size</label>
              <input 
                type="number"
                step="0.01"
                min="0.01"
                value={lots}
                onChange={(e) => setLots(e.target.value)}
                style={styles.input}
              />
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
              <div style={{ fontSize: '11px', color: '#787b86', marginTop: '4px' }}>
                Simulating spreads, slippage, and contract margins candle-by-candle
              </div>
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
              </div>

              <div style={styles.modelNote}>
                <Award size={16} style={{ marginRight: '8px', flexShrink: 0, color: '#ffd700' }} />
                <span>
                  <strong>Market Realism Engaged:</strong> Backtest fills are calculated using bid/ask crossing spread ($0.20), NY London overlap volatility slippage penalty factor, and 1:100 leverage contract margin verification.
                </span>
              </div>
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
