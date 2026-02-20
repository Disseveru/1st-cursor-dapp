/**
 * Minimal ABI fragments for on-chain reads.
 * Only the functions we actually call are included to keep the bundle small.
 */

export const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

export const UNISWAP_V3_QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
];

export const UNISWAP_V3_FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)',
];

export const SUSHISWAP_ROUTER_ABI = [
  'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
];

export const CURVE_REGISTRY_ABI = [
  'function find_pool_for_coins(address _from, address _to) external view returns (address)',
  'function get_exchange_amount(address _pool, address _from, address _to, uint256 _amount) external view returns (uint256)',
];

export const AAVE_V3_POOL_ABI = [
  'function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
];

export const AAVE_V3_DATA_PROVIDER_ABI = [
  'function getAllReservesTokens() external view returns ((string symbol, address tokenAddress)[])',
  'function getUserReserveData(address asset, address user) external view returns (uint256 currentATokenBalance, uint256 currentStableDebtTokenBalance, uint256 currentVariableDebtTokenBalance, uint256 principalStableDebt, uint256 scaledVariableDebt, uint256 stableBorrowRate, uint256 liquidityRate, uint40 stableRateLastUpdated, bool usageAsCollateralEnabled)',
];

export const COMPOUND_V3_COMET_ABI = [
  'function isLiquidatable(address account) external view returns (bool)',
  'function borrowBalanceOf(address account) external view returns (uint256)',
  'function getAssetInfo(uint8 i) external view returns ((uint8 offset, address asset, address priceFeed, uint64 scale, uint64 borrowCollateralFactor, uint64 liquidateCollateralFactor, uint64 liquidationFactor, uint128 supplyCap))',
  'function numAssets() external view returns (uint8)',
  'function baseToken() external view returns (address)',
  'function absorb(address absorber, address[] memory accounts) external',
];
