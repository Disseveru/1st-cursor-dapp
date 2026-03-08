jest.mock("../src/security/secrets", () => ({
  resolvePrivateKey: jest.fn().mockResolvedValue("0xabc123"),
}));

const { loadConfig } = require("../src/config");

const testLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe("loadConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      DSA_ID: "1",
      ETHEREUM_RPC_URL: "https://eth.llamarpc.com",
      ARBITRAGE_PAIRS_JSON: "[]",
      LIQUIDATION_POSITIONS_JSON: "[]",
      CROSS_CHAIN_PAIRS_JSON: "[]",
      EXECUTION_TEMPLATES_JSON: "",
      CHAIN_RPC_JSON: "{}",
      BRIDGE_ARGS_JSON: "[]",
      AVOCADO_BALANCE_CHAINS_JSON: "[1]",
      AVOCADO_TOKENS_BY_CHAIN_JSON: "{}",
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("accepts GAS_KILL_SWITCH_ETH=0 to disable kill-switch", async () => {
    process.env.GAS_KILL_SWITCH_ETH = "0";

    const config = await loadConfig({ logger: testLogger, cliFlags: {} });

    expect(config.risk.gasKillSwitchEth).toBe(0);
  });
});
