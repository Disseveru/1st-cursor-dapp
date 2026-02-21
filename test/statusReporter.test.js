const { StatusReporter } = require("../src/statusReporter");
const { parseEther } = require("ethers");

const nullLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe("StatusReporter", () => {
  let reporter;

  beforeEach(() => {
    reporter = new StatusReporter({ logger: nullLogger });
    nullLogger.info.mockClear();
  });

  it("initializes with zeroed counters", () => {
    const status = reporter.getStatus();
    expect(status.cycleCount).toBe(0);
    expect(status.opportunitiesFound).toBe(0);
    expect(status.opportunitiesExecuted).toBe(0);
    expect(status.errors).toBe(0);
    expect(status.retries).toBe(0);
    expect(status.killSwitchActivated).toBe(false);
    expect(status.startedAt).toBeNull();
    expect(status.realizedProfitEthWei).toBe("0");
    expect(status.realizedProfitEth).toBe("0.0");
  });

  it("records start time", () => {
    reporter.start();
    const status = reporter.getStatus();
    expect(status.startedAt).toBeTruthy();
    expect(status.uptimeMs).toBeGreaterThanOrEqual(0);
  });

  it("increments cycle count", () => {
    reporter.recordCycle();
    reporter.recordCycle();
    expect(reporter.getStatus().cycleCount).toBe(2);
  });

  it("accumulates opportunities found", () => {
    reporter.recordOpportunitiesFound(3);
    reporter.recordOpportunitiesFound(2);
    expect(reporter.getStatus().opportunitiesFound).toBe(5);
  });

  it("tracks execution with label and realized profit", () => {
    reporter.recordExecution("arb-dai-usdc", parseEther("0.01"));
    const status = reporter.getStatus();
    expect(status.opportunitiesExecuted).toBe(1);
    expect(status.lastExecutionLabel).toBe("arb-dai-usdc");
    expect(status.lastExecutionAt).toBeTruthy();
    expect(status.lastExecutionProfitEth).toBe("0.01");
    expect(status.realizedProfitEth).toBe("0.01");
  });

  it("counts errors", () => {
    reporter.recordError();
    reporter.recordError();
    reporter.recordError();
    expect(reporter.getStatus().errors).toBe(3);
  });

  it("counts retries", () => {
    reporter.recordRetry();
    expect(reporter.getStatus().retries).toBe(1);
  });

  it("records kill switch activation", () => {
    reporter.recordKillSwitch();
    expect(reporter.getStatus().killSwitchActivated).toBe(true);
  });

  it("reports uptime as 0 when not started", () => {
    expect(reporter.uptimeMs()).toBe(0);
  });

  it("logStatus calls logger.info with status data", () => {
    reporter.start();
    reporter.recordCycle();
    reporter.logStatus();
    expect(nullLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ cycleCount: 1 }),
      "Bot status report",
    );
  });
});
