import { ethers } from 'ethers';
import {
  AAVE_V3_POOL,
  AAVE_POOL_ABI,
  COMPOUND_V3_COMET,
  COMPOUND_COMET_ABI,
} from '../config/constants.js';
import { logger } from '../utils/logger.js';

// Health factor below 1e18 means the position is liquidatable in Aave V3.
const AAVE_HF_THRESHOLD = ethers.parseEther('1');

/**
 * @typedef {Object} LiquidationTarget
 * @property {'aave_v3'|'compound_v3'} protocol
 * @property {string} account
 * @property {bigint} healthFactor       (Aave only, 0 for Compound)
 * @property {bigint} totalDebt          (base units)
 * @property {bigint} totalCollateral    (base units)
 */

/**
 * Scans a list of Aave V3 borrower addresses and returns those whose
 * health factor has dropped below the liquidation threshold.
 */
export async function scanAaveLiquidations(provider, borrowers) {
  const pool = new ethers.Contract(AAVE_V3_POOL, AAVE_POOL_ABI, provider);
  const targets = [];

  const settled = await Promise.allSettled(
    borrowers.map(async (account) => {
      const data = await pool.getUserAccountData(account);
      return { account, data };
    }),
  );

  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    const { account, data } = result.value;
    const healthFactor = data.healthFactor ?? data[5];
    const totalDebt = data.totalDebtBase ?? data[1];
    const totalCollateral = data.totalCollateralBase ?? data[0];

    if (healthFactor < AAVE_HF_THRESHOLD && totalDebt > 0n) {
      logger.info(`[Liquidation] Aave V3 target: ${account} HF=${ethers.formatEther(healthFactor)}`);
      targets.push({ protocol: 'aave_v3', account, healthFactor, totalDebt, totalCollateral });
    }
  }
  return targets;
}

/**
 * Scans a list of Compound V3 borrower addresses using the Comet
 * isLiquidatable() view.
 */
export async function scanCompoundLiquidations(provider, borrowers) {
  const comet = new ethers.Contract(COMPOUND_V3_COMET, COMPOUND_COMET_ABI, provider);
  const targets = [];

  const settled = await Promise.allSettled(
    borrowers.map(async (account) => {
      const liquidatable = await comet.isLiquidatable(account);
      const debt = await comet.borrowBalanceOf(account);
      return { account, liquidatable, debt };
    }),
  );

  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    const { account, liquidatable, debt } = result.value;
    if (liquidatable) {
      logger.info(`[Liquidation] Compound V3 target: ${account} debt=${debt}`);
      targets.push({
        protocol: 'compound_v3',
        account,
        healthFactor: 0n,
        totalDebt: debt,
        totalCollateral: 0n,
      });
    }
  }
  return targets;
}

/**
 * Utility: Discover at-risk Aave borrowers by scanning recent
 * Borrow events from the Aave pool (last N blocks).
 * Returns an array of unique borrower addresses.
 */
export async function discoverAaveBorrowers(provider, lookbackBlocks = 5000) {
  const pool = new ethers.Contract(
    AAVE_V3_POOL,
    ['event Borrow(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint8 interestRateMode, uint256 borrowRate, uint16 indexed referralCode)'],
    provider,
  );
  const currentBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, currentBlock - lookbackBlocks);

  try {
    const events = await pool.queryFilter(pool.filters.Borrow(), fromBlock, currentBlock);
    const uniqueBorrowers = [...new Set(events.map((e) => e.args.onBehalfOf || e.args.user))];
    logger.debug(`[Discovery] Found ${uniqueBorrowers.length} Aave borrowers in last ${lookbackBlocks} blocks`);
    return uniqueBorrowers;
  } catch (err) {
    logger.error(`[Discovery] Failed to fetch Aave borrowers: ${err.message}`);
    return [];
  }
}

/**
 * Utility: Discover Compound V3 borrowers from recent Withdraw events.
 */
export async function discoverCompoundBorrowers(provider, lookbackBlocks = 5000) {
  const comet = new ethers.Contract(
    COMPOUND_V3_COMET,
    ['event Withdraw(address indexed src, address indexed to, uint256 amount)'],
    provider,
  );
  const currentBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, currentBlock - lookbackBlocks);

  try {
    const events = await comet.queryFilter(comet.filters.Withdraw(), fromBlock, currentBlock);
    const unique = [...new Set(events.map((e) => e.args.src))];
    logger.debug(`[Discovery] Found ${unique.length} Compound borrowers in last ${lookbackBlocks} blocks`);
    return unique;
  } catch (err) {
    logger.error(`[Discovery] Failed to fetch Compound borrowers: ${err.message}`);
    return [];
  }
}
