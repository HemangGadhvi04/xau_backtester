import { useState } from 'react';
import { TrendingUp, TrendingDown, ChevronDown, ChevronRight } from 'lucide-react';

const TradePanel = ({ 
  account, 
  onPlaceOrder, 
  positions, 
  onClosePosition, 
  pendingOrders = [], 
  onCancelPendingOrder,
  history, 
  currentPrice,
  onReviewTrade
}) => {
  const [orderType, setOrderType] = useState('MARKET'); // MARKET or LIMIT
  const [limitPrice, setLimitPrice] = useState('');
  const [riskPercent, setRiskPercent] = useState(1); // default 1% risk
  const [slPips, setSlPips] = useState(20); // default 20 pips SL
  const [tpPips, setTpPips] = useState(40); // default 40 pips TP (1:2 risk/reward)
  const [customLots, setCustomLots] = useState('');
  const [isLotMode, setIsLotMode] = useState(false);
  const [isOrderExpanded, setIsOrderExpanded] = useState(true);
  const [isPositionsExpanded, setIsPositionsExpanded] = useState(true);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(true);

  // Stats calculation
  const totalTrades = history.length;
  const winningTrades = history.filter(t => t.pnl > 0).length;
  const winRate = totalTrades > 0 ? ((winningTrades / totalTrades) * 100).toFixed(1) : 0;
  const totalNet = history.reduce((sum, t) => sum + t.pnl, 0);

  // Position sizing
  const calculateLotSize = () => {
    if (isLotMode) {
      return parseFloat(customLots) || 0.01;
    }
    const riskAmount = (account.balance * (riskPercent / 100));
    const calculatedLots = riskAmount / (slPips * 10);
    return Math.max(0.01, Math.round(calculatedLots * 100) / 100);
  };

  const currentLots = calculateLotSize();

  const handleBuy = () => {
    const entry = orderType === 'LIMIT' ? parseFloat(limitPrice) : currentPrice;
    if (!entry) return;
    const slPrice = entry - (slPips * 0.1);
    const tpPrice = entry + (tpPips * 0.1);
    onPlaceOrder('BUY', currentLots, entry, slPrice, tpPrice, orderType === 'LIMIT');
  };

  const handleSell = () => {
    const entry = orderType === 'LIMIT' ? parseFloat(limitPrice) : currentPrice;
    if (!entry) return;
    const slPrice = entry + (slPips * 0.1);
    const tpPrice = entry - (tpPips * 0.1);
    onPlaceOrder('SELL', currentLots, entry, slPrice, tpPrice, orderType === 'LIMIT');
  };

  return (
    <div style={styles.container}>
      {/* Account Info Section */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Account Balance</h3>
        <div style={styles.balanceGrid}>
          <div>
            <div style={styles.label}>Balance</div>
            <div style={styles.value}>${account.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div>
            <div style={styles.label}>Equity</div>
            <div style={{ ...styles.value, color: account.equity >= account.balance ? '#26a69a' : '#ef5350' }}>
              ${account.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      {/* Trade execution */}
      <div style={styles.section}>
        <div 
          onClick={() => setIsOrderExpanded(!isOrderExpanded)} 
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: isOrderExpanded ? '10px' : '0' }}
        >
          <h3 style={{ ...styles.sectionTitle, margin: 0 }}>New Order</h3>
          {isOrderExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
        
        {isOrderExpanded && (
          <>
            {/* Order Type Toggle */}
            <div style={styles.modeToggleGroup}>
              <button 
                style={{...styles.toggleButton, backgroundColor: orderType === 'MARKET' ? '#2962ff' : '#2b3139'}}
                onClick={() => setOrderType('MARKET')}
              >
                Market
              </button>
              <button 
                style={{...styles.toggleButton, backgroundColor: orderType === 'LIMIT' ? '#2962ff' : '#2b3139'}}
                onClick={() => {
                  setOrderType('LIMIT');
                  if (!limitPrice) setLimitPrice(currentPrice.toFixed(2));
                }}
              >
                Limit
              </button>
            </div>

            {/* Limit Price Input */}
            {orderType === 'LIMIT' && (
              <div style={{...styles.inputCol, marginBottom: '10px'}}>
                <span style={styles.inputLabel}>Limit Price</span>
                <input 
                  type="number" 
                  step="0.01"
                  value={limitPrice} 
                  onChange={(e) => setLimitPrice(e.target.value)}
                  style={styles.input} 
                />
              </div>
            )}

            <div style={styles.modeToggleGroup}>
              <button 
                style={{...styles.toggleButton, backgroundColor: !isLotMode ? '#3b82f6' : '#2b3139'}}
                onClick={() => setIsLotMode(false)}
              >
                Risk %
              </button>
              <button 
                style={{...styles.toggleButton, backgroundColor: isLotMode ? '#3b82f6' : '#2b3139'}}
                onClick={() => setIsLotMode(true)}
              >
                Fixed Lots
              </button>
            </div>

            {!isLotMode ? (
              <div style={styles.inputRow}>
                <div style={styles.inputCol}>
                  <span style={styles.inputLabel}>Risk %</span>
                  <input 
                    type="number" 
                    value={riskPercent} 
                    onChange={(e) => setRiskPercent(Math.max(0.1, parseFloat(e.target.value) || 1))}
                    style={styles.input} 
                  />
                </div>
                <div style={styles.inputCol}>
                  <span style={styles.inputLabel}>Risk ($)</span>
                  <div style={styles.readOnlyVal}>
                    ${(account.balance * (riskPercent / 100)).toFixed(2)}
                  </div>
                </div>
              </div>
            ) : (
              <div style={styles.inputRow}>
                <div style={styles.inputCol}>
                  <span style={styles.inputLabel}>Lots</span>
                  <input 
                    type="number" 
                    placeholder="1.0"
                    value={customLots} 
                    onChange={(e) => setCustomLots(e.target.value)}
                    style={styles.input} 
                  />
                </div>
              </div>
            )}

            <div style={styles.inputRow}>
              <div style={styles.inputCol}>
                <span style={styles.inputLabel}>SL (Pips)</span>
                <input 
                  type="number" 
                  value={slPips} 
                  onChange={(e) => setSlPips(Math.max(1, parseInt(e.target.value) || 1))}
                  style={styles.input} 
                />
              </div>
              <div style={styles.inputCol}>
                <span style={styles.inputLabel}>TP (Pips)</span>
                <input 
                  type="number" 
                  value={tpPips} 
                  onChange={(e) => setTpPips(Math.max(1, parseInt(e.target.value) || 1))}
                  style={styles.input} 
                />
              </div>
            </div>

            <div style={styles.summaryBox}>
              <div>Lot Size: <strong>{currentLots.toFixed(2)}</strong></div>
              <div>Risk per pip: <strong>${(currentLots * 10).toFixed(2)}</strong></div>
            </div>

            <div style={styles.btnRow}>
              <button onClick={handleBuy} style={{ ...styles.actionBtn, backgroundColor: '#26a69a' }}>
                <TrendingUp size={16} /> {orderType === 'LIMIT' ? 'Buy Limit' : 'Buy Market'}
              </button>
              <button onClick={handleSell} style={{ ...styles.actionBtn, backgroundColor: '#ef5350' }}>
                <TrendingDown size={16} /> {orderType === 'LIMIT' ? 'Sell Limit' : 'Sell Market'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Pending Orders Section */}
      {pendingOrders.length > 0 && (
        <div style={{ ...styles.section, maxHeight: '120px', overflowY: 'auto', flexShrink: 0 }}>
          <h3 style={styles.sectionTitle}>Pending Orders ({pendingOrders.length})</h3>
          {pendingOrders.map(order => (
              <div key={order.id} style={{...styles.posCard, borderLeft: '3px solid #f59e0b', marginBottom: '6px'}}>
                <div style={styles.posHeader}>
                  <span style={{ color: order.type === 'BUY' ? '#26a69a' : '#ef5350', fontWeight: 'bold', fontSize: '12px' }}>
                    {order.type} LIMIT {order.lots.toFixed(2)}
                  </span>
                  <button onClick={() => onCancelPendingOrder(order.id)} style={styles.closeBtn}>
                    Cancel
                  </button>
                </div>
                <div style={styles.posBody}>
                  <div>Limit Price: {order.entryPrice.toFixed(2)}</div>
                  <div>SL: {order.sl ? order.sl.toFixed(2) : '-'}</div>
                  <div>TP: {order.tp ? order.tp.toFixed(2) : '-'}</div>
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* Open Positions Section */}
      <div style={{ ...styles.section, flex: isPositionsExpanded && positions.length > 0 ? 1.5 : '0 1 auto', minHeight: '40px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div 
          onClick={() => setIsPositionsExpanded(!isPositionsExpanded)} 
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: isPositionsExpanded ? '10px' : '0' }}
        >
          <h3 style={{ ...styles.sectionTitle, margin: 0 }}>Open Positions ({positions.length})</h3>
          {isPositionsExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
        
        {isPositionsExpanded && (
          positions.length === 0 ? (
            <div style={styles.noTrades}>No open positions</div>
          ) : (
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {positions.map((pos) => {
                const isBuy = pos.type === 'BUY';
                const priceDiff = isBuy ? (currentPrice - pos.entryPrice) : (pos.entryPrice - currentPrice);
                const unrealizedPnl = priceDiff * pos.lots * 100;
                return (
                  <div key={pos.id} style={{ ...styles.posCard, marginBottom: '6px' }}>
                    <div style={styles.posHeader}>
                      <span style={{ 
                        color: isBuy ? '#26a69a' : '#ef5350', 
                        fontWeight: 'bold',
                        fontSize: '12px'
                      }}>
                        {pos.type} {pos.lots.toFixed(2)} Lots
                      </span>
                      <button onClick={() => onClosePosition(pos.id, currentPrice)} style={styles.closeBtn}>
                        Close
                      </button>
                    </div>
                    <div style={styles.posBody}>
                      <div>Entry: {pos.entryPrice.toFixed(2)}</div>
                      <div>Current: {currentPrice ? currentPrice.toFixed(2) : '-'}</div>
                      <div style={{ 
                        fontWeight: 'bold', 
                        color: unrealizedPnl >= 0 ? '#26a69a' : '#ef5350' 
                      }}>
                        PnL: ${unrealizedPnl.toFixed(2)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* History Stats Section */}
      <div style={{ ...styles.section, borderBottom: 'none', flex: isHistoryExpanded ? 2 : '0 1 auto', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div 
          onClick={() => setIsHistoryExpanded(!isHistoryExpanded)} 
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: isHistoryExpanded ? '10px' : '0' }}
        >
          <h3 style={{ ...styles.sectionTitle, margin: 0 }}>Stats & History</h3>
          {isHistoryExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>

        {isHistoryExpanded && (
          <>
            <div style={styles.statsGrid}>
              <div>
                <div style={styles.label}>Trades</div>
                <div style={styles.statsVal}>{totalTrades}</div>
              </div>
              <div>
                <div style={styles.label}>Win Rate</div>
                <div style={styles.statsVal}>{winRate}%</div>
              </div>
              <div>
                <div style={styles.label}>Net Profit</div>
                <div style={{ ...styles.statsVal, color: totalNet >= 0 ? '#26a69a' : '#ef5350' }}>
                  ${totalNet.toFixed(2)}
                </div>
              </div>
            </div>

            <div style={{ marginTop: '10px', flex: 1, overflowY: 'auto', minHeight: '60px' }}>
              {history.length === 0 ? (
                <div style={styles.noTrades}>No trade history</div>
              ) : (
                history.map((trade) => {
                  const isWin = trade.pnl > 0;
                  return (
                    <div 
                      key={trade.id} 
                      onClick={() => onReviewTrade && onReviewTrade(trade)} 
                      style={{
                        ...styles.posCard, 
                        cursor: 'pointer', 
                        borderLeft: `3px solid ${isWin ? '#26a69a' : '#ef5350'}`,
                        transition: 'background-color 0.2s',
                        marginBottom: '6px'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#363c47'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2b3139'}
                    >
                      <div style={styles.posHeader}>
                        <span style={{ 
                          color: trade.type === 'BUY' ? '#26a69a' : '#ef5350', 
                          fontWeight: 'bold',
                          fontSize: '12px'
                        }}>
                          {trade.type} {trade.lots.toFixed(2)}
                        </span>
                        <span style={{ 
                          fontWeight: 'bold', 
                          color: isWin ? '#26a69a' : '#ef5350',
                          fontSize: '12px'
                        }}>
                          {isWin ? '+' : ''}${trade.pnl.toFixed(2)}
                        </span>
                      </div>
                      <div style={{ ...styles.posBody, fontSize: '11px' }}>
                        <div>Entry: {trade.entryPrice.toFixed(2)}</div>
                        <div>Exit: {trade.closePrice ? trade.closePrice.toFixed(2) : '-'}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    width: '280px',
    backgroundColor: '#1e222d',
    borderLeft: '1px solid #2b3139',
    padding: '16px',
    boxSizing: 'border-box',
    gap: '12px',
    color: '#d1d4dc',
    height: '100%',
    overflow: 'hidden'
  },
  section: {
    borderBottom: '1px solid rgba(43, 49, 57, 0.6)',
    paddingBottom: '12px',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: '600',
    margin: '0 0 10px 0',
    color: '#ffffff',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  balanceGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px'
  },
  label: {
    fontSize: '11px',
    color: '#787b86',
    marginBottom: '2px'
  },
  value: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#ffffff'
  },
  modeToggleGroup: {
    display: 'flex',
    gap: '5px',
    marginBottom: '10px'
  },
  toggleButton: {
    flex: 1,
    padding: '6px',
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: '500',
  },
  inputRow: {
    display: 'flex',
    gap: '10px',
    marginBottom: '10px'
  },
  inputCol: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  inputLabel: {
    fontSize: '11px',
    color: '#787b86'
  },
  input: {
    padding: '8px',
    backgroundColor: '#2b3139',
    border: '1px solid #434651',
    borderRadius: '4px',
    color: '#ffffff',
    fontSize: '13px',
    outline: 'none'
  },
  readOnlyVal: {
    padding: '8px',
    backgroundColor: 'rgba(43, 49, 57, 0.4)',
    border: '1px solid transparent',
    borderRadius: '4px',
    color: '#ffffff',
    fontSize: '13px',
  },
  summaryBox: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    border: '1px solid rgba(59, 130, 246, 0.2)',
    borderRadius: '4px',
    padding: '8px 12px',
    fontSize: '12px',
    marginBottom: '12px',
    display: 'flex',
    justifyContent: 'space-between'
  },
  btnRow: {
    display: 'flex',
    gap: '8px'
  },
  actionBtn: {
    flex: 1,
    padding: '10px',
    border: 'none',
    borderRadius: '4px',
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: '13px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
  },
  noTrades: {
    fontSize: '12px',
    color: '#787b86',
    textAlign: 'center',
    padding: '12px 0'
  },
  posCard: {
    backgroundColor: '#2b3139',
    borderRadius: '4px',
    padding: '8px 12px',
    marginBottom: '8px',
    borderLeft: '3px solid #3b82f6'
  },
  posHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px'
  },
  closeBtn: {
    backgroundColor: 'rgba(239, 83, 80, 0.2)',
    color: '#ef5350',
    border: 'none',
    padding: '3px 8px',
    borderRadius: '3px',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  posBody: {
    fontSize: '12px',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '4px 8px'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '6px',
    textAlign: 'center'
  },
  statsVal: {
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#ffffff',
    marginTop: '2px'
  }
};

export default TradePanel;
