class SearcherBot {
  constructor({
    config,
    mainProvider,
    arbitrageMonitor,
    liquidationMonitor,
    crossChainMonitor,
    executionEngine,
    logger,
  }) {
    this.config = config;
    this.mainProvider = mainProvider;
    this.arbitrageMonitor = arbitrageMonitor;
    this.liquidationMonitor = liquidationMonitor;
    this.crossChainMonitor = crossChainMonitor;
    this.executionEngine = executionEngine;
    this.logger = logger;
    this.running = false;
    this.inFlight = false;
    this.interval = null;
    this.blockListener = null;
    this.shutdownTimeoutMs = config.app.shutdownTimeoutMs || 30000;
  }

  rankOpportunities(opportunities) {
    return opportunities.sort((a, b) => {
      const profitA = a.expectedProfitEthWei || 0n;
      const profitB = b.expectedProfitEthWei || 0n;
      if (profitA === profitB) return 0;
      return profitA > profitB ? -1 : 1;
    });
  }

  async runCycle(trigger) {
    if (this.inFlight) return;
    this.inFlight = true;

    try {
      this.logger.debug({ trigger }, "Running monitor cycle");

      const safeToRun = await this.executionEngine.checkKillSwitch();
      if (!safeToRun) {
        this.inFlight = false;
        await this.stop();
        return;
      }

      const [arbOpps, liqOpps, crossOpps] = await Promise.all([
        this.arbitrageMonitor.scan(),
        this.liquidationMonitor.scan(),
        this.crossChainMonitor.scan(),
      ]);

      const opportunities = this.rankOpportunities([...arbOpps, ...liqOpps, ...crossOpps]);

      if (!opportunities.length) {
        this.logger.debug("No executable opportunities in this cycle");
        return;
      }

      for (const opp of opportunities) {
        this.logger.info(
          {
            label: opp.label,
            type: opp.type,
            chainId: opp.chainId,
          },
          "Attempting opportunity execution",
        );

        try {
          const result = await this.executionEngine.executeOpportunity(opp);
          if (result?.executed || result?.reason === "dry-run") {
            break;
          }
        } catch (error) {
          this.logger.warn(
            { label: opp.label, error: error.message },
            "Opportunity execution attempt failed",
          );
        }
      }
    } catch (error) {
      this.logger.error({ error: error.message, stack: error.stack }, "Cycle failed");
    } finally {
      this.inFlight = false;
    }
  }

  async start() {
    this.running = true;

    if (this.config.app.once) {
      await this.runCycle("once");
      this.running = false;
      return;
    }

    if (this.config.app.blockListener) {
      this.blockListener = async (blockNumber) => {
        await this.runCycle(`block:${blockNumber}`);
      };
      this.mainProvider.on("block", this.blockListener);
      this.logger.info("Block listener enabled for async opportunity checks");
    }

    this.interval = setInterval(async () => {
      await this.runCycle("interval");
    }, this.config.app.pollIntervalMs);

    this.logger.info(
      { intervalMs: this.config.app.pollIntervalMs },
      "Autonomous searcher bot started",
    );

    await this.runCycle("startup");
  }

  async stop() {
    if (!this.running) return;
    this.running = false;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    if (this.blockListener) {
      this.mainProvider.off("block", this.blockListener);
      this.blockListener = null;
    }

    if (this.inFlight) {
      this.logger.info("Waiting for in-flight cycle to complete before shutdown...");
      const deadline = Date.now() + (this.shutdownTimeoutMs || 30000);
      while (this.inFlight && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 200));
      }
      if (this.inFlight) {
        this.logger.warn("Shutdown deadline reached with cycle still in-flight");
      }
    }

    this.logger.warn("Searcher bot stopped");
  }
}

module.exports = { SearcherBot };
