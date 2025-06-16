import { SessionData } from "../types/commands";
import { WalletData } from "../types/wallet";

interface CommandContext {
  session: SessionData;
  wallet?: WalletData;
  args?: string;
}

export const depositHandler = {
  command: "deposit",
  description: "Display your wallet address for deposits",
  handler: async ({ session, wallet }: CommandContext) => {
    try {
      const userId = session.userId;
      if (!userId) {
        return {
          response: "❌ Please start the bot first with /start command.",
        };
      }

      if (!wallet) {
        const buttons = [
          [
            { label: "Create Wallet", callback: "/create" },
            { label: "Import Wallet", callback: "/import" },
          ],
        ];
        return {
          response:
            "❌ You don't have a wallet yet.\n\nYou need to create or import a wallet first:",
          buttons,
        };
      }

      return {
        response: `📥 Deposit ETH or Tokens\n\nSend ETH or any ERC-20 token to your wallet address on Base Network:\n\n${wallet.address}\n\nImportant:\n- Only send assets on the Base Network\n- ETH deposits usually confirm within minutes\n- Use /balance to check when funds arrive\n- Never share your private key with anyone`,
      };
    } catch (error) {
      console.error("Error in deposit command:", error);
      return { response: "❌ An error occurred. Please try again later." };
    }
  },
};
