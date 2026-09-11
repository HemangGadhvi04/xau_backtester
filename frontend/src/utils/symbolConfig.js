export let SYMBOL_CONFIGS = {
  XAUUSD: { pipSize: 0.1, contractSize: 100, precision: 2, defaultSpread: 0.20, displayName: "Gold / U.S. Dollar" },
  EURUSD: { pipSize: 0.0001, contractSize: 100000, precision: 5, defaultSpread: 0.0002, displayName: "Euro / U.S. Dollar" },
  BTCUSD: { pipSize: 1.0, contractSize: 1, precision: 2, defaultSpread: 20.0, displayName: "Bitcoin / U.S. Dollar" }
};

export const updateSymbolConfigs = (newConfigs) => {
  SYMBOL_CONFIGS = { ...SYMBOL_CONFIGS, ...newConfigs };
};

export const getSymbolConfig = (symbol) => {
  const normSym = (symbol || 'XAUUSD').replace('/', '').toUpperCase();
  return SYMBOL_CONFIGS[normSym] || SYMBOL_CONFIGS.XAUUSD;
};
