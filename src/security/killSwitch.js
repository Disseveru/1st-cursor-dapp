import { ethers } from 'ethers';
import config from '../config/index.js';
import { logger } from '../utils/logger.js';

let _halted = false;

/**
 * Checks whether the gas wallet balance is below the configured
 * minimum ETH threshold.  If so, the bot enters a halted state
 * and all execution is blocked until manually reset.
 *
 * @param {ethers.Provider} provider
 * @param {string} walletAddress
 * @returns {Promise<boolean>} true if the bot should continue, false if halted
 */
export async function checkKillSwitch(provider, walletAddress) {
  if (_halted) return false;

  try {
    const balance = await provider.getBalance(walletAddress);
    const minBalance = ethers.parseEther(config.killSwitch.minEthBalance.toString());

    if (balance < minBalance) {
      _halted = true;
      logger.error(
        `[KillSwitch] HALTED — wallet balance ${ethers.formatEther(balance)} ETH is below minimum ${config.killSwitch.minEthBalance} ETH. ` +
          `All operations stopped to prevent fund drain.`,
      );
      return false;
    }

    logger.debug(`[KillSwitch] OK — balance: ${ethers.formatEther(balance)} ETH`);
    return true;
  } catch (err) {
    logger.error(`[KillSwitch] Balance check failed: ${err.message} — halting as precaution`);
    _halted = true;
    return false;
  }
}

/**
 * Returns the current halt state.
 */
export function isHalted() {
  return _halted;
}

/**
 * Manually resets the kill switch (e.g. after topping up the wallet).
 */
export function resetKillSwitch() {
  _halted = false;
  logger.info('[KillSwitch] Reset — operations may resume');
}
