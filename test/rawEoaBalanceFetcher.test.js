const { RawEoaBalanceFetcher } = require("../src/rawEoaBalanceFetcher");

function makeLogger() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

describe("RawEoaBalanceFetcher", () => {
  it("returns null when not initialized", async () => {
    const fetcher = new RawEoaBalanceFetcher({
      privateKey: "0x1234",
      chainRpcUrls: {},
      chainIds: [],
      trackTokenBalances: false,
      logger: makeLogger(),
    });

    await expect(fetcher.fetchBalances()).resolves.toBeNull();
  });

  it("initializes providers only for chains with RPC URLs", async () => {
    const providerFactory = jest.fn((rpcUrl, chainId) => ({
      rpcUrl,
      chainId,
      getBalance: jest.fn(async () => 0n),
    }));
    const logger = makeLogger();
    const fetcher = new RawEoaBalanceFetcher({
      privateKey: "0x1234",
      chainRpcUrls: {
        1: "https://mainnet.example",
        8453: "https://base.example",
      },
      chainIds: [1, 8453, 42161],
      trackTokenBalances: false,
      logger,
      providerFactory,
      walletFactory: jest.fn(() => ({ address: "0xabc" })),
    });

    await fetcher.init();

    expect(fetcher.ready).toBe(true);
    expect(providerFactory).toHaveBeenCalledTimes(2);
    expect(providerFactory).toHaveBeenCalledWith("https://mainnet.example", 1);
    expect(providerFactory).toHaveBeenCalledWith("https://base.example", 8453);
    expect(logger.debug).toHaveBeenCalledWith(
      { chainId: 42161 },
      "Missing RPC URL for chain; skipping EOA balance fetch",
    );
  });

  it("fetches balances per chain and skips chain/token failures", async () => {
    const providersByChain = {
      1: {
        getBalance: jest.fn(async () => 1_250_000_000_000_000_000n),
      },
      8453: {
        getBalance: jest.fn(async () => {
          throw new Error("rpc down");
        }),
      },
    };
    const contractFactory = jest.fn((tokenAddress) => ({
      balanceOf: jest.fn(async () => {
        if (tokenAddress === "0xtoken-fail") {
          throw new Error("token call failed");
        }
        return 42n;
      }),
    }));
    const logger = makeLogger();

    const fetcher = new RawEoaBalanceFetcher({
      privateKey: "0x1234",
      chainRpcUrls: {
        1: "https://mainnet.example",
        8453: "https://base.example",
      },
      chainIds: [1, 8453],
      trackTokenBalances: true,
      trackedTokensByChain: {
        1: [
          { address: "0xtoken-ok", symbol: "USDC", decimals: 6 },
          { address: "0xtoken-fail", symbol: "FAIL", decimals: 18 },
        ],
      },
      logger,
      providerFactory: jest.fn((_rpcUrl, chainId) => providersByChain[chainId]),
      walletFactory: jest.fn(() => ({ address: "0xmy-eoa" })),
      contractFactory,
      formatEtherFn: jest.fn(() => "1.25"),
    });

    await fetcher.init();
    const balances = await fetcher.fetchBalances();

    expect(balances).toEqual({
      1: {
        address: "0xmy-eoa",
        nativeBalanceWei: "1250000000000000000",
        nativeBalanceEth: "1.25",
        tokenBalances: {
          USDC: {
            address: "0xtoken-ok",
            decimals: 6,
            raw: "42",
          },
        },
      },
    });
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ chainId: 1, tokenAddress: "0xtoken-fail" }),
      "Failed to fetch EOA token balance",
    );
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ chainId: 8453 }),
      "Failed to fetch EOA native balance for chain",
    );
  });
});
