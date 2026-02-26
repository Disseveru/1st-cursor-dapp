const { JsonRpcProvider, Wallet, Contract, formatEther } = require("ethers");

const ERC20_BALANCE_OF_ABI = ["function balanceOf(address account) view returns (uint256)"];

class RawEoaBalanceFetcher {
  constructor({
    privateKey,
    chainRpcUrls,
    chainIds,
    trackedTokensByChain,
    trackTokenBalances,
    logger,
    providerFactory,
    walletFactory,
    contractFactory,
    formatEtherFn,
  }) {
    this.privateKey = privateKey;
    this.chainRpcUrls = chainRpcUrls || {};
    this.chainIds = chainIds || [];
    this.trackedTokensByChain = trackedTokensByChain || {};
    this.trackTokenBalances = Boolean(trackTokenBalances);
    this.logger = logger;

    this.providerFactory = providerFactory || ((rpcUrl, chainId) => new JsonRpcProvider(rpcUrl, chainId));
    this.walletFactory = walletFactory || ((key) => new Wallet(key));
    this.contractFactory =
      contractFactory || ((tokenAddress, abi, provider) => new Contract(tokenAddress, abi, provider));
    this.formatEtherFn = formatEtherFn || formatEther;

    this.address = "";
    this.providers = {};
    this.ready = false;
  }

  async init() {
    try {
      this.address = this.walletFactory(this.privateKey).address;
      this.providers = {};

      for (const chainIdRaw of this.chainIds) {
        const chainId = Number(chainIdRaw);
        const rpcUrl = this.chainRpcUrls[String(chainId)] || this.chainRpcUrls[chainId];
        if (!rpcUrl) {
          this.logger.debug({ chainId }, "Missing RPC URL for chain; skipping EOA balance fetch");
          continue;
        }
        this.providers[chainId] = this.providerFactory(rpcUrl, chainId);
      }

      this.ready = Object.keys(this.providers).length > 0;
      if (this.ready) {
        this.logger.info(
          { address: this.address, chains: Object.keys(this.providers).map(Number) },
          "Raw EOA cross-chain balance fetcher initialized",
        );
      } else {
        this.logger.warn("No chain providers configured for raw EOA balance fetching");
      }
    } catch (error) {
      this.ready = false;
      this.logger.warn(
        { error: error.message },
        "Raw EOA balance fetcher initialization failed; cross-chain balances disabled",
      );
    }
  }

  async fetchBalances() {
    if (!this.ready || !this.address) {
      return null;
    }

    const balances = {};
    for (const [chainIdRaw, provider] of Object.entries(this.providers)) {
      const chainId = Number(chainIdRaw);

      try {
        const nativeBalance = await provider.getBalance(this.address);
        const chainBucket = {
          address: this.address,
          nativeBalanceWei: nativeBalance.toString(),
          nativeBalanceEth: this.formatEtherFn(nativeBalance),
        };

        if (this.trackTokenBalances) {
          const tokens = this.trackedTokensByChain[String(chainId)] || [];
          const tokenBalances = {};
          for (const token of tokens) {
            try {
              const erc20 = this.contractFactory(token.address, ERC20_BALANCE_OF_ABI, provider);
              const tokenBalance = await erc20.balanceOf(this.address);
              tokenBalances[token.symbol || token.address] = {
                address: token.address,
                decimals: token.decimals ?? 18,
                raw: tokenBalance.toString(),
              };
            } catch (error) {
              this.logger.debug(
                { chainId, tokenAddress: token.address, error: error.message },
                "Failed to fetch EOA token balance",
              );
            }
          }
          chainBucket.tokenBalances = tokenBalances;
        }

        balances[String(chainId)] = chainBucket;
      } catch (error) {
        this.logger.debug(
          { chainId, error: error.message },
          "Failed to fetch EOA native balance for chain",
        );
      }
    }

    return balances;
  }
}

module.exports = {
  RawEoaBalanceFetcher,
};
