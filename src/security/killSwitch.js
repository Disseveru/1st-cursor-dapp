import { ethers } from 'ethers';
import { getMainnetProvider, getWallet } from '../connection/provider.js';
import settings from '../config/settings.js';
import logger from '../utils/logger.js';

let halted = false;

/**
 * Check whether the kill-switch should be engaged.
 *
 * The switch trips when the wallet's ETH balance drops below the
 * configured MIN_ETH_BALANCE threshold. Once tripped it stays latched
 * until explicitly reset (prevents repeated gas-wasting attempts).
 */
export async function isKillSwitchTripped() {
  if (halted) return true;

  const provider = getMainnetProvider();
  const wallet = getWallet();

  try {
    const balance = await provider.getBalance(wallet.address);
    const balanceEth = parseFloat(ethers.formatEther(balance));

    if (balanceEth < settings.killSwitch.minEthBalance) {
      halted = true;
      logger.error(
        `KILL-SWITCH ENGAGED — wallet balance ${balanceEth.toFixed(6)} ETH < threshold ${settings.killSwitch.minEthBalance} ETH. All operations halted.`,
      );
      return true;
    }

    logger.debug(`Kill-switch check: balance=${balanceEth.toFixed(6)} ETH — OK`);
    return false;
  } catch (err) {
    logger.error(`Kill-switch balance check failed: ${err.message} — engaging as a precaution`);
    halted = true;
    return true;
  }
}

/**
 * Manually reset the kill-switch (e.g. after topping up gas funds).
 */
export function resetKillSwitch() {
  halted = false;
  logger.warn('Kill-switch manually reset');
}

/**
 * Check if the bot is currently halted.
 */
export function isHalted() {
  return halted;
}
