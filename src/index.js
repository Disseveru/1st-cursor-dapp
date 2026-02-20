#!/usr/bin/env node

/**
 * Instadapp Autonomous Searcher Bot
 * -----------------------------------
 * Flash-loan-backed arbitrage & liquidation bot that integrates with
 * the Instadapp DeFi Smart Layer (DSL) and uses Flashbots for
 * MEV-protected execution.
 *
 * Usage:
 *   1. Copy .env.example → .env and fill in your values.
 *   2. npm start
 */

import { ethers } from 'ethers';
import settings from './config/settings.js';
import { initProviders, getMainnetProvider, getWallet } from './connection/provider.js';
import { initDSA } from './connection/dsa.js';
import { scanArbitrageOpportunities } from './monitors/arbitrageScanner.js';
import { scanAaveLiquidations, scanCompoundLiquidations } from './monitors/liquidationScanner.js';
import { scanCrossChainPriceGaps } from './monitors/crossChainScanner.js';
import { executeArbitrage, executeLiquidation } from './execution/executor.js';
import { isKillSwitchTripped, isHalted } from './security/killSwitch.js';
import logger from './utils/logger.js';
import { sleep } from './utils/helpers.js';

let running = true;
let aaveBorrowers = [];
let compoundAccounts = [];

async function init() {
  logger.info('=== Instadapp Searcher Bot starting ===');

  initProviders();

  const provider = getMainnetProvider();
  const network = await provider.getNetwork();
  logger.info(`Connected to chain ${network.chainId} (${network.name})`);

  const wallet = getWallet();
  const balance = await provider.getBalance(wallet.address);
  logger.info(`Wallet balance: ${ethers.formatEther(balance)} ETH`);

  await initDSA();

  if (await isKillSwitchTripped()) {
    logger.error('Kill-switch already tripped on startup — fund the wallet and restart');
    process.exit(1);
  }

  logger.info('Initialisation complete — entering main loop');
}

async function monitorLoop() {
  while (running) {
    try {
      if (isHalted()) {
        logger.warn('Bot halted (kill-switch). Waiting 30 s before re-checking...');
        await sleep(30_000);
        continue;
      }

      // --- 1. Swap Arbitrage ---
      logger.debug('Scanning for arbitrage opportunities...');
      const arbOpps = await scanArbitrageOpportunities();
      for (const opp of arbOpps) {
        await executeArbitrage(opp);
      }

      // --- 2. Aave V3 Liquidations ---
      logger.debug('Scanning Aave V3 liquidations...');
      const aaveResult = await scanAaveLiquidations(aaveBorrowers);
      aaveBorrowers = aaveResult.watchedBorrowers;
      for (const pos of aaveResult.liquidatable) {
        await executeLiquidation(pos);
      }

      // --- 3. Compound V3 Liquidations ---
      logger.debug('Scanning Compound V3 liquidations...');
      const compResult = await scanCompoundLiquidations(compoundAccounts);
      compoundAccounts = compResult.watchedAccounts;
      for (const pos of compResult.liquidatable) {
        logger.info(`Compound liquidatable position found: ${pos.borrower} — manual handling required for Compound absorb()`);
      }

      // --- 4. Cross-Chain Price Gaps ---
      logger.debug('Scanning cross-chain price gaps...');
      const crossChainOpps = await scanCrossChainPriceGaps();
      if (crossChainOpps.length > 0) {
        logger.info(`Found ${crossChainOpps.length} cross-chain price gap(s) — bridging execution is future work`);
      }

      // --- Kill-switch re-check ---
      await isKillSwitchTripped();

    } catch (err) {
      logger.error(`Monitor loop error: ${err.message}`);
      logger.debug(err.stack);
    }

    await sleep(settings.polling.intervalMs);
  }
}

function setupGracefulShutdown() {
  const shutdown = (signal) => {
    logger.info(`Received ${signal} — shutting down gracefully`);
    running = false;
    setTimeout(() => process.exit(0), 2000);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught exception: ${err.message}`);
    logger.error(err.stack);
    running = false;
    setTimeout(() => process.exit(1), 1000);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled rejection: ${reason}`);
  });
}

async function main() {
  setupGracefulShutdown();
  await init();
  await monitorLoop();
}

main().catch((err) => {
  logger.error(`Fatal: ${err.message}`);
  logger.error(err.stack);
  process.exit(1);
});
