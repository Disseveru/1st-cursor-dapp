const { createLogger } = require("../src/logger");

describe("createLogger", () => {
  it("creates a pino logger at the specified level", () => {
    const logger = createLogger("debug");
    expect(logger).toBeDefined();
    expect(logger.level).toBe("debug");
  });

  it("defaults to info level", () => {
    const logger = createLogger();
    expect(logger.level).toBe("info");
  });

  it("has expected log methods", () => {
    const logger = createLogger("info");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });
});
