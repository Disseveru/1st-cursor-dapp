const { Contract, parseUnits, formatUnits } = require("ethers");

const AAVE_V3_POOL_ABI = [
  "function getUserAccountData(address user) view returns (uint256 totalCollateralBase,uint256 totalDebtBase,uint256 availableBorrowsBase,uint256 currentLiquidationThreshold,uint256 ltv,uint256 healthFactor)",
];
const COMPOUND_V2_COMPTROLLER_ABI = [
  "function getAccountLiquidity(address account) view returns (uint256 error, uint256 liquidity, uint256 shortfall)",
];
const COMPOUND_V3_COMET_ABI = [
  "function isLiquidatable(address account) view returns (bool)",
];

class LiquidationMonitor {
  constructor({
    config,
    providers,
    logger,
  }) {
    this.config = config;
    this.providers = providers;
    this.logger = logger;
    this.contracts = new Map();
  }

  getProvider(chainId) {
    const provider = this.providers[Number(chainId)];
    if (!provider) {
      throw new Error(`No provider configured for chain ${chainId}`);
    }
    return provider;
  }

  getContract(chainId, address, abi, key) {
    const cacheKey = `${chainId}:${address.toLowerCase()}:${key}`;
    if (!this.contracts.has(cacheKey)) {
      this.contracts.set(
        cacheKey,
        new Contract(address, abi, this.getProvider(chainId)),
      );
    }
    return this.contracts.get(cacheKey);
  }

  createOpportunity(position, metadata) {
    return {
      type: "liquidation",
      label: position.label || `${position.protocol}:${position.borrower}`,
      chainId: Number(position.chainId || 1),
      protocol: position.protocol,
      borrower: position.borrower,
      repayToken: position.repayToken,
      collateralToken: position.collateralToken,
      flashLoanAmountWei: parseUnits(
        String(position.flashLoanAmount || "0"),
        Number(position.flashLoanDecimals || 18),
      ),
      expectedProfitEthWei: parseUnits(
        String(position.expectedProfitEth || "0"),
        18,
      ),
      metadata,
    };
  }

  async scanAaveV3(position) {
    const poolAddress =
      position.poolAddress || this.config.addresses.AAVE_V3_POOL_MAINNET;
    const contract = this.getContract(
      position.chainId || 1,
      poolAddress,
      AAVE_V3_POOL_ABI,
      "aave-v3-pool",
    );
    const data = await contract.getUserAccountData(position.borrower);
    const healthFactor = Number(formatUnits(data.healthFactor, 18));
    const threshold = Number(position.liquidationHealthFactor || 1);

    if (healthFactor < threshold) {
      return this.createOpportunity(position, {
        healthFactor,
        threshold,
        source: "aave-v3",
      });
    }
    return null;
  }

  async scanCompoundV2(position) {
    const comptrollerAddress =
      position.comptrollerAddress ||
      this.config.addresses.COMPOUND_V2_COMPTROLLER_MAINNET;
    const contract = this.getContract(
      position.chainId || 1,
      comptrollerAddress,
      COMPOUND_V2_COMPTROLLER_ABI,
      "compound-v2-comptroller",
    );
    const [, liquidity, shortfall] = await contract.getAccountLiquidity(
      position.borrower,
    );

    if (shortfall > 0n) {
      return this.createOpportunity(position, {
        liquidity: liquidity.toString(),
        shortfall: shortfall.toString(),
        source: "compound-v2",
      });
    }
    return null;
  }

  async scanCompoundV3(position) {
    if (!position.cometAddress) {
      return null;
    }
    const contract = this.getContract(
      position.chainId || 1,
      position.cometAddress,
      COMPOUND_V3_COMET_ABI,
      "compound-v3-comet",
    );
    const liquidatable = await contract.isLiquidatable(position.borrower);
    if (liquidatable) {
      return this.createOpportunity(position, {
        source: "compound-v3",
      });
    }
    return null;
  }

  async scanPosition(position) {
    try {
      if (position.protocol === "aave-v3") {
        return this.scanAaveV3(position);
      }
      if (position.protocol === "compound-v2") {
        return this.scanCompoundV2(position);
      }
      if (position.protocol === "compound-v3") {
        return this.scanCompoundV3(position);
      }
      this.logger.warn(
        { protocol: position.protocol, label: position.label },
        "Unsupported liquidation protocol",
      );
      return null;
    } catch (error) {
      this.logger.debug(
        { label: position.label, error: error.message },
        "Liquidation position scan failed",
      );
      return null;
    }
  }

  async scan() {
    const opportunities = [];
    const positions = this.config.monitoring.liquidationPositions || [];
    for (const position of positions) {
      const opp = await this.scanPosition(position);
      if (opp) {
        this.logger.info(
          {
            label: opp.label,
            protocol: opp.protocol,
            borrower: opp.borrower,
          },
          "Liquidation opportunity detected",
        );
        opportunities.push(opp);
      }
    }
    return opportunities;
  }
}

module.exports = { LiquidationMonitor };
