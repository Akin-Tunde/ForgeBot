import { SessionData } from "../types/commands";
import { getWallet, getEthBalance } from "../lib/token-wallet";
import {
  getTokenBalance,
  getBalanceHistory,
  formatBalanceHistoryTable,
} from "../lib/history";
import { getUniqueTokensByUserId } from "../lib/database";
import { formatBalanceMessage } from "../utils/formatters";
import { TokenInfo } from "../types/config";
import { WalletData } from "../types/wallet";

interface CommandContext {
  session: SessionData;
  wallet?: WalletData; // Fix: Use WalletData
}

export const balanceHandler = {
  command: "balance",
  description: "Show current ETH + filtered ERC-20 balances",
  handler: async ({ session, wallet }: CommandContext) => {
    try {
      const userId = session.userId;
      if (!userId) {
        return {
          response: "❌ Please start the bot first with /start command.",
        };
      }

      if (!wallet) {
        return {
          response:
            "❌ You don't have a wallet yet.\n\nUse /create to create a new wallet or /import to import an existing one.",
        };
      }

      const ethBalance = await getEthBalance(wallet.address as `0x${string}`);
      const tokenData = await getTokenBalance(wallet.address);
      const interactedTokens = getUniqueTokensByUserId(userId).map((t) =>
        t.toLowerCase()
      );
      const tokens: TokenInfo[] = [];

      if (tokenData?.tokens) {
        for (const token of tokenData.tokens) {
          if (
            token.type === "ERC20" &&
            BigInt(token.balance) > 0 &&
            interactedTokens.includes(token.contract.toLowerCase())
          ) {
            tokens.push({
              address: token.contract,
              symbol: token.symbol,
              decimals: token.decimals,
              balance: token.balance,
            });
          }
        }
      }

      const buttons = [
        [
          { label: "📈 View History", callback: "/history" },
          { label: "📥 Deposit", callback: "/deposit" },
        ],
        [
          { label: "💱 Buy Token", callback: "/buy" },
          { label: "💱 Sell Token", callback: "/sell" },
        ],
        [{ label: "📤 Withdraw", callback: "/withdraw" }],
      ];

      return {
        response: formatBalanceMessage(ethBalance, tokens).replace(/`/g, ""),
        buttons,
      };
    } catch (error) {
      console.error("Error in balance command:", error);
      return {
        response:
          "❌ An error occurred while fetching your balances. Please try again later.",
      };
    }
  },
};

export const historyHandler = {
  command: "history",
  description: "Display 1-month balance history as a table",
  handler: async ({ session, wallet }: CommandContext) => {
    try {
      const userId = session.userId;
      if (!userId) {
        return {
          response: "❌ Please start the bot first with /start command.",
        };
      }

      if (!wallet) {
        return {
          response:
            "❌ You don't have a wallet yet.\n\nUse /create to create a new wallet or /import to import an existing one.",
        };
      }

      const history = await getBalanceHistory(wallet.address, "month");
      if (history.length === 0) {
        return {
          response:
            "📊 No Balance History\n\nThere is no balance history available for your wallet yet.\n\nThis could be because:\n- Your wallet is new\n- You haven't had any transactions\n- The history data is still being indexed\n\nCheck back later after making some transactions.",
        };
      }

      session.tempData = { history, timeframe: "month" };
      const buttons = [
        [
          { label: "📆 Day", callback: "history_day" },
          { label: "📆 Week", callback: "history_week" },
          { label: "📆 Month", callback: "history_month" },
        ],
      ];

      return {
        response: formatBalanceHistoryTable(history).replace(/`/g, ""),
        buttons,
      };
    } catch (error) {
      console.error("Error in history command:", error);
      return {
        response:
          "❌ An error occurred while fetching your balance history. Please try again later.",
      };
    }
  },
};

export async function handleTimeframeChange(
  session: SessionData,
  wallet: { address: string },
  timeframe: "day" | "week" | "month"
): Promise<{
  response: string;
  buttons?: { label: string; callback: string }[][];
}> {
  try {
    const history = await getBalanceHistory(wallet.address, timeframe);
    if (history.length === 0) {
      return { response: "No history data available for this timeframe." };
    }

    session.tempData = { history, timeframe };
    const buttons = [
      [
        { label: "📆 Day", callback: "history_day" },
        { label: "📆 Week", callback: "history_week" },
        { label: "📆 Month", callback: "history_month" },
      ],
    ];

    return {
      response: formatBalanceHistoryTable(history).replace(/`/g, ""),
      buttons,
    };
  } catch (error) {
    console.error("Error handling timeframe change:", error);
    return { response: "An error occurred. Please try again." };
  }
}
