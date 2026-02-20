import { ethers } from 'ethers';
import settings from '../config/settings.js';
import logger from '../utils/logger.js';

let mainnetProvider;
let arbitrumProvider;
let baseProvider;
let wallet;

/**
 * Initialise JSON-RPC providers and the signer wallet.
 * Providers are cached as module-level singletons.
 */
export function initProviders() {
  mainnetProvider = new ethers.JsonRpcProvider(settings.rpc.mainnet);
  logger.info('Mainnet provider initialised');

  if (settings.rpc.arbitrum) {
    arbitrumProvider = new ethers.JsonRpcProvider(settings.rpc.arbitrum);
    logger.info('Arbitrum provider initialised');
  }
  if (settings.rpc.base) {
    baseProvider = new ethers.JsonRpcProvider(settings.rpc.base);
    logger.info('Base provider initialised');
  }

  wallet = new ethers.Wallet(settings.privateKey, mainnetProvider);
  logger.info(`Signer address: ${wallet.address}`);

  return { mainnetProvider, arbitrumProvider, baseProvider, wallet };
}

export function getMainnetProvider() {
  if (!mainnetProvider) throw new Error('Providers not initialised — call initProviders() first');
  return mainnetProvider;
}

export function getArbitrumProvider() {
  return arbitrumProvider;
}

export function getBaseProvider() {
  return baseProvider;
}

export function getWallet() {
  if (!wallet) throw new Error('Wallet not initialised — call initProviders() first');
  return wallet;
}
