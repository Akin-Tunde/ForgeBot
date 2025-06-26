// src/commands/import-export.ts 

import { CommandContext } from "../types/commands";
import { importWallet, getPrivateKey } from "../lib/token-wallet";
import { isValidPrivateKey } from "../utils/validators";
import { startHandler } from "./start-help";

export const importHandler = {
  command: "import",
  description: "Import wallet via private key",
  handler: async ({ session, wallet }: CommandContext) => {
    try {
      if (!session.userId) {
        return { response: "❌ Please start the bot first." };
      }

      if (wallet) {
        return {
          response: "⚠️ You already have a wallet. Importing a new one will replace it. Are you sure?",
          buttons: [
            [{ label: "Yes, import new", callback: "confirm_import_wallet" }, { label: "No, cancel", callback: "cancel_import_wallet" }]
          ],
        };
      }

      session.currentAction = "import_wallet";
      return {
        response: "🔑 Please send your private key to import your wallet.",
      };
    } catch (error) {
      console.error("Error in import command:", error);
      return { response: "❌ An error occurred." };
    }
  },
};

export async function handlePrivateKeyInput(context: CommandContext): Promise<{
  response: any;
  buttons?: { label: string; callback: string }[][];
}> {
  const { session, args: input } = context;
  try {
    if (!session.userId || !input) {
      return { response: "❌ Invalid request." };
    }
    if (!isValidPrivateKey(input)) {
      return { response: "❌ Invalid private key format. Please try again." };
    }

    const newWallet = await importWallet(session.userId, input);
    session.currentAction = undefined;

    const startResult = await startHandler.handler({ session, wallet: newWallet });
    return {
      response: `✅ Wallet imported successfully!\n\nAddress: ${newWallet.address}\n\n${startResult.response}`,
      buttons: startResult.buttons,
    };
  } catch (error) {
    console.error("Error handling private key input:", error);
    session.currentAction = undefined;
    return { response: "❌ An error occurred during import." };
  }
};

export const exportHandler = {
  command: "export",
  description: "Display private key",
  handler: async ({ session, wallet }: CommandContext) => {
    try {
      if (!session.userId) {
        return { response: "❌ Please start the bot first." };
      }
      if (!wallet) {
        return { response: "❌ You don’t have a wallet to export." };
      }

      session.currentAction = "export_wallet";

      // This is the fix. The `return` keyword was missing.
      return {
        response: "⚠️ SECURITY WARNING\n\nAre you sure you want to export your private key? This is sensitive information.",
        buttons: [
          [{ label: "✅ Yes, I'm sure", callback: "confirm_yes" }, { label: "❌ No, cancel", callback: "confirm_no" }]
        ],
      };
    } catch (error) {
      console.error("Error in export command:", error);
      return { response: "❌ An error occurred." };
    }
  },
};

export async function handleExportConfirmation(
  context: CommandContext,
  confirmed: boolean
): Promise<{
  response: string;
  buttons?: { label: string; callback: string }[][];
}> {
  const { session, wallet } = context;
  try {
    // We must always clear the action after a confirmation attempt
    session.currentAction = undefined;

    if (!session.userId || !wallet) {
      return { response: "❌ Session or wallet not found." };
    }

    if (!confirmed) {
      return { response: "✅ Export cancelled." };
    }

    const privateKey = getPrivateKey(wallet);

    return {
      response: `🔑 Your Private Key:\n\n 0x${privateKey}\n\n⚠️ REMINDER: Save this securely and do not share it with anyone.`,
    };
  } catch (error) {
    console.error("Error during export confirmation:", error);
    // Ensure action is also cleared on error
    if(session) session.currentAction = undefined;
    return { response: "❌ An error occurred during export." };
  }
}