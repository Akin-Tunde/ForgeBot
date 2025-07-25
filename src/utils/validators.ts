import { isAddress } from "viem";

/**
 * Validate if a string is a valid Ethereum address
 */
export function isValidAddress(address: string): boolean {
  return isAddress(address);
}



// src/utils/validators.ts
export function isValidPrivateKey(privateKey: string): boolean {
  // Remove 0x prefix if present
  const cleanedKey = privateKey.startsWith("0x") ? privateKey.slice(2) : privateKey;
  // Check if it's a 64-character hexadecimal string
  return /^[0-9a-fA-F]{64}$/.test(cleanedKey);
}

/**
 * Validate if a string is a valid amount
 */
export function isValidAmount(amount: string): boolean {
  // Amount should be a positive number with up to 18 decimal places
  const amountRegex = /^(?!0\d)\d*(\.\d{1,18})?$/;
  return amountRegex.test(amount) && parseFloat(amount) > 0;
}

/**
 * Check if user has enough balance for a transaction
 */
export function hasEnoughBalance(
  balance: string,
  amount: string,
  gasEstimate: string = "0"
): boolean {
  try {
    const balanceBigInt = BigInt(balance);
    const amountBigInt = BigInt(amount);
    const gasEstimateBigInt = BigInt(gasEstimate);

    // For ETH transfers, we need to check if balance >= amount + gas
    return balanceBigInt >= amountBigInt + gasEstimateBigInt;
  } catch (error) {
    console.error("Error checking balance:", error);
    return false;
  }
}

/**
 * Validate slippage value
 */
export function isValidSlippage(slippage: number): boolean {
  return slippage > 0 && slippage <= 50;
}

/**
 * Validate gas priority value
 */
export function isValidGasPriority(
  priority: string
): priority is "low" | "medium" | "high" {
  return ["low", "medium", "high"].includes(priority);
}
