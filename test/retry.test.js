const { withRetry, isTransientRpcError } = require("../src/utils");

describe("withRetry", () => {
  it("returns the result on first success", async () => {
    const fn = jest.fn(async () => 42);
    const result = await withRetry(fn, { maxAttempts: 3 });
    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on transient failure then succeeds", async () => {
    let attempt = 0;
    const fn = jest.fn(async () => {
      attempt++;
      if (attempt < 3) {
        const err = new Error("timeout");
        err.code = "TIMEOUT";
        throw err;
      }
      return "ok";
    });

    const result = await withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 1,
      shouldRetry: () => true,
    });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting all attempts", async () => {
    const fn = jest.fn(async () => {
      throw new Error("always fails");
    });

    await expect(withRetry(fn, { maxAttempts: 2, baseDelayMs: 1 })).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry when shouldRetry returns false", async () => {
    const fn = jest.fn(async () => {
      throw new Error("permanent");
    });

    await expect(
      withRetry(fn, {
        maxAttempts: 5,
        baseDelayMs: 1,
        shouldRetry: () => false,
      }),
    ).rejects.toThrow("permanent");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("calls logger.debug on retry", async () => {
    let attempt = 0;
    const logger = { debug: jest.fn() };
    const fn = jest.fn(async () => {
      attempt++;
      if (attempt < 2) throw new Error("transient");
      return "ok";
    });

    await withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 1,
      label: "test-op",
      logger,
    });
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ label: "test-op", attempt: 1 }),
      "Retrying after transient failure",
    );
  });
});

describe("isTransientRpcError", () => {
  it.each([
    { code: "TIMEOUT", message: "" },
    { code: "SERVER_ERROR", message: "" },
    { code: "NETWORK_ERROR", message: "" },
    { code: undefined, message: "connection timeout after 5000ms" },
    { code: undefined, message: "ECONNRESET" },
    { code: undefined, message: "ECONNREFUSED" },
    { code: undefined, message: "socket hang up" },
    { code: undefined, message: "429 Too Many Requests" },
    { code: undefined, message: "rate limit exceeded" },
  ])("returns true for %o", (errProps) => {
    const err = new Error(errProps.message);
    if (errProps.code) err.code = errProps.code;
    expect(isTransientRpcError(err)).toBe(true);
  });

  it("returns false for non-transient errors", () => {
    expect(isTransientRpcError(new Error("revert: insufficient balance"))).toBe(false);
    expect(isTransientRpcError(new Error("invalid argument"))).toBe(false);
  });
});
