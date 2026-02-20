import { ethers } from 'ethers';
import settings from '../config/settings.js';
import { getMainnetProvider, getWallet } from './provider.js';
import { INSTADAPP } from '../config/addresses.js';
import logger from '../utils/logger.js';

/**
 * Lightweight Instadapp DSA wrapper that constructs and submits
 * `cast()` transactions against the InstaIndex/InstaAccount contracts.
 *
 * In production you would install the official `@instadapp/dsa-connect` SDK
 * (mode: 'node') and call `dsa.setInstance(dsaId)`.  This wrapper mirrors
 * the same interface so the rest of the bot stays SDK-agnostic and can work
 * even when the SDK is unavailable in a CI/test environment.
 */

const INSTA_ACCOUNT_ABI = [
  'function cast(string[] calldata _targetNames, bytes[] calldata _datas, address _origin) external payable returns (bytes32)',
];

const INSTA_INDEX_ABI = [
  'function build(address _owner, uint256 _accountVersion, address _origin) external returns (address _account)',
  'function account(uint256) external view returns (address)',
];

let dsaAddress = null;
let dsaContract = null;

/**
 * Resolve the on-chain address for the given DSA ID and prepare
 * a contract instance that the execution engine can call.
 */
export async function initDSA() {
  const provider = getMainnetProvider();
  const wallet = getWallet();
  const dsaId = settings.dsaId;

  if (dsaId > 0) {
    const index = new ethers.Contract(INSTADAPP.instaIndex, INSTA_INDEX_ABI, provider);
    dsaAddress = await index.account(dsaId);
    if (dsaAddress === ethers.ZeroAddress) {
      throw new Error(`DSA #${dsaId} does not exist on-chain`);
    }
    logger.info(`DSA #${dsaId} resolved to ${dsaAddress}`);
  } else {
    dsaAddress = wallet.address;
    logger.warn('DSA_ID is 0 — using wallet address as DSA (build a DSA on-chain first for production)');
  }

  dsaContract = new ethers.Contract(dsaAddress, INSTA_ACCOUNT_ABI, wallet);
  return { dsaAddress, dsaContract };
}

/**
 * Submit a `cast()` call with the given spell targets + encoded data.
 * @param {string[]} targets  e.g. ['INSTAPOOL-C', 'UNISWAP-V3-A']
 * @param {string[]} datas    ABI-encoded calldata per target
 * @param {{ value?: bigint, gasLimit?: number }} [opts]
 */
export async function castSpell(targets, datas, opts = {}) {
  if (!dsaContract) throw new Error('DSA not initialised — call initDSA() first');
  const wallet = getWallet();
  const tx = await dsaContract.cast(targets, datas, wallet.address, {
    value: opts.value ?? 0n,
    gasLimit: opts.gasLimit ?? 3_000_000,
  });
  logger.info(`cast() tx submitted: ${tx.hash}`);
  const receipt = await tx.wait(1);
  logger.info(`cast() confirmed in block ${receipt.blockNumber}, gas used: ${receipt.gasUsed}`);
  return receipt;
}

export function getDSAAddress() {
  return dsaAddress;
}

export function getDSAContract() {
  return dsaContract;
}
