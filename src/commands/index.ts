import { SessionData, CommandContext, CommandHandler } from "../types/commands";
import { WalletData } from "../types/wallet";
import { getWallet } from "../lib/token-wallet";

// Import all command handlers
import { startHandler, helpHandler } from "./start-help";
import { walletHandler, createHandler } from "./wallet";
import {
  importHandler,
  exportHandler,
  handlePrivateKeyInput,
  handleExportConfirmation,
} from "./import-export";
import {
  balanceHandler,
  historyHandler,
  handleTimeframeChange,
} from "./balance-history";
import {
  buyHandler,
  handleTokenSelection,
  handleCustomTokenInput,
  handleBuyAmountInput,
  handleBuyConfirmation,
} from "./buy";
import {
  sellHandler,
  handleSellTokenSelection,
  handleSellCustomTokenInput,
  handleSellAmountInput,
  handleSellConfirmation,
} from "./sell";
import {
  settingsHandler,
  handleSettingsOption,
  updateSlippage,
  updateGasPriority,
} from "./settings";
import { depositHandler } from "./deposit";
import {
  withdrawHandler,
  handleWithdrawAddress,
  handleWithdrawAmount,
  handleWithdrawConfirmation,
} from "./withdraw";

// A map of command names to handlers
// Add other handlers as needed for a complete mapping
const commandMap: Record<string, CommandHandler> = {
  start: startHandler,
  help: helpHandler,
  wallet: walletHandler,
  create: createHandler,
  import: importHandler,
  export: exportHandler,
  balance: balanceHandler,
  history: historyHandler,
  buy: buyHandler,
  sell: sellHandler,
  settings: settingsHandler,
  deposit: depositHandler,
  withdraw: withdrawHandler,
  // Note: Sub-handlers like handlePrivateKeyInput, handleTokenSelection, etc.,
  // are typically invoked based on session.currentAction or callbacks within their main command flows.
  // This basic handleCommand dispatches to the primary command handlers.
  // More complex routing would be needed if chat.ts needs to manage those states directly.
};

export async function handleCommand(
  commandNameInput: string,
  session: SessionData,
  commandArgs?: string
): Promise<{
  response: string;
  buttons?: { label: string; callback: string }[][];
}> {
  const commandName = commandNameInput.toLowerCase().replace(/^\//, ""); // Normalize command name (remove leading / and lowercase)

  const commandHandler = commandMap[commandName];

  if (!commandHandler) {
    console.warn(`Unknown command received: ${commandNameInput}`);
    return { response: `Unknown command: ${commandNameInput}` };
  }

  let wallet: WalletData | undefined = undefined;
  if (session.userId) {
    // Ensure userId is used for fetching wallet if that's the primary key
    const fetchedWallet = await getWallet(session.userId);
    if (fetchedWallet) {
      wallet = fetchedWallet;
      // Optionally update session.walletAddress if not already set or differs
      if (session.walletAddress !== fetchedWallet.address) {
        session.walletAddress = fetchedWallet.address;
      }
    }
  }

  const context: CommandContext = {
    session,
    wallet, // Pass the fetched wallet object
    args: commandArgs,
  };

  return commandHandler.handler(context);
}
