const { createProviderMap, getProviderOrThrow } = require("../src/providers");

describe("createProviderMap", () => {
  it("creates a provider for each chain ID in the map", () => {
    const providers = createProviderMap({
      1: "https://eth.example.com",
      42161: "https://arb.example.com",
    });
    expect(providers[1]).toBeDefined();
    expect(providers[42161]).toBeDefined();
  });

  it("returns empty object for empty input", () => {
    expect(createProviderMap({})).toEqual({});
  });
});

describe("getProviderOrThrow", () => {
  it("returns the provider for a valid chain ID", () => {
    const providers = { 1: "mock-provider" };
    expect(getProviderOrThrow(providers, 1)).toBe("mock-provider");
  });

  it("throws for a missing chain ID", () => {
    expect(() => getProviderOrThrow({}, 999)).toThrow("Missing provider for chainId 999");
  });
});
