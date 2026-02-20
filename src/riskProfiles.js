const RISK_PROFILES = Object.freeze({
  conservative: {
    id: "conservative",
    name: "Conservative",
    title: "Conservative",
    summary: "Focuses on larger spreads and stronger gas buffers.",
    description: "Higher profit filter and higher gas reserve to reduce failed execution risk.",
    minProfitEth: 0.005,
    gasKillSwitchEth: 0.08,
    gasMultiplier: 1.1,
    pollIntervalMs: 4000,
  },
  balanced: {
    id: "balanced",
    name: "Balanced",
    title: "Balanced",
    summary: "Default profile for mixed opportunity flow.",
    description: "Moderate profit filter and reserve thresholds for daily operation.",
    minProfitEth: 0.003,
    gasKillSwitchEth: 0.05,
    gasMultiplier: 1.15,
    pollIntervalMs: 2500,
  },
  aggressive: {
    id: "aggressive",
    name: "Aggressive",
    title: "Aggressive",
    summary: "Targets more opportunities with tighter margins and faster polling.",
    description: "Lower profit threshold and smaller reserve buffer to capture more opportunities.",
    minProfitEth: 0.001,
    gasKillSwitchEth: 0.03,
    gasMultiplier: 1.2,
    pollIntervalMs: 1200,
  },
});

function toPublicProfile(profile) {
  return {
    id: profile.id,
    name: profile.name,
    title: profile.title,
    summary: profile.summary,
    description: profile.description,
    minProfitEth: profile.minProfitEth,
    gasKillSwitchEth: profile.gasKillSwitchEth,
    gasMultiplier: profile.gasMultiplier,
    pollIntervalMs: profile.pollIntervalMs,
    recommendedConfig: {
      MIN_PROFIT_ETH: String(profile.minProfitEth),
      GAS_KILL_SWITCH_ETH: String(profile.gasKillSwitchEth),
      GAS_MULTIPLIER: String(profile.gasMultiplier),
      POLL_INTERVAL_MS: String(profile.pollIntervalMs),
    },
  };
}

function getRiskProfile(profileName) {
  if (!profileName || profileName === "custom") return null;
  const key = String(profileName).toLowerCase();
  const profile = RISK_PROFILES[key];
  return profile ? toPublicProfile(profile) : null;
}

function getRiskProfileById(id) {
  return getRiskProfile(id);
}

function getRiskProfiles() {
  return Object.values(RISK_PROFILES).map(toPublicProfile);
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
  getRiskProfileById,
  getRiskProfiles,
  applyRiskProfile,
};
