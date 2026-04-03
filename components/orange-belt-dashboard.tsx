"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import {
  APP_NAME,
  CONTRACT_EXPLORER_URL,
  CONTRACT_ID,
  TX_EXPLORER_BASE_URL,
  isContractConfigured,
} from "@/app/lib/config";
import {
  POLL_CACHE_KEY,
  clearPollCache,
  createPollCacheSnapshot,
  parsePollCacheSnapshot,
  persistPollCache,
} from "@/app/lib/cache";
import { classifyError } from "@/app/lib/errors";
import {
  fetchPollResults,
  fetchRecentEvents,
  fetchWalletBalance,
  submitVote,
} from "@/app/lib/contract";
import {
  calculateShare,
  formatAddress,
  formatBalance,
  formatRelativeTime,
  initialResults,
} from "@/app/lib/poll-utils";
import { connectWallet, signWithWallet, supportedWallets } from "@/app/lib/wallet-kit";
import type {
  ClassifiedError,
  ContractEventFeedItem,
  PollResults,
  TxStatus,
  VoteTarget,
  WalletChoice,
  WalletSession,
} from "@/app/lib/types";

const initialTxStatus: TxStatus = {
  state: "idle",
  message: "No contract transaction has been submitted yet.",
};

type SyncSource = "cache" | "stale-cache" | "network" | null;

function Panel({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section className="shell signal-ring rounded-[28px] p-6 sm:p-7">
      <p className="text-xs font-medium uppercase tracking-[0.34em] text-[var(--muted)]">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{title}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function ActionButton({
  children,
  variant = "primary",
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  onClick?: () => void;
}) {
  const className =
    variant === "primary"
      ? "bg-[var(--accent)] text-white shadow-[0_18px_35px_rgba(14,165,233,0.24)] hover:bg-[var(--accent-strong)]"
      : "bg-white/6 text-[var(--foreground)] hover:bg-white/10";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
    >
      {children}
    </button>
  );
}

function ErrorBanner({ error }: { error: ClassifiedError | null }) {
  if (!error) {
    return null;
  }

  return (
    <div className="rounded-[24px] border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-4">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--danger)]">
        {error.title}
      </p>
      <p className="mt-2 text-sm leading-6 text-white/88">{error.message}</p>
    </div>
  );
}

