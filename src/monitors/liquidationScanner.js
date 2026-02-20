import { ethers } from 'ethers';
import { getMainnetProvider } from '../connection/provider.js';
import { AAVE_V3, COMPOUND_V3 } from '../config/addresses.js';
import { AAVE_V3_POOL_ABI, COMPOUND_V3_COMET_ABI } from '../config/abis.js';
import logger from '../utils/logger.js';
import { retry } from '../utils/helpers.js';

/**
 * Aave V3 health-factor threshold.
 * Positions with HF < 1e18 are eligible for liquidation.
 */
const AAVE_HF_THRESHOLD = ethers.parseEther('1');

/**
 * Discover Aave V3 borrowers by scanning recent Borrow events,
 * then check their health factors.
 */
export async function scanAaveLiquidations(watchedBorrowers = []) {
  const provider = getMainnetProvider();
  const pool = new ethers.Contract(AAVE_V3.pool, AAVE_V3_POOL_ABI, provider);

  if (watchedBorrowers.length === 0) {
    const borrowTopic = ethers.id('Borrow(address,address,address,uint256,uint8,uint256,uint16)');
    try {
      const latestBlock = await provider.getBlockNumber();
      const logs = await provider.getLogs({
        address: AAVE_V3.pool,
        topics: [borrowTopic],
        fromBlock: latestBlock - 500,
        toBlock: latestBlock,
      });
      const uniqueBorrowers = new Set();
      for (const log of logs) {
        const borrower = ethers.dataSlice(log.topics[2] ?? log.data, 12, 32);
        if (borrower && borrower !== ethers.ZeroAddress) {
          uniqueBorrowers.add(ethers.getAddress('0x' + borrower.replace(/^0x/, '').padStart(40, '0')));
        }
      }
      watchedBorrowers = [...uniqueBorrowers];
    } catch (err) {
      logger.warn(`Failed to fetch Aave borrow events: ${err.message}`);
    }
  }

  const liquidatable = [];

  for (const borrower of watchedBorrowers) {
    try {
      const data = await retry(() => pool.getUserAccountData(borrower));
      const healthFactor = data.healthFactor ?? data[5];
      if (healthFactor < AAVE_HF_THRESHOLD && healthFactor > 0n) {
        const entry = {
          protocol: 'AaveV3',
          borrower,
          healthFactor: ethers.formatEther(healthFactor),
          totalDebtBase: ethers.formatUnits(data.totalDebtBase ?? data[1], 8),
          totalCollateralBase: ethers.formatUnits(data.totalCollateralBase ?? data[0], 8),
        };
        logger.info(
          `Liquidatable Aave position: ${borrower} HF=${entry.healthFactor} debt=${entry.totalDebtBase}`,
        );
        liquidatable.push(entry);
      }
    } catch {
      // Borrower may no longer have a position — skip.
    }
  }

  return { liquidatable, watchedBorrowers };
}

/**
 * Check Compound V3 (Comet) for liquidatable positions.
 * We scan recent Supply/Withdraw events to discover active accounts,
 * then check `isLiquidatable`.
 */
export async function scanCompoundLiquidations(watchedAccounts = []) {
  const provider = getMainnetProvider();
  const comet = new ethers.Contract(COMPOUND_V3.comet_USDC, COMPOUND_V3_COMET_ABI, provider);

  if (watchedAccounts.length === 0) {
    try {
      const supplyTopic = ethers.id('Supply(address,address,uint256)');
      const latestBlock = await provider.getBlockNumber();
      const logs = await provider.getLogs({
        address: COMPOUND_V3.comet_USDC,
        topics: [supplyTopic],
        fromBlock: latestBlock - 500,
        toBlock: latestBlock,
      });
      const unique = new Set();
      for (const log of logs) {
        if (log.topics[1]) {
          unique.add(ethers.getAddress('0x' + log.topics[1].slice(26)));
        }
      }
      watchedAccounts = [...unique];
    } catch (err) {
      logger.warn(`Failed to fetch Compound events: ${err.message}`);
    }
  }

  const liquidatable = [];

  for (const account of watchedAccounts) {
    try {
      const isLiq = await retry(() => comet.isLiquidatable(account));
      if (isLiq) {
        const debt = await comet.borrowBalanceOf(account);
        const entry = {
          protocol: 'CompoundV3',
          borrower: account,
          debtUSDC: ethers.formatUnits(debt, 6),
        };
        logger.info(`Liquidatable Compound position: ${account} debt=${entry.debtUSDC} USDC`);
        liquidatable.push(entry);
      }
    } catch {
      // skip
    }
  }

  return { liquidatable, watchedAccounts };
}
