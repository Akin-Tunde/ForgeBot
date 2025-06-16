import { CommandContext } from "../types/commands";
import { importWallet, getWallet, getPrivateKey } from "../lib/token-wallet";
import { isValidPrivateKey } from "../utils/validators";

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
      return {
        response:
          "🔑 Please send your private key.\n\nFor security reasons:\n- Private keys are stored in an encrypted format\n- Never share your private key with anyone else\n- You can cancel this operation by typing /cancel",
      };
    } catch (error) {
      console.error("Error in import command:", error);
      return { response: "❌ An error occurred. Please try again later." };
    }
  },
};

export async function handlePrivateKeyInput(context: CommandContext): Promise<{
  response: string;
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

    const buttons = [[{ label: "💰 Check Balance", callback: "/balance" }]];
    return {
      response: `✅ Wallet imported successfully!\n\nAddress: ${newWallet.address}\n\nNow you can:\n- Use /deposit to receive funds\n- Use /balance to check your balance\n- Use /buy to buy tokens with ETH`,
      buttons,
    };
  } catch (error) {
    console.error("Error handling private key input:", error);
    session.currentAction = undefined;
    return {
      response:
        "❌ An error occurred while importing your wallet. Please try again later.",
    };
  }
}

export const exportHandler = {
  command: "export",
  description: "Display private key (with confirmation prompt)",
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
            "❌ You don’t have a wallet yet.\n\nUse /create to create a new wallet or /import to import an existing one.",
        };
      }

      session.currentAction = "export_wallet";
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
      console.error("Error in export command:", error);
      return { response: "❌ An error occurred. Please try again later." };
    }
  },
};

export async function handleExportConfirmation(
  context: CommandContext,
  confirmed: boolean // confirmed is specific to this handler, not from general args
): Promise<{
  response: string;
  buttons?: { label: string; callback: string }[][];
}> {
  const { session, wallet } = context;
  try {
    if (!confirmed) {
      session.currentAction = undefined;
      return {
        response: "Operation cancelled. Your private key was not exported.",
      };
    }

    const userId = session.userId;
    if (!userId) {
      return {
        response: "❌ Session expired. Please use /start to begin again.",
      };
    }

    if (!wallet) {
      return {
        response:
          "❌ Wallet not found. Please create or import a wallet first.",
      };
    }

    if (!wallet) {
      // Double check, though context should provide it if exportHandler was called
      return { response: "❌ Wallet not found for export." };
    }

    const privateKey = getPrivateKey(wallet);
    session.currentAction = undefined;

    return {
      response: `🔑 Your Private Key\n\n${privateKey}\n\n⚠️ REMINDER\n\nYour private key has been displayed. For security:\n1. Save it in a secure password manager\n2. Never share it with anyone\n3. Delete any chat history containing this key`,
    };
  } catch (error) {
    console.error("Error handling export confirmation:", error);
    return {
      response:
        "❌ An error occurred while exporting your private key. Please try again later.",
    };
  }
}
