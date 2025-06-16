import { CommandContext } from "../types/commands";
import {
  getTokenInfo,
  getTokenAddressFromSymbol,
  getWallet,
  getEthBalance,
  executeTransaction,
} from "../lib/token-wallet";
import { getQuote, getSwap, getGasParams } from "../lib/swap";
import {
  formatEthBalance,
  formatTransactionDetails,
} from "../utils/formatters";
import { isValidAddress, isValidAmount } from "../utils/validators";
import { saveTransaction } from "../lib/database";
import { NATIVE_TOKEN_ADDRESS } from "../utils/constants";
import { parseEther, formatUnits, Address } from "viem";
import { WalletData } from "../types/wallet";

export const buyHandler = {
  command: "buy",
  description: "Buy ERC-20 tokens with ETH",
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
            "❌ You don't have a wallet yet.\n\nUse /create to create a new wallet or /import to import an existing one.",
        };
      }

      const balance = await getEthBalance(wallet.address as `0x${string}`);
      if (BigInt(balance) <= BigInt(0)) {
        return {
          response:
            "❌ Your wallet has no ETH balance to buy tokens.\n\nUse /deposit to get your deposit address and add ETH first.",
        };
      }

      session.currentAction = "buy_token";
      session.tempData = {
        fromToken: NATIVE_TOKEN_ADDRESS,
        fromSymbol: "ETH",
        fromDecimals: 18,
        walletAddress: wallet.address,
        balance,
      };

      const buttons = [
        [
          { label: "USDC", callback: "USDC" },
          { label: "DAI", callback: "DAI" },
          { label: "WBTC", callback: "WBTC" },
        ],
        [{ label: "Custom Token", callback: "custom" }],
      ];

      return {
        response:
          `💱 Buy Tokens with ETH\n\nYour ETH balance: ${formatEthBalance(
            balance
          )} ETH\n\nSelect a token to buy or choose "Custom Token" to enter a specific token address:`.replace(
            /`/g,
            ""
          ),
        buttons,
      };
    } catch (error) {
      console.error("Error in buy command:", error);
      return { response: "❌ An error occurred. Please try again later." };
    }
  },
};

export async function handleTokenSelection(context: CommandContext): Promise<{
  response: string;
  buttons?: { label: string; callback: string }[][];
}> {
  const { session, args: tokenSymbol } = context;
  try {
    if (tokenSymbol === "custom") {
      session.currentAction = "buy_custom_token";
      return {
        response:
          `💱 Buy Custom Token\n\nPlease send the ERC-20 token address you want to buy.\n\nThe address should look like: 0x1234...5678\n\nYou can cancel this operation by typing /cancel`.replace(
            /`/g,
            ""
          ),
      };
    }

    const tokenAddress = getTokenAddressFromSymbol(tokenSymbol!);
    if (!tokenAddress) {
      return { response: "❌ Token symbol not recognized." };
    }

    const tokenInfo = await getTokenInfo(tokenAddress);
    if (!tokenInfo) {
      return {
        response: "❌ Unable to get token information. Please try again.",
      };
    }

    session.tempData!.toToken = tokenInfo.address;
    session.tempData!.toSymbol = tokenInfo.symbol;
    session.tempData!.toDecimals = tokenInfo.decimals;
    session.currentAction = "buy_amount";

    return {
      response: `💱 Buy ${tokenInfo.symbol}\n\nYou are buying ${
        tokenInfo.symbol
      } with ETH.\n\nYour ETH balance: ${formatEthBalance(
        session.tempData!.balance
      )} ETH\n\nPlease enter the amount of ETH you want to spend:`.replace(
        /`/g,
        ""
      ),
    };
  } catch (error) {
    console.error("Error handling token selection:", error);
    return { response: "❌ An error occurred. Please try again." };
  }
}

export async function handleCustomTokenInput(context: CommandContext): Promise<{
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

    session.tempData!.toToken = tokenInfo.address;
    session.tempData!.toSymbol = tokenInfo.symbol;
    session.tempData!.toDecimals = tokenInfo.decimals;
    session.currentAction = "buy_amount";

    return {
      response: `💱 Buy ${tokenInfo.symbol}\n\nYou are buying ${
        tokenInfo.symbol
      } with ETH.\n\nYour ETH balance: ${formatEthBalance(
        session.tempData!.balance
      )} ETH\n\nPlease enter the amount of ETH you want to spend:`.replace(
        /`/g,
        ""
      ),
    };
  } catch (error) {
    console.error("Error handling custom token input:", error);
    return { response: "❌ An error occurred. Please try again later." };
  }
}

