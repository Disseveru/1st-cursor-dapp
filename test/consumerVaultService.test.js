const { parseEther } = require("ethers");
const { ConsumerVaultService } = require("../src/consumerVaultService");

function makeLogger() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

describe("ConsumerVaultService", () => {
  const walletA = "0x000000000000000000000000000000000000dEaD";
  const walletB = "0x000000000000000000000000000000000000bEEF";

  test("exposes strategy catalog derived from risk profiles", () => {
    const service = new ConsumerVaultService({ logger: makeLogger() });
    const strategies = service.listStrategies();
    expect(strategies.map((s) => s.id)).toEqual([
      "strategy-conservative",
      "strategy-balanced",
      "strategy-aggressive",
    ]);
    expect(strategies[0].executionMode).toBe("flashbots-private");
  });

  test("handles deposit and withdrawal accounting", () => {
    const service = new ConsumerVaultService({ logger: makeLogger() });
    const deposit = service.deposit({
      wallet: walletA,
      amountEth: "1.0",
      strategyId: "strategy-balanced",
    });
    expect(deposit.ok).toBe(true);
    expect(deposit.portfolio.estimatedBalanceEth).toBe("1.0");

    const withdraw = service.withdraw({
      wallet: walletA,
      amountEth: "0.4",
    });
    expect(withdraw.ok).toBe(true);
    expect(Number(withdraw.portfolio.estimatedBalanceEth)).toBeCloseTo(0.6, 6);

    const vault = service.getVaultStats();
    expect(Number(vault.totalAssetsEth)).toBeCloseTo(0.6, 6);
    expect(Number(vault.totalWithdrawnEth)).toBeCloseTo(0.4, 6);
  });

  test("syncs realized bot profit into vault analytics", () => {
    const service = new ConsumerVaultService({ logger: makeLogger() });
    service.deposit({ wallet: walletA, amountEth: "1.0" });

    service.syncFromStatus({ realizedProfitEthWei: "0" });
    service.syncFromStatus({ realizedProfitEthWei: parseEther("0.2").toString() });

    const portfolio = service.getPortfolio(walletA);
    expect(Number(portfolio.estimatedBalanceEth)).toBeCloseTo(1.2, 6);
    expect(Number(portfolio.unrealizedPnlEth)).toBeCloseTo(0.2, 6);

    const analytics = service.getAnalytics({
      status: {
        opportunitiesFound: 10,
        opportunitiesExecuted: 2,
        errors: 1,
        cycleCount: 5,
      },
    });
    expect(analytics.executionRatePct).toBe("20.00");
    expect(Number(analytics.vault.distributedProfitEth)).toBeCloseTo(0.2, 6);
  });

  test("enforces policy controls for strategy and risk limits", () => {
    const service = new ConsumerVaultService({ logger: makeLogger() });
    service.updatePolicyControls({
      allowAggressiveStrategy: false,
      maxDepositEthPerWallet: "1.0",
    });

    expect(() =>
      service.deposit({
        wallet: walletA,
        amountEth: "0.2",
        strategyId: "strategy-aggressive",
      }),
    ).toThrow(/aggressive strategy is disabled/i);

    service.deposit({
      wallet: walletA,
      amountEth: "0.9",
      strategyId: "strategy-balanced",
    });

    expect(() =>
      service.deposit({
        wallet: walletA,
        amountEth: "0.2",
        strategyId: "strategy-balanced",
      }),
    ).toThrow(/maxDepositEthPerWallet/i);

    expect(() =>
      service.withdraw({
        wallet: walletA,
        amountEth: "11",
      }),
    ).toThrow(/maxWithdrawalEthPerRequest/i);
  });

  test("stores per-wallet notification preferences", () => {
    const service = new ConsumerVaultService({ logger: makeLogger() });
    const updated = service.updateNotificationPreference(walletB, {
      enabled: true,
      webhookUrl: "https://example.com/hook",
      minProfitAlertEth: "0.05",
      notifyOnErrors: false,
    });

    expect(updated.enabled).toBe(true);
    expect(updated.webhookUrl).toBe("https://example.com/hook");
    expect(updated.minProfitAlertEth).toBe("0.05");
    expect(updated.notifyOnExecution).toBe(true);
    expect(updated.notifyOnErrors).toBe(false);
  });
});
