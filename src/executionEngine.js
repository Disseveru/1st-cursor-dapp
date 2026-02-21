const { formatEther, parseEther } = require("ethers");
const { withRetry, isTransientRpcError } = require("./utils");

class ExecutionEngine {
  constructor({
    config,
    dsa,
    signerAddress,
    provider,
    spellBuilder,
    flashbotsExecutor,
    logger,
    onRetry,
  }) {
    this.config = config;
    this.dsa = dsa;
    this.signerAddress = signerAddress;
    this.provider = provider;
    this.spellBuilder = spellBuilder;
    this.flashbotsExecutor = flashbotsExecutor;
    this.logger = logger;
    this.onRetry = onRetry;
    this.halted = false;
  }

  rpcRetryOpts(label) {
    return {
      maxAttempts: 3,
      baseDelayMs: 300,
      shouldRetry: isTransientRpcError,
      label,
      logger: this.logger,
      onRetry: this.onRetry,
    };
  }

  async checkKillSwitch() {
    const thresholdWei = parseEther(String(this.config.risk.gasKillSwitchEth));
    const balanceWei = await withRetry(
      () => this.provider.getBalance(this.signerAddress),
      this.rpcRetryOpts("kill-switch-balance"),
    );

    if (balanceWei < thresholdWei) {
      this.halted = true;
      this.logger.error(
        {
          signer: this.signerAddress,
          balanceEth: formatEther(balanceWei),
          thresholdEth: this.config.risk.gasKillSwitchEth,
        },
        "Kill-switch activated: gas wallet below threshold",
      );
      return false;
    }

    return true;
  }

  async getGasPriceWei() {
    const fee = await withRetry(() => this.provider.getFeeData(), this.rpcRetryOpts("gas-price"));
    return fee.gasPrice || parseEther("0.00000002"); // 20 gwei fallback
  }

  applyGasMultiplier(gasCostWei) {
    const scaled = Math.round(Number(this.config.risk.gasMultiplier) * 1000);
    return (gasCostWei * BigInt(scaled)) / 1000n;
  }

  async buildCastTransaction(spells) {
    const gasPriceWei = await this.getGasPriceWei();
    const txObj = await this.dsa.castTxObj({
      spells,
      from: this.signerAddress,
      gasPrice: gasPriceWei.toString(),
    });
    const estimatedGasWei = BigInt(txObj.gas) * BigInt(txObj.gasPrice);

    return {
      txObj,
      estimatedGasWei: this.applyGasMultiplier(estimatedGasWei),
    };
  }

  toEthersTransaction(txObj, chainId) {
    return {
      to: txObj.to,
      data: txObj.data,
      value: BigInt(txObj.value || 0),
      gasLimit: BigInt(txObj.gas),
      gasPrice: BigInt(txObj.gasPrice),
      nonce: Number(txObj.nonce),
      chainId,
      type: 0,
    };
  }

  async validateProfitability(opportunity, estimatedGasWei) {
    const minProfitWei = parseEther(String(this.config.risk.minProfitEth));
    const expected = opportunity.expectedProfitEthWei || 0n;

    if (expected < minProfitWei) {
      this.logger.info(
        {
          label: opportunity.label,
          expectedProfitEth: formatEther(expected),
          minRequiredEth: this.config.risk.minProfitEth,
        },
        "Opportunity skipped: below minimum profit threshold",
      );
      return false;
    }

    if (expected <= estimatedGasWei) {
      this.logger.info(
        {
          label: opportunity.label,
          expectedProfitEth: formatEther(expected),
          estimatedGasEth: formatEther(estimatedGasWei),
        },
        "Opportunity skipped: expected profit does not exceed gas cost",
      );
      return false;
    }
    return true;
  }

  async executeOpportunity(opportunity) {
    if (this.halted) {
      return { skipped: true, reason: "kill-switch-active" };
    }

    const spells = this.spellBuilder.buildFlashloanSpell(opportunity);
    const { txObj, estimatedGasWei } = await this.buildCastTransaction(spells);
    const profitable = await this.validateProfitability(opportunity, estimatedGasWei);

    if (!profitable) {
      return { skipped: true, reason: "not-profitable" };
    }

    const network = await this.provider.getNetwork();
    const txRequest = this.toEthersTransaction(txObj, Number(network.chainId));

    if (this.config.app.dryRun) {
      this.logger.info(
        {
          label: opportunity.label,
          type: opportunity.type,
          estimatedGasEth: formatEther(estimatedGasWei),
          expectedProfitEth: formatEther(opportunity.expectedProfitEthWei || 0n),
        },
        "Dry run enabled: transaction not broadcast",
      );
      return { skipped: true, reason: "dry-run" };
    }

    if (this.config.flashbots.enabled) {
      try {
        const fb = await this.flashbotsExecutor.sendPrivate(txRequest);
        if (fb.included) {
          this.logger.info(
            {
              label: opportunity.label,
              txHash: fb.txHash,
            },
            "Opportunity executed through Flashbots private relay",
          );
          return { executed: true, txHash: fb.txHash, privateRelay: true };
        }

        this.logger.warn(
          { label: opportunity.label, resolution: fb.resolution },
          "Flashbots submission did not include transaction in target window",
        );
      } catch (error) {
        this.logger.warn(
          { label: opportunity.label, error: error.message },
          "Flashbots private send failed",
        );
      }
    }

    if (!this.config.flashbots.allowPublicFallback) {
      return { skipped: true, reason: "private-send-not-included" };
    }

    const txHash = await this.dsa.cast({
      spells,
      gasPrice: txObj.gasPrice,
      gas: txObj.gas,
      nonce: txObj.nonce,
    });

    this.logger.warn(
      { label: opportunity.label, txHash },
      "Transaction sent to public mempool fallback",
    );

    return { executed: true, txHash, privateRelay: false };
  }
}

module.exports = { ExecutionEngine };
