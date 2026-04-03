import type { ClassifiedError } from "@/app/lib/types";

function readMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object" && error) {
    const candidate = error as {
      message?: string;
      error?: string;
      details?: string;
    };

    return candidate.message || candidate.error || candidate.details || "";
  }

  return "";
}

export function classifyError(error: unknown): ClassifiedError {
  const message = readMessage(error);
  const normalized = message.toLowerCase();

  if (!message) {
    return {
      kind: "unknown",
      title: "Unexpected error",
      message: "Something went wrong and no detailed error message was returned.",
    };
  }

  if (
    /not found|not installed|not available|no wallet/.test(normalized) ||
    /freighter|xbull/.test(normalized)
  ) {
    return {
      kind: "wallet-not-found",
      title: "Wallet not found",
      message:
        "The selected wallet could not be reached. Install the wallet or switch to another supported option.",
    };
  }

  if (/rejected|declined|denied|cancelled|canceled/.test(normalized)) {
    return {
      kind: "rejected",
      title: "Request rejected",
      message:
        "The wallet request was rejected by the user. Re-open the wallet and approve the action to continue.",
    };
  }

  if (/insufficient balance|underfunded|op_underfunded/.test(normalized)) {
    return {
      kind: "insufficient-balance",
      title: "Insufficient balance",
      message:
        "This wallet does not have enough XLM to cover the contract transaction and fees on testnet.",
    };
  }

  if (/contract id|contract not configured/.test(normalized)) {
    return {
      kind: "contract-not-configured",
      title: "Contract not configured",
      message:
        "Add the deployed testnet contract ID to NEXT_PUBLIC_CONTRACT_ID before testing contract calls from the frontend.",
    };
  }

  return {
    kind: "unknown",
    title: "Operation failed",
    message,
  };
}
