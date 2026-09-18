import { describe, expect, it } from "vitest";
import { toPawaPayMsisdn, toPaychanguMobile } from "./iso3";

describe("toPaychanguMobile", () => {
  it("passes clean local Malawi numbers through unchanged", () => {
    expect(toPaychanguMobile("0999086648", "MW")).toBe("0999086648");
  });
  it("converts international +265 format to the local MSISDN (live incident format)", () => {
    expect(toPaychanguMobile("+265992620513", "MW")).toBe("0992620513");
  });
  it("strips spaces and other separators from pasted numbers", () => {
    expect(toPaychanguMobile("+265 986 57 23 21", "MW")).toBe("0986572321");
    expect(toPaychanguMobile("+265 986572321", "MW")).toBe("0986572321");
  });
  it("handles bare 265 prefix without the plus", () => {
    expect(toPaychanguMobile("265992620513", "MW")).toBe("0992620513");
  });
  it("does not mangle numbers from unknown countries (pass-through digits)", () => {
    expect(toPaychanguMobile("0771502794", "ZM")).toBe("0771502794");
  });
});

describe("toPawaPayMsisdn", () => {
  it("still normalizes to bare MSISDN with dialing code", () => {
    expect(toPawaPayMsisdn("0771502794", "ZM")).toBe("260771502794");
    expect(toPawaPayMsisdn("+254745697136", "KE")).toBe("254745697136");
  });
});
