import { useState } from 'react';
import { getSymbolConfig } from '../utils/symbolConfig';

const TerminalPanel = ({
  account,
  positions,
  onClosePosition,
  pendingOrders = [],
  onCancelPendingOrder,
  history,
  currentPrice,
  onReviewTrade,
  activeSymbol
}) => {
  const [activeTab, setActiveTab] = useState('open'); // 'open', 'pending', 'closed'

  const cfg = getSymbolConfig(activeSymbol);

  // Stats calculation
  const totalTrades = history.length;
  const winningTrades = history.filter(t => t.pnl > 0).length;
  const winRate = totalTrades > 0 ? ((winningTrades / totalTrades) * 100).toFixed(1) : '0';
  const totalNet = history.reduce((sum, t) => sum + t.pnl, 0);

  // Profit/Loss calculations for open positions
  const openPositionsPnl = positions.reduce((total, pos) => {
    const isBuy = pos.type === 'BUY';
    const priceDiff = isBuy ? (currentPrice - pos.entryPrice) : (pos.entryPrice - currentPrice);
    return total + (priceDiff * pos.lots * cfg.contractSize);
  }, 0);

  const usedMargin = positions.reduce((total, pos) => total + (pos.entryPrice * pos.lots * cfg.contractSize) / 100, 0); // 1:100 leverage
  const freeMargin = account.equity - usedMargin;

  return (
    <div style={styles.container}>
      {/* Tab bar header */}
      <div style={styles.tabHeader}>
        <div style={styles.tabGroup}>
          <button 
            style={{ ...styles.tabButton, borderBottom: activeTab === 'open' ? '2px solid #2962ff' : '2px solid transparent', color: activeTab === 'open' ? '#ffffff' : '#787b86' }}
            onClick={() => setActiveTab('open')}
          >
            Open ({positions.length})
          </button>
          <button 
            style={{ ...styles.tabButton, borderBottom: activeTab === 'pending' ? '2px solid #2962ff' : '2px solid transparent', color: activeTab === 'pending' ? '#ffffff' : '#787b86' }}
            onClick={() => setActiveTab('pending')}
          >
            Pending ({pendingOrders.length})
          </button>
          <button 
            style={{ ...styles.tabButton, borderBottom: activeTab === 'closed' ? '2px solid #2962ff' : '2px solid transparent', color: activeTab === 'closed' ? '#ffffff' : '#787b86' }}
            onClick={() => setActiveTab('closed')}
          >
            Closed History ({history.length})
          </button>
        </div>
        <div style={styles.quickStats}>
          <span>Floating P/L: <strong style={{ color: openPositionsPnl >= 0 ? '#26a69a' : '#ef5350' }}>${openPositionsPnl.toFixed(2)}</strong></span>
          <span style={{ margin: '0 8px', color: '#2b3139' }}>|</span>
          <span>Win Rate: <strong style={{ color: '#ffffff' }}>{winRate}%</strong></span>
          <span style={{ margin: '0 8px', color: '#2b3139' }}>|</span>
          <span>Net P&L: <strong style={{ color: totalNet >= 0 ? '#26a69a' : '#ef5350' }}>${totalNet.toFixed(2)}</strong></span>
        </div>
      </div>

      {/* Grid Content Panel */}
      <div style={styles.gridContainer}>
        {activeTab === 'open' && (
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHeaderRow}>
                <th style={styles.th}>Symbol</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Volume, lot</th>
                <th style={styles.th}>Open price</th>
                <th style={styles.th}>Current price</th>
                <th style={styles.th}>T/P</th>
                <th style={styles.th}>S/L</th>
                <th style={styles.th}>Open time</th>
                <th style={styles.th}>P/L, USD</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {positions.length === 0 ? (
                <tr>
                  <td colSpan="10" style={styles.noTrades}>No open positions</td>
                </tr>
              ) : (
                positions.map((pos) => {
                  const isBuy = pos.type === 'BUY';
                  const priceDiff = isBuy ? (currentPrice - pos.entryPrice) : (pos.entryPrice - currentPrice);
                  const unrealizedPnl = priceDiff * pos.lots * cfg.contractSize;
                  return (
                    <tr key={pos.id} style={styles.tableRow}>
                      <td style={{ ...styles.td, color: '#ffffff', fontWeight: 'bold' }}>{activeSymbol}</td>
                      <td style={{ ...styles.td, color: isBuy ? '#26a69a' : '#ef5350', fontWeight: 'bold' }}>
                        {isBuy ? '● Buy' : '● Sell'}
                      </td>
                      <td style={styles.td}>{pos.lots.toFixed(2)}</td>
                      <td style={styles.td}>{pos.entryPrice.toFixed(cfg.precision)}</td>
                      <td style={styles.td}>{currentPrice ? currentPrice.toFixed(cfg.precision) : '-'}</td>
                      <td style={{ ...styles.td, color: '#26a69a' }}>{pos.tp ? pos.tp.toFixed(cfg.precision) : '-'}</td>
                      <td style={{ ...styles.td, color: '#ef5350' }}>{pos.sl ? pos.sl.toFixed(cfg.precision) : '-'}</td>
                      <td style={styles.td}>{pos.timestamp ? new Date(pos.timestamp * 1000).toLocaleTimeString() : '-'}</td>
                      <td style={{ ...styles.td, fontWeight: 'bold', color: unrealizedPnl >= 0 ? '#26a69a' : '#ef5350' }}>
                        {unrealizedPnl >= 0 ? '+' : ''}{unrealizedPnl.toFixed(2)}
                      </td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>
                        <button onClick={() => onClosePosition(pos.id, currentPrice)} style={styles.closeBtn}>
                          Close
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}

        {activeTab === 'pending' && (
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHeaderRow}>
                <th style={styles.th}>Symbol</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Volume, lot</th>
                <th style={styles.th}>Limit Price</th>
                <th style={styles.th}>T/P</th>
                <th style={styles.th}>S/L</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingOrders.length === 0 ? (
                <tr>
                  <td colSpan="7" style={styles.noTrades}>No pending limit orders</td>
                </tr>
              ) : (
                pendingOrders.map((order) => (
                  <tr key={order.id} style={styles.tableRow}>
                    <td style={{ ...styles.td, color: '#ffffff', fontWeight: 'bold' }}>{activeSymbol}</td>
                    <td style={{ ...styles.td, color: order.type === 'BUY' ? '#26a69a' : '#ef5350', fontWeight: 'bold' }}>
                      {order.type === 'BUY' ? '● Buy Limit' : '● Sell Limit'}
                    </td>
                    <td style={styles.td}>{order.lots.toFixed(2)}</td>
                    <td style={styles.td}>{order.entryPrice.toFixed(cfg.precision)}</td>
                    <td style={{ ...styles.td, color: '#26a69a' }}>{order.tp ? order.tp.toFixed(cfg.precision) : '-'}</td>
                    <td style={{ ...styles.td, color: '#ef5350' }}>{order.sl ? order.sl.toFixed(cfg.precision) : '-'}</td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>
                      <button onClick={() => onCancelPendingOrder(order.id)} style={styles.closeBtn}>
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {activeTab === 'closed' && (
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHeaderRow}>
                <th style={styles.th}>Symbol</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Volume, lot</th>
                <th style={styles.th}>Open price</th>
                <th style={styles.th}>Close price</th>
                <th style={styles.th}>T/P</th>
                <th style={styles.th}>S/L</th>
                <th style={styles.th}>Close time</th>
                <th style={styles.th}>P/L, USD</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan="9" style={styles.noTrades}>No trade history available</td>
                </tr>
              ) : (
                history.map((trade) => {
                  const isWin = trade.pnl > 0;
                  return (
                    <tr 
                      key={trade.id} 
                      onClick={() => onReviewTrade && onReviewTrade(trade)} 
                      style={{ ...styles.tableRow, cursor: 'pointer' }}
                    >
                      <td style={{ ...styles.td, color: '#ffffff', fontWeight: 'bold' }}>{activeSymbol}</td>
                      <td style={{ ...styles.td, color: trade.type === 'BUY' ? '#26a69a' : '#ef5350', fontWeight: 'bold' }}>
                        {trade.type === 'BUY' ? '● Buy' : '● Sell'}
                      </td>
                      <td style={styles.td}>{trade.lots.toFixed(2)}</td>
                      <td style={styles.td}>{trade.entryPrice.toFixed(cfg.precision)}</td>
                      <td style={styles.td}>{trade.closePrice ? trade.closePrice.toFixed(cfg.precision) : '-'}</td>
                      <td style={{ ...styles.td, color: '#26a69a' }}>{trade.tp ? trade.tp.toFixed(cfg.precision) : '-'}</td>
                      <td style={{ ...styles.td, color: '#ef5350' }}>{trade.sl ? trade.sl.toFixed(cfg.precision) : '-'}</td>
                      <td style={styles.td}>{trade.closeTime ? new Date(trade.closeTime * 1000).toLocaleTimeString() : '-'}</td>
                      <td style={{ ...styles.td, fontWeight: 'bold', color: isWin ? '#26a69a' : '#ef5350' }}>
                        {isWin ? '+' : ''}{trade.pnl.toFixed(2)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Real-time trading status footer */}
      <div style={styles.footer}>
        <div style={styles.footerItem}>Equity: <span style={{ color: '#ffffff', fontWeight: 'bold' }}>${account.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span></div>
        <div style={styles.footerItem}>Free Margin: <span style={{ color: '#ffffff', fontWeight: 'bold' }}>${freeMargin.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span></div>
        <div style={styles.footerItem}>Balance: <span style={{ color: '#ffffff', fontWeight: 'bold' }}>${account.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span></div>
        <div style={styles.footerItem}>Margin: <span style={{ color: '#ffffff', fontWeight: 'bold' }}>${usedMargin.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span></div>
        <div style={styles.footerItem}>Margin level: <span style={{ color: '#ffffff', fontWeight: 'bold' }}>{usedMargin > 0 ? `${((account.equity / usedMargin) * 100).toFixed(0)}%` : '—'}</span></div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#1c2030',
    borderTop: '1px solid #2b3139',
    color: '#d1d4dc',
    fontFamily: 'sans-serif',
    boxSizing: 'border-box'
  },
  tabHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#131722',
    borderBottom: '1px solid #2b3139',
    height: '38px',
    padding: '0 12px',
    flexShrink: 0
  },
  tabGroup: {
    display: 'flex',
    gap: '16px',
    height: '100%'
  },
  tabButton: {
    background: 'none',
    border: 'none',
    fontSize: '12px',
    fontWeight: 'bold',
    cursor: 'pointer',
    height: '100%',
    padding: '0 4px',
    outline: 'none',
    transition: 'all 0.15s ease'
  },
  quickStats: {
    fontSize: '11px',
    color: '#787b86',
    display: 'flex',
    alignItems: 'center'
  },
  gridContainer: {
    flex: 1,
    overflowY: 'auto'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px',
    textAlign: 'left'
  },
  tableHeaderRow: {
    borderBottom: '1px solid #2b3139',
    backgroundColor: '#131722',
    position: 'sticky',
    top: 0,
    zIndex: 5
  },
  th: {
    padding: '8px 12px',
    color: '#787b86',
    fontWeight: 'normal',
    fontSize: '11px'
  },
  tableRow: {
    borderBottom: '1px solid #2b3139',
    transition: 'background-color 0.2s',
    '&:hover': {
      backgroundColor: '#2b3139'
    }
  },
  td: {
    padding: '8px 12px',
    color: '#d1d4dc'
  },
  closeBtn: {
    backgroundColor: 'rgba(239, 83, 80, 0.2)',
    color: '#ef5350',
    border: 'none',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  noTrades: {
    padding: '24px',
    textAlign: 'center',
    color: '#787b86'
  },
  footer: {
    display: 'flex',
    gap: '24px',
    padding: '8px 16px',
    backgroundColor: '#131722',
    borderTop: '1px solid #2b3139',
    fontSize: '11px',
    color: '#787b86',
    flexShrink: 0
  },
  footerItem: {
    display: 'flex',
    gap: '4px'
  }
};

export default TerminalPanel;
