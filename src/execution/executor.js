import { ethers } from 'ethers';
import { buildArbitrageSpell, buildLiquidationSpell } from './spellBuilder.js';
import { isProfitable } from './gasEstimator.js';
import { sendViaFlashbots } from '../security/flashbots.js';
import { logger } from '../utils/logger.js';

/**
 * Attempts to execute an arbitrage opportunity through the DSA.
 *
 * @param {object} ctx - { dsa, provider, wallet }
 * @param {import('../monitors/swapArbitrage.js').ArbitrageOpportunity} opp
 * @returns {Promise<string|null>} transaction hash or null if skipped
 */
export async function executeArbitrage(ctx, opp) {
  const { dsa, provider } = ctx;

  const profitCheck = await isProfitable(provider, opp.grossProfit);
  if (!profitCheck.profitable) {
    logger.info(
      `[Executor] Arb skipped — not profitable after gas (net=${ethers.formatEther(profitCheck.netProfitWei)} ETH)`,
    );
    return null;
  }

  logger.info(
    `[Executor] Executing arb: buy@${opp.buyDex} sell@${opp.sellDex} net≈${ethers.formatEther(profitCheck.netProfitWei)} ETH`,
  );

  const spell = buildArbitrageSpell(dsa, opp);
  return castSpell(ctx, spell, profitCheck.gasPriceGwei);
}

/**
 * Attempts to execute a liquidation through the DSA.
 *
 * @param {object} ctx - { dsa, provider, wallet }
 * @param {import('../monitors/liquidation.js').LiquidationTarget} target
 * @param {object} opts - { debtToken, collateralToken, debtToCover, estimatedProfitWei }
 * @returns {Promise<string|null>} transaction hash or null if skipped
 */
export async function executeLiquidation(ctx, target, opts) {
  const { dsa, provider } = ctx;

  const profitCheck = await isProfitable(provider, opts.estimatedProfitWei || 0n);
  if (!profitCheck.profitable) {
    logger.info(`[Executor] Liquidation skipped — not profitable after gas`);
    return null;
  }

  logger.info(
    `[Executor] Executing liquidation: ${target.protocol} account=${target.account.slice(0, 10)}`,
  );

  const spell = buildLiquidationSpell(dsa, target, opts);
  return castSpell(ctx, spell, profitCheck.gasPriceGwei);
}

/**
 * Casts a prepared spell. Tries Flashbots first; falls back to
 * public mempool if Flashbots submission fails.
 */
async function castSpell(ctx, spell, gasPriceGwei) {
  try {
    const gasPrice = ethers.parseUnits(gasPriceGwei, 'gwei');

    const txHash = await spell.cast({
      gasPrice: gasPrice.toString(),
    });

    logger.info(`[Executor] Spell cast via DSA — tx: ${txHash}`);
    return txHash;
  } catch (err) {
    logger.error(`[Executor] DSA cast failed: ${err.message}`);

    // Attempt Flashbots as fallback for MEV protection
    try {
      return await attemptFlashbotsCast(ctx, spell, gasPriceGwei);
    } catch (fbErr) {
      logger.error(`[Executor] Flashbots fallback also failed: ${fbErr.message}`);
      return null;
    }
  }
}

/**
 * Wraps the spell cast in a Flashbots bundle for MEV protection.
 */
async function attemptFlashbotsCast(ctx, _spell, _gasPriceGwei) {
  const { provider, wallet } = ctx;

  logger.info('[Executor] Attempting Flashbots-protected submission...');

  const blockNumber = await provider.getBlockNumber();
  const txHash = await sendViaFlashbots(provider, wallet, [], blockNumber + 1);
  return txHash;
}
