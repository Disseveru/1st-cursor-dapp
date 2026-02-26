const { createSafe, setRpcUrls } = require("@instadapp/avocado");
const { providers, Wallet } = require("ethers-v5");

function normalizeChainRpcUrls(chainRpcUrls = {}, avocadoRpcUrl) {
  const normalized = {};
  for (const [chainId, url] of Object.entries(chainRpcUrls || {})) {
    if (!url) continue;
    normalized[Number(chainId)] = url;
  }
  if (avocadoRpcUrl) {
    normalized[634] = avocadoRpcUrl;
  }
  return normalized;
}

class AvocadoExecutor {
  constructor({
    privateKey,
    avocadoRpcUrl,
    chainRpcUrls,
    safeAddress,
    targetChainId = 1,
    signatureOptions = {},
    logger,
  }) {
    this.privateKey = privateKey;
    this.avocadoRpcUrl = avocadoRpcUrl || "https://rpc.avocado.instadapp.io";
    this.chainRpcUrls = chainRpcUrls || {};
    this.safeAddress = safeAddress || "";
    this.targetChainId = Number(targetChainId || 1);
    this.signatureOptions = {
      validUntil:
        signatureOptions.validUntil !== undefined ? String(signatureOptions.validUntil) : "0",
      gas: signatureOptions.gas !== undefined ? String(signatureOptions.gas) : "0",
      source:
        signatureOptions.source || "0x000000000000000000000000000000000000Cad0",
      id: signatureOptions.id !== undefined ? String(signatureOptions.id) : "0",
      ...(signatureOptions.version ? { version: String(signatureOptions.version) } : {}),
    };
    this.logger = logger;
    this.initialized = false;
    this.executionAddress = null;
  }

  async init() {
    if (this.initialized) return;

    const rpcUrls = normalizeChainRpcUrls(this.chainRpcUrls, this.avocadoRpcUrl);
    setRpcUrls(rpcUrls);

    const provider = new providers.StaticJsonRpcProvider(this.avocadoRpcUrl, {
      chainId: 634,
      name: "avocado",
    });
    const wallet = new Wallet(this.privateKey, provider);

    this.safe = createSafe(wallet, provider);
    const ownerAddress = await this.safe.getOwnerAddress();
    const derivedSafeAddress = await this.safe.getSafeAddress();
    const activeSafeAddress = this.safeAddress || derivedSafeAddress;

    this.executionAddress = activeSafeAddress;
    this.initialized = true;
    this.logger.info(
      {
        ownerAddress,
        derivedSafeAddress,
        configuredSafeAddress: this.safeAddress || null,
        activeSafeAddress,
        targetChainId: this.targetChainId,
      },
      "Avocado executor initialized",
    );
  }

  getExecutionAddress() {
    return this.executionAddress || this.safeAddress || null;
  }

  async sendTransaction({ to, data, value = 0n, chainId }) {
    if (!this.initialized) {
      await this.init();
    }

    const targetChainId = Number(chainId || this.targetChainId || 1);
    const txValue = typeof value === "bigint" ? value.toString() : String(value || "0");
    const safeOptions = {
      ...this.signatureOptions,
      ...(this.safeAddress ? { safeAddress: this.safeAddress } : {}),
    };

    const response = await this.safe.sendTransaction(
      {
        to,
        data,
        value: txValue,
      },
      targetChainId,
      safeOptions,
    );

    let receipt = null;
    if (response && typeof response.wait === "function") {
      receipt = await response.wait(1);
    }

    return {
      txHash: response?.hash || null,
      receipt,
    };
  }
}

module.exports = {
  AvocadoExecutor,
};
