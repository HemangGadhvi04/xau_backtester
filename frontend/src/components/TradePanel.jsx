import { useState } from 'react';
import { TrendingUp, TrendingDown, ChevronDown, ChevronRight } from 'lucide-react';
import { getSymbolConfig } from '../utils/symbolConfig';

const TradePanel = ({ 
  account, 
  onPlaceOrder, 
  currentPrice,
  activeSymbol,

  // Lifted state props
  orderType,
  setOrderType,
  limitPrice,
  setLimitPrice,
  plannedDirection,
  setPlannedDirection,
  slPips,
  setSlPips,
  tpPips,
  setTpPips,
  riskPercent,
  setRiskPercent,
  customLots,
  setCustomLots,
  isLotMode,
  setIsLotMode
}) => {
  const [isOrderExpanded, setIsOrderExpanded] = useState(true);

  const cfg = getSymbolConfig(activeSymbol);
  const pipValuePerLot = cfg.pipSize * cfg.contractSize;

  // Position sizing
  const calculateLotSize = () => {
    if (isLotMode) {
      return parseFloat(customLots) || 0.01;
    }
    const riskAmount = (account.balance * (riskPercent / 100));
    const calculatedLots = riskAmount / (slPips * pipValuePerLot);
    return Math.max(0.01, Math.round(calculatedLots * 100) / 100);
  };

  const currentLots = calculateLotSize();

  const handleBuy = () => {
    const entry = orderType === 'LIMIT' ? parseFloat(limitPrice) : currentPrice;
    if (!entry) return;
    const slPrice = entry - (slPips * cfg.pipSize);
    const tpPrice = entry + (tpPips * cfg.pipSize);
    onPlaceOrder('BUY', currentLots, entry, slPrice, tpPrice, orderType === 'LIMIT');
    setPlannedDirection(null);
  };

  const handleSell = () => {
    const entry = orderType === 'LIMIT' ? parseFloat(limitPrice) : currentPrice;
    if (!entry) return;
    const slPrice = entry + (slPips * cfg.pipSize);
    const tpPrice = entry - (tpPips * cfg.pipSize);
    onPlaceOrder('SELL', currentLots, entry, slPrice, tpPrice, orderType === 'LIMIT');
    setPlannedDirection(null);
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
      <div style={{ ...styles.section, borderBottom: 'none' }}>
        <div 
          onClick={() => setIsOrderExpanded(!isOrderExpanded)} 
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: isOrderExpanded ? '10px' : '0' }}
        >
          <h3 style={{ ...styles.sectionTitle, margin: 0 }}>New Order</h3>
          {isOrderExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
        
        {isOrderExpanded && (
          <>
            {/* Direction Selection */}
            <div style={{...styles.modeToggleGroup, marginBottom: '8px'}}>
              <button 
                style={{...styles.toggleButton, backgroundColor: plannedDirection === 'BUY' ? '#26a69a' : '#2b3139', border: plannedDirection === 'BUY' ? '1px solid #ffffff' : 'none'}}
                onClick={() => setPlannedDirection('BUY')}
              >
                BUY Direction
              </button>
              <button 
                style={{...styles.toggleButton, backgroundColor: plannedDirection === 'SELL' ? '#ef5350' : '#2b3139', border: plannedDirection === 'SELL' ? '1px solid #ffffff' : 'none'}}
                onClick={() => setPlannedDirection('SELL')}
              >
                SELL Direction
              </button>
              {plannedDirection && (
                <button 
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid #434651',
                    color: '#787b86',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    padding: '0 8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Cancel Planned Order"
                  onClick={() => setPlannedDirection(null)}
                >
                  ✕
                </button>
              )}
            </div>

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
	                  if (!limitPrice && currentPrice) setLimitPrice(currentPrice.toFixed(cfg.precision));
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
	                  step={cfg.pipSize}
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
              <div>Risk per pip: <strong>${(currentLots * pipValuePerLot).toFixed(2)}</strong></div>
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
    </div>
  );
};

const styles = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#1e222d',
    borderLeft: '1px solid #2b3139',
    color: '#d1d4dc',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    overflowY: 'auto',
    boxSizing: 'border-box',
    padding: '16px'
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
  }
};

export default TradePanel;
