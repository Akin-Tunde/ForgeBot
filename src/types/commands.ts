// FILE: backend/src/types/commands.ts

import { Session } from "express-session";
import { UserSettings } from "./config";
import { WalletData } from "./wallet";

export interface SessionData {
  userId?: string;
  walletAddress?: string;
  currentAction?: string;
  tempData?: Record<string, any>;
  settings?: UserSettings;
  fid?: string;
  username?: string;
  displayName?: string;
}

// This is our custom state object used in the cookie-less pattern.
export type BotState = SessionData & {
  userId: string;
  fid: string;
  // It's important that this can be `null` because `getWallet` can return null.
  wallet?: WalletData | null;
};

// This is the context object passed to all command handlers.
export interface CommandContext {
  session: BotState;
  // This must also allow `null` to match the BotState type.
  wallet?: WalletData | null;
  args?: string;
}

export interface CommandHandler {
  command: string;
  description: string;
  handler: (ctx?: CommandContext) => Promise<{
    response: string;
    buttons?: { label: string; callback: string }[][];
  }>;
}

export type SettingsOption = "slippage" | "gasPriority";