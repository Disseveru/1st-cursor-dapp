// Well-known token addresses (Ethereum Mainnet)
export const TOKENS = {
  ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
};

// Uniswap V3 Quoter V2
export const UNISWAP_V3_QUOTER = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e';

// SushiSwap Router
export const SUSHISWAP_ROUTER = '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F';

// Curve Router
export const CURVE_ROUTER = '0xF0d4c12A5768D806021F80a262B4d39d26C58b8D';

// Aave V3 Pool (Ethereum Mainnet)
export const AAVE_V3_POOL = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';

// Compound V3 Comet (USDC market, Mainnet)
export const COMPOUND_V3_COMET = '0xc3d688B66703497DAA19211EEdff47f25384cdc3';

// Instadapp connector names
export const CONNECTORS = {
  INSTAPOOL_V5: 'INSTAPOOL-C',
  UNISWAP_V3: 'UNISWAP-V3-A',
  AAVE_V3: 'AAVE-V3-A',
  COMPOUND_V3: 'COMPOUND-V3-A',
  BASIC: 'BASIC-A',
};

// ERC-20 minimal ABI
export const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

// Uniswap V3 Quoter V2 ABI (quoteExactInputSingle)
export const UNISWAP_QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
];

// SushiSwap Router ABI (getAmountsOut)
export const SUSHISWAP_ROUTER_ABI = [
  'function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts)',
];

// Aave V3 Pool ABI (getUserAccountData)
export const AAVE_POOL_ABI = [
  'function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
];

// Compound V3 Comet ABI
export const COMPOUND_COMET_ABI = [
  'function borrowBalanceOf(address account) external view returns (uint256)',
  'function isLiquidatable(address account) external view returns (bool)',
  'function absorb(address absorber, address[] calldata accounts) external',
];

// Common pool fee tiers for Uniswap V3
export const UNI_V3_FEES = [100, 500, 3000, 10000];
