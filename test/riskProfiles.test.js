const { getRiskProfiles, getRiskProfileById } = require("../src/riskProfiles");

describe("riskProfiles", () => {
  test("returns all default profiles", () => {
    const profiles = getRiskProfiles();
    expect(Array.isArray(profiles)).toBe(true);
    expect(profiles.map((p) => p.id)).toEqual(["conservative", "balanced", "aggressive"]);
  });

  test("returns profile by id (case-insensitive)", () => {
    const profile = getRiskProfileById("BALANCED");
    expect(profile).not.toBeNull();
    expect(profile.id).toBe("balanced");
    expect(profile.recommendedConfig.MIN_PROFIT_ETH).toBeDefined();
  });

  test("returns null when profile id is unknown", () => {
    expect(getRiskProfileById("unknown")).toBeNull();
  });
});
