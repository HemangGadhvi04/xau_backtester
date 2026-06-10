
import { Play, Pause, FastForward, Scissors } from 'lucide-react';

const ReplayControls = ({ 
    isPlaying, 
    onTogglePlay, 
    speed, 
    onSpeedChange,
    onNextCandle,
    timeframe,
    onTimeframeChange,
    isSelectingStartBar,
    onToggleSelectStartBar
}) => {
    const speedOptions = [1, 2, 5, 10, 25, 50, 100];
    const timeframes = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];

    return (
        <div style={styles.container}>
            {/* Timeframe Selector */}
            <div style={styles.group}>
                {timeframes.map(tf => (
                    <button
                        key={tf}
                        onClick={() => onTimeframeChange(tf)}
                        style={{
                            ...styles.tfButton,
                            backgroundColor: timeframe === tf ? '#2962ff' : 'transparent',
                            color: timeframe === tf ? '#ffffff' : '#d1d4dc',
                            borderColor: timeframe === tf ? '#2962ff' : '#434651'
                        }}
                    >
                        {tf}
                    </button>
                ))}
            </div>

            {/* Replay State Controls */}
            <div style={styles.group}>
                <button 
                    onClick={onToggleSelectStartBar} 
                    title="Select Start Bar (Cut future candles)"
                    style={{
                        ...styles.button, 
                        backgroundColor: isSelectingStartBar ? '#2962ff' : '#2b3139',
                        color: isSelectingStartBar ? '#ffffff' : '#d1d4dc'
                    }}
                >
                    <Scissors size={18} />
                    <span style={styles.buttonText}>{isSelectingStartBar ? 'Click Candle...' : 'Cut Replay'}</span>
                </button>

                <button 
                    onClick={onTogglePlay} 
                    disabled={isSelectingStartBar}
                    style={{
                        ...styles.button, 
                        backgroundColor: isPlaying ? '#ef5350' : '#26a69a',
                        opacity: isSelectingStartBar ? 0.5 : 1
                    }}
                >
                    {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                    <span style={styles.buttonText}>{isPlaying ? 'Pause' : 'Play'}</span>
                </button>

                <button 
                    onClick={onNextCandle} 
                    disabled={isPlaying || isSelectingStartBar}
                    style={{
                        ...styles.button, 
                        opacity: (isPlaying || isSelectingStartBar) ? 0.5 : 1
                    }}
                >
                    <FastForward size={18} />
                    <span style={styles.buttonText}>Next</span>
                </button>
            </div>

            {/* Speed Selector */}
            <div style={styles.speedGroup}>
                <span style={styles.label}>Speed:</span>
                <select 
                    value={speed} 
                    onChange={(e) => onSpeedChange(Number(e.target.value))}
                    style={styles.select}
                >
                    {speedOptions.map(s => (
                        <option key={s} value={s}>{s}x</option>
                    ))}
                </select>
            </div>
        </div>
    );
};

const styles = {
    container: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 20px',
        backgroundColor: '#1e222d',
        borderBottom: '1px solid #2b3139',
        gap: '20px',
        userSelect: 'none'
    },
    group: {
        display: 'flex',
        gap: '6px',
        alignItems: 'center'
    },
    tfButton: {
        padding: '6px 12px',
        border: '1px solid #434651',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: '600',
        transition: 'all 0.15s ease',
    },
    button: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 14px',
        border: 'none',
        borderRadius: '4px',
        color: '#fff',
        cursor: 'pointer',
        backgroundColor: '#2b3139',
        fontWeight: '500',
        transition: 'background-color 0.2s',
    },
    buttonText: {
        fontSize: '13px',
    },
    speedGroup: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    },
    label: {
        fontSize: '13px',
        color: '#d1d4dc',
    },
    select: {
        padding: '6px 10px',
        backgroundColor: '#2b3139',
        color: '#fff',
        border: '1px solid #434651',
        borderRadius: '4px',
        outline: 'none',
        cursor: 'pointer',
        fontSize: '13px'
    }
};

export default ReplayControls;
