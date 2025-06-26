import { SessionData, CommandContext } from "../types/commands";
import { TransactionParams } from "../types/wallet";
import {
  getTokenInfo,
  getTokenAllowance,
  executeTransaction,
  executeContractMethod,
} from "../lib/token-wallet";
import { getQuote, getSwap, getGasParams } from "../lib/swap";
import { getUniqueTokensByUserId, saveTransaction } from "../lib/database";
import {
  formatEthBalance,
  formatTransactionDetails,
} from "../utils/formatters";
import { isValidAddress, isValidAmount } from "../utils/validators";

import { NATIVE_TOKEN_ADDRESS, MAX_UINT256 } from "../utils/constants";
import { Address, parseUnits, formatUnits } from "viem";
import { erc20Abi } from "../utils/abis";

// FILE: src/commands/sell.ts

// ... imports ...

// FILE: src/commands/sell.ts

import { getTokenBalance as getDirectTokenBalance } from "../lib/token-wallet";


export const sellHandler = {
  command: "sell",
  description: "Sell ERC-20 tokens for ETH",
  handler: async ({ session, wallet }: CommandContext) => {
    try {
      const userId = session.userId;
      if (!userId) {
        return { response: "❌ Please start the bot first with /start command." };
      }
      if (!wallet) {
        return { response: "❌ You don't have a wallet yet.\n\nUse /create to create a new wallet or /import to import an existing one." };
      }

      // --- START OF NEW LOGIC ---
      // 1. Get the list of tokens the user has interacted with from OUR database.
      const interactedTokenAddresses = await getUniqueTokensByUserId(userId);
      if (interactedTokenAddresses.length === 0) {
        return { response: "❌ You have no transaction history. Use /buy to purchase some tokens first." };
      }

      console.log(`[Sell] Found interacted tokens from DB:`, interactedTokenAddresses);

      // 2. For each token, get its info and REAL-TIME balance directly from the blockchain.
      const sellableTokensPromises = interactedTokenAddresses.map(async (tokenAddress) => {
        const balance = await getDirectTokenBalance(tokenAddress as Address, wallet.address as Address);
        
        // Only consider tokens with a balance > 0
        if (BigInt(balance) > 0n) {
          const tokenInfo = await getTokenInfo(tokenAddress as Address);
          if (tokenInfo) {
            return {
              ...tokenInfo,
              balance: balance,
              contract: tokenAddress, // Ensure contract property is present
            };
          }
        }
        return null;
      });

      const resolvedTokens = await Promise.all(sellableTokensPromises);
      const sellableTokens = resolvedTokens.filter(token => token !== null);
      
      console.log(`[Sell] Found sellable tokens with balance:`, sellableTokens);
      // --- END OF NEW LOGIC ---

      if (sellableTokens.length === 0) {
        return {
          response:
            "❌ You don't have any sellable ERC-20 tokens in your wallet with a balance.\n\nIf you just bought a token, please wait a moment for the blockchain to update and try again.",
        };
      }

      session.currentAction = "sell_token";
      session.tempData = {
        toToken: NATIVE_TOKEN_ADDRESS,
        toSymbol: "ETH",
        toDecimals: 18,
        walletAddress: wallet.address,
        tokens: sellableTokens, // Pass the correctly filtered list to the session
      };

      const buttons = [];
      for (let i = 0; i < Math.min(sellableTokens.length, 6); i += 2) {
        const row = [];
        if (sellableTokens[i]) {
          row.push({
            label: sellableTokens[i].symbol,
            callback: `sell_token_${sellableTokens[i].contract}`,
          });
        }
        if (sellableTokens[i + 1]) {
          row.push({
            label: sellableTokens[i + 1].symbol,
            callback: `sell_token_${sellableTokens[i + 1].contract}`,
          });
        }
        if (row.length > 0) buttons.push(row);
      }
      
      buttons.push([{ label: "Sell Custom Token", callback: "sell_token_custom"}]);

      return {
        response: "💱 Sell Tokens for ETH\n\nSelect a token from your wallet to sell:",
        buttons,
      };
    } catch (error) {
      console.error("Error in sell command:", error);
      return { response: "❌ An error occurred. Please try again later." };
    }
  },
};

// ... The rest of the `sell.ts` file remains unchanged ...
// ... The rest of the file (handleSellTokenSelection, etc.) remains unchanged.