export async function handleBuyAmountInput(context: CommandContext): Promise<{
  response: string;
  buttons?: { label: string; callback: string }[][];
}> {
  const { session, args: input } = context;
  try {
    const userId = session.userId;
    if (!userId || !input) {
      return { response: "❌ Invalid request. Please try again." };
    }

    if (!isValidAmount(input)) {
      return {
        response:
          "❌ Invalid amount format. Please enter a positive number.\n\nTry again or type /cancel to abort.",
      };
    }

    let amountInput = input!;
    if (amountInput.startsWith(".")) {
      amountInput = "0" + amountInput;
    }

    const amount = parseFloat(amountInput);
    const balance = session.tempData!.balance;
    if (amount > parseFloat(formatEthBalance(balance))) {
      return {
        response: `❌ Insufficient balance. You only have ${formatEthBalance(
          balance
        )} ETH available.\n\nPlease enter a smaller amount or type /cancel to abort.`,
      };
    }

    const amountWei = parseEther(amountInput).toString();
    session.tempData!.fromAmount = amountWei;

    const gasParams = await getGasParams(
      session.settings?.gasPriority || "medium"
    );
    session.tempData!.gasPrice = gasParams.price;
    session.tempData!.maxFeePerGas = gasParams.maxFeePerGas;
    session.tempData!.maxPriorityFeePerGas = gasParams.maxPriorityFeePerGas;

    const selectedSlippage = session.settings?.slippage.toString() || "1.0";
    const selectedGasPriority = session.settings?.gasPriority || "medium";

    const quote = await getQuote(
      session.tempData!.fromToken,
      session.tempData!.toToken,
      amountInput,
      session.tempData!.gasPrice
    );

    session.tempData!.toAmount = quote.data.outAmount;
    session.tempData!.estimatedGas = quote.data.estimatedGas;

    const fromAmount = formatEthBalance(amountWei);
    const toAmount = formatUnits(
      BigInt(quote.data.outAmount),
      session.tempData!.toDecimals
    );

    session.currentAction = "buy_confirm";

    const buttons = [
      [
        { label: "✅ Confirm", callback: "confirm_yes" },
        { label: "❌ Cancel", callback: "confirm_no" },
      ],
    ];

    return {
      response: formatTransactionDetails(
        session.tempData!.fromSymbol,
        session.tempData!.toSymbol,
        fromAmount,
        toAmount,
        selectedGasPriority,
        selectedSlippage
      ).replace(/`/g, ""),
      buttons,
    };
  } catch (error) {
    console.error("Error handling buy amount input:", error);
    return { response: "❌ An error occurred. Please try again later." };
  }
}

export async function handleBuyConfirmation(
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

    session.currentAction = undefined;
    session.tempData = {};

    if (receipt.status === "success") {
      return {
        response: `✅ Transaction Successful\n\nYou bought ${formatUnits(
          session.tempData!.toAmount,
          session.tempData!.toDecimals
        )} ${session.tempData!.toSymbol}\nPrice impact: ${
          swap.data.price_impact
        }\nView on Block Explorer: https://basescan.org/tx/${
          receipt.transactionHash
        }`.replace(/`/g, ""),
      };
    } else {
      return {
        response:
          `❌ Transaction Failed\n\nView on Block Explorer: https://basescan.org/tx/${receipt.transactionHash}`.replace(
            /`/g,
            ""
          ),
      };
    }
  } catch (error) {
    console.error("Error processing buy confirmation:", error);
    session.currentAction = undefined;
    session.tempData = {};
    return {
      response:
        "❌ An error occurred while processing your trade. Please try again later.",
    };
  }
}
