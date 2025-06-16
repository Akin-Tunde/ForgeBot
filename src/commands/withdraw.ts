import { CommandContext } from "../types/commands";
import { getWallet, getEthBalance, withdrawEth } from "../lib/token-wallet";
import {
  formatEthBalance,
  formatWithdrawalConfirmation,
} from "../utils/formatters";
import { isValidAddress, isValidAmount } from "../utils/validators";
import { parseEther } from "viem";
import { saveTransaction } from "../lib/database";
import { NATIVE_TOKEN_ADDRESS } from "../utils/constants";

// Map gasPriority to gasPrice (wei)
const getGasPriceFromPriority = (
  priority: "low" | "medium" | "high" | undefined
): string => {
  switch (priority) {
    case "low":
      return "1000000000"; // 1 Gwei
    case "medium":
      return "5000000000"; // 5 Gwei
    case "high":
      return "10000000000"; // 10 Gwei
    default:
      return "5000000000"; // Default to medium
  }
};

export const withdrawHandler = {
  command: "withdraw",
  description: "Withdraw ETH to another address",
  handler: async ({ session }: CommandContext) => {
    try {
      const userId = session.userId;
      if (!userId) {
        return {
          response: "❌ Please start the bot first with /start command.",
        };
      }

      const wallet = await getWallet(userId);
      if (!wallet) {
        return {
          response:
            "❌ You don't have a wallet yet.\n\nUse /create to create a new wallet or /import to import an existing one.",
        };
      }

      const balance = await getEthBalance(wallet.address);
      if (BigInt(balance) <= BigInt(0)) {
        return {
          response:
            "❌ Your wallet has no ETH balance to withdraw.\n\nUse /deposit to get your deposit address and add funds first.",
        };
      }

      const formattedBalance = formatEthBalance(balance);
      session.currentAction = "withdraw_address";
      session.tempData = { from: wallet.address, balance };

      return {
        response: `💰 Withdraw ETH\n\nYour current balance: ${formattedBalance} ETH\n\nPlease send the destination Ethereum address you want to withdraw to.\n\nYou can cancel this operation by typing /cancel`,
      };
    } catch (error) {
      console.error("Error in withdraw command:", error);
      return { response: "❌ An error occurred. Please try again later." };
    }
  },
};

export async function handleWithdrawAddress({
  session,
  args,
}: CommandContext): Promise<{
  response: string;
  buttons?: { label: string; callback: string }[][];
}> {
  try {
    const userId = session.userId;
    const toAddress = args;
    if (!userId || !toAddress) {
      return { response: "❌ Invalid request. Please try again." };
    }

    if (!isValidAddress(toAddress)) {
      return {
        response:
          "❌ Invalid Ethereum address format. Please provide a valid address.\n\nTry again or type /cancel to abort.",
      };
    }

    session.tempData!.to = toAddress;
    session.currentAction = "withdraw_amount";

    const balance = session.tempData!.balance;
    const formattedBalance = formatEthBalance(balance);

    return {
      response: `📤 Withdraw ETH\n\nDestination address: ${toAddress}\n\nYour current balance: ${formattedBalance} ETH\n\nPlease enter the amount of ETH you wish to withdraw\n\nPlease leave a small amount of ETH in your wallet for gas fees.\n\nYou can cancel this operation by typing /cancel`,
    };
  } catch (error) {
    console.error("Error handling withdrawal address:", error);
    return { response: "❌ An error occurred. Please try again later." };
  }
}

export async function handleWithdrawAmount({
  session,
  args,
}: CommandContext): Promise<{
  response: string;
  buttons?: { label: string; callback: string }[][];
}> {
  try {
    const userId = session.userId;
    let amountInput = args;
    if (!userId || !amountInput) {
      return { response: "❌ Invalid request. Please try again." };
    }

    const balance = session.tempData!.balance;
    const toAddress = session.tempData!.to;

    if (!isValidAmount(amountInput)) {
      return {
        response:
          "❌ Invalid amount format. Please enter a valid positive number.\n\nTry again or type /cancel to abort.",
      };
    }

    if (amountInput.startsWith(".")) {
      amountInput = "0" + amountInput;
    }

    const amountWei = parseEther(amountInput).toString();
    if (BigInt(balance) < BigInt(amountWei)) {
      return {
        response: `❌ Insufficient balance for this withdrawal.\n\nAmount requested: ${amountInput} ETH\nYour balance: ${formatEthBalance(
          balance
        )} ETH\n\nPlease enter a smaller amount`,
      };
    }

    const gasPrice = getGasPriceFromPriority(session.settings?.gasPriority);
    session.tempData!.amount = amountWei;
    session.tempData!.gasPrice = gasPrice;
    session.currentAction = "withdraw_confirm";

    return {
      response: formatWithdrawalConfirmation(amountWei, toAddress),
      buttons: [
        [
          { label: "Confirm", callback: "withdraw_confirm_true" },
          { label: "Cancel", callback: "withdraw_confirm_false" },
        ],
      ],
    };
  } catch (error) {
    console.error("Error handling withdrawal amount:", error);
    return { response: "❌ An error occurred. Please try again later." };
  }
}

export async function handleWithdrawConfirmation(
  { session }: CommandContext,
  confirmed: boolean
): Promise<{
  response: string;
  buttons?: { label: string; callback: string }[][];
}> {
  try {
    if (!confirmed) {
      session.currentAction = undefined;
      session.tempData = {};
      return { response: "Withdrawal cancelled." };
    }

    const userId = session.userId;
    if (!userId) {
      return {
        response: "❌ Session expired. Please use /start to begin again.",
      };
    }

    const { from, to, amount, gasPrice } = session.tempData!;
    const wallet = await getWallet(userId);
    if (!wallet) {
      return {
        response:
          "❌ Wallet not found. Please create or import a wallet first.",
      };
    }

    const receipt = await withdrawEth(wallet, { from, to, amount, gasPrice });

    saveTransaction(
      receipt.transactionHash,
      userId,
      wallet.address,
      NATIVE_TOKEN_ADDRESS,
      to,
      amount,
      receipt.status,
      "0",
      receipt.gasUsed
    );

    if (receipt.status === "success") {
      return {
        response: `✅ Withdrawal Successful\n\nAmount: ${formatEthBalance(
          amount
        )} ETH\nTo: ${to}\nTransaction Hash: ${
          receipt.transactionHash
        }\nGas Used: ${formatEthBalance(
          receipt.gasUsed
        )} ETH\n\nYou can view this transaction on the block explorer:\nhttps://basescan.org/tx/${
          receipt.transactionHash
        }`,
      };
    } else {
      return {
        response: `❌ Withdrawal Failed\n\nView on Block Explorer: https://basescan.org/tx/${receipt.transactionHash}`,
      };
    }
  } catch (error) {
    console.error("Error processing withdrawal:", error);
    return {
      response:
        "❌ An error occurred while processing your withdrawal. Please try again later.",
    };
  } finally {
    session.currentAction = undefined;
    session.tempData = {};
  }
}