export async function handleSellTokenSelection(
  context: CommandContext
): Promise<{
  response: string;
  buttons?: { label: string; callback: string }[][];
}> {
  const { session, args: tokenAddress } = context;
  try {
    if (tokenAddress === "custom") {
      session.currentAction = "sell_custom_token";
      return {
        response:
          "💱 Sell Custom Token\n\nPlease send the ERC-20 token address you want to sell.\n\nThe address should look like: 0x1234...5678\n\nYou can cancel this operation by typing /cancel",
      };
    }

    const tokenInfo = await getTokenInfo(tokenAddress! as Address);
    if (!tokenInfo) {
      return {
        response: "❌ Unable to get token information. Please try again.",
      };
    }

    const token = session.tempData!.tokens.find(
      (t: any) => t.contract.toLowerCase() === tokenAddress!.toLowerCase()
    );

    if (!token || BigInt(token.balance) <= BigInt(0)) {
      return { response: "❌ You don't have any balance for this token." };
    }

    session.tempData!.fromToken = tokenInfo.address;
    session.tempData!.fromSymbol = tokenInfo.symbol;
    session.tempData!.fromDecimals = tokenInfo.decimals;
    session.tempData!.tokenBalance = token.balance;
    session.currentAction = "sell_amount";

    const formattedBalance = formatUnits(
      BigInt(token.balance),
      tokenInfo.decimals
    );

    return {
      response: `💱 Sell ${tokenInfo.symbol}\n\nYou are selling ${tokenInfo.symbol} for ETH.\n\nYour ${tokenInfo.symbol} balance: ${formattedBalance}\n\nPlease enter the amount of ${tokenInfo.symbol} you want to sell (or type "max" for maximum):`,
    };
  } catch (error) {
    console.error("Error handling sell token selection:", error);
    return { response: "❌ An error occurred. Please try again." };
  }
}

export async function handleSellCustomTokenInput(
  context: CommandContext
): Promise<{
  response: string;
  buttons?: { label: string; callback: string }[][];
}> {
  const { session, args: input } = context;
  try {
    const userId = session.userId;
    if (!userId || !input) {
      return { response: "❌ Invalid request. Please try again." };
    }

    if (!isValidAddress(input)) {
      return {
        response:
          "❌ Invalid token address format. Please provide a valid Ethereum address.\n\nTry again or type /cancel to abort.",
      };
    }

    const tokenInfo = await getTokenInfo(input as Address);
    if (!tokenInfo) {
      return {
        response:
          "❌ Unable to get information for this token. It might not be a valid ERC-20 token on Base Network.\n\nPlease check the address and try again or type /cancel to abort.",
      };
    }

    const token = session.tempData!.tokens.find(
      (t: any) => t.contract.toLowerCase() === input.toLowerCase()
    );

    if (!token || BigInt(token.balance) <= BigInt(0)) {
      return {
        response: `❌ You don\'t have any ${tokenInfo.symbol} balance to sell.\n\nPlease use /buy to buy this token first or /deposit to receive it.`,
      };
    }

    session.tempData!.fromToken = tokenInfo.address;
    session.tempData!.fromSymbol = tokenInfo.symbol;
    session.tempData!.fromDecimals = tokenInfo.decimals;
    session.tempData!.tokenBalance = token.balance;
    session.currentAction = "sell_amount";

    const formattedBalance = formatUnits(
      BigInt(token.balance),
      tokenInfo.decimals
    );

    return {
      response: `💱 Sell ${tokenInfo.symbol}\n\nYou are selling ${tokenInfo.symbol} for ETH.\n\nYour ${tokenInfo.symbol} balance: ${formattedBalance}\n\nPlease enter the amount of ${tokenInfo.symbol} you want to sell (or type "max" for maximum):`,
    };
  } catch (error) {
    console.error("Error handling sell custom token input:", error);
    return { response: "❌ An error occurred. Please try again later." };
  }
}

export async function handleSellAmountInput(context: CommandContext): Promise<{
  response: string;
  buttons?: { label: string; callback: string }[][];
}> {
  const { session, wallet, args: input } = context;
  try {
    const userId = session.userId;
    if (!userId || !input) {
      return { response: "❌ Invalid request. Please try again." };
    }

    const { fromSymbol, fromDecimals, tokenBalance } = session.tempData!;
    let amountInput = input!;

    if (amountInput.toLowerCase() === "max") {
      return await handleSellAmountLogic({ session, wallet }, tokenBalance);
    }

    if (!isValidAmount(amountInput)) {
      return {
        response:
          "❌ Invalid amount format. Please enter a positive number.\n\nTry again or type /cancel to abort.",
      };
    }

    if (amountInput.startsWith(".")) {
      amountInput = "0" + amountInput;
    }

    const amountInUnits = parseUnits(amountInput, fromDecimals).toString();
    if (BigInt(amountInUnits) > BigInt(tokenBalance)) {
      const formattedBalance = formatUnits(BigInt(tokenBalance), fromDecimals);
      return {
        response: `❌ Insufficient balance. You only have ${formattedBalance} ${fromSymbol} available.\n\nPlease enter a smaller amount or type /cancel to abort.`,
      };
    }

    return await handleSellAmountLogic({ session, wallet }, amountInUnits);
  } catch (error) {
    console.error("Error handling sell amount input:", error);
    return { response: "❌ An error occurred. Please try again later." };
  }
}

