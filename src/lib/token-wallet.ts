//src/lib/token-wallet.ts
import {
  createWalletClient,
  http,
  createPublicClient,
  Account,
  WalletClient,
  Address,
  formatUnits,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { encrypt, decrypt, verifyEncryptionKey } from "./encryption";
import { saveWallet, getWalletByUserId } from "./database";
import {
  WalletData,
  TransactionParams,
  WithdrawalParams,
  TransactionReceipt,
} from "../types/wallet";
import { TokenInfo } from "../types/config";
import { erc20Abi } from "../utils/abis";
import {
  QUICKNODE_RPC_URL,
  COMMON_TOKENS,
  NATIVE_TOKEN_ADDRESS,
  MAX_UINT256,
} from "../utils/constants";
import { isValidPrivateKey } from "../utils/validators";
import { isValidAddress } from "../utils/validators";

import {client as publicClient} from "../utils/constants";
// *** WALLET FUNCTIONS *** //

/**
 * Create a wallet client for the given private key
 
function createClient(account: Account): WalletClient {
  return createWalletClient({
    account,
    chain: base,
    transport: http(QUICKNODE_RPC_URL),
  });
}
*/

function createClient(account: Account): WalletClient {
  return createWalletClient({
    account,
    chain: base,
    transport: http(`https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`),
  });
}

export function createPublicClientForBase() {
  return publicClient;
}
 
/**
 * Create a public client for Base network

export function createPublicClientForBase() {
  return createPublicClient({
    chain: base,
    transport: http(QUICKNODE_RPC_URL),
  });
}
 */
/**
 * Generate a new wallet
 */
export async function generateWallet(userId: string): Promise<WalletData> {
  const privateKey = generatePrivateKey();

  // Create account from private key
  const account = privateKeyToAccount(privateKey);

  const walletData: WalletData = {
    address: account.address,
    encryptedPrivateKey: encrypt(privateKey),
    type: "generated",
    createdAt: Date.now(),
  };

  // Save wallet to database
  saveWallet(walletData, userId);

  return walletData;
}

/**
 * Import a wallet from private key
 */
export async function importWallet(
  userId: string,
  privateKey: string
): Promise<WalletData> {
  try {
    // Remove 0x prefix if present
    const cleanPrivateKey = privateKey.replace(/^0x/, "");

    // Validate private key format
    if (!isValidPrivateKey(cleanPrivateKey)) {
      throw new Error("Invalid private key format");
    }

    // Create account from private key
    const account = privateKeyToAccount(`0x${cleanPrivateKey}`);

    const walletData: WalletData = {
      address: account.address,
      encryptedPrivateKey: encrypt(cleanPrivateKey),
      type: "imported",
      createdAt: Date.now(),
    };

    // Save wallet to database
    await saveWallet(walletData, userId);

    return walletData;
  } catch (error) {
    console.error("Error importing wallet:", error);
    throw new Error("Invalid private key or database error");
  }
}

/**
 * Get wallet for a user
 */
export async function getWallet(userId: string): Promise<WalletData | null> {
  return getWalletByUserId(userId);
}

/**
 * Get account object from wallet data
 */
export function getAccount(walletData: WalletData): Account {
  const privateKey = decrypt(walletData.encryptedPrivateKey);
  return privateKeyToAccount(`0x${privateKey.replace(/^0x/, "")}`);
}

/**
 * Get private key from wallet data
 */
export function getPrivateKey(wallet: WalletData): string {
  try {
    if (!verifyEncryptionKey()) {
      throw new Error("Encryption key not configured");
    }
    const privateKey = decrypt(wallet.encryptedPrivateKey);
    if (!isValidPrivateKey(privateKey)) {
      throw new Error("Decrypted private key is invalid");
    }
    return `${privateKey}`;
  } catch (error) {
    console.error("Error decrypting private key:", error);
    throw new Error("Failed to retrieve private key");
  }
}

/**
 * Get ETH balance for an address
 */
export async function getEthBalance(address: Address): Promise<string> {
  try {
    console.log("[getEthBalance] Fetching ETH balance for address:", address);
    const balance = await publicClient.getBalance({ address });
    const balanceWei = balance.toString();
    console.log("[getEthBalance] Success: address =", address, "balance =", balanceWei, "wei");
    return balanceWei;
  } catch (error) {
    console.error("[getEthBalance] Error fetching ETH balance for address:", address, error);
    return "0";
  }
}
// FILE: src/lib/token-wallet.ts
// (Showing only the function that needs to be fixed)

// ... other functions like createClient, generateWallet, importWallet, etc. ...

/**
 * Execute a contract method using viem's writeContract
 *
 * NOTE: This function is not currently used by buy/sell but could be in the future.
 * It also needs to be updated to return the correct receipt type.
 */
export async function executeContractMethod({
  walletData,
  contractAddress,
  abi,
  functionName,
  args,
}: {
  walletData: WalletData;
  contractAddress: Address;
  abi: any;
  functionName: string;
  args: any[];
}): Promise<TransactionReceipt> {
  try {
    const account = getAccount(walletData);
    const publicClient = createPublicClientForBase();
    const walletClient = createClient(account);

    const { request } = await publicClient.simulateContract({
      address: contractAddress,
      abi,
      functionName,
      args,
      account,
    });

    const hash = await walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    // CORRECTED: Ensure it returns the full TransactionReceipt object
    return {
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === "success" ? "success" : "failure",
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPrice: receipt.effectiveGasPrice.toString(), // <-- FIX APPLIED HERE
    };
  } catch (error) {
    console.error("Contract method execution failed:", error);
    throw error;
  }
}

/**
 * Execute a transaction
 * THIS IS THE FUNCTION CAUSING THE ERROR
 */
export async function executeTransaction(
  walletData: WalletData,
  params: TransactionParams
): Promise<TransactionReceipt> {
  try {
    const account = getAccount(walletData);
    const client = createClient(account);

    // Prepare transaction parameters
    // The buy/sell commands use OpenOcean, which provides legacy gasPrice.
    // viem will automatically handle converting this to EIP-1559 format if the network supports it.
    const txParams: any = {
      to: params.to,
      data: params.data,
      value: BigInt(params.value || "0"),
      gasPrice: BigInt(params.gasPrice), // OpenOcean addon provides this
    };

    // Send transaction
    const hash = await client.sendTransaction(txParams);

    // Wait for transaction receipt
    const publicClient = createPublicClientForBase();
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    // CORRECTED: Return the full TransactionReceipt object
    return {
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === "success" ? "success" : "failure",
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPrice: receipt.effectiveGasPrice.toString(), // <-- FIX APPLIED HERE
    };
  } catch (error) {
    console.error("Transaction execution failed:", error);
    throw error;
  }
}


/**
 * Withdraw ETH to another address
 * (This function is already correct from the previous fix)
 */
export async function withdrawEth(
  walletData: WalletData,
  params: WithdrawalParams
): Promise<TransactionReceipt> {
    // ... function code is correct from previous step ...
    try {
        const account = getAccount(walletData);
        const client = createClient(account);

        const txParams: any = {
          to: params.to,
          value: BigInt(params.amount),
        };

        if (params.maxFeePerGas && params.maxPriorityFeePerGas) {
          txParams.maxFeePerGas = BigInt(params.maxFeePerGas);
          txParams.maxPriorityFeePerGas = BigInt(params.maxPriorityFeePerGas);
        } else if (params.gasPrice) {
          txParams.gasPrice = BigInt(params.gasPrice);
        }

        const hash = await client.sendTransaction(txParams);

        const publicClient = createPublicClientForBase();
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        return {
          transactionHash: receipt.transactionHash,
          blockNumber: receipt.blockNumber,
          status: receipt.status === "success" ? "success" : "failure",
          gasUsed: receipt.gasUsed.toString(),
          effectiveGasPrice: receipt.effectiveGasPrice.toString(),
        };
      } catch (error) {
        console.error("Withdrawal failed:", error);
        throw error;
      }
}


// ... rest of the file ...

// ... other functions in the file ...
/**
 * Estimate gas for ETH withdrawal
 */
export async function estimateWithdrawalGas(
  from: Address,
  to: Address,
  amount: string
): Promise<string> {
  try {
    const publicClient = createPublicClientForBase();

    const gasEstimate = await publicClient.estimateGas({
      account: from,
      to: to,
      value: BigInt(amount),
    });

    return gasEstimate.toString();
  } catch (error) {
    console.error("Gas estimation failed:", error);
    return "21000"; // Default gas limit for ETH transfer
  }
}

// *** TOKEN FUNCTIONS *** //

/**
 * Get token information using on-chain RPC calls
 * @param tokenAddress The token's contract address
 * @returns TokenInfo object with token details or null if failed
 */
export async function getTokenInfo(
  tokenAddress: Address
): Promise<TokenInfo | null> {
  try {
    console.log("[getTokenInfo] Validating address:", tokenAddress);
    if (!isValidAddress(tokenAddress)) {
      console.error("[getTokenInfo] Invalid token address:", tokenAddress);
      return null;
    }

    if (tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()) {
      console.log("[getTokenInfo] Returning native ETH info");
      return {
        address: NATIVE_TOKEN_ADDRESS,
        symbol: "ETH",
        decimals: 18,
        balance: "0",
      };
    }

    const publicClient = createPublicClientForBase();
    console.log("[getTokenInfo] Fetching token data for:", tokenAddress);

    try {
      const [symbol, decimals] = await Promise.all([
        publicClient.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "symbol",
        }).catch((e) => { throw new Error(`Failed to fetch symbol: ${e.message}`); }),
        publicClient.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "decimals",
        }).catch((e) => { throw new Error(`Failed to fetch decimals: ${e.message}`); }),
      ]);

      console.log("[getTokenInfo] Success: symbol =", symbol, "decimals =", decimals);
      return {
        address: tokenAddress,
        symbol: symbol as string,
        decimals: Number(decimals),
        balance: "0",
      };
    } catch (contractError) {
      console.error("[getTokenInfo] Contract call failed for address:", tokenAddress, contractError);
      return null;
    }
  } catch (error) {
    console.error("[getTokenInfo] Error fetching token info for address:", tokenAddress, error);
    return null;
  }
}

