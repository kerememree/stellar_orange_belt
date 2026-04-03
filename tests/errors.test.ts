import { describe, expect, it } from "vitest";
import { classifyError } from "../app/lib/errors";

describe("classifyError", () => {
  it("maps rejected wallet actions", () => {
    const result = classifyError("User rejected the signature request");

    expect(result.kind).toBe("rejected");
    expect(result.title).toBe("Request rejected");
  });

  it("maps insufficient balance messages", () => {
    const result = classifyError("op_underfunded");

    expect(result.kind).toBe("insufficient-balance");
  });

  it("maps missing wallets", () => {
    const result = classifyError("xBull wallet not found");

    expect(result.kind).toBe("wallet-not-found");
  });
});
