// FILE: src/types/wallet.ts

import { Address } from "viem";

export interface WalletData {
  address: Address;
  encryptedPrivateKey: string;
  type: "imported" | "generated";
  createdAt: number;
}

export interface TransactionParams {
  to: Address;
  data: string;
  value: string;
  gasPrice: string; // This is used by the buy/sell swap functions from OpenOcean
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface WithdrawalParams {
  from: Address;
  to: Address;
  amount: string; // in wei
  gasPrice?: string; // <-- CORRECTED: Made optional
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface TransactionReceipt {
  transactionHash: string;
  blockNumber: BigInt;
  status: "success" | "failure";
  gasUsed: string;
  effectiveGasPrice: string; // <-- CORRECTED: Added this property
}