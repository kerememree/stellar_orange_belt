import type { PollResults } from "@/app/lib/types";

export const initialResults: PollResults = {
  freighter: 0,
  xbull: 0,
  total: 0,
};

export function formatAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

export function formatBalance(balance: string | null) {
  if (!balance) {
    return "--";
  }

  const amount = Number(balance);

  if (Number.isNaN(amount)) {
    return balance;
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatRelativeTime(value?: string) {
  if (!value) {
    return "Awaiting first contract event";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function calculateShare(value: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.round((value / total) * 100);
}
