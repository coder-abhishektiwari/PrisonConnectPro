/** Family wallet-link (bearer token) API payloads. */

export interface WalletLinkInfo {
  inmateName: string;
  balance: number;
  currency: string;
  /** Pending offline-cash request the inmate raised on the kiosk, else 0. */
  requestedAmount: number;
  limits: { minRupees: number; maxRupees: number };
}

export interface WalletOrder {
  orderId: string;
  amountPaise: number;
  currency: string;
  keyId: string;
  balance: number;
}

export interface WalletVerifyResult {
  ok: boolean;
  /** Net paise actually added to the wallet (gross minus gateway charges). */
  creditedPaise: number;
  balance: number;
}