async function handleSellAmountLogic(
  { session, wallet }: CommandContext,
  amountInUnits: string
): Promise<{
  response: string;
  buttons?: { label: string; callback: string }[][];
}> {
  try {
    if (!wallet) {
      return {
        response:
          "❌ Wallet not found. Please create or import a wallet first.",
      };
    }

    const {
      fromToken,
      toToken,
      fromSymbol,
      toSymbol,
      fromDecimals,
      walletAddress,
    } = session.tempData!;
    session.tempData!.fromAmount = amountInUnits;

    const gasParams = await getGasParams(
      session.settings?.gasPriority || "medium"
    );
    session.tempData!.gasPrice = gasParams.price;
    session.tempData!.maxFeePerGas = gasParams.maxFeePerGas;
    session.tempData!.maxPriorityFeePerGas = gasParams.maxPriorityFeePerGas;

    const amountInput = formatUnits(BigInt(amountInUnits), fromDecimals);
    const selectedSlippage = session.settings?.slippage.toString() || "1.0";
    const selectedGasPriority = session.settings?.gasPriority || "medium";

    const quote = await getQuote(
      fromToken,
      toToken,
      amountInput,
      session.tempData!.gasPrice
    );
    session.tempData!.toAmount = quote.data.outAmount;
    session.tempData!.estimatedGas = quote.data.estimatedGas;

    const fromAmount = amountInput;
    const toAmount = formatEthBalance(quote.data.outAmount);

    session.currentAction = "sell_confirm";
    const buttons = [
      [
        { label: "✅ Confirm", callback: "confirm_yes" },
        { label: "❌ Cancel", callback: "confirm_no" },
      ],
    ];

    return {
      response: formatTransactionDetails(
        fromSymbol,
        toSymbol,
        fromAmount,
        toAmount,
        selectedGasPriority,
        selectedSlippage
      ),
      buttons,
    };
  } catch (error) {
    console.error("Error getting sell quote:", error);
    return {
      response:
        "❌ An error occurred while getting the quote. Please try again later.",
    };
  }
}

export async function handleSellConfirmation(
  context: CommandContext,
  confirmed: boolean
): Promise<{
  response: string;
  buttons?: { label: string; callback: string }[][];
}> {
  const { session, wallet } = context;
  try {
    if (!confirmed) {
      session.currentAction = undefined;
      session.tempData = {};
      return { response: "Trade cancelled." };
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

    const {
      fromToken,
      toToken,
      fromAmount,
      fromDecimals,
      fromSymbol,
      walletAddress,
      gasPrice,
    } = session.tempData!;
    const slippage = session.settings?.slippage.toString() || "1.0";
    const formattedFromAmount = formatUnits(BigInt(fromAmount), fromDecimals);

    const swap = await getSwap(
      fromToken,
      toToken,
      formattedFromAmount,
      gasPrice,
      slippage,
      walletAddress
    );

    if (fromToken.toLowerCase() !== NATIVE_TOKEN_ADDRESS.toLowerCase()) {
      const allowance = await getTokenAllowance(
        fromToken as Address,
        wallet.address as Address,
        swap.data.to as Address
      );
      if (BigInt(allowance) < BigInt(swap.data.inAmount)) {
        const receipt = await executeContractMethod({
          walletData: wallet,
          contractAddress: fromToken as Address,
          abi: erc20Abi,
          functionName: "approve",
          args: [swap.data.to, MAX_UINT256],
        });

        if (receipt.status !== "success") {
          return {
            response: `❌ Approval Failed\n\nUnable to approve token spending.\nView on Block Explorer: https://basescan.org/tx/${receipt.transactionHash}`,
          };
        }

        const newAllowance = await getTokenAllowance(
          fromToken as Address,
          wallet.address as Address,
          swap.data.to as Address
        );
        if (BigInt(newAllowance) < BigInt(fromAmount)) {
          return {
            response: "❌ Token approval failed. Please try again later.",
          };
        }
      }
    }

    const receipt = await executeTransaction(wallet, {
      to: swap.data.to,
      data: swap.data.data,
      value: swap.data.value,
      gasPrice: swap.data.gasPrice,
    });

    saveTransaction(
      receipt.transactionHash,
      userId,
      wallet.address,
      fromToken,
      toToken,
      fromAmount,
      receipt.status,
      session.tempData!.toAmount,
      receipt.gasUsed
    );

    if (receipt.status === "success") {
      return {
        response: `✅ Transaction Successful\n\nYou sold ${formatUnits(
          BigInt(fromAmount),
          fromDecimals
        )} ${fromSymbol}\nYou received ${formatEthBalance(
          session.tempData!.toAmount
        )} ETH\nPrice impact: ${
          swap.data.price_impact
        }\nView on Block Explorer: https://basescan.org/tx/${
          receipt.transactionHash
        }`,
      };
    } else {
      return {
        response: `❌ Transaction Failed\n\nView on Block Explorer: https://basescan.org/tx/${receipt.transactionHash}`,
      };
    }
  } catch (error) {
    console.error("Error processing sell confirmation:", error);
    session.currentAction = undefined;
    session.tempData = {};
    return {
      response:
        "❌ An error occurred while processing your trade. Please try again later.",
    };
  }
}
