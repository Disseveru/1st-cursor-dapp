import { ethers } from 'ethers';
import { getMainnetProvider, getWallet } from '../connection/provider.js';
import { castSpell } from '../connection/dsa.js';
import { buildArbitrageSpell, buildLiquidationSpell } from './spellBuilder.js';
import { sendFlashbotsBundle } from '../security/flashbots.js';
import { isKillSwitchTripped } from '../security/killSwitch.js';
import settings from '../config/settings.js';
import logger from '../utils/logger.js';
import { estimateGasCostEth } from '../utils/helpers.js';

/**
 * Execute a profitable arbitrage opportunity.
 * Returns true if the transaction was submitted, false otherwise.
 */
export async function executeArbitrage(opportunity) {
  if (await isKillSwitchTripped()) {
    logger.error('Kill-switch tripped — skipping arbitrage execution');
    return false;
  }

  const wallet = getWallet();
  const provider = getMainnetProvider();

  const { targets, datas } = buildArbitrageSpell({
    tokenA: opportunity.tokenA,
    tokenB: opportunity.tokenB,
    amountIn: opportunity.rawAmountIn,
    buyDex: opportunity.buyDex,
    sellDex: opportunity.sellDex,
    walletAddress: wallet.address,
  });

  const estimatedGas = 600_000;
  const gasCost = parseFloat(await estimateGasCostEth(provider, estimatedGas));
  const estimatedProfit = (opportunity.spreadBps / 10000) * parseFloat(opportunity.amountIn);

  if (estimatedProfit <= gasCost) {
    logger.info(
      `Arb not profitable after gas: profit≈${estimatedProfit.toFixed(6)} ETH, gas≈${gasCost.toFixed(6)} ETH`,
    );
    return false;
  }

  if (estimatedProfit < settings.profit.minThreshold) {
    logger.info(`Arb below min threshold: profit≈${estimatedProfit.toFixed(6)} ETH`);
    return false;
  }

  logger.info(`Executing arb: estimated profit=${estimatedProfit.toFixed(6)} ETH, gas=${gasCost.toFixed(6)} ETH`);

  try {
    if (settings.flashbots.authSignerKey) {
      return await sendFlashbotsBundle(targets, datas);
    }
    await castSpell(targets, datas, { gasLimit: estimatedGas });
    return true;
  } catch (err) {
    logger.error(`Arb execution failed: ${err.message}`);
    return false;
  }
}

/**
 * Execute a liquidation on an underwater Aave V3 position.
 */
export async function executeLiquidation(position) {
  if (await isKillSwitchTripped()) {
    logger.error('Kill-switch tripped — skipping liquidation execution');
    return false;
  }

  const wallet = getWallet();
  const provider = getMainnetProvider();

  const debtToCover = ethers.parseUnits(position.totalDebtBase, 8) / 2n;

  const { targets, datas } = buildLiquidationSpell({
    debtToken: ethers.ZeroAddress, // would be resolved from on-chain data in production
    collateralToken: ethers.ZeroAddress,
    borrower: position.borrower,
    debtToCover,
    walletAddress: wallet.address,
  });

  const estimatedGas = 800_000;
  const gasCost = parseFloat(await estimateGasCostEth(provider, estimatedGas));

  logger.info(`Executing liquidation for ${position.borrower}, estimated gas=${gasCost.toFixed(6)} ETH`);

  try {
    if (settings.flashbots.authSignerKey) {
      return await sendFlashbotsBundle(targets, datas);
    }
    await castSpell(targets, datas, { gasLimit: estimatedGas });
    return true;
  } catch (err) {
    logger.error(`Liquidation execution failed: ${err.message}`);
    return false;
  }
}
