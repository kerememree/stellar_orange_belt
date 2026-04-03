import {
  FREIGHTER_ID,
  FreighterModule,
  StellarWalletsKit,
  WalletNetwork,
  XBULL_ID,
  xBullModule,
} from "@creit.tech/stellar-wallets-kit";
import { NETWORK_PASSPHRASE } from "@/app/lib/config";
import type { WalletChoice, WalletSession } from "@/app/lib/types";

export const supportedWallets = [
  {
    id: "freighter" as const,
    kitId: FREIGHTER_ID,
    name: "Freighter",
    description: "Best default option for Stellar testnet development.",
    installUrl: "https://www.freighter.app/",
  },
  {
    id: "xbull" as const,
    kitId: XBULL_ID,
    name: "xBull",
    description: "Alternative wallet option to satisfy multi-wallet support.",
    installUrl: "https://xbull.app/",
  },
];

let walletKit: StellarWalletsKit | null = null;

function resolveKit() {
  if (!walletKit) {
    walletKit = new StellarWalletsKit({
      network: WalletNetwork.TESTNET,
      selectedWalletId: FREIGHTER_ID,
      modules: [new FreighterModule(), new xBullModule()],
    });
  }

  return walletKit;
}

function resolveWalletMeta(walletId: WalletChoice) {
  return supportedWallets.find((item) => item.id === walletId) ?? supportedWallets[0];
}

export async function connectWallet(walletId: WalletChoice): Promise<WalletSession> {
  const kit = resolveKit();
  const walletMeta = resolveWalletMeta(walletId);

  await kit.setWallet(walletMeta.kitId);
  const response = await kit.getAddress();

  return {
    address: response.address,
    walletId,
    walletName: walletMeta.name,
  };
}

export async function signWithWallet(walletId: WalletChoice, xdr: string, address: string) {
  const kit = resolveKit();
  const walletMeta = resolveWalletMeta(walletId);

  await kit.setWallet(walletMeta.kitId);

  return kit.signTransaction(xdr, {
    address,
    networkPassphrase: NETWORK_PASSPHRASE,
  });
}
