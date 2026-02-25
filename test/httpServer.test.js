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

async function waitForListening(server) {
  await new Promise((resolve, reject) => {
    if (server.listening) return resolve();
    server.once("listening", resolve);
    server.once("error", reject);
  });
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
      await waitForListening(serverHandle.server);

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
    } finally {
      await serverHandle.close();
    }
  });

  test("accepts invitation and returns invitation status", async () => {
    const logger = makeLogger();
    const statusReporter = new StatusReporter({ logger });
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
      await waitForListening(serverHandle.server);
      const address = serverHandle.server.address();
      const baseUrl = `http://127.0.0.1:${address.port}`;

      const accepted = await fetch(`${baseUrl}/api/invitation/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "accept my invitation", invitee: "alice" }),
      }).then((r) => r.json());

      expect(accepted.ok).toBe(true);
      expect(accepted.data.invitationCode).toBe("my-invitation");
      expect(accepted.data.status).toBe("accepted");
      expect(accepted.data.invitee).toBe("alice");

      const acceptedAgain = await fetch(`${baseUrl}/api/invitations/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invitationCode: "my-invitation", invitee: "bob" }),
      }).then((r) => r.json());
      expect(acceptedAgain.ok).toBe(true);
      expect(acceptedAgain.data.status).toBe("already-accepted");
      expect(acceptedAgain.data.invitee).toBe("alice");

      const status = await fetch(`${baseUrl}/api/invitations/my-invitation`).then((r) => r.json());
      expect(status.ok).toBe(true);
      expect(status.data.status).toBe("accepted");
      expect(status.data.invitee).toBe("alice");

      const missingCodeResponse = await fetch(`${baseUrl}/api/invitations/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invitee: "charlie" }),
      });
      expect(missingCodeResponse.status).toBe(400);
      const missingCodePayload = await missingCodeResponse.json();
      expect(missingCodePayload.ok).toBe(false);
      expect(missingCodePayload.error).toMatch(/Invitation code is required/);

      const missingInvitation = await fetch(`${baseUrl}/api/invitations/not-found`);
      expect(missingInvitation.status).toBe(404);
      const missingInvitationPayload = await missingInvitation.json();
      expect(missingInvitationPayload.ok).toBe(false);
      expect(missingInvitationPayload.error).toBe("Invitation not found");
    } finally {
      await serverHandle.close();
    }
  });
});
