import Web3 from 'web3';
import DSA from 'dsa-connect';
import { ethers } from 'ethers';
import config from './index.js';
import { resolvePrivateKey } from './keyManager.js';
import { logger } from '../utils/logger.js';

let _dsa = null;
let _provider = null;
let _wallet = null;
let _web3 = null;

/**
 * Initialise the Instadapp DSA SDK in Node mode and
 * return the connected dsa instance alongside an ethers Wallet.
 */
export async function initDSA() {
  if (_dsa) return { dsa: _dsa, provider: _provider, wallet: _wallet, web3: _web3 };

  const privateKey = await resolvePrivateKey();
  const pkHex = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;

  _provider = new ethers.JsonRpcProvider(config.rpc.mainnet);
  _wallet = new ethers.Wallet(pkHex, _provider);

  _web3 = new Web3(new Web3.providers.HttpProvider(config.rpc.mainnet));

  _dsa = new DSA({
    web3: _web3,
    mode: 'node',
    privateKey: pkHex,
  });

  if (config.dsaId) {
    await _dsa.setInstance(config.dsaId);
    logger.info(`DSA instance set to ID ${config.dsaId}`);
  } else {
    logger.warn('DSA_ID not set – bot will not be able to cast spells until setInstance() is called');
  }

  const address = _wallet.address;
  const balance = ethers.formatEther(await _provider.getBalance(address));
  logger.info(`Wallet ${address} connected — balance: ${balance} ETH`);

  return { dsa: _dsa, provider: _provider, wallet: _wallet, web3: _web3 };
}

/**
 * Return individual providers for multi-chain monitoring.
 */
export function getProviders() {
  const providers = { mainnet: _provider };

  if (config.rpc.arbitrum) {
    providers.arbitrum = new ethers.JsonRpcProvider(config.rpc.arbitrum);
  }
  if (config.rpc.base) {
    providers.base = new ethers.JsonRpcProvider(config.rpc.base);
  }

  return providers;
}
