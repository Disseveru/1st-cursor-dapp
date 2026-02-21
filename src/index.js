const { createLogger } = require("./logger");
const { loadConfig } = require("./config");
const { createInstadappClient } = require("./instadappClient");
const { createProviderMap } = require("./providers");
const { PriceQuoter } = require("./priceQuoter");
const { ArbitrageMonitor } = require("./arbitrageMonitor");
const { LiquidationMonitor } = require("./liquidationMonitor");
const { CrossChainMonitor } = require("./crossChainMonitor");
const { SpellBuilder } = require("./spellBuilder");
const { FlashbotsExecutor } = require("./flashbotsExecutor");
const { ExecutionEngine } = require("./executionEngine");
const { AvocadoBalanceFetcher } = require("./avocadoBalanceFetcher");
const { StatusReporter } = require("./statusReporter");
const { SearcherBot } = require("./bot");
const { createHttpServer } = require("./httpServer");

function parseFlags(argv) {
  return {
    dryRun: argv.includes("--dry-run"),
    once: argv.includes("--once"),
  };
}

async function bootstrap() {
  const cliFlags = parseFlags(process.argv.slice(2));
  const bootstrapLogger = createLogger(process.env.LOG_LEVEL || "info");
  const config = await loadConfig({ logger: bootstrapLogger, cliFlags });
  const logger = createLogger(config.app.logLevel);
  const statusReporter = new StatusReporter({ logger });
  const onRetry = () => statusReporter.recordRetry();

  const providers = createProviderMap(config.providers.chainRpcUrls);
  const mainProvider = providers[1];
  if (!mainProvider) {
    throw new Error("Mainnet provider missing. Configure ETHEREUM_RPC_URL or CHAIN_RPC_JSON[1].");
  }

  const { dsa, signerAddress } = await createInstadappClient({
    rpcUrl: config.dsa.rpcUrl,
    privateKey: config.dsa.privateKey,
    dsaId: config.dsa.dsaId,
    origin: config.dsa.origin,
    logger,
  });

  const quoter = new PriceQuoter({ providers, logger, onRetry });

  let avocadoBalanceFetcher = null;
  if (config.avocado.enabled) {
    avocadoBalanceFetcher = new AvocadoBalanceFetcher({
      privateKey: config.dsa.privateKey,
      avocadoRpcUrl: config.avocado.rpcUrl,
      chainRpcUrls: config.providers.chainRpcUrls,
      chainIds: config.avocado.chainIds,
      trackedTokensByChain: config.avocado.trackedTokensByChain,
      trackTokenBalances: config.avocado.trackTokenBalances,
      logger,
    });
    await avocadoBalanceFetcher.init();
  }

  const arbitrageMonitor = new ArbitrageMonitor({
    config,
    quoter,
    logger,
  });
  const liquidationMonitor = new LiquidationMonitor({
    config,
    providers,
    logger,
  });
  const crossChainMonitor = new CrossChainMonitor({
    config,
    quoter,
    avocadoBalanceFetcher,
    logger,
  });

  const spellBuilder = new SpellBuilder({
    dsa,
    config,
    logger,
  });

  const flashbotsExecutor = new FlashbotsExecutor({
    provider: mainProvider,
    privateKey: config.dsa.privateKey,
    config: config.flashbots,
    logger,
  });
  await flashbotsExecutor.init();

  const executionEngine = new ExecutionEngine({
    config,
    dsa,
    signerAddress,
    provider: mainProvider,
    spellBuilder,
    flashbotsExecutor,
    logger,
    onRetry,
  });

  let httpServer = null;

  if (config.app.webDashboardEnabled) {
    httpServer = createHttpServer({
      config,
      statusReporter,
      logger,
    });
  }

  const bot = new SearcherBot({
    config,
    mainProvider,
    arbitrageMonitor,
    liquidationMonitor,
    crossChainMonitor,
    executionEngine,
    statusReporter,
    logger,
  });

  let shuttingDown = false;
  async function gracefulShutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.warn({ signal }, "Signal received, initiating graceful shutdown");
    const forceTimeout = setTimeout(() => {
      logger.error("Forced exit after shutdown timeout");
      process.exit(1);
    }, 35000);
    forceTimeout.unref();
    await bot.stop();
    if (httpServer) {
      try {
        await httpServer.close();
      } catch (error) {
        logger.warn({ error: error.message }, "HTTP server close failed");
      }
    }
    process.exit(0);
  }
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

  await bot.start();
}

if (require.main === module) {
  bootstrap().catch((error) => {
    const logger = createLogger(process.env.LOG_LEVEL || "error");
    logger.error({ error: error.message, stack: error.stack }, "Fatal error");
    process.exit(1);
  });
}

module.exports = { bootstrap };
