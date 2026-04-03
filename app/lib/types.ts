export type WalletChoice = "freighter" | "xbull";

export type WalletSession = {
  address: string;
  walletId: WalletChoice;
  walletName: string;
};

export type PollResults = {
  freighter: number;
  xbull: number;
  total: number;
};

export type VoteTarget = WalletChoice;

export type TxState = "idle" | "pending" | "success" | "error";

export type TxStatus = {
  state: TxState;
  message: string;
  hash?: string;
};

export type ContractEventFeedItem = {
  id: string;
  ledger: number | null;
  txHash?: string;
  topics: string[];
  option?: string;
  total?: number;
  closedAt?: string;
};

export type ClassifiedError = {
  kind:
    | "wallet-not-found"
    | "rejected"
    | "insufficient-balance"
    | "contract-not-configured"
    | "unknown";
  title: string;
  message: string;
};
