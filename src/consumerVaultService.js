const { formatEther, parseEther } = require("ethers");
const { getRiskProfiles } = require("./riskProfiles");

const WAD = 10n ** 18n;

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim());
}

function normalizeWallet(wallet) {
  const candidate = String(wallet || "").trim();
  if (!isAddress(candidate)) {
    throw new Error("wallet must be a valid 0x address");
  }
  return candidate.toLowerCase();
}

function parseEth(value, fieldName, { allowZero = false } = {}) {
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new Error(`${fieldName} is required`);
  }

  let parsed;
  try {
    parsed = parseEther(String(value));
  } catch (error) {
    throw new Error(`${fieldName} must be a valid ETH amount`);
  }

  if (parsed < 0n || (!allowZero && parsed === 0n)) {
    throw new Error(`${fieldName} must be ${allowZero ? ">= 0" : "> 0"}`);
  }

  return parsed;
}

function parseBool(value, fieldName) {
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be a boolean`);
  }
  return value;
}

function ratioPctString(numerator, denominator) {
  if (!denominator || denominator <= 0) return "0.00";
  const bps = Math.round((Number(numerator) / Number(denominator)) * 10000);
  return (bps / 100).toFixed(2);
}

function formatSignedBps(bps) {
  const negative = bps < 0n;
  const abs = negative ? -bps : bps;
  const whole = abs / 100n;
  const fractional = abs % 100n;
  return `${negative ? "-" : ""}${whole.toString()}.${fractional.toString().padStart(2, "0")}`;
}

function ceilDiv(a, b) {
  if (b <= 0n) {
    throw new Error("division by zero");
  }
  return (a + b - 1n) / b;
}

class ConsumerVaultService {
  constructor({ logger, now = () => new Date() }) {
    this.logger = logger;
    this.now = now;

    this.strategies = this.buildStrategies();
    this.strategyById = new Map(this.strategies.map((strategy) => [strategy.id, strategy]));
    this.defaultStrategyId = this.strategyById.has("strategy-balanced")
      ? "strategy-balanced"
      : this.strategies[0].id;

    this.positions = new Map();
    this.notificationPreferences = new Map();
    this.policyControls = {
      minDepositEth: "0.01",
      maxDepositEthPerWallet: "25.0",
      maxWithdrawalEthPerRequest: "10.0",
      allowAggressiveStrategy: true,
    };

    this.totalAssetsWei = 0n;
    this.totalSharesWei = 0n;
    this.totalDepositedWei = 0n;
    this.totalWithdrawnWei = 0n;
    this.totalDistributedProfitWei = 0n;
    this.protocolTreasuryProfitWei = 0n;
    this.lastReportedProfitWei = null;
  }

  buildStrategies() {
    const profiles = getRiskProfiles();
    return profiles.map((profile) => ({
      id: `strategy-${profile.id}`,
      name: `${profile.name} Searcher Vault`,
      riskProfileId: profile.id,
      summary: profile.summary,
      description: profile.description,
      minDepositEth: "0.01",
      executionMode: "flashbots-private",
      status: "active",
      feeBps: profile.id === "aggressive" ? 175 : 125,
    }));
  }

  listStrategies() {
    return this.strategies.map((strategy) => ({ ...strategy }));
  }

  assertStrategy(strategyId) {
    const strategy = this.strategyById.get(String(strategyId || "").trim());
    if (!strategy) {
      throw new Error("strategyId is invalid");
    }
    if (strategy.riskProfileId === "aggressive" && !this.policyControls.allowAggressiveStrategy) {
      throw new Error("aggressive strategy is disabled by policy controls");
    }
    return strategy;
  }

  syncFromStatus(status) {
    if (!status) return;

    let reportedProfitWei = null;
    if (
      status.realizedProfitEthWei !== undefined &&
      status.realizedProfitEthWei !== null &&
      String(status.realizedProfitEthWei).trim() !== ""
    ) {
      try {
        reportedProfitWei = BigInt(String(status.realizedProfitEthWei).trim());
      } catch (_error) {
        reportedProfitWei = null;
      }
    } else if (
      status.realizedProfitEth !== undefined &&
      status.realizedProfitEth !== null &&
      String(status.realizedProfitEth).trim() !== ""
    ) {
      try {
        reportedProfitWei = parseEther(String(status.realizedProfitEth).trim());
      } catch (_error) {
        reportedProfitWei = null;
      }
    }

    if (reportedProfitWei === null) return;

    if (this.lastReportedProfitWei === null) {
      this.lastReportedProfitWei = reportedProfitWei;
      return;
    }

    if (reportedProfitWei < this.lastReportedProfitWei) {
      this.logger?.warn?.(
        {
          previous: this.lastReportedProfitWei.toString(),
          current: reportedProfitWei.toString(),
        },
        "Realized profit counter moved backwards; resetting sync baseline",
      );
      this.lastReportedProfitWei = reportedProfitWei;
      return;
    }

    const delta = reportedProfitWei - this.lastReportedProfitWei;
    this.lastReportedProfitWei = reportedProfitWei;
    if (delta <= 0n) return;

    if (this.totalSharesWei > 0n) {
      this.totalAssetsWei += delta;
      this.totalDistributedProfitWei += delta;
    } else {
      // Profit without active depositors is kept in treasury accounting.
      this.protocolTreasuryProfitWei += delta;
    }
  }

  getVaultStats() {
    return {
      totalAssetsEth: formatEther(this.totalAssetsWei),
      totalSharesWei: this.totalSharesWei.toString(),
      participantCount: this.getActiveParticipants(),
      totalDepositedEth: formatEther(this.totalDepositedWei),
      totalWithdrawnEth: formatEther(this.totalWithdrawnWei),
      distributedProfitEth: formatEther(this.totalDistributedProfitWei),
      treasuryProfitEth: formatEther(this.protocolTreasuryProfitWei),
      sharePriceEth: this.sharePriceEth(),
      strategyCount: this.strategies.length,
      policyControls: this.getPolicyControls(),
    };
  }

  getActiveParticipants() {
    let participants = 0;
    for (const position of this.positions.values()) {
      if (position.sharesWei > 0n) {
        participants++;
      }
    }
    return participants;
  }

  sharePriceEth() {
    if (this.totalSharesWei === 0n) return "1.0";
    const sharePriceWei = (this.totalAssetsWei * WAD) / this.totalSharesWei;
    return formatEther(sharePriceWei);
  }

  toAssets(sharesWei) {
    if (sharesWei <= 0n || this.totalSharesWei <= 0n || this.totalAssetsWei <= 0n) return 0n;
    return (sharesWei * this.totalAssetsWei) / this.totalSharesWei;
  }

  getPosition(wallet) {
    const normalizedWallet = normalizeWallet(wallet);
    return this.positions.get(normalizedWallet) || null;
  }

  getOrCreatePosition(wallet, strategyId) {
    const normalizedWallet = normalizeWallet(wallet);
    const current = this.positions.get(normalizedWallet);
    if (current) return current;

    const nowIso = this.now().toISOString();
    const created = {
      wallet: normalizedWallet,
      strategyId: strategyId || this.defaultStrategyId,
      sharesWei: 0n,
      totalDepositedWei: 0n,
      totalWithdrawnWei: 0n,
      createdAt: nowIso,
      updatedAt: nowIso,
      lastDepositAt: null,
      lastWithdrawalAt: null,
    };
    this.positions.set(normalizedWallet, created);
    return created;
  }

  formatPosition(position) {
    const estimatedBalanceWei = this.toAssets(position.sharesWei);
    const netDepositedWei = position.totalDepositedWei - position.totalWithdrawnWei;
    const unrealizedPnlWei = estimatedBalanceWei - netDepositedWei;
    const pnlBps = netDepositedWei === 0n ? 0n : (unrealizedPnlWei * 10000n) / netDepositedWei;

    return {
      wallet: position.wallet,
      strategyId: position.strategyId,
      sharesWei: position.sharesWei.toString(),
      estimatedBalanceEth: formatEther(estimatedBalanceWei),
      totalDepositedEth: formatEther(position.totalDepositedWei),
      totalWithdrawnEth: formatEther(position.totalWithdrawnWei),
      netDepositedEth: formatEther(netDepositedWei),
      unrealizedPnlEth: formatEther(unrealizedPnlWei),
      unrealizedPnlPct: formatSignedBps(pnlBps),
      createdAt: position.createdAt,
      updatedAt: position.updatedAt,
      lastDepositAt: position.lastDepositAt,
      lastWithdrawalAt: position.lastWithdrawalAt,
    };
  }

  getPortfolio(wallet) {
    const position = this.getPosition(wallet);
    if (!position) {
      const normalizedWallet = normalizeWallet(wallet);
      return {
        wallet: normalizedWallet,
        strategyId: null,
        sharesWei: "0",
        estimatedBalanceEth: "0.0",
        totalDepositedEth: "0.0",
        totalWithdrawnEth: "0.0",
        netDepositedEth: "0.0",
        unrealizedPnlEth: "0.0",
        unrealizedPnlPct: "0.00",
        createdAt: null,
        updatedAt: null,
        lastDepositAt: null,
        lastWithdrawalAt: null,
      };
    }
    return this.formatPosition(position);
  }

  deposit({ wallet, amountEth, strategyId }) {
    const amountWei = parseEth(amountEth, "amountEth");
    const policyMinWei = parseEther(this.policyControls.minDepositEth);
    if (amountWei < policyMinWei) {
      throw new Error(`amountEth must be >= ${this.policyControls.minDepositEth}`);
    }

    const selectedStrategyId = String(strategyId || "").trim() || this.defaultStrategyId;
    this.assertStrategy(selectedStrategyId);

    const position = this.getOrCreatePosition(wallet, selectedStrategyId);
    if (position.strategyId !== selectedStrategyId && position.sharesWei > 0n) {
      throw new Error("withdraw current position before switching strategy");
    }
    position.strategyId = selectedStrategyId;

    const maxPerWalletWei = parseEther(this.policyControls.maxDepositEthPerWallet);
    const currentBalanceWei = this.toAssets(position.sharesWei);
    if (currentBalanceWei + amountWei > maxPerWalletWei) {
      throw new Error(`wallet exceeds maxDepositEthPerWallet (${this.policyControls.maxDepositEthPerWallet})`);
    }

    let sharesToMintWei;
    if (this.totalSharesWei === 0n || this.totalAssetsWei === 0n) {
      sharesToMintWei = amountWei;
    } else {
      sharesToMintWei = (amountWei * this.totalSharesWei) / this.totalAssetsWei;
    }

    if (sharesToMintWei <= 0n) {
      throw new Error("amountEth is too small for current share price");
    }

    this.totalAssetsWei += amountWei;
    this.totalSharesWei += sharesToMintWei;
    this.totalDepositedWei += amountWei;

    const nowIso = this.now().toISOString();
    position.sharesWei += sharesToMintWei;
    position.totalDepositedWei += amountWei;
    position.lastDepositAt = nowIso;
    position.updatedAt = nowIso;

    return {
      ok: true,
      action: "deposit",
      wallet: position.wallet,
      amountEth: formatEther(amountWei),
      strategyId: position.strategyId,
      sharesMintedWei: sharesToMintWei.toString(),
      portfolio: this.formatPosition(position),
      vault: this.getVaultStats(),
    };
  }

  withdraw({ wallet, amountEth }) {
    const amountWei = parseEth(amountEth, "amountEth");
    const maxWithdrawalWei = parseEther(this.policyControls.maxWithdrawalEthPerRequest);
    if (amountWei > maxWithdrawalWei) {
      throw new Error(
        `amountEth exceeds maxWithdrawalEthPerRequest (${this.policyControls.maxWithdrawalEthPerRequest})`,
      );
    }

    const position = this.getPosition(wallet);
    if (!position || position.sharesWei <= 0n) {
      throw new Error("wallet has no active position");
    }

    const userAssetsWei = this.toAssets(position.sharesWei);
    if (amountWei > userAssetsWei) {
      throw new Error("amountEth exceeds wallet balance");
    }

    const sharesToBurnWei = ceilDiv(amountWei * this.totalSharesWei, this.totalAssetsWei);
    if (sharesToBurnWei > position.sharesWei) {
      throw new Error("withdraw amount is too close to full balance; retry with slightly lower amount");
    }

    this.totalAssetsWei -= amountWei;
    this.totalSharesWei -= sharesToBurnWei;
    this.totalWithdrawnWei += amountWei;

    const nowIso = this.now().toISOString();
    position.sharesWei -= sharesToBurnWei;
    position.totalWithdrawnWei += amountWei;
    position.lastWithdrawalAt = nowIso;
    position.updatedAt = nowIso;

    if (this.totalSharesWei === 0n) {
      this.totalAssetsWei = 0n;
    }

    return {
      ok: true,
      action: "withdraw",
      wallet: position.wallet,
      amountEth: formatEther(amountWei),
      sharesBurnedWei: sharesToBurnWei.toString(),
      portfolio: this.formatPosition(position),
      vault: this.getVaultStats(),
    };
  }

  getPolicyControls() {
    return { ...this.policyControls };
  }

  updatePolicyControls(input = {}) {
    const next = { ...this.policyControls };

    if (Object.prototype.hasOwnProperty.call(input, "minDepositEth")) {
      next.minDepositEth = formatEther(parseEth(input.minDepositEth, "minDepositEth"));
    }
    if (Object.prototype.hasOwnProperty.call(input, "maxDepositEthPerWallet")) {
      next.maxDepositEthPerWallet = formatEther(
        parseEth(input.maxDepositEthPerWallet, "maxDepositEthPerWallet"),
      );
    }
    if (Object.prototype.hasOwnProperty.call(input, "maxWithdrawalEthPerRequest")) {
      next.maxWithdrawalEthPerRequest = formatEther(
        parseEth(input.maxWithdrawalEthPerRequest, "maxWithdrawalEthPerRequest"),
      );
    }
    if (Object.prototype.hasOwnProperty.call(input, "allowAggressiveStrategy")) {
      next.allowAggressiveStrategy = parseBool(
        input.allowAggressiveStrategy,
        "allowAggressiveStrategy",
      );
    }

    if (parseEther(next.minDepositEth) > parseEther(next.maxDepositEthPerWallet)) {
      throw new Error("minDepositEth cannot exceed maxDepositEthPerWallet");
    }

    this.policyControls = next;
    return this.getPolicyControls();
  }

  defaultNotificationPreference(wallet) {
    return {
      wallet,
      enabled: false,
      webhookUrl: "",
      minProfitAlertEth: "0.01",
      notifyOnExecution: true,
      notifyOnErrors: true,
    };
  }

  getNotificationPreference(wallet) {
    const normalizedWallet = normalizeWallet(wallet);
    return this.notificationPreferences.get(normalizedWallet) || this.defaultNotificationPreference(normalizedWallet);
  }

  updateNotificationPreference(wallet, input = {}) {
    const normalizedWallet = normalizeWallet(wallet);
    const current = this.getNotificationPreference(normalizedWallet);
    const next = { ...current };

    if (Object.prototype.hasOwnProperty.call(input, "enabled")) {
      next.enabled = parseBool(input.enabled, "enabled");
    }
    if (Object.prototype.hasOwnProperty.call(input, "webhookUrl")) {
      if (typeof input.webhookUrl !== "string") {
        throw new Error("webhookUrl must be a string");
      }
      next.webhookUrl = input.webhookUrl.trim();
    }
    if (Object.prototype.hasOwnProperty.call(input, "minProfitAlertEth")) {
      next.minProfitAlertEth = formatEther(
        parseEth(input.minProfitAlertEth, "minProfitAlertEth", { allowZero: true }),
      );
    }
    if (Object.prototype.hasOwnProperty.call(input, "notifyOnExecution")) {
      next.notifyOnExecution = parseBool(input.notifyOnExecution, "notifyOnExecution");
    }
    if (Object.prototype.hasOwnProperty.call(input, "notifyOnErrors")) {
      next.notifyOnErrors = parseBool(input.notifyOnErrors, "notifyOnErrors");
    }

    this.notificationPreferences.set(normalizedWallet, next);
    return { ...next };
  }

  getAnalytics({ status }) {
    const s = status || {};
    return {
      executionRatePct: ratioPctString(s.opportunitiesExecuted || 0, s.opportunitiesFound || 0),
      errorRatePctPerCycle: ratioPctString(s.errors || 0, s.cycleCount || 0),
      retryRatePctPerCycle: ratioPctString(s.retries || 0, s.cycleCount || 0),
      realizedProfitEth: s.realizedProfitEth || formatEther(this.totalDistributedProfitWei),
      realizedProfitEthWei:
        s.realizedProfitEthWei || this.totalDistributedProfitWei.toString(),
      status: {
        cycleCount: s.cycleCount || 0,
        opportunitiesFound: s.opportunitiesFound || 0,
        opportunitiesExecuted: s.opportunitiesExecuted || 0,
        errors: s.errors || 0,
        retries: s.retries || 0,
        killSwitchActivated: Boolean(s.killSwitchActivated),
        lastExecutionLabel: s.lastExecutionLabel || null,
        lastExecutionAt: s.lastExecutionAt || null,
      },
      vault: this.getVaultStats(),
    };
  }

  getRoadmapStatus() {
    return {
      overallStatus: "all-passes-complete",
      phases: [
        {
          id: "phase-1",
          title: "Searcher Engine + Safety Controls",
          status: "complete",
          passes: [
            "Arbitrage/liquidation/cross-chain monitoring",
            "Instadapp spell execution with Flashbots relay support",
            "Kill-switch, retries, and runtime status reporting",
          ],
        },
        {
          id: "phase-2",
          title: "Consumer Vault Access Layer",
          status: "complete",
          passes: [
            "Wallet-first strategy selection APIs",
            "Deposit and withdraw flows with policy validation",
            "Portfolio views for non-technical users",
          ],
        },
        {
          id: "phase-3",
          title: "Analytics + Notifications + Policy Controls",
          status: "complete",
          passes: [
            "Execution and PnL analytics endpoints",
            "Per-wallet notification preference management",
            "Runtime policy controls for risk enforcement",
          ],
        },
      ],
    };
  }
}

module.exports = {
  ConsumerVaultService,
  normalizeWallet,
};
