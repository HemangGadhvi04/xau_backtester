import { useState } from 'react';
import axios from 'axios';
import { BookOpen, Edit2, Play, Check, X } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000/api';

const TradeJournal = ({ history, onReviewTrade, onRefreshData }) => {
  const [editingTrade, setEditingTrade] = useState(null);
  const [formData, setFormData] = useState({
    setup_name: '',
    mistake_type: '',
    emotion: '',
    lesson: '',
    tag_input: ''
  });

  // Calculate analytical metrics
  const totalTrades = history.length;
  const closedTrades = history.filter(t => t.pnl !== 0);
  const winningTrades = closedTrades.filter(t => t.pnl > 0);
  const losingTrades = closedTrades.filter(t => t.pnl < 0);
  
  const winRate = totalTrades > 0 ? ((winningTrades.length / totalTrades) * 100).toFixed(1) : 0;
  const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = losingTrades.reduce((sum, t) => sum + Math.abs(t.pnl), 0);
  const netProfit = grossProfit - grossLoss;
  const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : grossProfit > 0 ? '∞' : '0.00';
  
  const avgWin = winningTrades.length > 0 ? (grossProfit / winningTrades.length).toFixed(2) : '0.00';
  const avgLoss = losingTrades.length > 0 ? (grossLoss / losingTrades.length).toFixed(2) : '0.00';

  // Generate equity curve coordinates
  let currentBalance = 10000;
  const balanceHistory = [10000];
  
  // Sort history chronologically to plot the equity curve
  const chronoHistory = [...history].sort((a, b) => a.closeTime - b.closeTime);
  chronoHistory.forEach(trade => {
    currentBalance += trade.pnl;
    balanceHistory.push(currentBalance);
  });

  const maxBalance = Math.max(...balanceHistory, 10000);
  const minBalance = Math.min(...balanceHistory, 9000);
  const balanceRange = maxBalance - minBalance || 1000;

  // Render responsive SVG Equity Curve
  const renderEquityCurve = () => {
    if (balanceHistory.length < 2) {
      return (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#787b86' }}>
          Place trades to generate your Equity Curve.
        </div>
      );
    }

    const width = 600;
    const height = 150;
    const padding = 20;

    const points = balanceHistory.map((bal, idx) => {
      const x = padding + (idx / (balanceHistory.length - 1)) * (width - padding * 2);
      const y = height - padding - ((bal - minBalance) / balanceRange) * (height - padding * 2);
      return `${x},${y}`;
    });

    const pathData = `M ${points.join(' L ')}`;
    const fillData = `${pathData} L ${points[points.length - 1].split(',')[0]},${height - padding} L ${points[0].split(',')[0]},${height - padding} Z`;

    return (
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%' }}>
        <defs>
          <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#26a69a" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#26a69a" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path d={fillData} fill="url(#curveGradient)" />
        <path d={pathData} fill="none" stroke="#26a69a" strokeWidth="2.5" />
        {balanceHistory.map((bal, idx) => {
          const [x, y] = points[idx].split(',');
          return (
            <circle 
              key={idx} 
              cx={x} 
              cy={y} 
              r="3.5" 
              fill="#1e222d" 
              stroke="#26a69a" 
              strokeWidth="1.5" 
              style={{ cursor: 'pointer' }}
            >
              <title>{`Trade #${idx}: $${bal.toFixed(2)}`}</title>
            </circle>
          );
        })}
      </svg>
    );
  };

  const handleStartEdit = (trade) => {
    setEditingTrade(trade);
    const jn = trade.journal_note || {};
    setFormData({
      setup_name: jn.setup_name || '',
      mistake_type: jn.mistake_type || '',
      emotion: jn.emotion || '',
      lesson: jn.lesson || '',
      tag_input: trade.tags?.map(t => t.value).join(', ') || ''
    });
  };

  const handleSaveJournal = async (e) => {
    e.preventDefault();
    if (!editingTrade) return;

    // Split tag inputs
    const tagList = formData.tag_input
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0)
      .map(tag => ({ category: 'confluence', value: tag }));

    try {
      await axios.post(`${API_BASE}/trades/${editingTrade.id}/journal`, {
        setup_name: formData.setup_name,
        mistake_type: formData.mistake_type,
        emotion: formData.emotion,
        lesson: formData.lesson,
        tags: tagList
      });

      setEditingTrade(null);
      if (onRefreshData) onRefreshData();
    } catch (err) {
      console.error("Error saving journal entry:", err);
      alert("Failed to save journal notes.");
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}><BookOpen size={20} style={{ marginRight: '8px' }} /> Analytical Trade Journal</h2>
      </div>

      {/* Grid: Stats & Equity Curve */}
      <div style={styles.dashboardGrid}>
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Performance Overview</h3>
          <div style={styles.statsGrid}>
            <div style={styles.statBox}>
              <div style={styles.statLabel}>Net Profit</div>
              <div style={{ ...styles.statVal, color: netProfit >= 0 ? '#26a69a' : '#ef5350' }}>
                ${netProfit.toFixed(2)}
              </div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statLabel}>Win Rate</div>
              <div style={styles.statVal}>{winRate}%</div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statLabel}>Profit Factor</div>
              <div style={styles.statVal}>{profitFactor}</div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statLabel}>Avg Win / Loss</div>
              <div style={styles.statVal}>
                <span style={{ color: '#26a69a' }}>+${parseFloat(avgWin).toFixed(0)}</span>
                <span style={{ color: '#787b86', margin: '0 4px' }}>/</span>
                <span style={{ color: '#ef5350' }}>-${parseFloat(avgLoss).toFixed(0)}</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ ...styles.card, flex: 1.5 }}>
          <h3 style={styles.cardTitle}>Equity Curve History</h3>
          <div style={{ height: '110px' }}>
            {renderEquityCurve()}
          </div>
        </div>
      </div>

      {/* Trade Ledger / Table */}
      <div style={{ ...styles.card, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', marginTop: '16px' }}>
        <h3 style={styles.cardTitle}>Trade History Ledger</h3>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.thRow}>
                <th style={styles.th}>ID/Time</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Lots</th>
                <th style={styles.th}>Entry</th>
                <th style={styles.th}>Exit</th>
                <th style={styles.th}>PnL</th>
                <th style={styles.th}>SMC Setup</th>
                <th style={styles.th}>Emotion</th>
                <th style={styles.th}>Mistakes / Lessons</th>
                <th style={styles.th}>Confluences</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan="11" style={styles.emptyCell}>No logged trades found. Use Replay to execute trades.</td>
                </tr>
              ) : (
                history.map((trade) => {
                  const isWin = trade.pnl > 0;
                  const dateStr = new Date(trade.closeTime * 1000).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  });

                  return (
                    <tr key={trade.id} style={styles.tr}>
                      <td style={styles.td}>
                        <div style={{ fontSize: '12px', fontWeight: 'bold' }}>#{String(trade.id).slice(-4)}</div>
                        <div style={{ fontSize: '10px', color: '#787b86' }}>{dateStr}</div>
                      </td>
                      <td style={styles.td}>
                        <span style={{ 
                          color: trade.type === 'BUY' ? '#26a69a' : '#ef5350', 
                          fontWeight: 'bold',
                          backgroundColor: trade.type === 'BUY' ? 'rgba(38, 166, 154, 0.1)' : 'rgba(239, 83, 80, 0.1)',
                          padding: '2px 6px',
                          borderRadius: '3px',
                          fontSize: '11px'
                        }}>
                          {trade.type}
                        </span>
                      </td>
                      <td style={styles.td}>{trade.lots.toFixed(2)}</td>
                      <td style={styles.td}>${trade.entryPrice.toFixed(2)}</td>
                      <td style={styles.td}>${trade.closePrice ? trade.closePrice.toFixed(2) : '-'}</td>
                      <td style={{ ...styles.td, fontWeight: 'bold', color: isWin ? '#26a69a' : '#ef5350' }}>
                        {isWin ? '+' : ''}${trade.pnl.toFixed(2)}
                      </td>
                      <td style={styles.td}>
                        <span style={{ fontWeight: '600', color: '#e0e3eb' }}>
                          {trade.journal_note?.setup_name || '-'}
                        </span>
                      </td>
                      <td style={styles.td}>{trade.journal_note?.emotion || '-'}</td>
                      <td style={styles.td}>
                        <div style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {trade.journal_note?.mistake_type && (
                            <span style={{ color: '#f59e0b', fontSize: '10px', display: 'block' }}>
                              ⚠️ {trade.journal_note.mistake_type}
                            </span>
                          )}
                          <span style={{ fontSize: '11px', color: '#b2b5be' }}>
                            {trade.journal_note?.lesson || '-'}
                          </span>
                        </div>
                      </td>
                      <td style={styles.td}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', maxWidth: '140px' }}>
                          {trade.tags && trade.tags.length > 0 ? (
                            trade.tags.map((tag, idx) => (
                              <span key={idx} style={styles.tagBadge}>
                                {tag.value}
                              </span>
                            ))
                          ) : (
                            <span style={{ color: '#787b86' }}>-</span>
                          )}
                        </div>
                      </td>
                      <td style={styles.td}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button 
                            title="Review on Replay Chart"
                            onClick={() => onReviewTrade && onReviewTrade(trade)} 
                            style={{ ...styles.actionBtn, backgroundColor: '#2962ff' }}
                          >
                            <Play size={11} /> Review
                          </button>
                          <button 
                            title="Edit Notes & Confluences"
                            onClick={() => handleStartEdit(trade)} 
                            style={{ ...styles.actionBtn, backgroundColor: '#434651' }}
                          >
                            <Edit2 size={11} /> Log
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Overlay Edit Modal */}
      {editingTrade && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0 }}>Log Journal Entry (Trade #{String(editingTrade.id).slice(-4)})</h3>
              <button onClick={() => setEditingTrade(null)} style={styles.closeModalBtn}><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveJournal} style={styles.form}>
              <div style={styles.formRow}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>SMC Setup Pattern</label>
                  <select 
                    value={formData.setup_name}
                    onChange={(e) => setFormData({ ...formData, setup_name: e.target.value })}
                    style={styles.select}
                  >
                    <option value="">-- Select Setup --</option>
                    <option value="OTE (Optimal Trade Entry)">OTE (Optimal Trade Entry)</option>
                    <option value="FVG Sweep / Fill">FVG Sweep / Fill</option>
                    <option value="Order Block (OB)">Order Block (OB)</option>
                    <option value="Breaker Block (BB)">Breaker Block (BB)</option>
                    <option value="Liquidity Grab (BSL/SSL)">Liquidity Grab (BSL/SSL)</option>
                    <option value="MSS / BOS Shift">MSS / BOS Shift</option>
                    <option value="Asian Session Liquidity">Asian Session Liquidity</option>
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Emotional State</label>
                  <select 
                    value={formData.emotion}
                    onChange={(e) => setFormData({ ...formData, emotion: e.target.value })}
                    style={styles.select}
                  >
                    <option value="">-- Select Emotion --</option>
                    <option value="Calm & Disciplined">Calm & Disciplined</option>
                    <option value="Anxious / Stressed">Anxious / Stressed</option>
                    <option value="FOMO (Fear of Missing Out)">FOMO (Fear of Missing Out)</option>
                    <option value="Greedy / Overconfident">Greedy / Overconfident</option>
                    <option value="Hesitant / Late Entry">Hesitant / Late Entry</option>
                  </select>
                </div>
              </div>

              <div style={styles.formRow}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Execution Mistakes</label>
                  <select 
                    value={formData.mistake_type}
                    onChange={(e) => setFormData({ ...formData, mistake_type: e.target.value })}
                    style={styles.select}
                  >
                    <option value="">None (Good Execution)</option>
                    <option value="Early Entry (Chase)">Early Entry (Chase)</option>
                    <option value="Late Entry (Missed Move)">Late Entry (Missed Move)</option>
                    <option value="Over-Leveraging">Over-Leveraging</option>
                    <option value="Moved SL / Rule Break">Moved SL / Rule Break</option>
                    <option value="Impatient Close">Impatient Close</option>
                  </select>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Confluence Tags (comma separated)</label>
                  <input 
                    type="text"
                    placeholder="e.g. 4H OB, OTE zone, FVG fill, 15m MSS"
                    value={formData.tag_input}
                    onChange={(e) => setFormData({ ...formData, tag_input: e.target.value })}
                    style={styles.input}
                  />
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Lesson Learned / Technical Notes</label>
                <textarea 
                  rows="3"
                  placeholder="Record what went right, what went wrong, and how to improve this execution..."
                  value={formData.lesson}
                  onChange={(e) => setFormData({ ...formData, lesson: e.target.value })}
                  style={styles.textarea}
                />
              </div>

              <div style={styles.modalFooter}>
                <button type="button" onClick={() => setEditingTrade(null)} style={styles.cancelBtn}>Cancel</button>
                <button type="submit" style={styles.submitBtn}><Check size={14} style={{ marginRight: '4px' }} /> Save Journal</button>
              </div>
            </form>
          </div>
        </div>
      )}
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
    overflow: 'hidden',
    height: '100%'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px'
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: '600',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center'
  },
  dashboardGrid: {
    display: 'flex',
    gap: '16px',
    flexShrink: 0
  },
  card: {
    backgroundColor: '#1e222d',
    border: '1px solid #2b3139',
    borderRadius: '8px',
    padding: '16px',
    boxSizing: 'border-box'
  },
  cardTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#787b86',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    margin: '0 0 12px 0'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px 20px',
    height: '110px',
    alignContent: 'center'
  },
  statBox: {
    display: 'flex',
    flexDirection: 'column'
  },
  statLabel: {
    fontSize: '11px',
    color: '#787b86',
    marginBottom: '4px'
  },
  statVal: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#ffffff'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left'
  },
  thRow: {
    borderBottom: '1px solid #2b3139'
  },
  th: {
    color: '#787b86',
    fontWeight: '600',
    fontSize: '11px',
    padding: '10px 12px',
    textTransform: 'uppercase'
  },
  tr: {
    borderBottom: '1px solid rgba(43, 49, 57, 0.4)',
    cursor: 'pointer'
  },
  td: {
    padding: '12px',
    fontSize: '13px',
    verticalAlign: 'middle'
  },
  emptyCell: {
    textAlign: 'center',
    color: '#787b86',
    padding: '30px',
    fontSize: '13px'
  },
  tagBadge: {
    fontSize: '10px',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    color: '#3b82f6',
    padding: '2px 6px',
    borderRadius: '10px',
    fontWeight: '500'
  },
  actionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    border: 'none',
    color: '#ffffff',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    cursor: 'pointer',
    fontWeight: '600'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(3px)'
  },
  modal: {
    backgroundColor: '#1e222d',
    border: '1px solid #434651',
    borderRadius: '8px',
    width: '550px',
    padding: '20px',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #2b3139',
    paddingBottom: '12px'
  },
  closeModalBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#787b86',
    cursor: 'pointer'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  formRow: {
    display: 'flex',
    gap: '16px'
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
  textarea: {
    backgroundColor: '#2b3139',
    border: '1px solid #434651',
    color: '#ffffff',
    borderRadius: '4px',
    padding: '8px',
    fontSize: '13px',
    outline: 'none',
    resize: 'none'
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    borderTop: '1px solid #2b3139',
    paddingTop: '12px',
    marginTop: '6px'
  },
  cancelBtn: {
    backgroundColor: 'transparent',
    border: '1px solid #434651',
    color: '#d1d4dc',
    padding: '8px 16px',
    borderRadius: '4px',
    fontSize: '13px',
    cursor: 'pointer'
  },
  submitBtn: {
    backgroundColor: '#26a69a',
    border: 'none',
    color: '#ffffff',
    padding: '8px 16px',
    borderRadius: '4px',
    fontSize: '13px',
    fontWeight: 'bold',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center'
  }
};

export default TradeJournal;
