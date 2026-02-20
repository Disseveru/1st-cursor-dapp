import { ethers } from 'ethers';
import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';
import config from '../config/index.js';
import { logger } from '../utils/logger.js';

let _flashbotsProvider = null;

/**
 * Lazily initialise the Flashbots bundle provider.
 * Uses a dedicated auth signer (not the main wallet) to avoid
 * leaking the searcher's identity.
 */
async function getFlashbotsProvider(provider, _wallet) {
  if (_flashbotsProvider) return _flashbotsProvider;

  const authSigner = config.flashbots.authKey
    ? new ethers.Wallet(config.flashbots.authKey)
    : ethers.Wallet.createRandom();

  // FlashbotsBundleProvider expects ethers v5-style provider/signer.
  // With ethers v6 the library may need the compatibility shim.
  // We wrap in a try/catch so the bot still works without Flashbots.
  try {
    _flashbotsProvider = await FlashbotsBundleProvider.create(
      provider,
      authSigner,
      config.flashbots.relayUrl,
    );
    logger.info('[Flashbots] Provider initialised');
  } catch (err) {
    logger.warn(`[Flashbots] Init failed (${err.message}) — falling back to public mempool`);
    _flashbotsProvider = null;
  }

  return _flashbotsProvider;
}

/**
 * Sends a bundle of signed transactions through the Flashbots relay
 * so they never touch the public mempool.
 *
 * @param {ethers.Provider} provider
 * @param {ethers.Wallet} wallet
 * @param {Array<{to: string, data: string, value?: bigint, gasLimit?: bigint}>} txs
 * @param {number} targetBlockNumber
 * @returns {Promise<string|null>} first tx hash on success, null on failure
 */
export async function sendViaFlashbots(provider, wallet, txs, targetBlockNumber) {
  const fb = await getFlashbotsProvider(provider, wallet);
  if (!fb) {
    throw new Error('Flashbots provider not available');
  }

  const signedBundle = await fb.signBundle(
    txs.map((tx) => ({
      signer: wallet,
      transaction: {
        to: tx.to,
        data: tx.data,
        value: tx.value ?? 0n,
        gasLimit: tx.gasLimit ?? 500_000n,
        chainId: 1,
        type: 2,
      },
    })),
  );

  const simulation = await fb.simulate(signedBundle, targetBlockNumber);

  if ('error' in simulation || simulation.firstRevert) {
    const reason = simulation.error?.message || simulation.firstRevert?.error || 'unknown';
    logger.error(`[Flashbots] Simulation reverted: ${reason}`);
    throw new Error(`Flashbots simulation reverted: ${reason}`);
  }

  logger.info(`[Flashbots] Simulation OK — submitting to block ${targetBlockNumber}`);

  const bundleResponse = await fb.sendRawBundle(signedBundle, targetBlockNumber);

  const resolution = await bundleResponse.wait();
  if (resolution === 0) {
    logger.info('[Flashbots] Bundle included!');
    return bundleResponse.bundleHash;
  }

  // Try the next block as well
  const bundleResponse2 = await fb.sendRawBundle(signedBundle, targetBlockNumber + 1);
  const resolution2 = await bundleResponse2.wait();

  if (resolution2 === 0) {
    logger.info('[Flashbots] Bundle included in next block');
    return bundleResponse2.bundleHash;
  }

  logger.warn('[Flashbots] Bundle not included after 2 blocks');
  return null;
}

/**
 * Build raw transaction data for a DSA cast() call that can be
 * submitted through Flashbots.
 *
 * @param {ethers.Wallet} wallet
 * @param {string} dsaAddress - The DSA contract address
 * @param {string} castCalldata - ABI-encoded cast() calldata
 * @param {object} opts - { gasLimit, maxFeePerGas, maxPriorityFeePerGas }
 */
export function buildFlashbotsTx(wallet, dsaAddress, castCalldata, opts = {}) {
  return {
    to: dsaAddress,
    data: castCalldata,
    value: opts.value ?? 0n,
    gasLimit: opts.gasLimit ?? 600_000n,
  };
}
