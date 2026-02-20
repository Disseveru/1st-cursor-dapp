import { ethers } from 'ethers';
import axios from 'axios';
import {
  TOKENS,
  UNISWAP_V3_QUOTER,
  UNISWAP_QUOTER_ABI,
  UNI_V3_FEES,
} from '../config/constants.js';
import { logger } from '../utils/logger.js';

// Uniswap V3 Quoter addresses on L2s
const L2_QUOTERS = {
  arbitrum: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  base: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
};

// WETH addresses on each chain
const WETH_BY_CHAIN = {
  mainnet: TOKENS.WETH,
  arbitrum: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  base: '0x4200000000000000000000000000000000000006',
};

// USDC addresses on each chain
const USDC_BY_CHAIN = {
  mainnet: TOKENS.USDC,
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
};

/**
 * Get best Uniswap V3 quote on a specific chain.
 */
async function getQuoteOnChain(provider, quoterAddress, tokenIn, tokenOut, amountIn) {
  const quoter = new ethers.Contract(quoterAddress, UNISWAP_QUOTER_ABI, provider);
  let best = 0n;
  for (const fee of UNI_V3_FEES) {
    try {
      const result = await quoter.quoteExactInputSingle.staticCall({
        tokenIn,
        tokenOut,
        amountIn,
        fee,
        sqrtPriceLimitX96: 0n,
      });
      const out = result.amountOut ?? result[0];
      if (out > best) best = out;
    } catch {
      // pool may not exist
    }
  }
  return best;
}

/**
 * @typedef {Object} CrossChainOpportunity
 * @property {string} pair
 * @property {string} cheapChain
 * @property {string} expensiveChain
 * @property {bigint} cheapPrice
 * @property {bigint} expensivePrice
 * @property {bigint} priceDelta
 */

/**
 * Compares WETH/USDC prices across Mainnet and configured L2s.
 * Returns opportunities where the price gap exceeds a threshold.
 */
export async function scanCrossChainGaps(providers, minDeltaBps = 30) {
  const opportunities = [];
  const amountIn = ethers.parseEther('1');

  const chains = Object.entries(providers).filter(
    ([name]) => WETH_BY_CHAIN[name] && USDC_BY_CHAIN[name],
  );

  const quotes = {};
  await Promise.all(
    chains.map(async ([chain, provider]) => {
      const quoterAddr = chain === 'mainnet' ? UNISWAP_V3_QUOTER : L2_QUOTERS[chain];
      if (!quoterAddr) return;
      try {
        const out = await getQuoteOnChain(
          provider,
          quoterAddr,
          WETH_BY_CHAIN[chain],
          USDC_BY_CHAIN[chain],
          amountIn,
        );
        quotes[chain] = out;
      } catch (err) {
        logger.debug(`[CrossChain] Quote failed on ${chain}: ${err.message}`);
      }
    }),
  );

  const chainNames = Object.keys(quotes);
  for (let i = 0; i < chainNames.length; i++) {
    for (let j = i + 1; j < chainNames.length; j++) {
      const a = chainNames[i];
      const b = chainNames[j];
      const qA = quotes[a];
      const qB = quotes[b];
      if (qA === 0n || qB === 0n) continue;

      const [cheap, expensive, cheapQ, expQ] =
        qA < qB ? [b, a, qB, qA] : [a, b, qA, qB];
      // cheap chain gives MORE USDC per ETH = ETH is cheaper there
      // expensive chain gives LESS USDC per ETH = ETH is pricier

      const deltaBps = ((cheapQ - expQ) * 10000n) / expQ;

      if (deltaBps >= BigInt(minDeltaBps)) {
        logger.info(
          `[CrossChain] WETH/USDC gap: ${cheap} ${cheapQ} vs ${expensive} ${expQ} (${deltaBps} bps)`,
        );
        opportunities.push({
          pair: 'WETH/USDC',
          cheapChain: expensive,
          expensiveChain: cheap,
          cheapPrice: expQ,
          expensivePrice: cheapQ,
          priceDelta: deltaBps,
        });
      }
    }
  }

  return opportunities;
}

/**
 * Fetches cross-chain balances via Avocado / Instadapp aggregation API.
 * Useful for monitoring the DSA's collateral across chains.
 */
export async function fetchAvocadoBalances(walletAddress) {
  try {
    const { data } = await axios.get(
      `https://api.instadapp.io/defi/balances?owner=${walletAddress}`,
      { timeout: 8000 },
    );
    return data;
  } catch (err) {
    logger.warn(`[Avocado] Balance fetch failed: ${err.message}`);
    return null;
  }
}
