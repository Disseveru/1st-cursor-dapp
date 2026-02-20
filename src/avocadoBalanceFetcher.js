const { createRequire } = require("module");
const { createSafe, setRpcUrls } = require("@instadapp/avocado");

function loadAvocadoEthers() {
  const localRequire = createRequire(__filename);
  const avocadoEntry = localRequire.resolve("@instadapp/avocado");
  const avocadoRequire = createRequire(avocadoEntry);
  return avocadoRequire("ethers");
}

class AvocadoBalanceFetcher {
  constructor({
    privateKey,
    avocadoRpcUrl,
    chainRpcUrls,
    chainIds,
    trackedTokensByChain,
    trackTokenBalances,
    logger,
  }) {
    this.privateKey = privateKey;
    this.avocadoRpcUrl = avocadoRpcUrl;
    this.chainRpcUrls = chainRpcUrls || {};
    this.chainIds = chainIds || [];
    this.trackedTokensByChain = trackedTokensByChain || {};
    this.trackTokenBalances = Boolean(trackTokenBalances);
    this.logger = logger;
    this.ready = false;
  }

  async init() {
    try {
      const ethers5 = loadAvocadoEthers();
      this.ethers5 = ethers5;

      setRpcUrls(this.chainRpcUrls);
      const provider = new ethers5.providers.StaticJsonRpcProvider(this.avocadoRpcUrl, {
        chainId: 634,
        name: "avocado",
      });

      const wallet = new ethers5.Wallet(this.privateKey, provider);
      this.safe = createSafe(wallet);
      this.ready = true;
      this.logger.info("Avocado cross-chain balance fetcher initialized");
    } catch (error) {
      this.ready = false;
      this.logger.warn(
        { error: error.message },
        "Avocado initialization failed; cross-chain balances disabled",
      );
    }
  }

  async fetchBalances() {
    if (!this.ready || !this.safe) {
      return null;
    }

    const balances = {};

    try {
      const safeAddress = await this.safe.getSafeAddress();

      for (const chainId of this.chainIds) {
        try {
          const signer = this.safe.getSignerForChainId(chainId);
          const provider = signer.provider;
          const nativeBalance = await provider.getBalance(safeAddress);

          const chainBucket = {
            safeAddress,
            nativeBalanceWei: nativeBalance.toString(),
            nativeBalanceEth: this.ethers5.utils.formatEther(nativeBalance),
          };

          if (this.trackTokenBalances) {
            const tokens = this.trackedTokensByChain[String(chainId)] || [];
            const tokenBalances = {};
            for (const token of tokens) {
              const erc20 = new this.ethers5.Contract(
                token.address,
                ["function balanceOf(address account) view returns (uint256)"],
                provider,
              );
              const tokenBalance = await erc20.balanceOf(safeAddress);
              tokenBalances[token.symbol || token.address] = {
                address: token.address,
                decimals: token.decimals ?? 18,
                raw: tokenBalance.toString(),
              };
            }
            chainBucket.tokenBalances = tokenBalances;
          }

          balances[String(chainId)] = chainBucket;
        } catch (error) {
          this.logger.debug(
            { chainId, error: error.message },
            "Failed to fetch Avocado balance for chain",
          );
        }
      }

      return balances;
    } catch (error) {
      this.logger.warn({ error: error.message }, "Unable to fetch Avocado cross-chain balances");
      return null;
    }
  }
}

module.exports = {
  AvocadoBalanceFetcher,
};
