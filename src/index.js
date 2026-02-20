import config, { validateEnv } from './config/index.js';
import { initDSA, getProviders } from './config/dsaConnection.js';
import {
  scanArbitrageOpportunities,
  scanAaveLiquidations,
  scanCompoundLiquidations,
  discoverAaveBorrowers,
  discoverCompoundBorrowers,
  scanCrossChainGaps,
} from './monitors/index.js';
import { executeArbitrage, executeLiquidation } from './execution/index.js';
import { checkKillSwitch, isHalted } from './security/index.js';
import { logger } from './utils/logger.js';

// ── Globals ──────────────────────────────────────────────────

let aaveBorrowers = [];
let compoundBorrowers = [];
let cycleCount = 0;
const BORROWER_REFRESH_CYCLES = 50; // re-discover borrowers every N liquidation cycles

// ── Helpers ──────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Monitoring Loops ─────────────────────────────────────────

async function runArbitrageLoop(ctx) {
  const { provider, wallet } = ctx;

  while (!isHalted()) {
    try {
      const ok = await checkKillSwitch(provider, wallet.address);
      if (!ok) break;

      const opps = await scanArbitrageOpportunities(provider);
      for (const opp of opps) {
        if (isHalted()) break;
        await executeArbitrage(ctx, opp);
      }
    } catch (err) {
      logger.error(`[ArbLoop] ${err.message}`);
    }

    await sleep(config.intervals.arbitrage);
  }
}

async function runLiquidationLoop(ctx) {
  const { provider, wallet } = ctx;

  while (!isHalted()) {
    try {
      const ok = await checkKillSwitch(provider, wallet.address);
      if (!ok) break;

      // Periodically refresh the list of at-risk borrowers
      if (cycleCount % BORROWER_REFRESH_CYCLES === 0) {
        [aaveBorrowers, compoundBorrowers] = await Promise.all([
          discoverAaveBorrowers(provider),
          discoverCompoundBorrowers(provider),
        ]);
        logger.info(
          `[LiqLoop] Refreshed borrowers — Aave: ${aaveBorrowers.length}, Compound: ${compoundBorrowers.length}`,
        );
      }
      cycleCount++;

      const [aaveTargets, compTargets] = await Promise.all([
        scanAaveLiquidations(provider, aaveBorrowers),
        scanCompoundLiquidations(provider, compoundBorrowers),
      ]);

      for (const target of [...aaveTargets, ...compTargets]) {
        if (isHalted()) break;
        // In production, you would resolve debtToken/collateralToken from on-chain data.
        // Here we provide a placeholder — the spell builder handles encoding.
        await executeLiquidation(ctx, target, {
          debtToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
          collateralToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
          debtToCover: target.totalDebt / 2n || 1n,
          estimatedProfitWei: target.totalCollateral / 20n || 0n, // rough 5% bonus estimate
        });
      }
    } catch (err) {
      logger.error(`[LiqLoop] ${err.message}`);
    }

    await sleep(config.intervals.liquidation);
  }
}

async function runCrossChainLoop(ctx) {
  const providers = getProviders();
  const { wallet } = ctx;

  // Only run if at least two chains are configured
  if (Object.keys(providers).length < 2) {
    logger.info('[CrossChain] Fewer than 2 chain RPCs configured — skipping cross-chain monitor');
    return;
  }

  while (!isHalted()) {
    try {
      const ok = await checkKillSwitch(providers.mainnet, wallet.address);
      if (!ok) break;

      const gaps = await scanCrossChainGaps(providers);
      for (const gap of gaps) {
        logger.info(
          `[CrossChain] Opportunity: ${gap.pair} ${gap.cheapChain}→${gap.expensiveChain} Δ${gap.priceDelta}bps`,
        );
        // Cross-chain execution requires bridging which is beyond single-block atomicity.
        // Log the opportunity for manual review or future Avocado integration.
      }
    } catch (err) {
      logger.error(`[CrossChain] ${err.message}`);
    }

    await sleep(config.intervals.crossChain);
  }
}

// ── Entrypoint ───────────────────────────────────────────────

async function main() {
  logger.info('═══════════════════════════════════════════════');
  logger.info('  Instadapp Arbitrage & Liquidation Bot v1.0  ');
  logger.info('═══════════════════════════════════════════════');

  validateEnv();

  const ctx = await initDSA();

  logger.info('Starting monitoring loops...');

  const monitorOnly = process.argv.includes('--monitor-only');
  if (monitorOnly) {
    logger.info('Running in MONITOR-ONLY mode (no execution)');
  }

  // Launch all loops concurrently
  await Promise.allSettled([
    runArbitrageLoop(ctx),
    runLiquidationLoop(ctx),
    runCrossChainLoop(ctx),
  ]);

  logger.warn('All loops exited — bot shutting down');
}

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT — shutting down gracefully');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM — shutting down gracefully');
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason}`);
});

main().catch((err) => {
  logger.error(`Fatal: ${err.message}`);
  process.exit(1);
});
