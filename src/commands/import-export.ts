// src/commands/import-export.ts
import { CommandContext } from "../types/commands";
import { importWallet, getWallet, getPrivateKey } from "../lib/token-wallet";
import { isValidPrivateKey } from "../utils/validators";
import { startHandler } from "./start-help";

export const importHandler = {
  command: "import",
  description: "Import wallet via private key",
  handler: async ({ session, wallet }: CommandContext) => {
    try {
      const userId = session.userId;
      if (!userId) {
        return {
          response: "❌ Please start the bot first with /start command.",
        };
      }

      if (wallet) {
        const buttons = [
          [
            {
              label: "Yes, import new wallet",
              callback: "confirm_import_wallet",
            },
            {
              label: "No, keep current wallet",
              callback: "cancel_import_wallet",
            },
          ],
        ];
        return {
          response:
            "⚠️ You already have a wallet set up. Importing a new wallet will replace your current one.\n\nMake sure you have exported your private key if you want to keep access to your current wallet.\n\nDo you want to continue?",
          buttons,
        };
      }

      session.currentAction = "import_wallet";
      await new Promise((resolve, reject) => {
        session.save((err: Error | null) => {
          if (err) {
            console.error("importHandler: Error saving session for userId:", userId, err);
            reject(err);
          } else {
            console.log("importHandler: Session saved with currentAction = import_wallet for userId:", userId);
            resolve(null);
          }
        });
      });
      return {
        response:
          "🔑 Please send your private key.\n\nFor security reasons:\n- Private keys are stored in an encrypted format\n- Never share your private key with anyone else\n- You can cancel this operation by typing /cancel",
      };
    } catch (error) {
      console.error("Error in import command for userId:", session?.userId, error);
      return { response: "❌ An error occurred. Please try again later." };
    }
  },
};

export async function handlePrivateKeyInput(context: CommandContext): Promise<{
  response: any;
  buttons?: { label: string; callback: string }[][];
}> {
  const { session, args: input } = context;
  try {
    const userId = session.userId;
    if (!userId || !input) {
      return { response: "❌ Invalid request. Please try again." };
    }

    if (!isValidPrivateKey(input)) {
      return {
        response:
          "❌ Invalid private key format. Please provide a valid 64-character hexadecimal private key with or without 0x prefix.\n\nTry again or type /cancel to abort.",
      };
    }

    const newWallet = await importWallet(userId, input);
    session.walletAddress = newWallet.address;
    session.currentAction = undefined;
    await new Promise((resolve, reject) => {
      session.save((err: Error | null) => {
        if (err) {
          console.error("handlePrivateKeyInput: Error saving session for userId:", userId, err);
          reject(err);
        } else {
          console.log("handlePrivateKeyInput: Session saved, currentAction cleared for userId:", userId);
          resolve(null);
        }
      });
    });

    const startResult = await startHandler.handler({ session });
    return {
      response: `✅ Wallet imported successfully!\n\nAddress: ${newWallet.address}\n\nImportant:\n- This wallet is stored securely on our server\n- Use /export to get your private key\n- Store your private key somewhere safe\n- Never share your private key with anyone\n\n${startResult.response}`,
      buttons: startResult.buttons,
    };
  } catch (error) {
    console.error("Error handling private key input for userId:", session?.userId, error);
    session.currentAction = undefined;
    await new Promise((resolve, reject) => {
      session.save((err: Error | null) => {
        if (err) {
          console.error("handlePrivateKeyInput: Error saving session for userId:", session?.userId, err);
          reject(err);
        } else {
          resolve(null);
        }
      });
    });
    return {
      response:
        "❌ An error occurred while importing your wallet. Please try again later.",
    };
  }
}

// src/commands/import-export.ts (exportHandler only)
// src/commands/import-export.ts (exportHandler only)
// src/commands/import-export.ts (exportHandler only)
export const exportHandler = {
  command: "export",
  description: "Display private key (with confirmation prompt)",
  handler: async ({ session, wallet }: CommandContext) => {
    try {
      const userId = session.userId;
      if (!userId) {
        console.error("[Export] No userId found, session:", session);
        return {
          response: "❌ Please start the bot first with /start command.",
        };
      }

      if (!wallet) {
        console.error("[Export] No wallet found for userId:", userId);
        return {
          response:
            "❌ You don’t have a wallet yet.\n\nUse /create to create a new wallet or /import to import an existing one.",
        };
      }

      console.log("[Export] Initiating export for userId:", userId, "wallet address:", wallet.address);
      session.currentAction = "export_wallet";
      await session.save();
      console.log("[Export] Session saved with currentAction=export_wallet for userId:", userId);

      const buttons = [
        [
          { label: "✅ Confirm", callback: "confirm_yes" },
          { label: "❌ Cancel", callback: "confirm_no" },
        ],
      ];
      return {
        response:
          "⚠️ SECURITY WARNING\n\nYou are about to export your private key. This is sensitive information that gives complete control over your wallet funds.\n\nNEVER:\n- Share your private key with anyone\n- Enter it on websites\n- Take screenshots of it\n\nAre you sure you want to proceed?",
        buttons,
      };
    } catch (error) {
      console.error("[Export] Error in export command for userId:", session?.userId, error);
      return { response: "❌ An error occurred. Please try again later." };
    }
  },
};

// ... (importHandler, handlePrivateKeyInput, handleExportConfirmation unchanged)

// src/commands/import-export.ts (handleExportConfirmation only)
export async function handleExportConfirmation(
  context: CommandContext,
  confirmed: boolean
): Promise<{
  response: string;
  buttons?: { label: string; callback: string }[][];
}> {
  const { session, wallet } = context;
  try {
    console.log("[ExportConfirmation] Handling confirmation, confirmed:", confirmed, "userId:", session.userId, "wallet:", wallet ? 'exists' : 'undefined');
    
    if (!confirmed) {
      session.currentAction = undefined;
      await session.save();
      console.log("[ExportConfirmation] Cancelled, session cleared for userId:", session.userId);
      return {
        response: "✅ Operation cancelled. Your private key was not exported.",
      };
    }

    const userId = session.userId;
    if (!userId) {
      session.currentAction = undefined;
      await session.save();
      console.error("[ExportConfirmation] No userId found");
      return {
        response: "❌ Session expired. Please use /start to begin again.",
      };
    }

    if (!wallet) {
      session.currentAction = undefined;
      await session.save();
      console.error("[ExportConfirmation] No wallet found for userId:", userId);
      return {
        response:
          "❌ Wallet not found. Please create or import a wallet first.",
      };
    }

    console.log("[ExportConfirmation] Retrieving private key for userId:", userId, "address:", wallet.address);
    const privateKey = getPrivateKey(wallet);
    session.currentAction = undefined;
    await session.save();
    console.log("[ExportConfirmation] Private key retrieved, session cleared for userId:", userId);

    return {
      response: `🔑 Your Private Key\n\n${privateKey}\n\n⚠️ REMINDER\n\nYour private key has been displayed. For security:\n1. Save it in a secure password manager\n2. Never share it with anyone\n3. Delete any chat history containing this key`,
    };
  } catch (error) {
    console.error("[ExportConfirmation] Error for userId:", session?.userId, error);
    session.currentAction = undefined;
    await session.save();
    return {
      response:
        "❌ An error occurred while exporting your private key. Please try again later.",
    };
  }
}