import { describe, expect, it } from "vitest";
import {
  calculateShare,
  formatAddress,
  formatBalance,
} from "../app/lib/poll-utils";

describe("poll utility helpers", () => {
  it("calculates vote share percentages", () => {
    expect(calculateShare(3, 4)).toBe(75);
    expect(calculateShare(0, 0)).toBe(0);
  });

  it("formats balances for the dashboard", () => {
    expect(formatBalance("9999")).toBe("9,999.00");
    expect(formatBalance(null)).toBe("--");
  });

  it("truncates addresses for compact UI display", () => {
    expect(formatAddress("GAT5VQ111122223333TTM2A4")).toBe("GAT5VQ...TTM2A4");
  });
});
