const { SearcherBot } = require("../src/bot");

const nullLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

function makeBot(overrides = {}) {
  const defaults = {
    config: {
      app: { once: true, pollIntervalMs: 100, blockListener: false },
    },
    mainProvider: { on: jest.fn(), off: jest.fn() },
    arbitrageMonitor: { scan: jest.fn(async () => []) },
    liquidationMonitor: { scan: jest.fn(async () => []) },
    crossChainMonitor: { scan: jest.fn(async () => []) },
    executionEngine: {
      checkKillSwitch: jest.fn(async () => true),
      executeOpportunity: jest.fn(async () => ({ executed: true })),
    },
    logger: nullLogger,
  };
  return new SearcherBot({ ...defaults, ...overrides });
}

describe("SearcherBot", () => {
  describe("rankOpportunities", () => {
    it("sorts opportunities by expectedProfitEthWei descending", () => {
      const bot = makeBot();
      const opps = [
        { label: "low", expectedProfitEthWei: 10n },
        { label: "high", expectedProfitEthWei: 1000n },
        { label: "mid", expectedProfitEthWei: 500n },
      ];
      const ranked = bot.rankOpportunities(opps);
      expect(ranked.map((o) => o.label)).toEqual(["high", "mid", "low"]);
    });

    it("handles missing expectedProfitEthWei (defaults to 0n)", () => {
      const bot = makeBot();
      const opps = [
        { label: "zero" },
        { label: "some", expectedProfitEthWei: 1n },
      ];
      const ranked = bot.rankOpportunities(opps);
      expect(ranked[0].label).toBe("some");
    });
  });

  describe("runCycle", () => {
    it("halts when kill-switch triggers", async () => {
      const executionEngine = {
        checkKillSwitch: jest.fn(async () => false),
        executeOpportunity: jest.fn(),
      };
      const bot = makeBot({ executionEngine });
      bot.running = true;
      await bot.runCycle("test");
      expect(executionEngine.executeOpportunity).not.toHaveBeenCalled();
    });

    it("skips cycle when already in-flight", async () => {
      const executionEngine = {
        checkKillSwitch: jest.fn(async () => true),
        executeOpportunity: jest.fn(),
      };
      const bot = makeBot({ executionEngine });
      bot.inFlight = true;
      await bot.runCycle("test");
      expect(executionEngine.checkKillSwitch).not.toHaveBeenCalled();
    });

    it("executes best opportunity when found", async () => {
      const executeOpportunity = jest.fn(async () => ({ executed: true }));
      const arbitrageMonitor = {
        scan: jest.fn(async () => [
          { label: "opp1", type: "arbitrage", chainId: 1, expectedProfitEthWei: 100n },
        ]),
      };
      const bot = makeBot({
        arbitrageMonitor,
        executionEngine: {
          checkKillSwitch: jest.fn(async () => true),
          executeOpportunity,
        },
      });
      await bot.runCycle("test");
      expect(executeOpportunity).toHaveBeenCalledTimes(1);
      expect(executeOpportunity).toHaveBeenCalledWith(
        expect.objectContaining({ label: "opp1" }),
      );
    });

    it("logs and continues when cycle throws", async () => {
      const arbitrageMonitor = {
        scan: jest.fn(async () => {
          throw new Error("RPC down");
        }),
      };
      const bot = makeBot({
        arbitrageMonitor,
        executionEngine: {
          checkKillSwitch: jest.fn(async () => true),
          executeOpportunity: jest.fn(),
        },
      });
      await expect(bot.runCycle("test")).resolves.not.toThrow();
      expect(bot.inFlight).toBe(false);
    });
  });

  describe("start / stop", () => {
    it("runs a single cycle when config.app.once is true", async () => {
      const bot = makeBot();
      await bot.start();
      expect(bot.running).toBe(false);
    });

    it("stop is idempotent", async () => {
      const bot = makeBot();
      await bot.stop();
      await bot.stop();
      expect(bot.running).toBe(false);
    });

    it("waits for in-flight cycle to complete on stop", async () => {
      const bot = makeBot();
      bot.running = true;
      bot.inFlight = true;
      bot.shutdownTimeoutMs = 2000;

      setTimeout(() => {
        bot.inFlight = false;
      }, 100);

      const start = Date.now();
      await bot.stop();
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(50);
      expect(bot.running).toBe(false);
    });

    it("exits after shutdown deadline even if cycle is stuck", async () => {
      const bot = makeBot();
      bot.running = true;
      bot.inFlight = true;
      bot.shutdownTimeoutMs = 500;

      const start = Date.now();
      await bot.stop();
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(400);
      expect(elapsed).toBeLessThan(2000);
    });
  });
});
