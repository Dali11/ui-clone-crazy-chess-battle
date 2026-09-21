import { describe, it, expect } from "vitest";
import { describeDepositFailure } from "../failure-reasons";

describe("describeDepositFailure", () => {
  it("maps a stored PawaPay failureReason payload to a friendly reason", () => {
    const notes = JSON.stringify({
      failureReason: {
        failureCode: "INSUFFICIENT_BALANCE",
        failureMessage: "The customer does not have enough funds to complete the payment.",
      },
    });
    expect(describeDepositFailure(notes)).toContain("Top up");
  });

  it("maps PAYMENT_NOT_APPROVED", () => {
    const notes = JSON.stringify({
      failureReason: { failureCode: "PAYMENT_NOT_APPROVED", failureMessage: "not approved" },
    });
    expect(describeDepositFailure(notes)).toContain("PIN");
  });

  it("falls back to the provider's own message for unknown codes", () => {
    const notes = JSON.stringify({
      failureReason: { failureCode: "SOMETHING_NEW", failureMessage: "Provider X said no" },
    });
    expect(describeDepositFailure(notes)).toBe("Provider X said no");
  });

  it("finds codes embedded in plain-text notes (initiation errors)", () => {
    expect(describeDepositFailure("PawaPay initiation error: INVALID_PAYER_FORMAT for 26076…")).toContain(
      "rejected by the provider"
    );
  });

  it("returns short plain-text notes verbatim", () => {
    expect(describeDepositFailure("PayChangu initiation rejected: bad operator")).toBe(
      "PayChangu initiation rejected: bad operator"
    );
  });

  it("returns null for missing or overly long notes", () => {
    expect(describeDepositFailure(null)).toBeNull();
    expect(describeDepositFailure(undefined)).toBeNull();
    expect(describeDepositFailure("x".repeat(500))).toBeNull();
  });
});