/**
 * Get token balance for a specific address
 * @param tokenAddress The token's contract address
 * @param walletAddress The wallet address to check balance for
 * @returns Token balance as string
 */
export async function getTokenBalance(
  tokenAddress: Address,
  walletAddress: Address
): Promise<string> {
  try {
    const publicClient = createPublicClientForBase();

    // If it's ETH, get native balance
    if (tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()) {
      const balance = await publicClient.getBalance({
        address: walletAddress,
      });
      return balance.toString();
    }

    // For ERC20 tokens
    const balance = await publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [walletAddress],
    });

    return balance.toString();
  } catch (error) {
    console.error("Error fetching token balance:", error);
    return "0";
  }
}

/**
 * Get multiple token balances for a wallet
 * @param tokenAddresses Array of token addresses
 * @param walletAddress Wallet address to check balances for
 * @returns Array of token info objects with balances
 */
export async function getMultipleTokenBalances(
  tokenAddresses: Address[],
  walletAddress: Address
): Promise<TokenInfo[]> {
  try {
    const tokenPromises = tokenAddresses.map(async (address) => {
      const tokenInfo = await getTokenInfo(address);
      if (!tokenInfo) return null;

      const balance = await getTokenBalance(address, walletAddress);
      return {
        ...tokenInfo,
        balance,
      };
    });

    const tokens = await Promise.all(tokenPromises);
    return tokens.filter((token): token is TokenInfo => token !== null);
  } catch (error) {
    console.error("Error fetching multiple token balances:", error);
    return [];
  }
}

