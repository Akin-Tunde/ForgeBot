// src/handlers/wallet.ts
import { CommandContext, CommandHandler } from "../types/commands";
import { getWallet, generateWallet } from "../lib/token-wallet";
import { verifyEncryptionKey } from "../lib/encryption";
import { startHandler } from "./start-help"; // Adjust path if needed

export const walletHandler: CommandHandler = {
  command: "wallet",
  description: "Show wallet address and type",
  handler: async (ctx?: CommandContext) => {
    try {
      const session = ctx?.session;
      const userId = session?.userId;
      if (!userId) {
        return {
          response: "❌ Please start the bot first with /start command.",
        };
      }

      const wallet = await getWallet(userId);
      if (!wallet) {
        return {
          response:
            "❌ You don't have a wallet yet.\n\nYou can create a new wallet or import an existing one:",
          buttons: [
            [
              { label: "Create Wallet", callback: "create_wallet" },
              { label: "Import Wallet", callback: "import_wallet" },
            ],
          ],
        };
      }

      session.walletAddress = wallet.address;

      return {
        response: `💼 Your Wallet\n\nAddress: ${wallet.address}\nType: ${
          wallet.type === "generated" ? "Generated" : "Imported"
        }\nCreated: ${new Date(
          wallet.createdAt
        ).toLocaleDateString()}\n\nChoose an action below or use these commands:\n- /balance - Check your token balances\n- /deposit - Show your deposit address\n- /withdraw - Withdraw ETH to another address\n- /buy - Buy tokens with ETH\n- /sell - Sell tokens for ETH`,
        buttons: [
          [{ label: "🔑 Export Key", callback: "export_key" }],
          [
            { label: "💰 Check Balance", callback: "check_balance" },
            { label: "📥 Deposit", callback: "deposit" },
          ],
          [{ label: "📤 Withdraw", callback: "withdraw" }],
        ],
      };
    } catch (error) {
      console.error("Error in wallet command:", error);
      return { response: "❌ An error occurred. Please try again later." };
    }
  },
};

export const createHandler: CommandHandler = {
  command: "create",
  description: "Create and save a new wallet",
  handler: async (ctx?: CommandContext) => {
    try {
      const session = ctx?.session;
      const userId = session?.userId;
      if (!userId) {
        return {
          response: "❌ Please start the bot first with /start command.",
        };
      }

      if (!verifyEncryptionKey()) {
        return {
          response:
            "❌ Bot encryption key is not properly configured. Please contact the bot administrator.",
        };
      }

      const existingWallet = session?.walletAddress;
      if (existingWallet) {
        return {
          response:
            "⚠️ You already have a wallet set up. Creating a new wallet will replace your current one.\n\nMake sure you have exported your private key if you want to keep access to your current wallet.\n\nDo you want to continue?",
          buttons: [
            [
              {
                label: "Yes, create new wallet",
                callback: "confirm_create_wallet",
              },
              {
                label: "No, keep current wallet",
                callback: "cancel_create_wallet",
              },
            ],
          ],
        };
      }

      const wallet = await generateWallet(userId);
      session.walletAddress = wallet.address;

      // Trigger startHandler to show full buttons
      const startResult = await startHandler.handler({ session });
      return {
        response: `✅ Wallet created successfully!\n\nAddress: ${wallet.address}\n\nImportant:\n- This wallet is stored securely on our server\n- Use /export to get your private key\n- Store your private key somewhere safe\n- Never share your private key with anyone\n\n${startResult.response}`,
        buttons: startResult.buttons,
      };
    } catch (error) {
      console.error("Error in create command:", error);
      return {
        response:
          "❌ An error occurred while creating your wallet. Please try again later.",
      };
    }
  },
};