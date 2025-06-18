import { UserSettings } from "./config";
import { WalletData } from "./wallet";

export interface SessionData {
  userId?: string;
  walletAddress?: string;
  currentAction?: string;
  tempData?: Record<string, any>;
  settings?: UserSettings;
  fid?: string;
  username?: string; // Add username
  displayName?: string; // Add displayName
}

export interface CommandContext {
  session: SessionData;
  wallet?: WalletData;
  args?: string; // Single string for input (e.g., private key, amount)
}

export interface CommandHandler {
  command: string;
  description: string;
  handler: (ctx: CommandContext) => Promise<{
    response: string;
    buttons?: { label: string; callback: string }[][];
  }>;
}

export type SettingsOption = "slippage" | "gasPriority";