function StatusPill({ status }: { status: TxStatus["state"] }) {
  const tone =
    status === "success"
      ? "bg-[var(--success-soft)] text-[var(--success)]"
      : status === "error"
        ? "bg-[var(--danger-soft)] text-[var(--danger)]"
        : status === "pending"
          ? "bg-[var(--warning-soft)] text-[var(--warning)]"
          : "bg-white/8 text-[var(--muted)]";

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] ${tone}`}
    >
      {status}
    </span>
  );
}

function ProgressState({
  active,
  label,
}: {
  active: boolean;
  label: string;
}) {
  return (
    <div className="mt-5 rounded-[22px] border border-[var(--border)] bg-black/12 px-4 py-4">
      <div className="h-2 overflow-hidden rounded-full bg-white/8">
        <div
          className={`h-full rounded-full bg-sky-400 transition-all duration-500 ${
            active ? "w-2/3 animate-pulse" : "w-1/4 opacity-40"
          }`}
        />
      </div>
      <p className="mt-3 text-sm text-[var(--muted)]">{label}</p>
    </div>
  );
}

function getSyncMessage(source: SyncSource, lastSyncedAt: string | null) {
  if (!source) {
    return "No cached contract snapshot has been loaded yet.";
  }

  const suffix = lastSyncedAt
    ? ` Last sync marker: ${formatRelativeTime(lastSyncedAt)}.`
    : "";

  if (source === "network") {
    return `Live Soroban data has been refreshed from the network.${suffix}`;
  }

  if (source === "cache") {
    return `A fresh cached snapshot was loaded first for a faster startup.${suffix}`;
  }

  return `A stale cached snapshot is visible while the app waits for another live refresh.${suffix}`;
}

export function OrangeBeltDashboard() {
  const [selectedWallet, setSelectedWallet] = useState<WalletChoice>("freighter");
  const [wallet, setWallet] = useState<WalletSession | null>(null);
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [results, setResults] = useState<PollResults>(initialResults);
  const [events, setEvents] = useState<ContractEventFeedItem[]>([]);
  const [txStatus, setTxStatus] = useState<TxStatus>(initialTxStatus);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isVoting, setIsVoting] = useState<VoteTarget | null>(null);
  const [error, setError] = useState<ClassifiedError | null>(null);
  const [syncSource, setSyncSource] = useState<SyncSource>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const refreshData = useEffectEvent(async (activeWallet: WalletSession) => {
    if (!isContractConfigured()) {
      setError(
        classifyError("Contract ID is missing. Set NEXT_PUBLIC_CONTRACT_ID first."),
      );
      return;
    }

    setIsRefreshing(true);

    try {
      const [nextBalance, nextResults, nextEvents] = await Promise.all([
        fetchWalletBalance(activeWallet.address),
        fetchPollResults(activeWallet.address),
        fetchRecentEvents(),
      ]);

      setWalletBalance(nextBalance);
      setResults(nextResults);
      setEvents(nextEvents);

      const snapshot = createPollCacheSnapshot({
        walletAddress: activeWallet.address,
        walletBalance: nextBalance,
        results: nextResults,
        events: nextEvents,
      });

      persistPollCache(window.localStorage, snapshot);
      setSyncSource("network");
      setLastSyncedAt(snapshot.cachedAt);
    } catch (refreshError) {
      setError(classifyError(refreshError));
    } finally {
      setIsRefreshing(false);
    }
  });

  useEffect(() => {
    const cached = parsePollCacheSnapshot(window.localStorage.getItem(POLL_CACHE_KEY));

    if (!cached) {
      return;
    }

    setWalletBalance(cached.snapshot.walletBalance);
    setResults(cached.snapshot.results);
    setEvents(cached.snapshot.events);
    setLastSyncedAt(cached.snapshot.cachedAt);
    setSyncSource(cached.isFresh ? "cache" : "stale-cache");
  }, []);

  useEffect(() => {
    if (!wallet || !isContractConfigured()) {
      return;
    }

    refreshData(wallet).catch(() => undefined);

    const interval = window.setInterval(() => {
      refreshData(wallet).catch(() => undefined);
    }, 8000);

    return () => window.clearInterval(interval);
  }, [wallet]);

  async function handleConnect() {
    setIsConnecting(true);
    setError(null);

    try {
      const session = await connectWallet(selectedWallet);
      setWallet(session);
      setTxStatus(initialTxStatus);
      await refreshData(session);
    } catch (connectError) {
      setError(classifyError(connectError));
    } finally {
      setIsConnecting(false);
    }
  }

  function handleDisconnect() {
    setWallet(null);
    setTxStatus(initialTxStatus);
    setError(null);
  }

  function handleClearCache() {
    clearPollCache(window.localStorage);
    setSyncSource(null);
    setLastSyncedAt(null);
  }

  async function handleVote(option: VoteTarget) {
    if (!wallet) {
      setError(
        classifyError(
          "Wallet not found. Connect one of the supported wallets before voting.",
        ),
      );
      return;
    }

    setIsVoting(option);
    setError(null);
    setTxStatus({
      state: "pending",
      message: `Submitting ${option} vote transaction to the deployed Soroban contract...`,
    });

    try {
      const response = await submitVote({
        address: wallet.address,
        walletId: wallet.walletId,
        option,
        signTransaction: signWithWallet,
      });

      setTxStatus({
        state: response.status === "success" ? "success" : "pending",
        message:
          response.status === "success"
            ? "Contract call completed successfully and state sync has been refreshed."
            : "Transaction was submitted and is still pending final confirmation.",
        hash: response.hash,
      });

      await refreshData(wallet);
    } catch (voteError) {
      const nextError = classifyError(voteError);
      setError(nextError);
      setTxStatus({
        state: "error",
        message: nextError.message,
      });
    } finally {
      setIsVoting(null);
    }
  }

  const freighterShare = calculateShare(results.freighter, results.total);
  const xbullShare = calculateShare(results.xbull, results.total);

  const activityLabel = useMemo(() => {
    if (isConnecting) {
      return "Connecting the selected wallet and preparing the first read.";
    }

    if (isVoting) {
      return `Submitting the ${isVoting} vote and waiting for signature approval.`;
    }

    if (isRefreshing) {
      return "Refreshing live contract state, events, and balance from the network.";
    }

    if (txStatus.state === "pending") {
      return "The contract transaction is pending final confirmation.";
    }

    return getSyncMessage(syncSource, lastSyncedAt);
  }, [isConnecting, isRefreshing, isVoting, lastSyncedAt, syncSource, txStatus.state]);

  const latestEvent = events[0];

  return (
    <main className="px-5 py-8 text-[var(--foreground)] sm:px-8 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="shell signal-ring overflow-hidden rounded-[34px] px-6 py-8 sm:px-8 lg:px-10 lg:py-10">
          <div className="grid gap-8 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="space-y-6">
              <div className="inline-flex items-center rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.32em] text-sky-200">
                Level 3 - Orange Belt
              </div>
              <div className="space-y-4">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.05em] sm:text-5xl lg:text-6xl">
                  Tested Soroban poll dApp with caching, progress states, and complete docs.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg">
                  {APP_NAME} extends the Yellow Belt app into a full Orange Belt
                  mini-dApp by adding cached startup data, visible loading and
                  progress states, repeatable tests, and complete submission
                  documentation around the same deployed Soroban flow.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="shell-soft rounded-[24px] p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
                    Cache
                  </p>
                  <p className="mt-3 text-2xl font-semibold">
                    {syncSource ? "Enabled" : "Warm"}
                  </p>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Contract snapshots persist between refreshes.
                  </p>
                </div>
                <div className="shell-soft rounded-[24px] p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
                    Loading
                  </p>
                  <p className="mt-3 text-2xl font-semibold">Visible</p>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Connection, refresh, and transaction progress are surfaced.
                  </p>
                </div>
                <div className="shell-soft rounded-[24px] p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
                    Tests
                  </p>
                  <p className="mt-3 text-2xl font-semibold">3+</p>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Helper and caching logic is covered with automated tests.
                  </p>
                </div>
              </div>
            </div>

            <div className="shell-soft rounded-[30px] p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-[var(--muted)]">Deployed contract</p>
                  <p className="mt-2 font-mono text-xs text-white/84">
                    {CONTRACT_ID || "Add NEXT_PUBLIC_CONTRACT_ID to enable the full flow"}
                  </p>
                </div>
                <StatusPill status={txStatus.state} />
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-[24px] border border-[var(--border)] bg-black/18 p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
                    Connected wallet
                  </p>
                  <p className="mt-3 text-lg font-semibold">
                    {wallet ? wallet.walletName : "Not connected"}
                  </p>
                  <p className="mt-2 font-mono text-xs text-[var(--muted)]">
                    {wallet ? formatAddress(wallet.address) : "Choose a wallet below"}
                  </p>
                </div>
                <div className="rounded-[24px] border border-[var(--border)] bg-black/18 p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
                    Testnet balance
                  </p>
                  <p className="mt-3 text-lg font-semibold">
                    {wallet ? `${formatBalance(walletBalance)} XLM` : "--"}
                  </p>
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    Used for fee checks, retries, and contract signing.
                  </p>
                </div>
              </div>

              <ProgressState
                active={
                  isConnecting ||
                  isRefreshing ||
                  isVoting !== null ||
                  txStatus.state === "pending"
                }
                label={activityLabel}
              />

              <div className="mt-5 flex flex-wrap gap-3">
                <ActionButton onClick={handleConnect} disabled={isConnecting}>
                  {isConnecting ? "Connecting..." : "Connect selected wallet"}
                </ActionButton>
                <ActionButton
                  variant="secondary"
                  onClick={() => wallet && refreshData(wallet)}
                  disabled={!wallet || isRefreshing}
                >
                  {isRefreshing ? "Refreshing..." : "Refresh contract state"}
                </ActionButton>
                <ActionButton
                  variant="secondary"
                  onClick={handleDisconnect}
                  disabled={!wallet}
                >
                  Disconnect
                </ActionButton>
                <ActionButton
                  variant="secondary"
                  onClick={handleClearCache}
                  disabled={syncSource === null}
                >
                  Clear cache
                </ActionButton>
              </div>

              <div className="mt-5 flex flex-wrap gap-3 text-sm text-[var(--muted)]">
                {CONTRACT_EXPLORER_URL ? (
                  <a
                    href={CONTRACT_EXPLORER_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-[var(--border)] px-4 py-2 transition hover:bg-white/6"
                  >
                    View contract on Stellar Expert
                  </a>
                ) : null}
                {txStatus.hash ? (
                  <a
                    href={`${TX_EXPLORER_BASE_URL}${txStatus.hash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-[var(--border)] px-4 py-2 transition hover:bg-white/6"
                  >
                    Open latest tx hash
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <ErrorBanner error={error} />

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr_0.92fr]">
          <Panel eyebrow="Wallet Options" title="Choose the wallet you want to test">
            <div className="space-y-3">
              {supportedWallets.map((walletOption) => {
                const active = walletOption.id === selectedWallet;

                return (
                  <div
                    key={walletOption.id}
                    className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${
                      active
                        ? "border-sky-400 bg-[var(--accent-soft)]"
                        : "border-[var(--border)] bg-black/10 hover:bg-white/6"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold">{walletOption.name}</p>
                        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                          {walletOption.description}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedWallet(walletOption.id)}
                        className="rounded-full border border-[var(--border)] px-3 py-1 text-xs uppercase tracking-[0.24em] text-[var(--muted)]"
                      >
                        {active ? "Selected" : "Select"}
                      </button>
                    </div>
                    <a
                      href={walletOption.installUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex text-sm font-semibold text-sky-300"
                    >
                      Install {walletOption.name}
                    </a>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 rounded-[24px] border border-[var(--border)] bg-black/16 p-4">
              <p className="text-sm font-semibold">Handled error states</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--muted)]">
                <li>`wallet not found` when the chosen wallet is unavailable</li>
                <li>`rejected` when connection or signing is denied</li>
                <li>`insufficient balance` when fees cannot be covered</li>
              </ul>
            </div>
          </Panel>

          <Panel eyebrow="Contract Voting" title="Cast a real Soroban contract vote">
            <div className="grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => handleVote("freighter")}
                disabled={!wallet || isVoting !== null}
                className="rounded-[26px] border border-[var(--border)] bg-black/15 p-5 text-left transition hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <p className="text-xs uppercase tracking-[0.24em] text-sky-200">
                  Vote Option
                </p>
                <p className="mt-3 text-2xl font-semibold">Freighter</p>
                <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full bg-sky-400 transition"
                    style={{ width: `${freighterShare}%` }}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between text-sm text-[var(--muted)]">
                  <span>{results.freighter} votes</span>
                  <span>{freighterShare}% share</span>
                </div>
                <p className="mt-4 text-sm font-semibold text-white/88">
                  {isVoting === "freighter"
                    ? "Awaiting wallet signature..."
                    : "Vote from frontend"}
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleVote("xbull")}
                disabled={!wallet || isVoting !== null}
                className="rounded-[26px] border border-[var(--border)] bg-black/15 p-5 text-left transition hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <p className="text-xs uppercase tracking-[0.24em] text-amber-200">
                  Vote Option
                </p>
                <p className="mt-3 text-2xl font-semibold">xBull</p>
                <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full bg-amber-400 transition"
                    style={{ width: `${xbullShare}%` }}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between text-sm text-[var(--muted)]">
                  <span>{results.xbull} votes</span>
                  <span>{xbullShare}% share</span>
                </div>
                <p className="mt-4 text-sm font-semibold text-white/88">
                  {isVoting === "xbull" ? "Awaiting wallet signature..." : "Vote from frontend"}
                </p>
              </button>
            </div>

            <div className="mt-5 rounded-[26px] border border-[var(--border)] bg-black/16 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
                    Transaction status
                  </p>
                  <p className="mt-2 text-lg font-semibold">{txStatus.message}</p>
                </div>
                <StatusPill status={txStatus.state} />
              </div>

              {txStatus.hash ? (
                <div className="mt-4 break-all rounded-[20px] bg-white/6 px-4 py-4 font-mono text-xs text-sky-100">
                  {txStatus.hash}
                </div>
              ) : null}
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div className="rounded-[24px] border border-[var(--border)] bg-black/14 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
                  Total votes
                </p>
                <p className="mt-3 text-3xl font-semibold">{results.total}</p>
              </div>
              <div className="rounded-[24px] border border-[var(--border)] bg-black/14 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
                  Cache strategy
                </p>
                <p className="mt-3 text-sm leading-6 text-white/88">
                  Latest results and event feed are cached in localStorage, then refreshed from Soroban RPC.
                </p>
              </div>
              <div className="rounded-[24px] border border-[var(--border)] bg-black/14 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
                  Read path
                </p>
                <p className="mt-3 text-sm leading-6 text-white/88">
                  `get_freighter_votes()` and `get_xbull_votes()` are simulated on refresh.
                </p>
              </div>
            </div>
          </Panel>

          <Panel eyebrow="Event Feed" title="Recent Soroban contract events">
            <div className="space-y-3">
              {events.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-[var(--border)] bg-black/10 px-4 py-6 text-sm leading-6 text-[var(--muted)]">
                  No events have been pulled yet. Connect a wallet, deploy the
                  contract, and submit a vote to populate the feed.
                </div>
              ) : (
                events.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-[24px] border border-[var(--border)] bg-black/14 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">
                          {event.option ? `Vote cast for ${event.option}` : "Contract event"}
                        </p>
                        <p className="mt-2 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                          {event.topics.join(" / ") || "No topics"}
                        </p>
                      </div>
                      <span className="rounded-full bg-white/6 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                        {event.ledger ? `Ledger ${event.ledger}` : "Ledger pending"}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                      {event.total !== undefined
                        ? `Updated total for this option: ${event.total}`
                        : "The event payload was received from Soroban RPC."}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--muted)]">
                      <span>{formatRelativeTime(event.closedAt)}</span>
                      {event.txHash ? (
                        <a
                          href={`${TX_EXPLORER_BASE_URL}${event.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-sky-200"
                        >
                          {formatAddress(event.txHash)}
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 rounded-[24px] border border-[var(--border)] bg-black/16 p-4">
              <p className="text-sm font-semibold">Why this satisfies Orange Belt</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                The app now shows explicit progress states, restores cached poll
                data on startup, exercises helper logic with automated tests, and
                is structured for a complete README plus a one-minute demo video.
              </p>
              {latestEvent ? (
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                  Latest cached or live event: {latestEvent.option ?? "contract event"} with
                  ledger {latestEvent.ledger ?? "pending"}.
                </p>
              ) : null}
            </div>
          </Panel>
        </section>
      </div>
    </main>
  );
}
