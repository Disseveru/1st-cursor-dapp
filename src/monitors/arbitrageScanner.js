import { ethers } from 'ethers';
import { getMainnetProvider } from '../connection/provider.js';
import {
  UNISWAP_V3,
  SUSHISWAP,
  CURVE,
  TOKEN_PAIRS,
} from '../config/addresses.js';
import {
  UNISWAP_V3_QUOTER_ABI,
  SUSHISWAP_ROUTER_ABI,
  CURVE_REGISTRY_ABI,
} from '../config/abis.js';
import logger from '../utils/logger.js';
import { retry, formatTokenAmount, parseTokenAmount } from '../utils/helpers.js';

const UNI_V3_FEES = [500, 3000, 10000]; // 0.05%, 0.3%, 1%

/**
 * Fetch the best Uniswap V3 quote across all fee tiers using staticCall
 * on the QuoterV2 contract.
 */
async function getUniswapV3Quote(quoter, tokenIn, tokenOut, amountIn) {
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
      // Pool may not exist for this fee tier — skip.
    }
  }
  return bestOut;
}

/**
 * Fetch a SushiSwap V2 quote via getAmountsOut.
 */
async function getSushiswapQuote(router, tokenIn, tokenOut, amountIn) {
  try {
    const amounts = await router.getAmountsOut(amountIn, [tokenIn, tokenOut]);
    return amounts[amounts.length - 1];
  } catch {
    return 0n;
  }
}

/**
 * Fetch a Curve quote via the on-chain registry.
 */
async function getCurveQuote(registry, tokenIn, tokenOut, amountIn) {
  try {
    const pool = await registry.find_pool_for_coins(tokenIn, tokenOut);
    if (pool === ethers.ZeroAddress) return 0n;
    return await registry.get_exchange_amount(pool, tokenIn, tokenOut, amountIn);
  } catch {
    return 0n;
  }
}

/**
 * A single pass: for each tracked token pair, fetch prices from all three
 * DEXes and return any opportunities where a round-trip yields profit.
 * @returns {Array<{pair, buyDex, sellDex, profit, amountIn, buyOut, sellOut}>}
 */
export async function scanArbitrageOpportunities() {
  const provider = getMainnetProvider();

  const quoter = new ethers.Contract(UNISWAP_V3.quoterV2, UNISWAP_V3_QUOTER_ABI, provider);
  const sushiRouter = new ethers.Contract(SUSHISWAP.router, SUSHISWAP_ROUTER_ABI, provider);
  const curveReg = new ethers.Contract(CURVE.registry, CURVE_REGISTRY_ABI, provider);

  const opportunities = [];

  for (const pair of TOKEN_PAIRS) {
    const amountIn = parseTokenAmount('1', pair.decimalsA);

    const quotes = await retry(async () => {
      const [uniOut, sushiOut, curveOut] = await Promise.all([
        getUniswapV3Quote(quoter, pair.tokenA, pair.tokenB, amountIn),
        getSushiswapQuote(sushiRouter, pair.tokenA, pair.tokenB, amountIn),
        getCurveQuote(curveReg, pair.tokenA, pair.tokenB, amountIn),
      ]);
      return { uniOut, sushiOut, curveOut };
    });

    const dexQuotes = [
      { name: 'UniswapV3', out: quotes.uniOut },
      { name: 'SushiSwap', out: quotes.sushiOut },
      { name: 'Curve', out: quotes.curveOut },
    ].filter((q) => q.out > 0n);

    if (dexQuotes.length < 2) continue;

    dexQuotes.sort((a, b) => (a.out > b.out ? -1 : a.out < b.out ? 1 : 0));

    const best = dexQuotes[0];
    const worst = dexQuotes[dexQuotes.length - 1];

    if (best.out <= worst.out) continue;

    const spreadBps = ((best.out - worst.out) * 10000n) / best.out;

    if (spreadBps > 10n) {
      const opp = {
        pair: `${pair.symbolA}/${pair.symbolB}`,
        buyDex: worst.name,
        sellDex: best.name,
        spreadBps: Number(spreadBps),
        amountIn: formatTokenAmount(amountIn, pair.decimalsA),
        buyQuote: formatTokenAmount(worst.out, pair.decimalsB),
        sellQuote: formatTokenAmount(best.out, pair.decimalsB),
        tokenA: pair.tokenA,
        tokenB: pair.tokenB,
        rawAmountIn: amountIn,
      };
      logger.info(
        `Arb opportunity: ${opp.pair} buy@${opp.buyDex}(${opp.buyQuote}) sell@${opp.sellDex}(${opp.sellQuote}) spread=${opp.spreadBps}bps`,
      );
      opportunities.push(opp);
    }
  }

  return opportunities;
}
