import { ethers } from 'ethers';
import {
  TOKENS,
  UNISWAP_V3_QUOTER,
  UNISWAP_QUOTER_ABI,
  SUSHISWAP_ROUTER,
  SUSHISWAP_ROUTER_ABI,
  UNI_V3_FEES,
} from '../config/constants.js';
import { logger } from '../utils/logger.js';

/**
 * Fetches the best Uniswap V3 output for a given pair and amount
 * by trying every standard fee tier via staticCall on the Quoter V2.
 */
async function getUniswapV3Quote(provider, tokenIn, tokenOut, amountIn) {
  const quoter = new ethers.Contract(UNISWAP_V3_QUOTER, UNISWAP_QUOTER_ABI, provider);
  let bestOut = 0n;

  for (const fee of UNI_V3_FEES) {
    try {
      const result = await quoter.quoteExactInputSingle.staticCall({
        tokenIn,
        tokenOut,
        amountIn,
        fee,
        sqrtPriceLimitX96: 0n,
      });
      const amountOut = result.amountOut ?? result[0];
      if (amountOut > bestOut) bestOut = amountOut;
    } catch {
      // pool may not exist for this fee tier
    }
  }
  return bestOut;
}

/**
 * Fetches the SushiSwap output for a given pair.
 */
async function getSushiSwapQuote(provider, tokenIn, tokenOut, amountIn) {
  const pathIn = tokenIn === TOKENS.ETH ? TOKENS.WETH : tokenIn;
  const pathOut = tokenOut === TOKENS.ETH ? TOKENS.WETH : tokenOut;
  const router = new ethers.Contract(SUSHISWAP_ROUTER, SUSHISWAP_ROUTER_ABI, provider);
  try {
    const amounts = await router.getAmountsOut(amountIn, [pathIn, pathOut]);
    return amounts[amounts.length - 1];
  } catch {
    return 0n;
  }
}

/**
 * Fetches a Curve quote via the Curve API (off-chain).
 * Falls back to 0 on any error so the bot never stalls.
 */
async function getCurveQuote(tokenIn, tokenOut, amountIn) {
  try {
    const { default: axios } = await import('axios');
    const url = `https://api.curve.fi/v1/get-best-route?inputToken=${tokenIn}&outputToken=${tokenOut}&amount=${amountIn.toString()}`;
    const { data } = await axios.get(url, { timeout: 5000 });
    return BigInt(data?.data?.outputAmount ?? '0');
  } catch {
    return 0n;
  }
}

/**
 * Core structure representing an arbitrage opportunity.
 * @typedef {Object} ArbitrageOpportunity
 * @property {string} tokenIn
 * @property {string} tokenOut
 * @property {bigint} amountIn
 * @property {string} buyDex
 * @property {string} sellDex
 * @property {bigint} buyPrice
 * @property {bigint} sellPrice
 * @property {bigint} grossProfit  - sellPrice - buyPrice (in tokenOut units)
 */

const DEFAULT_PAIRS = [
  { tokenIn: TOKENS.WETH, tokenOut: TOKENS.USDC, amountIn: ethers.parseEther('1') },
  { tokenIn: TOKENS.WETH, tokenOut: TOKENS.DAI, amountIn: ethers.parseEther('1') },
  { tokenIn: TOKENS.WBTC, tokenOut: TOKENS.WETH, amountIn: 100_000_000n }, // 1 WBTC = 1e8
  { tokenIn: TOKENS.WETH, tokenOut: TOKENS.USDT, amountIn: ethers.parseEther('1') },
];

/**
 * Polls all configured DEXes for the same pairs and returns any
 * opportunities where gross profit > 0.
 */
export async function scanArbitrageOpportunities(provider, pairs = DEFAULT_PAIRS) {
  const opportunities = [];

  for (const { tokenIn, tokenOut, amountIn } of pairs) {
    const label = `${tokenIn.slice(0, 6)}→${tokenOut.slice(0, 6)}`;

    const [uniOut, sushiOut, curveOut] = await Promise.all([
      getUniswapV3Quote(provider, tokenIn, tokenOut, amountIn),
      getSushiSwapQuote(provider, tokenIn, tokenOut, amountIn),
      getCurveQuote(tokenIn, tokenOut, amountIn),
    ]);

    const quotes = [
      { dex: 'uniswap_v3', out: uniOut },
      { dex: 'sushiswap', out: sushiOut },
      { dex: 'curve', out: curveOut },
    ].filter((q) => q.out > 0n);

    if (quotes.length < 2) continue;

    quotes.sort((a, b) => (a.out < b.out ? -1 : a.out > b.out ? 1 : 0));
    const cheapest = quotes[0];
    const richest = quotes[quotes.length - 1];
    const grossProfit = richest.out - cheapest.out;

    if (grossProfit > 0n) {
      logger.debug(
        `[ArbScan] ${label} | buy@${cheapest.dex}=${cheapest.out} sell@${richest.dex}=${richest.out} Δ=${grossProfit}`,
      );
      opportunities.push({
        tokenIn,
        tokenOut,
        amountIn,
        buyDex: cheapest.dex,
        sellDex: richest.dex,
        buyPrice: cheapest.out,
        sellPrice: richest.out,
        grossProfit,
      });
    }
  }

  return opportunities;
}
