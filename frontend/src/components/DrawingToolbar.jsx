
import { 
  MousePointer, 
  TrendingUp, 
  Minus, 
  Square, 
  Layers, 
  Trash2,
  ArrowRight,
  ArrowDown,
  Waypoints,
  Ruler,
  Clock,
  BarChart2
} from 'lucide-react';

const RiskRewardIcon = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3" y="4" width="18" height="7" rx="1.5" fill="rgba(38, 166, 154, 0.35)" stroke="#26a69a" />
    <rect x="3" y="13" width="18" height="7" rx="1.5" fill="rgba(239, 83, 80, 0.35)" stroke="#ef5350" />
    <line x1="2" y1="12" x2="22" y2="12" stroke="#ffffff" strokeWidth="1.5" strokeDasharray="2 2" />
  </svg>
);

const DrawingToolbar = ({ activeTool, onChangeTool, onClearDrawings, showSessions, onToggleSessions }) => {
  const tools = [
    { id: 'cursor', label: 'Cursor', icon: MousePointer },
    { id: 'trendline', label: 'Trendline', icon: TrendingUp },
    { id: 'horizontal', label: 'Horizontal Line', icon: Minus },
    { id: 'horizontal_ray', label: 'Horizontal Ray', icon: ArrowRight },
    { id: 'vertical_ray', label: 'Vertical Ray', icon: ArrowDown },
    { id: 'rectangle', label: 'Rectangle', icon: Square },
    { id: 'fib', label: 'Fib Retracement', icon: Layers },
    { id: 'path', label: 'Path Tool (Structure)', icon: Waypoints },
    { id: 'risk_reward', label: 'Risk/Reward Tool', icon: RiskRewardIcon },
    { id: 'scale', label: 'Scale Tool (Measure)', icon: Ruler },
    { id: 'volume_profile', label: 'Fixed Range Volume Profile', icon: BarChart2 },
  ];

  return (
    <div style={styles.toolbar}>
      {tools.map(tool => {
        const IconComponent = tool.icon;
        const isActive = activeTool === tool.id;
        return (
          <button
            key={tool.id}
            onClick={() => onChangeTool(tool.id)}
            title={tool.label}
            className={`drawing-tool-btn ${isActive ? 'active' : ''}`}
          >
            <IconComponent size={20} />
          </button>
        );
      })}
      
      <div style={styles.divider} />
      
      <button 
        onClick={onToggleSessions}
        title="Toggle ICT Sessions Shading"
        className={`drawing-tool-sessions-btn ${showSessions ? 'active' : ''}`}
      >
        <Clock size={20} />
      </button>

      <button 
        onClick={onClearDrawings}
        title="Clear All Drawings"
        className="drawing-tool-clear-btn"
      >
        <Trash2 size={20} />
      </button>
    </div>
  );
};

const styles = {
  toolbar: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '8px',
    backgroundColor: 'rgba(30, 34, 45, 0.85)',
    backdropFilter: 'blur(10px)',
    borderRight: '1px solid rgba(43, 49, 57, 0.8)',
    width: '48px',
    alignItems: 'center',
    height: '100%',
    boxSizing: 'border-box',
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  clearButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: '#ef5350',
    transition: 'all 0.2s ease',
  },
  divider: {
    width: '24px',
    height: '1px',
    backgroundColor: 'rgba(43, 49, 57, 0.8)',
    margin: '8px 0',
  }
};

export default DrawingToolbar;
