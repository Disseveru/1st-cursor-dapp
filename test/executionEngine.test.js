const { parseEther } = require("ethers");
const { ExecutionEngine } = require("../src/executionEngine");

function makeLogger() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function makeEngine(overrides = {}) {
  const config = {
    app: { dryRun: false },
    risk: {
      gasKillSwitchEth: 0.01,
      minProfitEth: 0.001,
      gasMultiplier: 1,
    },
    flashbots: {
      enabled: true,
      allowPublicFallback: true,
    },
    avocado: {
      executionEnabled: true,
      executionChainId: 1,
    },
  };

  const provider = {
    getFeeData: jest.fn(async () => ({ gasPrice: parseEther("0.00000002") })), // 20 gwei
    getNetwork: jest.fn(async () => ({ chainId: 1n })),
    getBalance: jest.fn(async () => parseEther("1")),
  };

  const dsa = {
    castTxObj: jest.fn(async () => ({
      to: "0x1111111111111111111111111111111111111111",
      data: "0x1234",
      value: "0",
      gas: "21000",
      gasPrice: "20000000000",
      nonce: "1",
    })),
    cast: jest.fn(async () => "0xcast"),
  };

  const spellBuilder = {
    buildFlashloanSpell: jest.fn(() => []),
  };

  const flashbotsExecutor = {
    sendPrivate: jest.fn(async () => ({ included: true, txHash: "0xflash" })),
  };

  const avocadoExecutor = {
    getExecutionAddress: jest.fn(() => "0xB1f1A61D71dFEa183deD1B62f2F3d6eB2CfdC8A5"),
    sendTransaction: jest.fn(async () => ({ txHash: "0xavocado" })),
  };

  const logger = makeLogger();

  const engine = new ExecutionEngine({
    config,
    dsa,
    signerAddress: "0xAfCa3a3127F93aBcF620995AeDe5641100FAc148",
    provider,
    spellBuilder,
    flashbotsExecutor,
    avocadoExecutor,
    logger,
    ...overrides,
  });

  return {
    engine,
    config,
    provider,
    dsa,
    spellBuilder,
    flashbotsExecutor,
    avocadoExecutor,
    logger,
  };
}

describe("ExecutionEngine avocado mode", () => {
  test("routes execution through Avocado relay when enabled", async () => {
    const { engine, avocadoExecutor, flashbotsExecutor, dsa } = makeEngine();

    const result = await engine.executeOpportunity({
      label: "arb-1",
      type: "arbitrage",
      expectedProfitEthWei: parseEther("0.01"),
    });

    expect(result.executed).toBe(true);
    expect(result.avocadoRelay).toBe(true);
    expect(result.txHash).toBe("0xavocado");
    expect(avocadoExecutor.sendTransaction).toHaveBeenCalledTimes(1);
    expect(flashbotsExecutor.sendPrivate).not.toHaveBeenCalled();
    expect(dsa.cast).not.toHaveBeenCalled();
  });

  test("returns avocado-send-failed when relay execution errors", async () => {
    const { engine, avocadoExecutor, flashbotsExecutor, dsa } = makeEngine();
    avocadoExecutor.sendTransaction.mockRejectedValueOnce(new Error("relay rejected"));

    const result = await engine.executeOpportunity({
      label: "arb-1",
      type: "arbitrage",
      expectedProfitEthWei: parseEther("0.01"),
    });

    expect(result).toEqual({ skipped: true, reason: "avocado-send-failed" });
    expect(flashbotsExecutor.sendPrivate).not.toHaveBeenCalled();
    expect(dsa.cast).not.toHaveBeenCalled();
  });

  test("uses avocado execution address for kill-switch balance checks", async () => {
    const { engine, provider, avocadoExecutor } = makeEngine();

    const safeToRun = await engine.checkKillSwitch();

    expect(safeToRun).toBe(true);
    expect(provider.getBalance).toHaveBeenCalledWith(
      "0xB1f1A61D71dFEa183deD1B62f2F3d6eB2CfdC8A5",
    );
    expect(avocadoExecutor.getExecutionAddress).toHaveBeenCalled();
  });
});
