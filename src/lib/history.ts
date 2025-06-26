// FILE: src/lib/history.ts

import axios from "axios";
import { formatEther } from "viem"; // `hexToBigInt` is not needed here
import {
  JsonRpcResponse,
  BalanceHistoryEntry,
  TokenBalanceResult,
} from "../types/config";
// --- START OF CORRECTION ---
// Import both URLs since different functions in this file might use different providers.
import { ALCHEMY_URL, QUICKNODE_RPC_URL } from "../utils/constants";
// --- END OF CORRECTION ---

// Helper type for Alchemy's response
interface AlchemyTransfer {
  blockNum: string;
  hash: string;
  from: string;
  to: string;
  value: number; // ETH value
  asset: string; // "ETH"
  metadata: {
    blockTimestamp: string;
  };
}

// New function to process the raw list from Alchemy into the summarized format we need
function processAlchemyHistory(
  transfers: AlchemyTransfer[],
  address: string
): BalanceHistoryEntry[] {
  const dailySummary: { [key: string]: BalanceHistoryEntry } = {};
  const lowerCaseAddress = address.toLowerCase();

  for (const transfer of transfers) {
    if (transfer.asset !== 'ETH') continue; // Only process native ETH transfers

    const timestamp = new Date(transfer.metadata.blockTimestamp).getTime();
    const dateKey = new Date(timestamp).toISOString().split("T")[0];

    if (!dailySummary[dateKey]) {
      const startOfDay = new Date(dateKey).getTime() / 1000;
      dailySummary[dateKey] = {
        time: startOfDay,
        txs: 0,
        received: "0",
        sent: "0",
        sentToSelf: "0",
        rates: { usd: 0 },
      };
    }

    const valueWei = BigInt(Math.round(transfer.value * 1e18));

    dailySummary[dateKey].txs += 1;
    if (transfer.to.toLowerCase() === lowerCaseAddress) {
      dailySummary[dateKey].received = (
        BigInt(dailySummary[dateKey].received) + valueWei
      ).toString();
    }
    if (transfer.from.toLowerCase() === lowerCaseAddress) {
      dailySummary[dateKey].sent = (
        BigInt(dailySummary[dateKey].sent) + valueWei
      ).toString();
    }
  }

  return Object.values(dailySummary).sort((a, b) => b.time - a.time); // Sort descending for most recent first
}

/**
 * Get balance history for an address using ALCHEMY's Transfers API
 */
export async function getBalanceHistory(
  address: string,
  timeframe: "day" | "week" | "month" = "month" // Timeframe is now for filtering, not for API call
): Promise<BalanceHistoryEntry[]> {
  console.log(`[History-Alchemy] Getting history for ${address}`);
  try {
    const toBlock = "latest";
    const maxCount = "0x3e8";

    const sentPromise = axios.post(ALCHEMY_URL, {
      id: 1,
      jsonrpc: "2.0",
      method: "alchemy_getAssetTransfers",
      params: [{ fromBlock: "0x0", toBlock, fromAddress: address, category: ["external"], withMetadata: true, maxCount }],
    });

    const receivedPromise = axios.post(ALCHEMY_URL, {
      id: 1,
      jsonrpc: "2.0",
      method: "alchemy_getAssetTransfers",
      params: [{ fromBlock: "0x0", toBlock, toAddress: address, category: ["external"], withMetadata: true, maxCount }],
    });

    const [sentResponse, receivedResponse] = await Promise.all([
      sentPromise,
      receivedPromise,
    ]);

    const sentTransfers = sentResponse.data.result?.transfers || [];
    const receivedTransfers = receivedResponse.data.result?.transfers || [];

    const allTransfersMap = new Map<string, AlchemyTransfer>();
    for (const transfer of [...sentTransfers, ...receivedTransfers]) {
      allTransfersMap.set(transfer.hash, transfer);
    }
    const uniqueTransfers = Array.from(allTransfersMap.values());
    
    console.log(`[History-Alchemy] Found ${uniqueTransfers.length} unique ETH transfers.`);

    return processAlchemyHistory(uniqueTransfers, address);
  } catch (error) {
    console.error("[History-Alchemy] Failed to fetch balance history:", error);
    return [];
  }
}

/**
 * Format balance history as a text table (NO CHANGES NEEDED HERE)
 */
export function formatBalanceHistoryTable(
  history: BalanceHistoryEntry[]
): string {
  if (history.length === 0) {
    return "No balance history available.";
  }
  let result = "*Balance History*\n\n";
  for (const entry of history) {
    const date = new Date(entry.time * 1000);
    const formattedDate = date.toLocaleString("en-US", {
      dateStyle: "short",
    });
    const received = BigInt(entry.received);
    const sent = BigInt(entry.sent);
    const net = received - sent;
    const ethSent = formatEther(sent);
    const ethReceived = formatEther(received);
    const ethNet = formatEther(net);
    result += `📅 *${formattedDate}*\n`;
    result += `🔻 Sent: \`${ethSent}\` ETH\n`;
    result += `🔺 Received: \`${ethReceived}\` ETH\n`;
    result += `📊 Net: \`${ethNet}\` ETH\n\n`;
  }
  return result.trim();
}

/**
 * Get token balance information (uses QuickNode Blockbook)
 */
export async function getTokenBalance(
  address: string
): Promise<TokenBalanceResult | null> {
  try {
    const response = await fetch(QUICKNODE_RPC_URL, { // This now correctly finds the imported variable
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "bb_getAddress",
        params: [address],
        id: 1,
        jsonrpc: "2.0",
      }),
    });
    const data = (await response.json()) as JsonRpcResponse<TokenBalanceResult>;
    if (data.error) {
      // Corrected from bb_getbalanceHistory to bb_getAddress
      // This method is less likely to fail with "Method not found"
      console.error(`Error in getTokenBalance (bb_getAddress): ${data.error.message}`);
      return null;
    }
    return data.result || null;
  } catch (error) {
    console.error("Failed to fetch token balances:", error);
    return null;
  }
}