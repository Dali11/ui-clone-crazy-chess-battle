import { describe, it, expect } from "vitest";
import {
  normalizeZmPhone,
  zmCarrier,
  zmCarrierName,
  zmwToMwk,
  mwkToZmw,
  mapOntechStatus,
  isOntechDisbursement,
  ontechReference,
} from "../ontech";

describe("normalizeZmPhone", () => {
  it("normalizes local, +260, and 260 formats", () => {
    expect(normalizeZmPhone("0971234567")).toBe("0971234567");
    expect(normalizeZmPhone("+260 97 123 4567")).toBe("0971234567");
    expect(normalizeZmPhone("260971234567")).toBe("0971234567");
    expect(normalizeZmPhone("096-123-4567")).toBe("0961234567");
  });

  it("accepts all valid carrier prefixes", () => {
    for (const p of ["095", "096", "097", "076", "077", "078", "079"]) {
      expect(normalizeZmPhone(p + "1234567")).toBe(p + "1234567");
    }
  });

  it("rejects invalid numbers", () => {
    expect(normalizeZmPhone("0991234567")).toBeNull(); // Malawi prefix
    expect(normalizeZmPhone("097123456")).toBeNull(); // too short
    expect(normalizeZmPhone("09712345678")).toBeNull(); // too long
    expect(normalizeZmPhone("12345")).toBeNull();
    expect(normalizeZmPhone("")).toBeNull();
  });
});

describe("zmCarrier", () => {
  it("maps prefixes to carriers", () => {
    expect(zmCarrier("0971234567")).toBe("AIRTEL");
    expect(zmCarrier("0961234567")).toBe("AIRTEL");
    expect(zmCarrier("0771234567")).toBe("MTN");
    expect(zmCarrier("0761234567")).toBe("MTN");
    expect(zmCarrier("0781234567")).toBe("MTN");
    expect(zmCarrier("0791234567")).toBe("MTN");
    expect(zmCarrier("0951234567")).toBe("ZAMTEL");
  });

  it("returns null for non-ZM shapes", () => {
    expect(zmCarrier("0991234567")).toBeNull();
    expect(zmCarrier("not a phone")).toBeNull();
  });

  it("labels map cleanly", () => {
    expect(zmCarrierName("AIRTEL")).toBe("Airtel Money");
    expect(zmCarrierName("MTN")).toBe("MTN MoMo");
    expect(zmCarrierName("ZAMTEL")).toBe("Zamtel Kwacha");
    expect(zmCarrierName(null)).toBe("Mobile Money");
  });
});

describe("FX conversion", () => {
  // live-ish rate: 1 MWK = 0.011030 ZMW → 1 ZMW ≈ 90.66 MWK
  const rate = 0.01103;

  it("converts ZMW → whole MWK, min 1", () => {
    expect(zmwToMwk(5, rate)).toBe(Math.round(5 / rate)); // ≈ 453
    expect(zmwToMwk(100, rate)).toBe(Math.round(100 / rate)); // ≈ 9066
    expect(zmwToMwk(0.01, rate)).toBe(1); // never zero
  });

  it("guards against bad rates", () => {
    expect(zmwToMwk(100, 0)).toBe(0);
    expect(zmwToMwk(100, -1)).toBe(0);
  });

  it("round-trips sensibly", () => {
    const mwk = zmwToMwk(50, rate);
    expect(Math.abs(mwkToZmw(mwk, rate) - 50)).toBeLessThan(1);
  });
});

describe("webhook mapping", () => {
  it("maps statuses to the 3-state model", () => {
    expect(mapOntechStatus({ status: "success" })).toBe("success");
    expect(mapOntechStatus({ event: "payment.completed" })).toBe("success");
    expect(mapOntechStatus({ status: "failed" })).toBe("failed");
    expect(mapOntechStatus({ event: "payment.reversed" })).toBe("failed");
    expect(mapOntechStatus({ status: "pending" })).toBe("pending");
    expect(mapOntechStatus({})).toBe("pending");
  });

  it("distinguishes disbursements", () => {
    expect(isOntechDisbursement({ event: "disbursement.completed" })).toBe(true);
    expect(isOntechDisbursement({ event: "payment.success" })).toBe(false);
  });

  it("extracts references from any field name", () => {
    expect(ontechReference({ reference: "ccbz123" })).toBe("ccbz123");
    expect(ontechReference({ transaction_id: "OP-XYZ" })).toBe("OP-XYZ");
    expect(ontechReference({ transactionId: "OP-ABC" })).toBe("OP-ABC");
    expect(ontechReference({})).toBeNull();
  });
});
