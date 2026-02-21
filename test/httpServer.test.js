const { createHttpServer } = require("../src/httpServer");
const { StatusReporter } = require("../src/statusReporter");

function makeLogger() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

describe("httpServer", () => {
  test("serves health, status, and risk profile endpoints", async () => {
    const logger = makeLogger();
    const statusReporter = new StatusReporter({ logger });
    statusReporter.start();
    statusReporter.recordCycle();
    statusReporter.recordOpportunitiesFound(3);

    const serverHandle = createHttpServer({
      config: {
        app: {
          webPort: 0,
          webHost: "127.0.0.1",
        },
      },
      statusReporter,
      logger,
    });

    try {
      await new Promise((resolve, reject) => {
        if (serverHandle.server.listening) return resolve();
        serverHandle.server.once("listening", resolve);
        serverHandle.server.once("error", reject);
      });

      const address = serverHandle.server.address();
      const baseUrl = `http://127.0.0.1:${address.port}`;

      const health = await fetch(`${baseUrl}/health`).then((r) => r.json());
      expect(health.ok).toBe(true);

      const status = await fetch(`${baseUrl}/api/status`).then((r) => r.json());
      expect(status.ok).toBe(true);
      expect(status.status.cycleCount).toBe(1);

      const profiles = await fetch(`${baseUrl}/api/risk-profiles`).then((r) => r.json());
      expect(profiles.ok).toBe(true);
      expect(profiles.data.length).toBeGreaterThan(0);

      const roadmap = await fetch(`${baseUrl}/api/roadmap`).then((r) => r.json());
      expect(roadmap.ok).toBe(true);
      expect(roadmap.data.currentPhase).toBe(2);
      expect(roadmap.data.phases[0].status).toBe("complete");
    } finally {
      await serverHandle.close();
    }
  });
});
