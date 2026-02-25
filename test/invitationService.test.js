const { InvitationService, extractInvitationCode } = require("../src/invitationService");

describe("invitationService", () => {
  test("extracts invitation code from known keys and command text", () => {
    expect(extractInvitationCode({ invitationCode: "abc-123" })).toBe("abc-123");
    expect(extractInvitationCode({ inviteCode: "def-456" })).toBe("def-456");
    expect(extractInvitationCode({ code: "ghi-789" })).toBe("ghi-789");
    expect(extractInvitationCode({ invitationId: "jkl-000" })).toBe("jkl-000");
    expect(extractInvitationCode({ message: "please ACCEPT my invitation now" })).toBe(
      "my-invitation",
    );
    expect(extractInvitationCode({})).toBeNull();
  });

  test("accepts invitations idempotently and exposes status lookup", () => {
    const service = new InvitationService({
      now: () => new Date("2026-02-25T00:00:00.000Z"),
    });

    const first = service.acceptInvitation({
      invitationCode: "alpha-code",
      invitee: "alice",
    });
    expect(first.status).toBe("accepted");
    expect(first.acceptedAt).toBe("2026-02-25T00:00:00.000Z");

    const second = service.acceptInvitation({
      invitationCode: "alpha-code",
      invitee: "bob",
    });
    expect(second.status).toBe("already-accepted");
    expect(second.invitee).toBe("alice");

    const status = service.getInvitation("alpha-code");
    expect(status).toEqual({
      invitationCode: "alpha-code",
      invitee: "alice",
      acceptedAt: "2026-02-25T00:00:00.000Z",
      status: "accepted",
    });
  });

  test("throws clear errors for missing invitation code", () => {
    const service = new InvitationService();
    expect(() => service.acceptInvitation({ invitee: "alice" })).toThrow(
      "Invitation code is required",
    );
    expect(() => service.getInvitation("")).toThrow("Invitation code is required");
  });
});
