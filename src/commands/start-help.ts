// src/commands/start-help.ts
import { CommandHandler, CommandContext } from "../types/commands";
import {
  createUser,
  getUserByfid,
  getUserSettings,
  saveUserSettings,
  getWalletByUserId,
} from "../lib/database";

const GETTING_STARTED_MESSAGE = `🤖 Welcome to Base MEV-Protected Trading Bot!\n\n🧱 Getting Started\n- /create — Create a new wallet\n- /import — Import an existing wallet\n\nStart by creating or importing a wallet to begin trading.`;

const HELP_MESSAGE = `🤖 Welcome to Base MEV-Protected Trading Bot!\n\nTrade ERC-20 tokens with MEV protection on the Base Network.\n\n🧱 Getting Started\n- /create — Create a new wallet\n- /import — Import an existing wallet\n\n💼 Wallet Management\n- /wallet — View your wallet address and type\n- /deposit — Get your deposit address\n- /withdraw — Withdraw ETH to another address\n- /balance — Check your current token balances\n- /history — View your balance history\n- /export — Export your private key\n\n📈 Trading Commands\n- /buy — Buy tokens with ETH\n- /sell — Sell tokens for ETH\n\n⚙️ Settings & Info\n- /settings — Configure your trading preferences\n- /help — Show this help message\n\n🛠 Tip: Start by creating or importing a wallet, then deposit ETH to begin trading.`;

export const startHandler: CommandHandler = {
  command: "start",
  description: "Start the bot and register user",
  handler: async (ctx?: CommandContext) => {
    try {
      const session = ctx?.session;
      const userId = session?.userId;
      console.log("startHandler: userId =", userId);
      if (!userId) {
        console.log("startHandler: No userId found in session");
        return {
          response: "❌ Unable to identify user. Please try again later.",
        };
      }

      const existingUser = await getUserByfid(userId);
      console.log("startHandler: existingUser =", existingUser);

      if (!existingUser) {
        console.log("startHandler: Creating new user for userId =", userId);
        await createUser(
          userId,
          userId,
          session.username || "player",
          session.displayName || "User",
          undefined
        );
        await saveUserSettings(userId, {
          slippage: 1.0,
          gasPriority: "medium",
        });
        return {
          response: GETTING_STARTED_MESSAGE,
          buttons: [
            [
              { label: "Create Wallet", callback: "create_wallet" },
              { label: "Import Wallet", callback: "import_wallet" },
            ],
          ],
        };
      }

      const wallet = await getWalletByUserId(userId);
      console.log("startHandler: wallet =", wallet);

      if (!wallet) {
        console.log("startHandler: No wallet found for userId =", userId);
        return {
          response: GETTING_STARTED_MESSAGE,
          buttons: [
            [
              { label: "Create Wallet", callback: "create_wallet" },
              { label: "Import Wallet", callback: "import_wallet" },
            ],
          ],
        };
      }

      const settings = await getUserSettings(userId);
      console.log("startHandler: settings =", settings);
      if (settings) {
        session.settings = settings;
      }
      return {
        response: `🤖 Welcome back to Base MEV-Protected Trading Bot, ${existingUser.username || existingUser.firstName || "User"}!\n\nWhat would you like to do today?`,
        buttons: [
          [
            { label: "💰 Balance", callback: "check_balance" },
            { label: "📊 History", callback: "check_history" },
          ],
          [
            { label: "💱 Buy Token", callback: "buy_token" },
            { label: "💱 Sell Token", callback: "sell_token" },
          ],
          [
            { label: "⚙️ Settings", callback: "open_settings" },
            { label: "📋 Help", callback: "help" },
          ],
        ], 
      };
    } catch (error) {
      console.error("Error in start command:", error);
      return { response: "❌ An error occurred. Please try again later." };
    }
  },
};

export const helpHandler: CommandHandler = {
  command: "help",
  description: "Show help information and available commands",
  handler: async () => {
    try {
      return { response: HELP_MESSAGE };
    } catch (error) {
      console.error("Error in help command:", error);
      return {
        response: "❌ An error occurred while displaying help. Please try again later.",
      };
    }
  },
};