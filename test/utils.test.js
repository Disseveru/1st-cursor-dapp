const { sleep, parseJSON, asBool, normalizePrivateKey, addressEq } = require("../src/utils");

describe("sleep", () => {
  it("resolves after the specified duration", async () => {
    const start = Date.now();
    await sleep(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });
});

describe("parseJSON", () => {
  it("returns parsed object for valid JSON string", () => {
    expect(parseJSON('{"a":1}', {}, "test")).toEqual({ a: 1 });
  });

  it("returns fallback when value is falsy", () => {
    expect(parseJSON(null, [1, 2], "test")).toEqual([1, 2]);
    expect(parseJSON("", { x: 1 }, "test")).toEqual({ x: 1 });
    expect(parseJSON(undefined, "default", "test")).toBe("default");
  });

  it("throws on invalid JSON with descriptive label", () => {
    expect(() => parseJSON("{bad", [], "MY_VAR")).toThrow("Invalid JSON for MY_VAR");
  });
});

describe("asBool", () => {
  it.each(["1", "true", "yes", "on", "TRUE", "Yes", "ON"])(
    "returns true for %s",
    (val) => {
      expect(asBool(val)).toBe(true);
    },
  );

  it.each(["0", "false", "no", "off", "anything"])(
    "returns false for %s",
    (val) => {
      expect(asBool(val)).toBe(false);
    },
  );

  it("returns fallback for undefined/null/empty", () => {
    expect(asBool(undefined, true)).toBe(true);
    expect(asBool(null, false)).toBe(false);
    expect(asBool("", true)).toBe(true);
  });
});

describe("normalizePrivateKey", () => {
  it("prepends 0x if missing", () => {
    expect(normalizePrivateKey("abc123")).toBe("0xabc123");
  });

  it("preserves existing 0x prefix", () => {
    expect(normalizePrivateKey("0xabc123")).toBe("0xabc123");
  });

  it("returns empty string for falsy input", () => {
    expect(normalizePrivateKey("")).toBe("");
    expect(normalizePrivateKey(null)).toBe("");
    expect(normalizePrivateKey(undefined)).toBe("");
  });
});

describe("addressEq", () => {
  it("treats addresses as case-insensitive", () => {
    expect(
      addressEq(
        "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2",
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
      ),
    ).toBe(true);
  });

  it("returns false for different addresses", () => {
    expect(addressEq("0xabc", "0xdef")).toBe(false);
  });
});
