import { useState, useEffect, useCallback, useRef } from 'react';

export function useReplay(token, activeSymbol = 'XAUUSD', timeframe = '1m') {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [replayState, setReplayState] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const playIntervalRef = useRef(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/replay/state?symbol=${activeSymbol}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setReplayState(data);
        return data;
      }
    } catch (e) {
      console.error('Failed to fetch replay state', e);
    }
    return null;
  }, [activeSymbol, token]);

  const stepForward = useCallback(async (count = 1) => {
    try {
      const res = await fetch(`/api/replay/step?symbol=${activeSymbol}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ count }),
      });
      if (res.ok) {
        const data = await res.json();
        setReplayState(data);
        return data;
      }
    } catch (e) {
      console.error('Failed to step replay', e);
    }
    return null;
  }, [activeSymbol, token]);

  const seekTo = useCallback(async ({ targetIndex, targetTimestamp }) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/replay/seek?symbol=${activeSymbol}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ target_index: targetIndex, target_timestamp: targetTimestamp }),
      });
      if (res.ok) {
        const data = await res.json();
        setReplayState(data);
        return data;
      }
    } catch (e) {
      console.error('Failed to seek replay', e);
    } finally {
      setIsLoading(false);
    }
    return null;
  }, [activeSymbol, token]);

  // Handle Play/Pause timer loop
  useEffect(() => {
    if (isPlaying) {
      const intervalMs = Math.max(50, 1000 / speed);
      playIntervalRef.current = setInterval(() => {
        stepForward(1);
      }, intervalMs);
    } else {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    }
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, [isPlaying, speed, stepForward]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  return {
    isPlaying,
    setIsPlaying,
    speed,
    setSpeed,
    replayState,
    isLoading,
    fetchState,
    stepForward,
    seekTo,
  };
}
