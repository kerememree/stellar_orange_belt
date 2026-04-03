import { Networks } from "@stellar/stellar-sdk";

export const APP_NAME = "Orange Belt Live Poll";
export const RPC_URL =
  process.env.NEXT_PUBLIC_STELLAR_RPC_URL ??
  "https://soroban-testnet.stellar.org";
export const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL ??
  "https://horizon-testnet.stellar.org";
export const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? Networks.TESTNET;
export const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID ?? "";
export const CONTRACT_EXPLORER_URL = CONTRACT_ID
  ? `https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`
  : null;
export const TX_EXPLORER_BASE_URL =
  "https://stellar.expert/explorer/testnet/tx/";

export function isContractConfigured() {
  return CONTRACT_ID.trim().length > 0;
}
