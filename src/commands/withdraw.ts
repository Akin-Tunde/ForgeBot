// FILE: src/commands/withdraw.ts (Final, Corrected Version)

import { CommandContext } from "../types/commands";
import { getWallet, getEthBalance, withdrawEth } from "../lib/token-wallet";
import { getGasParams } from "../lib/swap";
import {
  formatEthBalance,
  formatWithdrawalConfirmation,
} from "../utils/formatters";
import { isValidAddress, isValidAmount } from "../utils/validators";
import { parseEther, parseGwei } from "viem";
import { saveTransaction } from "../lib/database";
import { NATIVE_TOKEN_ADDRESS } from "../utils/constants";

export const withdrawHandler = {
  command: "withdraw",
  description: "Withdraw ETH to another address",
  handler: async ({ session, wallet }: CommandContext) => {
    try {
      if (!session.userId) {
        return { response: "❌ Please start the bot first." };
      }
      if (!wallet) {
        return { response: "❌ You don't have a wallet yet. Use /create or /import." };
      }

      const balance = await getEthBalance(wallet.address);
      if (BigInt(balance) <= BigInt(0)) {
        return { response: "❌ Your wallet has no ETH balance to withdraw." };
      }

      // Safely initialize tempData
      session.tempData = { from: wallet.address, balance: balance.toString() };
      session.currentAction = "withdraw_address";

      const formattedBalance = formatEthBalance(balance);
      return {
        response: `💰 Withdraw ETH\n\nYour current balance: ${formattedBalance} ETH\n\nPlease send the destination Ethereum address.`,
        buttons: [[{ label: "Cancel", callback: "/cancel" }]],
      };
    } catch (error) {
      console.error("[withdrawHandler] Error:", error);
      return { response: "❌ An error occurred." };
    }
  },
};

export async function handleWithdrawAddress({ session, args: toAddress }: CommandContext): Promise<{
  response: string;
  buttons?: { label: string; callback: string }[][];
}> {
  try {
    if (!session.userId || !toAddress) {
      return { response: "❌ Invalid request." };
    }
    if (!isValidAddress(toAddress)) {
      return { response: "❌ Invalid Ethereum address format." };
    }

    // Type guard to ensure tempData and its properties exist
    if (!session.tempData || typeof session.tempData.balance !== 'string') {
        session.currentAction = undefined;
        return { response: "❌ Session expired. Please start with /withdraw again." };
    }

    session.tempData.to = toAddress;
    session.currentAction = "withdraw_amount";

    const formattedBalance = formatEthBalance(session.tempData.balance);
    return {
      response: `📤 Withdraw ETH\n\nDestination: ${toAddress}\nBalance: ${formattedBalance} ETH\n\nPlease enter the amount to withdraw.`,
      buttons: [[{ label: "Cancel", callback: "/cancel" }]],
    };
  } catch (error) {
    console.error("[handleWithdrawAddress] Error:", error);
    return { response: "❌ An error occurred." };
  }
};

export async function handleWithdrawAmount({ session, args: amountInput }: CommandContext): Promise<{
  response: string;
  buttons?: { label: string; callback: string }[][];
}> {
  try {
    if (!session.userId || !amountInput) {
      return { response: "❌ Invalid request." };
    }

    // Type guard and safe destructuring
    if (!session.tempData || typeof session.tempData.balance !== 'string' || typeof session.tempData.to !== 'string') {
        session.currentAction = undefined;
        return { response: "❌ Session expired. Please start with /withdraw again." };
    }
    const { balance, to: toAddress } = session.tempData;

    if (!isValidAmount(amountInput)) {
      return { response: "❌ Invalid amount format." };
    }
    
    const cleanAmount = amountInput.startsWith(".") ? "0" + amountInput : amountInput;
    const amountWei = parseEther(cleanAmount).toString();

    if (BigInt(balance) < BigInt(amountWei)) {
        return { response: `❌ Insufficient balance. You have ${formatEthBalance(balance)} ETH.` };
    }

    const gasParams = await getGasParams(session.settings?.gasPriority || "medium");
    const gasLimit = 21000n;
    const maxFeePerGasWei = parseGwei(gasParams.maxFeePerGas);
    const gasCost = maxFeePerGasWei * gasLimit;

    if (BigInt(balance) <= BigInt(amountWei) + gasCost) {
      return { response: `❌ Insufficient balance for amount + gas.` };
    }

    // Safe assignment to tempData
    session.tempData.amount = amountWei;
    session.tempData.maxFeePerGas = maxFeePerGasWei.toString();
    session.tempData.maxPriorityFeePerGas = parseGwei(gasParams.maxPriorityFeePerGas).toString();
    session.currentAction = "withdraw_confirm";

    return {
      response: formatWithdrawalConfirmation(amountWei, toAddress),
      buttons: [[{ label: "Confirm", callback: "withdraw_confirm_true" }, { label: "Cancel", callback: "withdraw_confirm_false" }]],
    };
  } catch (error) {
    console.error("[handleWithdrawAmount] Error:", error);
    return { response: "❌ An error occurred." };
  }
};

export async function handleWithdrawConfirmation({ session, wallet }: CommandContext, confirmed: boolean): Promise<{
  response: string;
  buttons?: { label: string; callback: string }[][];
}> {
  try {
    if (!confirmed) {
      session.currentAction = undefined;
      session.tempData = {};
      return { response: "Withdrawal cancelled." };
    }

    if (!session.userId || !wallet) {
      return { response: "❌ Session or wallet not found. Please start over." };
    }
    
    // Type guard and safe destructuring for all required properties
    if (!session.tempData) {
        return { response: "❌ Session data lost. Please start over." };
    }
    const { from, to, amount, maxFeePerGas, maxPriorityFeePerGas } = session.tempData;
    if (!from || !to || !amount) {
        return { response: "❌ Missing transaction details in session. Please start over."};
    }
    
    const receipt = await withdrawEth(wallet, { from, to, amount, maxFeePerGas, maxPriorityFeePerGas });
    
    await saveTransaction(receipt.transactionHash, session.userId, wallet.address, NATIVE_TOKEN_ADDRESS, to, amount, receipt.status, "0", receipt.gasUsed);

    session.currentAction = undefined;
    session.tempData = {};

    if (receipt.status === "success") {
      const gasCost = BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice);
      return { response: `✅ Withdrawal Successful!\nAmount: ${formatEthBalance(amount)} ETH\nTo: ${to}\nTx: https://basescan.org/tx/${receipt.transactionHash}` };
    } else {
      return { response: `❌ Withdrawal Failed.\nTx: https://basescan.org/tx/${receipt.transactionHash}` };
    }
  } catch (error) {
    console.error("[handleWithdrawConfirmation] Error:", error);
    session.currentAction = undefined;
    session.tempData = {};
    return { response: "❌ An error occurred during withdrawal." };
  }
}