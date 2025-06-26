// FILE: src/lib/swap.ts

import axios from "axios";
import { Address, formatEther, formatUnits } from "viem";
import {
  OpenOceanErrorResponse,
  QuoteResponse,
  SwapResponse,
  GasPriceInfo,
  BlockPrices,
} from "../types/config";
import {
  QUICKNODE_RPC_URL,
  OPENOCEAN_ADDON_ID,
  BASE_CHAIN_ID,
  GAS_PRIORITY,
  client,
} from "../utils/constants";

const ADDON_ID = OPENOCEAN_ADDON_ID;
const CHAIN = "base";

// ** SWAP FUNCTIONS ** //

// Type guard to check if response contains an error
function isErrorResponse(data: any): data is OpenOceanErrorResponse {
  return data && typeof data.error !== "undefined";
}

/**
 * Get quote for a swap
 * OpenOcean requires the amount as non-wei value. e.g. for 1.00 ETH, set as 1.
 * OpenOcean requires the gas price as a string and in gwei, not wei
 */
// --- FIX: Made gasPrice optional by adding a '?' ---
export async function getQuote(
  inTokenAddress: string,
  outTokenAddress: string,
  amount: string,
  gasPrice?: string
): Promise<QuoteResponse> {
  try {
    let url = `${QUICKNODE_RPC_URL}addon/${ADDON_ID}/v4/${CHAIN}/quote?inTokenAddress=${inTokenAddress}&outTokenAddress=${outTokenAddress}&amount=${amount}`;

    // This check now correctly handles the optional parameter
    if (gasPrice) {
      url += `&gasPrice=${gasPrice}`;
    }

    const response = await axios.get(url);
    const data = response.data;

    if (isErrorResponse(data)) {
      throw new Error(`OpenOcean API error: ${data.error}`);
    }

    return data;
  } catch (error) {
    console.error(
      "Failed to get quote:",
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}

/**
 * Get swap transaction data
 */
// --- FIX: Made gasPrice, slippage, and account optional by adding '?' ---
export async function getSwap(
  inTokenAddress: Address,
  outTokenAddress: Address,
  amount: string,
  gasPrice?: string,
  slippage?: string,
  account?: Address
): Promise<SwapResponse> {
  try {
    let url =
      `${QUICKNODE_RPC_URL}addon/${ADDON_ID}/v4/${CHAIN}/swap` +
      `?inTokenAddress=${inTokenAddress}` +
      `&outTokenAddress=${outTokenAddress}` +
      `&amount=${amount}`;

    // These checks now correctly handle the optional parameters
    if (gasPrice) {
      url += `&gasPrice=${gasPrice}`;
    }
    if (slippage) {
      url += `&slippage=${slippage}`;
    }
    if (account) {
      url += `&account=${account}`;
    }

    const response = await axios.get<SwapResponse | OpenOceanErrorResponse>(
      url
    );
    const data = response.data;

    if (isErrorResponse(data)) {
      throw new Error(`OpenOcean API error: ${data.error}`);
    }

    return data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(
        "Axios error in getSwap:",
        error.response?.data || error.message
      );
    } else {
      console.error("Unexpected error in getSwap:", error);
    }
    throw error;
  }
}

// ** GAS ESTIMATION FUNCTIONS ** // (No changes needed below this line)

/**
 * Get gas price estimates from Sentio API
 */
export async function getGasEstimates(): Promise<BlockPrices> {
  try {
    const response = await axios.post(
      QUICKNODE_RPC_URL,
      {
        jsonrpc: "2.0",
        method: "sentio_gasPrice",
        params: { chainId: BASE_CHAIN_ID },
        id: 1,
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    const data = response.data;

    if (data.error) {
      throw new Error(`Error fetching gas price: ${data.error.message}`);
    }

    return data as BlockPrices;
  } catch (error) {
    console.error("Failed to fetch gas estimates:", error);
    return {
      blockPrices: [
        {
          estimatedPrices: [
            {
              confidence: 99,
              price: 0.1,
              maxFeePerGas: 1.5,
              maxPriorityFeePerGas: 0.1,
            },
            {
              confidence: 95,
              price: 0.1,
              maxFeePerGas: 1.2,
              maxPriorityFeePerGas: 0.08,
            },
            {
              confidence: 90,
              price: 0.05,
              maxFeePerGas: 1.0,
              maxPriorityFeePerGas: 0.05,
            },
          ],
        },
      ],
    };
  }
}

/**
 * Get gas price info for a specific priority level
 */
export async function getGasPriceForPriority(
  priority: "low" | "medium" | "high" = "medium"
): Promise<GasPriceInfo> {
  const gasEstimates = await getGasEstimates();
  const confidenceLevel = GAS_PRIORITY[priority];
  const estimatedPrices = gasEstimates.blockPrices[0].estimatedPrices;
  const estimate =
    estimatedPrices.find((e) => e.confidence === confidenceLevel) ||
    estimatedPrices[0];
  return {
    confidence: estimate.confidence,
    price: estimate.price,
    maxFeePerGas: estimate.maxFeePerGas,
    maxPriorityFeePerGas: estimate.maxPriorityFeePerGas,
  };
}

/**
 * Get gas parameters for transaction
 */
// FILE: src/lib/swap.ts

// ... other code and imports at the top ...
// Ensure `client` is imported from `../utils/constants`

/**
 * Get gas parameters for transaction
 */
// --- THIS IS THE NEW, RELIABLE VERSION ---
export async function getGasParams(
  priority: "low" | "medium" | "high" = "medium"
): Promise<{
  price: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}> {
  try {
    console.log("[getGasParams] Using viem's estimateFeesPerGas for reliable estimate.");
    
    // Use viem's reliable EIP-1559 fee estimator
    const feeEstimate = await client.estimateFeesPerGas({
      type: "eip1559"
    });

    // We will use the more important maxFeePerGas as our 'price' for the OpenOcean API.
    // The API requires it in Gwei, so we convert from wei to gwei.
    const priceInGwei = formatUnits(feeEstimate.maxFeePerGas!, 9);

    return {
      price: priceInGwei, // This is maxFeePerGas in Gwei
      maxFeePerGas: formatUnits(feeEstimate.maxFeePerGas!, 9),
      maxPriorityFeePerGas: formatUnits(feeEstimate.maxPriorityFeePerGas!, 9),
    };
  } catch (error) {
    console.error("Failed to get gas params from viem, using fallback.", error);
    // Provide a more realistic fallback in case the viem estimator fails
    return {
      price: "0.1", // 0.1 Gwei
      maxFeePerGas: "0.1",
      maxPriorityFeePerGas: "0.05",
    };
  }
}

/**
 * Format gas cost estimate for display
 */
export function formatGasCost(gasLimit: string, maxFeePerGas: string): string {
  const gasCost = BigInt(gasLimit) * BigInt(maxFeePerGas);
  return formatEther(gasCost);
}

/**
 * Get a human-readable gas priority label
 */
export function getGasPriorityLabel(
  priority: "low" | "medium" | "high"
): string {
  const labels = {
    low: "🐢 Low (slower, cheaper)",
    medium: "🚶 Medium (balanced)",
    high: "🚀 High (faster, expensive)",
  };
  return labels[priority];
}