import { useCallback } from 'react';

export function useOrders(token, activeSymbol = 'XAUUSD', onStateUpdated) {
  const submitOrder = useCallback(async ({ direction, orderType = 'MARKET', lots = 0.1, price = null, sl = null, tp = null }) => {
    try {
      const res = await fetch(`/api/replay/order?symbol=${activeSymbol}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          direction,
          order_type: orderType,
          lots,
          price,
          sl,
          tp,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (onStateUpdated) onStateUpdated();
        return data;
      }
    } catch (e) {
      console.error('Failed to submit order', e);
    }
    return null;
  }, [activeSymbol, token, onStateUpdated]);

  const cancelOrder = useCallback(async (orderId) => {
    try {
      const res = await fetch(`/api/replay/order/${orderId}?symbol=${activeSymbol}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        if (onStateUpdated) onStateUpdated();
        return true;
      }
    } catch (e) {
      console.error('Failed to cancel order', e);
    }
    return false;
  }, [activeSymbol, token, onStateUpdated]);

  const closePosition = useCallback(async (positionId) => {
    try {
      const res = await fetch(`/api/replay/position/${positionId}/close?symbol=${activeSymbol}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        if (onStateUpdated) onStateUpdated();
        return true;
      }
    } catch (e) {
      console.error('Failed to close position', e);
    }
    return false;
  }, [activeSymbol, token, onStateUpdated]);

  return {
    submitOrder,
    cancelOrder,
    closePosition,
  };
}
