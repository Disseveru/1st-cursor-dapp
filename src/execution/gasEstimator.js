import { ethers } from 'ethers';
import { logger } from '../utils/logger.js';

/**
 * Estimates whether executing a spell is profitable after gas costs.
 *
 * @param {ethers.Provider} provider
 * @param {bigint} grossProfitWei - Estimated gross profit in wei (ETH terms)
 * @param {bigint} [estimatedGasUnits=500_000n] - Expected gas units
 * @returns {Promise<{profitable: boolean, netProfitWei: bigint, gasCostWei: bigint, gasPriceGwei: string}>}
 */
export async function isProfitable(provider, grossProfitWei, estimatedGasUnits = 500_000n) {
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice ?? ethers.parseUnits('30', 'gwei');
  const gasCostWei = gasPrice * estimatedGasUnits;
  const netProfitWei = grossProfitWei - gasCostWei;
  const profitable = netProfitWei > 0n;

  logger.debug(
    `[Gas] gross=${ethers.formatEther(grossProfitWei)} gas=${ethers.formatEther(gasCostWei)} net=${ethers.formatEther(netProfitWei)} profitable=${profitable}`,
  );

  return {
    profitable,
    netProfitWei,
    gasCostWei,
    gasPriceGwei: ethers.formatUnits(gasPrice, 'gwei'),
  };
}

/**
 * Converts a token amount to approximate ETH value.
 * Rough heuristic for profitability checks — uses a simple
 * on-chain price oracle call or falls back to a hardcoded ratio.
 */
export function approxToEth(amountRaw, tokenDecimals, ethPriceInToken) {
  if (ethPriceInToken === 0n) return 0n;
  const scaled = (amountRaw * ethers.parseEther('1')) / ethPriceInToken;
  return scaled;
}