/**
 * Get token address from symbol
 * @param symbol Token symbol (e.g., "ETH", "USDC")
 * @returns Token address or null if not found
 */
export function getTokenAddressFromSymbol(symbol: string): Address | null {
  const upperSymbol = symbol.toUpperCase();

  // Check if it's in our common tokens list
  if (COMMON_TOKENS[upperSymbol as keyof typeof COMMON_TOKENS]) {
    return COMMON_TOKENS[upperSymbol as keyof typeof COMMON_TOKENS];
  }

  return null;
}

/**
 * Format token amount according to its decimals
 * @param amount Raw token amount (in base units)
 * @param decimals Token decimals
 * @param displayDecimals Number of decimals to display
 * @returns Formatted amount as string
 */
export function formatTokenAmount(
  amount: string | bigint,
  decimals: number,
  displayDecimals: number = 4
): string {
  try {
    const formatted = formatUnits(
      typeof amount === "string" ? BigInt(amount) : amount,
      decimals
    );
    return parseFloat(formatted).toFixed(displayDecimals);
  } catch (error) {
    console.error("Error formatting token amount:", error);
    return "0";
  }
}

/**
 * Get ERC20 token allowance
 * @param tokenAddress Token contract address
 * @param ownerAddress Owner address
 * @param spenderAddress Spender address (typically exchange contract)
 * @returns Allowance amount as string
 */
export async function getTokenAllowance(
  tokenAddress: Address,
  ownerAddress: Address,
  spenderAddress: Address
): Promise<string> {
  try {
    // Native token (ETH) doesn't need allowance
    if (tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()) {
      return MAX_UINT256;
    }

    const publicClient = createPublicClientForBase();

    const allowance = await publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "allowance",
      args: [ownerAddress, spenderAddress],
    });

    return allowance.toString();
  } catch (error) {
    console.error("Error getting token allowance:", error);
    return "0";
  }
}


