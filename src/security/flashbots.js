import { ethers } from 'ethers';
import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';
import { getMainnetProvider, getWallet } from '../connection/provider.js';
import { getDSAContract } from '../connection/dsa.js';
import settings from '../config/settings.js';
import logger from '../utils/logger.js';

let flashbotsProvider = null;

/**
 * Lazily initialise the Flashbots bundle provider.
 * A dedicated auth signer is used so the bot's main key is never exposed
 * to the Flashbots relay as an identity.
 */
async function getFlashbotsProvider() {
  if (flashbotsProvider) return flashbotsProvider;

  const provider = getMainnetProvider();
  const authSigner = settings.flashbots.authSignerKey
    ? new ethers.Wallet(settings.flashbots.authSignerKey)
    : ethers.Wallet.createRandom();

  flashbotsProvider = await FlashbotsBundleProvider.create(
    provider,
    authSigner,
    settings.flashbots.relayUrl,
  );

  logger.info('Flashbots provider initialised');
  return flashbotsProvider;
}

/**
 * Package a dsa.cast() call into a Flashbots bundle and submit it.
 * The bundle targets the *next* block so it has the highest chance of inclusion.
 *
 * @param {string[]} targets  Instadapp connector target names
 * @param {string[]} datas    ABI-encoded calldata per target
 * @param {{ gasLimit?: number }} [opts]
 * @returns {boolean} true if the bundle was included, false otherwise
 */
export async function sendFlashbotsBundle(targets, datas, opts = {}) {
  const provider = getMainnetProvider();
  const wallet = getWallet();
  const dsaContract = getDSAContract();
  const fbProvider = await getFlashbotsProvider();

  const blockNumber = await provider.getBlockNumber();
  const targetBlock = blockNumber + 1;

  const feeData = await provider.getFeeData();
  const maxFeePerGas = feeData.maxFeePerGas ?? ethers.parseUnits('50', 'gwei');
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? ethers.parseUnits('3', 'gwei');

  const tx = await dsaContract.cast.populateTransaction(targets, datas, wallet.address, {
    gasLimit: opts.gasLimit ?? 3_000_000,
    maxFeePerGas,
    maxPriorityFeePerGas,
    type: 2,
    chainId: 1,
  });

  tx.from = wallet.address;
  tx.nonce = await provider.getTransactionCount(wallet.address, 'latest');

  const signedBundle = await fbProvider.signBundle([{ signer: wallet, transaction: tx }]);

  const simulation = await fbProvider.simulate(signedBundle, targetBlock);
  if (simulation.firstRevert) {
    logger.error(`Flashbots simulation reverted: ${JSON.stringify(simulation.firstRevert)}`);
    return false;
  }
  logger.info(`Flashbots simulation OK — gas used: ${simulation.totalGasUsed}`);

  const bundleResponse = await fbProvider.sendBundle(signedBundle, targetBlock);
  logger.info(`Bundle submitted for block ${targetBlock}`);

  const resolution = await bundleResponse.wait();
  if (resolution === 0) {
    logger.info('Flashbots bundle included successfully');
    return true;
  }

  logger.warn(`Bundle not included in block ${targetBlock} (resolution=${resolution})`);
  return false;
}
