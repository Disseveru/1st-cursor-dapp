const {
  FlashbotsBundleProvider,
  FlashbotsTransactionResolution,
} = require("@flashbots/ethers-provider-bundle");
const { Wallet } = require("ethers");

function isRelayError(response) {
  return response && typeof response === "object" && "error" in response;
}

class FlashbotsExecutor {
  constructor({
    provider,
    privateKey,
    config,
    logger,
  }) {
    this.provider = provider;
    this.privateKey = privateKey;
    this.config = config;
    this.logger = logger;
    this.initialized = false;
  }

  async init() {
    if (!this.config.enabled) {
      this.logger.info("Flashbots disabled; public mempool path will be used");
      return;
    }

    this.wallet = new Wallet(this.privateKey, this.provider);
    const authSigner = this.config.authPrivateKey
      ? new Wallet(this.config.authPrivateKey)
      : Wallet.createRandom();

    this.flashbots = await FlashbotsBundleProvider.create(
      this.provider,
      authSigner,
      this.config.relayUrl,
    );

    this.initialized = true;
    this.logger.info(
      { relay: this.config.relayUrl },
      "Flashbots private relay initialized",
    );
  }

  async sendPrivate(txRequest) {
    if (!this.config.enabled) {
      return {
        included: false,
        skipped: true,
        reason: "flashbots-disabled",
      };
    }

    if (!this.initialized) {
      await this.init();
    }

    const blockNumber = await this.provider.getBlockNumber();
    const maxBlockNumber = blockNumber + this.config.maxBlocksInFuture;

    const response = await this.flashbots.sendPrivateTransaction(
      {
        signer: this.wallet,
        transaction: txRequest,
      },
      { maxBlockNumber },
    );

    if (isRelayError(response)) {
      throw new Error(
        `Flashbots relay error (${response.error.code}): ${response.error.message}`,
      );
    }

    const resolution = await response.wait();
    const included =
      resolution === FlashbotsTransactionResolution.TransactionIncluded;
    const txHash = response.transaction?.hash;

    return {
      included,
      txHash,
      resolution,
      maxBlockNumber,
    };
  }
}

module.exports = {
  FlashbotsExecutor,
};
