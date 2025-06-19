// src/lib/database.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import session from 'express-session';
import { WalletData } from "../types/wallet";
import { UserSettings } from "../types/config";
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DB_TABLES } from "../utils/constants";

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type UserRow = {
  userId: string;
  fid: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  createdAt: number;
};

type WalletRow = {
  address: string;
  userId: string;
  encryptedPrivateKey: string;
  type: string;
  createdAt: number;
};

type SettingsRow = {
  userId: string;
  slippage: number;
  gasPriority: string;
};

type TransactionRow = {
  txHash: string;
  userId: string;
  walletAddress: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string | null;
  status: string;
  gasUsed: string | null;
  timestamp: number;
};

export async function initDatabase(): Promise<void> {
  console.log("[Database] Initializing Supabase database...");
  try {
    // Verify sessions table exists
    const { error } = await supabase
      .from('sessions')
      .select('sid')
      .limit(1);
    if (error && error.code === 'PGRST204') {
      console.error("[Database] Sessions table does not exist. Please create it with schema: sid (text, primary key), session (jsonb), expires (timestamptz)");
      throw new Error("Sessions table not found");
    } else if (error) {
      console.error("[Database] Error checking sessions table:", error.message, error.details);
      throw new Error(`Failed to verify sessions table: ${error.message}`);
    }
    console.log("[Database] Sessions table verified successfully");
  } catch (err) {
    console.error("[Database] Initialization failed:", err);
    throw err;
  }
}

export class SupabaseSessionStore extends session.Store {
  private tableName: string;
  private ttl: number;

  constructor(private supabase: SupabaseClient, options: { tableName: string; ttl: number }) {
    super();
    this.tableName = options.tableName;
    this.ttl = options.ttl;
  }

  async get(sid: string, callback: (err: any, session?: any) => void) {
    try {
      console.log("[SessionStore] Getting session for sid:", sid);
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select("session, expires")
        .eq("sid", sid)
        .single();
      if (error) {
        console.error("[SessionStore] Get error for sid:", sid, "message:", error.message, "details:", error.details);
        return callback(error);
      }
      if (!data || new Date(data.expires) < new Date()) {
        console.log("[SessionStore] No session or expired for sid:", sid);
        return callback(null, null);
      }
      const sessionData = JSON.parse(data.session);
      console.log("[SessionStore] Retrieved session for sid:", sid, "session:", sessionData);
      callback(null, sessionData);
    } catch (err) {
      console.error("[SessionStore] Get exception for sid:", sid, err);
      callback(err);
    }
  }

  async set(sid: string, session: any, callback: (err?: any) => void) {
    try {
      const expires = new Date(Date.now() + this.ttl * 1000).toISOString();
      console.log("[SessionStore] Setting session for sid:", sid, "expires:", expires, "session:", session);
      const { error } = await this.supabase
        .from(this.tableName)
        .upsert({
          sid,
          session: JSON.stringify(session),
          expires,
        }, {
          onConflict: 'sid'
        });
      if (error) {
        console.error("[SessionStore] Set error for sid:", sid, "message:", error.message, "details:", error.details);
        throw error;
      }
      console.log("[SessionStore] Session set successfully for sid:", sid);
      callback();
    } catch (err) {
      console.error("[SessionStore] Set exception for sid:", sid, err);
      callback(err);
    }
  }

  async destroy(sid: string, callback: (err?: any) => void) {
    try {
      console.log("[SessionStore] Destroying session for sid:", sid);
      const { error } = await this.supabase
        .from(this.tableName)
        .delete()
        .eq("sid", sid);
      if (error) {
        console.error("[SessionStore] Destroy error for sid:", sid, "message:", error.message, "details:", error.details);
        throw error;
      }
      console.log("[SessionStore] Session destroyed for sid:", sid);
      callback();
    } catch (err) {
      console.error("[SessionStore] Destroy exception for sid:", sid, err);
      callback(err);
    }
  }
}

export const sessionStore = new SupabaseSessionStore(supabase, {
  tableName: "sessions",
  ttl: 24 * 60 * 60, // 24 hours
});

export async function createUser(
  userId: string,
  fid: string,
  username?: string,
  firstName?: string,
  lastName?: string
): Promise<void> {
  console.log("createUser: Creating user with fid =", fid, "userId =", userId);
  const { error } = await supabase
    .from(DB_TABLES.USERS)
    .insert({
      userId,
      fid,
      username,
      firstName,
      lastName,
      createdAt: Date.now(),
    })
    .single();

  if (error) {
    console.error("Error creating user:", error.message);
    throw new Error("Failed to create user.");
  }
}

export async function getUserByfid(fid: string): Promise<UserRow | undefined> {
  const { data, error } = await supabase
    .from(DB_TABLES.USERS)
    .select('*')
    .eq('fid', fid)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error("Error getting user by Telegram ID:", error.message);
    throw new Error("Failed to get user by Telegram ID.");
  }

  return data as UserRow | undefined;
}

