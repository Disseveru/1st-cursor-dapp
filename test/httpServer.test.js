const { createHttpServer } = require("../src/httpServer");
const { StatusReporter } = require("../src/statusReporter");

function makeLogger() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

describe("httpServer", () => {
  test("serves health, status, and risk profile endpoints", async () => {
    const logger = makeLogger();
    const statusReporter = new StatusReporter({ logger });
    statusReporter.start();
    statusReporter.recordCycle();
    statusReporter.recordOpportunitiesFound(3);

    const serverHandle = createHttpServer({
      config: {
        app: {
          webPort: 0,
          webHost: "127.0.0.1",
        },
      },
      statusReporter,
      logger,
    });

    try {
      await new Promise((resolve, reject) => {
        if (serverHandle.server.listening) return resolve();
        serverHandle.server.once("listening", resolve);
        serverHandle.server.once("error", reject);
      });

      const address = serverHandle.server.address();
      const baseUrl = `http://127.0.0.1:${address.port}`;

      const health = await fetch(`${baseUrl}/health`).then((r) => r.json());
      expect(health.ok).toBe(true);

      const status = await fetch(`${baseUrl}/api/status`).then((r) => r.json());
      expect(status.ok).toBe(true);
      expect(status.status.cycleCount).toBe(1);

      const profiles = await fetch(`${baseUrl}/api/risk-profiles`).then((r) => r.json());
      expect(profiles.ok).toBe(true);
      expect(profiles.data.length).toBeGreaterThan(0);

      const roadmap = await fetch(`${baseUrl}/api/roadmap`).then((r) => r.json());
      expect(roadmap.ok).toBe(true);
      expect(roadmap.data.overallStatus).toBe("all-passes-complete");

      const strategies = await fetch(`${baseUrl}/api/strategies`).then((r) => r.json());
      expect(strategies.ok).toBe(true);
      expect(strategies.data.length).toBeGreaterThan(0);

      const wallet = "0x000000000000000000000000000000000000dEaD";
      const deposit = await fetch(`${baseUrl}/api/vault/deposit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wallet,
          amountEth: "0.5",
          strategyId: "strategy-balanced",
        }),
      }).then((r) => r.json());
      expect(deposit.ok).toBe(true);
      expect(Number(deposit.data.portfolio.estimatedBalanceEth)).toBeCloseTo(0.5, 6);

      const portfolio = await fetch(`${baseUrl}/api/portfolio/${wallet}`).then((r) => r.json());
      expect(portfolio.ok).toBe(true);
      expect(portfolio.data.portfolio.strategyId).toBe("strategy-balanced");

      const withdraw = await fetch(`${baseUrl}/api/vault/withdraw`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wallet,
          amountEth: "0.2",
        }),
      }).then((r) => r.json());
      expect(withdraw.ok).toBe(true);
      expect(Number(withdraw.data.portfolio.estimatedBalanceEth)).toBeCloseTo(0.3, 6);

      const policyUpdate = await fetch(`${baseUrl}/api/policy-controls`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          minDepositEth: "0.02",
          allowAggressiveStrategy: false,
        }),
      }).then((r) => r.json());
      expect(policyUpdate.ok).toBe(true);
      expect(policyUpdate.data.allowAggressiveStrategy).toBe(false);

      const notifications = await fetch(`${baseUrl}/api/notifications/${wallet}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled: true,
          minProfitAlertEth: "0.03",
        }),
      }).then((r) => r.json());
      expect(notifications.ok).toBe(true);
      expect(notifications.data.enabled).toBe(true);

      const analytics = await fetch(`${baseUrl}/api/analytics`).then((r) => r.json());
      expect(analytics.ok).toBe(true);
      expect(analytics.data.vault.totalAssetsEth).toBeDefined();
    } finally {
      await serverHandle.close();
    }
  });
});
