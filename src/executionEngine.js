const { formatEther, parseEther, parseUnits } = require("ethers");
const { withRetry, isTransientRpcError } = require("./utils");

class ExecutionEngine {
  constructor({
    config,
    dsa,
    signerAddress,
    provider,
    spellBuilder,
    flashbotsExecutor,
    avocadoExecutor = null,
    logger,
  }) {
    this.config = config;
    this.dsa = dsa;
    this.signerAddress = signerAddress;
    this.provider = provider;
    this.spellBuilder = spellBuilder;
    this.flashbotsExecutor = flashbotsExecutor;
    this.avocadoExecutor = avocadoExecutor;
    this.logger = logger;
    this.halted = false;
    this.executionAddress = this.resolveExecutionAddress();
  }

  resolveExecutionAddress() {
    if (this.config.avocado?.executionEnabled) {
      return this.avocadoExecutor?.getExecutionAddress?.() || this.signerAddress;
    }
    return this.signerAddress;
  }

  rpcRetryOpts(label) {
    return {
      maxAttempts: 3,
      baseDelayMs: 300,
      shouldRetry: isTransientRpcError,
      label,
      logger: this.logger,
    };
  }

  async checkKillSwitch() {
    this.executionAddress = this.resolveExecutionAddress();
    const thresholdWei = parseEther(String(this.config.risk.gasKillSwitchEth));
    const balanceWei = await withRetry(
      () => this.provider.getBalance(this.executionAddress),
      this.rpcRetryOpts("kill-switch-balance"),
    );

    if (balanceWei < thresholdWei) {
      this.halted = true;
      this.logger.error(
        {
          signer: this.executionAddress,
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

  applyMultiplierToWei(valueWei, multiplier) {
    const normalized = Number.isFinite(Number(multiplier)) ? Number(multiplier) : 1;
    const scaled = Math.round(Math.max(normalized, 0.0001) * 10_000);
    return (valueWei * BigInt(scaled)) / 10_000n;
  }

  async getExecutionGasBid() {
    const fee = await withRetry(() => this.provider.getFeeData(), this.rpcRetryOpts("gas-price"));
    const multiplier = Number(this.config.execution?.gasPriceMultiplier || 1);

    const baseGasPriceWei = fee.gasPrice || fee.maxFeePerGas || parseEther("0.00000002");
    const gasPriceWei = this.applyMultiplierToWei(baseGasPriceWei, multiplier);

    const tipGwei = Number(this.config.execution?.priorityTipGwei || 0);
    if (tipGwei <= 0) {
      return {
        gasPriceWei,
        maxFeePerGasWei: null,
        maxPriorityFeePerGasWei: null,
      };
    }

    const maxPriorityFeePerGasWei = parseUnits(String(tipGwei), "gwei");
    const baseMaxFeeWei = fee.maxFeePerGas || gasPriceWei;
    let maxFeePerGasWei = this.applyMultiplierToWei(baseMaxFeeWei, multiplier);
    if (maxFeePerGasWei < maxPriorityFeePerGasWei) {
      maxFeePerGasWei = maxPriorityFeePerGasWei;
    }

    return {
      gasPriceWei,
      maxFeePerGasWei,
      maxPriorityFeePerGasWei,
    };
  }

  applyGasMultiplier(gasCostWei) {
    const scaled = Math.round(Number(this.config.risk.gasMultiplier) * 1000);
    return (gasCostWei * BigInt(scaled)) / 1000n;
  }

  async buildCastTransaction(spells) {
    const fromAddress = this.resolveExecutionAddress();
    const gasBid = await this.getExecutionGasBid();
    const txObj = await this.dsa.castTxObj({
      spells,
      from: fromAddress,
      gasPrice: gasBid.gasPriceWei.toString(),
    });
    const estimatedGasWei = BigInt(txObj.gas) * gasBid.gasPriceWei;

    return {
      txObj,
      estimatedGasWei: this.applyGasMultiplier(estimatedGasWei),
      gasBid,
    };
  }

  toEthersTransaction(txObj, chainId, gasBid) {
    const base = {
      to: txObj.to,
      data: txObj.data,
      value: BigInt(txObj.value || 0),
      gasLimit: BigInt(txObj.gas),
      nonce: Number(txObj.nonce),
      chainId,
    };

    if (gasBid?.maxFeePerGasWei && gasBid?.maxPriorityFeePerGasWei) {
      return {
        ...base,
        type: 2,
        maxFeePerGas: gasBid.maxFeePerGasWei,
        maxPriorityFeePerGas: gasBid.maxPriorityFeePerGasWei,
      };
    }

    return {
      ...base,
      type: 0,
      gasPrice: gasBid?.gasPriceWei || BigInt(txObj.gasPrice),
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
    const { txObj, estimatedGasWei, gasBid } = await this.buildCastTransaction(spells);
    const profitable = await this.validateProfitability(opportunity, estimatedGasWei);

    if (!profitable) {
      return { skipped: true, reason: "not-profitable" };
    }

    const network = await this.provider.getNetwork();
    const txRequest = this.toEthersTransaction(txObj, Number(network.chainId), gasBid);

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

    if (this.config.avocado?.executionEnabled && this.avocadoExecutor) {
      try {
        const avocado = await this.avocadoExecutor.sendTransaction({
          to: txRequest.to,
          data: txRequest.data,
          value: txRequest.value,
          chainId: this.config.avocado.executionChainId || txRequest.chainId,
        });
        this.logger.info(
          {
            label: opportunity.label,
            txHash: avocado.txHash,
            safeAddress: this.avocadoExecutor.getExecutionAddress(),
            chainId: this.config.avocado.executionChainId || txRequest.chainId,
          },
          "Opportunity executed via Avocado relay",
        );
        return {
          executed: true,
          txHash: avocado.txHash,
          privateRelay: false,
          avocadoRelay: true,
        };
      } catch (error) {
        this.logger.warn(
          { label: opportunity.label, error: error.message },
          "Avocado relay send failed",
        );
        return { skipped: true, reason: "avocado-send-failed" };
      }
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
