import {
  BASE_FEE,
  Contract,
  Horizon,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import {
  CONTRACT_ID,
  HORIZON_URL,
  NETWORK_PASSPHRASE,
  RPC_URL,
} from "@/app/lib/config";
import type {
  ContractEventFeedItem,
  PollResults,
  VoteTarget,
  WalletChoice,
} from "@/app/lib/types";

export type RpcEventRecord = {
  id?: string;
  ledger?: number;
  txHash?: string;
  topic?: string[];
  value?: string;
  ledgerClosedAt?: string;
};

const sorobanServer = new rpc.Server(RPC_URL);
const horizonServer = new Horizon.Server(HORIZON_URL);

function requireContractId() {
  if (!CONTRACT_ID) {
    throw new Error("Contract ID is missing. Set NEXT_PUBLIC_CONTRACT_ID first.");
  }

  return CONTRACT_ID;
}

async function buildSimulatedTransaction(address: string, method: string) {
  const account = await sorobanServer.getAccount(address);
  const contract = new Contract(requireContractId());

  return new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method))
    .setTimeout(30)
    .build();
}

async function simulateValue<T>(address: string, method: string) {
  const tx = await buildSimulatedTransaction(address, method);
  const simulation = await sorobanServer.simulateTransaction(tx);

  if (!rpc.Api.isSimulationSuccess(simulation)) {
    throw new Error("Could not simulate the contract read call.");
  }

  return scValToNative((simulation.result as { retval: xdr.ScVal }).retval) as T;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeTopicValue(value: string) {
  try {
    return scValToNative(xdr.ScVal.fromXDR(value, "base64"));
  } catch {
    return value;
  }
}

function normalizeEventPayload(value: unknown) {
  if (typeof value === "object" && value) {
    return value as {
      option?: string;
      total?: number;
    };
  }

  return {};
}

export async function fetchWalletBalance(address: string) {
  const account = await horizonServer.loadAccount(address);
  const nativeBalance = account.balances.find(
    (balance) => balance.asset_type === "native",
  );

  return nativeBalance?.balance ?? "0";
}

export async function fetchPollResults(address: string): Promise<PollResults> {
  const [freighterVotes, xbullVotes] = await Promise.all([
    simulateValue<number>(address, "get_freighter_votes"),
    simulateValue<number>(address, "get_xbull_votes"),
  ]);

  return {
    freighter: Number(freighterVotes ?? 0),
    xbull: Number(xbullVotes ?? 0),
    total: Number(freighterVotes ?? 0) + Number(xbullVotes ?? 0),
  };
}

export async function submitVote(options: {
  address: string;
  walletId: WalletChoice;
  option: VoteTarget;
  signTransaction: (walletId: WalletChoice, xdr: string, address: string) => Promise<{
    signedTxXdr: string;
  }>;
}) {
  const account = await sorobanServer.getAccount(options.address);
  const contract = new Contract(requireContractId());

  let tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        "vote",
        nativeToScVal(options.address, { type: "address" }),
        nativeToScVal(options.option, { type: "symbol" }),
      ),
    )
    .setTimeout(30)
    .build();

  const simulation = await sorobanServer.simulateTransaction(tx);

  if (!rpc.Api.isSimulationSuccess(simulation)) {
    throw new Error("Could not prepare the contract write transaction.");
  }

  tx = rpc.assembleTransaction(tx, simulation).build();

  const { signedTxXdr } = await options.signTransaction(
    options.walletId,
    tx.toXDR(),
    options.address,
  );

  const signedTransaction = TransactionBuilder.fromXDR(
    signedTxXdr,
    NETWORK_PASSPHRASE,
  );
  const sendResponse = await sorobanServer.sendTransaction(
    signedTransaction as Parameters<typeof sorobanServer.sendTransaction>[0],
  );

  if (sendResponse.status === "ERROR") {
    throw new Error(sendResponse.errorResultXdr || "Contract transaction failed.");
  }

  const hash = sendResponse.hash;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const transaction = await sorobanServer.getTransaction(hash);

    if (transaction.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return {
        hash,
        status: "success" as const,
      };
    }

    if (transaction.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error("The Soroban transaction reached a failed status.");
    }

    await wait(1500);
  }

  return {
    hash,
    status: "pending" as const,
  };
}

export async function fetchRecentEvents(): Promise<ContractEventFeedItem[]> {
  requireContractId();

  const latestLedgerResponse = await fetch(RPC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "yellow-belt-latest-ledger",
      method: "getLatestLedger",
    }),
  });

  const latestLedgerPayload = (await latestLedgerResponse.json()) as {
    result?: {
      sequence?: number;
    };
    error?: {
      message?: string;
    };
  };

  if (latestLedgerPayload.error) {
    throw new Error(
      latestLedgerPayload.error.message ||
        "Could not read the latest ledger from Soroban RPC.",
    );
  }

  const latestLedger = latestLedgerPayload.result?.sequence;

  if (!latestLedger) {
    throw new Error("Soroban RPC did not return the latest ledger sequence.");
  }

  const startLedger = Math.max(1, latestLedger - 2000);

  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "yellow-belt-events",
      method: "getEvents",
      params: {
        startLedger,
        filters: [
          {
            type: "contract",
            contractIds: [CONTRACT_ID],
          },
        ],
        pagination: {
          limit: 10,
        },
      },
    }),
  });

  const payload = (await response.json()) as {
    result?: {
      events?: RpcEventRecord[];
    };
    error?: {
      message?: string;
    };
  };

  if (payload.error) {
    throw new Error(
      payload.error.message || "Could not load contract events from Soroban RPC.",
    );
  }

  const events = payload.result?.events ?? [];

  return mapRpcEvents(events);
}

export function mapRpcEvents(events: RpcEventRecord[]): ContractEventFeedItem[] {
  return events
    .slice()
    .reverse()
    .map((event, index) => {
      const decodedTopics = (event.topic ?? []).map((topic) =>
        String(decodeTopicValue(topic)),
      );
      const decodedValue = event.value ? decodeTopicValue(event.value) : null;
      const normalized = normalizeEventPayload(decodedValue);

      return {
        id: event.id ?? `${event.txHash ?? "event"}-${index}`,
        ledger: event.ledger ?? null,
        txHash: event.txHash,
        topics: decodedTopics,
        option:
          typeof normalized.option === "string"
            ? normalized.option
            : typeof decodedTopics[2] === "string"
              ? decodedTopics[2]
              : undefined,
        total:
          typeof normalized.total === "number" ? normalized.total : undefined,
        closedAt: event.ledgerClosedAt,
      };
    });
}
