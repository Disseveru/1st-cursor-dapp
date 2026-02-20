/**
 * On-chain contract addresses used by the monitors and execution engine.
 * All addresses are Ethereum Mainnet unless noted otherwise.
 */

export const TOKENS = {
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
};

export const UNISWAP_V3 = {
  factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  quoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
};

export const SUSHISWAP = {
  router: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',
  factory: '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac',
};

export const CURVE = {
  registry: '0x90E00ACe148ca3b23Ac1bC8C240C2a7Dd9c2d7f5',
  addressProvider: '0x0000000022D53366457F9d5E68Ec105046FC4383',
};

export const AAVE_V3 = {
  pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
  poolDataProvider: '0x7B4EB56E7CD4b454BA8ff71E4518426c01f87',
  oracle: '0x54586bE62E3c3580375aE3723C145253060Ca0C2',
};

export const COMPOUND_V3 = {
  comet_USDC: '0xc3d688B66703497DAA19211EEdff47f25384cdc3',
};

export const INSTADAPP = {
  instaIndex: '0x2971AdFa57b20E5a416aE5a708A8655A9c74f723',
  flashloanConnector: 'INSTAPOOL-C',
  uniswapConnector: 'UNISWAP-V3-A',
  aaveConnector: 'AAVE-V3-A',
  compoundConnector: 'COMPOUND-V3-A',
  basicConnector: 'BASIC-A',
};

export const TOKEN_PAIRS = [
  { tokenA: TOKENS.WETH, tokenB: TOKENS.USDC, symbolA: 'WETH', symbolB: 'USDC', decimalsA: 18, decimalsB: 6 },
  { tokenA: TOKENS.WETH, tokenB: TOKENS.DAI, symbolA: 'WETH', symbolB: 'DAI', decimalsA: 18, decimalsB: 18 },
  { tokenA: TOKENS.WBTC, tokenB: TOKENS.WETH, symbolA: 'WBTC', symbolB: 'WETH', decimalsA: 8, decimalsB: 18 },
  { tokenA: TOKENS.WETH, tokenB: TOKENS.USDT, symbolA: 'WETH', symbolB: 'USDT', decimalsA: 18, decimalsB: 6 },
];
