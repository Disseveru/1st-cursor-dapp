import { ethers } from 'ethers';

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Format a bigint token amount to a human-readable string.
 */
export function formatTokenAmount(amount, decimals) {
  return ethers.formatUnits(amount, decimals);
}

/**
 * Parse a human-readable token amount into a bigint.
 */
export function parseTokenAmount(amount, decimals) {
  return ethers.parseUnits(String(amount), decimals);
}

/**
 * Retry an async function with exponential back-off.
 */
export async function retry(fn, { retries = 3, baseDelayMs = 1000 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < retries) {
        const delay = baseDelayMs * 2 ** i;
        await sleep(delay);
      }
    }
  }
  throw lastErr;
}

/**
 * Return the estimated gas cost in ETH for a given gas limit + current fee data.
 */
export async function estimateGasCostEth(provider, gasLimit) {
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice ?? 30_000_000_000n;
  return ethers.formatEther(gasPrice * BigInt(gasLimit));
}
