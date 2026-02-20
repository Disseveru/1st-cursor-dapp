const RISK_PROFILES = [
  {
    id: "conservative",
    name: "Conservative",
    summary: "Focuses on larger spreads and stronger gas buffers.",
    recommendedConfig: {
      MIN_PROFIT_ETH: "0.01",
      GAS_MULTIPLIER: "1.25",
      GAS_KILL_SWITCH_ETH: "0.08",
      POLL_INTERVAL_MS: "4000",
    },
  },
  {
    id: "balanced",
    name: "Balanced",
    summary: "Default profile for mixed opportunity flow.",
    recommendedConfig: {
      MIN_PROFIT_ETH: "0.004",
      GAS_MULTIPLIER: "1.15",
      GAS_KILL_SWITCH_ETH: "0.05",
      POLL_INTERVAL_MS: "2500",
    },
  },
  {
    id: "aggressive",
    name: "Aggressive",
    summary: "Targets more opportunities with tighter margins and faster polling.",
    recommendedConfig: {
      MIN_PROFIT_ETH: "0.0015",
      GAS_MULTIPLIER: "1.08",
      GAS_KILL_SWITCH_ETH: "0.03",
      POLL_INTERVAL_MS: "1200",
    },
  },
];

function getRiskProfiles() {
  return RISK_PROFILES.map((profile) => ({
    ...profile,
    recommendedConfig: { ...profile.recommendedConfig },
  }));
}

function getRiskProfileById(id) {
  if (!id) return null;
  const match = RISK_PROFILES.find((profile) => profile.id === String(id).toLowerCase());
  if (!match) return null;
  return {
    ...match,
    recommendedConfig: { ...match.recommendedConfig },
  };
}

module.exports = {
  getRiskProfiles,
  getRiskProfileById,
};
const RISK_PROFILES = Object.freeze({
  conservative: {
    id: "conservative",
    title: "Conservative",
    description:
      "Higher profit filter and higher gas reserve to reduce failed execution risk.",
    minProfitEth: 0.005,
    gasKillSwitchEth: 0.08,
    gasMultiplier: 1.1,
  },
  balanced: {
    id: "balanced",
    title: "Balanced",
    description: "Moderate profit filter and reserve thresholds for daily operation.",
    minProfitEth: 0.003,
    gasKillSwitchEth: 0.05,
    gasMultiplier: 1.15,
  },
  aggressive: {
    id: "aggressive",
    title: "Aggressive",
    description:
      "Lower profit threshold and smaller reserve buffer to capture more opportunities.",
    minProfitEth: 0.001,
    gasKillSwitchEth: 0.03,
    gasMultiplier: 1.2,
  },
});

function getRiskProfile(profileName) {
  if (!profileName || profileName === "custom") return null;
  return RISK_PROFILES[profileName] || null;
}

function getRiskProfiles() {
  return Object.values(RISK_PROFILES);
}

function applyRiskProfile({ profileName, env, riskConfig }) {
  const preset = getRiskProfile(profileName);
  if (!preset) {
    return {
      ...riskConfig,
      profile: "custom",
    };
  }

  return {
    ...riskConfig,
    profile: preset.id,
    minProfitEth:
      env.MIN_PROFIT_ETH === undefined || env.MIN_PROFIT_ETH === ""
        ? preset.minProfitEth
        : riskConfig.minProfitEth,
    gasKillSwitchEth:
      env.GAS_KILL_SWITCH_ETH === undefined || env.GAS_KILL_SWITCH_ETH === ""
        ? preset.gasKillSwitchEth
        : riskConfig.gasKillSwitchEth,
    gasMultiplier:
      env.GAS_MULTIPLIER === undefined || env.GAS_MULTIPLIER === ""
        ? preset.gasMultiplier
        : riskConfig.gasMultiplier,
  };
}

module.exports = {
  RISK_PROFILES,
  getRiskProfile,
  getRiskProfiles,
  applyRiskProfile,
};