export async function saveWallet(walletData: WalletData, userId: string): Promise<void> {
  const { error } = await supabase
    .from(DB_TABLES.WALLETS)
    .upsert({
      address: walletData.address,
      userId,
      encryptedPrivateKey: walletData.encryptedPrivateKey,
      type: walletData.type,
      createdAt: walletData.createdAt,
    })
    .single();

  if (error) {
    console.error("Error saving wallet:", error.message);
    throw new Error("Failed to save wallet.");
  }
}

export async function getWalletByUserId(userId: string): Promise<WalletData | null> {
  const { data, error } = await supabase
    .from(DB_TABLES.WALLETS)
    .select('*')
    .eq('userId', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error("Error getting wallet by user ID:", error.message);
    throw new Error("Failed to get wallet by user ID.");
  }

  return data ? (data as unknown as WalletData) : null;
}

export async function getWalletByAddress(address: string): Promise<WalletData | null> {
  const { data, error } = await supabase
    .from(DB_TABLES.WALLETS)
    .select('*')
    .eq('address', address)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error("Error getting wallet by address:", error.message);
    throw new Error("Failed to get wallet by address.");
  }

  return data ? (data as unknown as WalletData) : null;
}

export async function deleteWallet(address: string): Promise<void> {
  const { error } = await supabase
    .from(DB_TABLES.WALLETS)
    .delete()
    .eq('address', address);

  if (error) {
    console.error("Error deleting wallet:", error.message);
    throw new Error("Failed to delete wallet.");
  }
}

export async function saveUserSettings(
  userId: string,
  settings: Omit<UserSettings, "userId">
): Promise<void> {
  try {
    console.log("[Database] saveUserSettings: Saving settings for userId:", userId, "settings:", settings);
    const { error } = await supabase
      .from(DB_TABLES.SETTINGS)
      .upsert({
        userId,
        slippage: settings.slippage,
        gasPriority: settings.gasPriority,
      })
      .single();

    if (error) {
      console.error("[Database-error] saveUserSettings: Error for userId:", userId, error);
      throw new Error(`Failed to save user settings: ${error.message}`);
    }
    console.log("[Database] saveUserSettings: Successfully saved settings for userId:", userId);
  } catch (err) {
    console.error("[Database-error] saveUserSettings: Exception for userId:", userId, err);
    throw err;
  }
}

export async function getUserSettings(userId: string): Promise<UserSettings | null> {
  try {
    console.log("[Database] getUserSettings: Fetching settings for userId:", userId);
    const { data, error } = await supabase
      .from(DB_TABLES.SETTINGS)
      .select('*')
      .eq('userId', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error("[Database-error] getUserSettings: Error for userId:", userId, error);
      throw new Error(`Failed to get user settings: ${error.message}`);
    }

    if (!data) {
      console.log("[Database] getUserSettings: No settings found for userId:", userId);
      return null;
    }

    console.log("[Database] getUserSettings: Retrieved settings for userId:", userId, data);
    return {
      userId: data.userId,
      slippage: data.slippage,
      gasPriority: data.gasPriority as UserSettings["gasPriority"],
    };
  } catch (err) {
    console.error("[Database-error] getUserSettings: Exception for userId:", userId, err);
    throw err;
  }
}

export async function saveTransaction(
  txHash: string,
  userId: string,
  walletAddress: string,
  fromToken: string,
  toToken: string,
  fromAmount: string,
  status: string,
  toAmount?: string,
  gasUsed?: string
): Promise<void> {
  const { error } = await supabase
    .from(DB_TABLES.TRANSACTIONS)
    .upsert({
      txHash,
      userId,
      walletAddress,
      fromToken,
      toToken,
      fromAmount,
      toAmount,
      status,
      gasUsed,
      timestamp: Date.now(),
    })
    .single();

  if (error) {
    console.error("Error saving transaction:", error.message);
    throw new Error("Failed to save transaction.");
  }
}

export async function getTransactionsByUserId(
  userId: string,
  limit = 10
): Promise<TransactionRow[]> {
  const { data, error } = await supabase
    .from(DB_TABLES.TRANSACTIONS)
    .select('*')
    .eq('userId', userId)
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error getting transactions by user ID:", error.message);
    throw new Error("Failed to get transactions by user ID.");
  }

  return data as TransactionRow[];
}

export async function getUniqueTokensByUserId(userId: string): Promise<string[]> {
  const { data: fromTokens, error: fromError } = await supabase
    .from(DB_TABLES.TRANSACTIONS)
    .select('fromToken')
    .eq('userId', userId);

  if (fromError) {
    console.error("Error getting unique fromTokens:", fromError.message);
    throw new Error("Failed to get unique tokens.");
  }

  const { data: toTokens, error: toError } = await supabase
    .from(DB_TABLES.TRANSACTIONS)
    .select('toToken')
    .eq('userId', userId);

  if (toError) {
    console.error("Error getting unique toTokens:", toError.message);
    throw new Error("Failed to get unique tokens.");
  }

  const allTokens = [...(fromTokens || []).map(row => row.fromToken), ...(toTokens || []).map(row => row.toToken)];
  return Array.from(new Set(allTokens)).filter(token => token !== null) as string[];
}

export function closeDatabase(): void {
  console.log("Supabase connection managed automatically.");
}