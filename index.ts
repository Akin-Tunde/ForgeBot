import express, { Request, Response, NextFunction } from "express";
import session from "express-session";
import dotenv from "dotenv";
import { initDatabase, closeDatabase } from "./src/lib/database";
import { verifyEncryptionKey } from "./src/lib/encryption";
import { CommandContext, SessionData } from "./src/types/commands";
import { verifyFarcasterSignature } from "./src/lib/farcaster";
import { getWallet } from "./src/lib/token-wallet"; // Import getWallet

// Extend express-session to include SessionData
declare module "express-session" {
  interface SessionData {
    userId: string;
    currentAction?: string;
    tempData: Record<string, any>;
    settings: { slippage: number; gasPriority: string };
    walletAddress?: string;
  }
}

// Import commands
import { startHandler, helpHandler } from "./src/commands/start-help";
import { walletHandler, createHandler } from "./src/commands/wallet";
import {
  importHandler,
  exportHandler,
  handlePrivateKeyInput,
  handleExportConfirmation,
} from "./src/commands/import-export";
import {
  balanceHandler,
  historyHandler,
  handleTimeframeChange,
} from "./src/commands/balance-history";
import {
  buyHandler,
  handleTokenSelection,
  handleCustomTokenInput,
  handleBuyAmountInput,
  handleBuyConfirmation,
} from "./src/commands/buy";
import {
  sellHandler,
  handleSellTokenSelection,
  handleSellCustomTokenInput,
  handleSellAmountInput,
  handleSellConfirmation,
} from "./src/commands/sell";
import {
  settingsHandler,
  handleSettingsOption,
  updateSlippage,
  updateGasPriority,
} from "./src/commands/settings";
import { depositHandler } from "./src/commands/deposit";
import {
  withdrawHandler,
  handleWithdrawAddress,
  handleWithdrawAmount,
  handleWithdrawConfirmation,
} from "./src/commands/withdraw";

// Load environment variables
dotenv.config();

// Initialize database
initDatabase();

// Verify encryption key
if (!verifyEncryptionKey()) {
  console.error(
    "⛔ ERROR: Wallet encryption key is not properly configured. Set a 32-character WALLET_ENCRYPTION_KEY in your .env file."
  );
  process.exit(1);
}

// Verify session secret
if (!process.env.SESSION_SECRET) {
  console.error("⛔ ERROR: SESSION_SECRET is not set in .env file.");
  process.exit(1);
}

// Create Express app
const app = express();

// Middleware
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === "production" },
  })
);

// Farcaster authentication middleware
const authenticateFarcaster = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { user } = req.body;
  if (user?.nonce && user?.signature && user?.message) {
    const isValid = await verifyFarcasterSignature(req);
    if (!isValid) {
      res.status(401).json({ response: "❌ Farcaster authentication failed." });
      return;
    }
  }
  next();
};

// Initialize session data
const ensureSessionData = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.session.userId) {
    req.session.userId = `guest_${Date.now()}`; // Fallback guest ID
    req.session.currentAction = undefined;
    req.session.tempData = {};
    req.session.settings = { slippage: 1.0, gasPriority: "medium" };
  }
  next();
};

// API Routes
app.post(
  "/api/start",
  authenticateFarcaster,
  ensureSessionData,
  async (req: Request, res: Response): Promise<void> => {
    const result = await startHandler.handler({
      session: req.session as SessionData,
    });
    res.json(result);
    return;
  }
);

app.post("/api/help", async (_req: Request, res: Response): Promise<void> => {
  const result = await helpHandler.handler();
  res.json(result);
  return;
});

app.post(
  "/api/wallet",
  authenticateFarcaster,
  ensureSessionData,
  async (req: Request, res: Response): Promise<void> => {
    const result = await walletHandler.handler({
      session: req.session as SessionData,
    });
    res.json(result);
    return;
  }
);

app.post(
  "/api/create",
  authenticateFarcaster,
  ensureSessionData,
  async (req: Request, res: Response): Promise<void> => {
    const result = await createHandler.handler({
      session: req.session as SessionData,
    });
    res.json(result);
    return;
  }
);

app.post(
  "/api/import",
  authenticateFarcaster,
  ensureSessionData,
  async (req: Request, res: Response): Promise<void> => {
    const { args, callback } = req.body;
    const wallet = req.session.userId
      ? (await getWallet(req.session.userId)) || undefined
      : undefined;
    let result;
    if (callback === "confirm_import_wallet") {
      req.session.walletAddress = undefined;
      result = await importHandler.handler({
        session: req.session as SessionData,
        wallet, // Pass wallet, though importHandler itself might not use it directly for this path
      });
    } else if (req.session.currentAction === "import_wallet") {
      result = await handlePrivateKeyInput({
        session: req.session as SessionData,
        args,
      });
    } else {
      result = await importHandler.handler({
        session: req.session as SessionData,
        wallet,
      });
    }
    res.json(result);
    return;
  }
);

app.post(
  "/api/export",
  authenticateFarcaster,
  ensureSessionData,
  async (req: Request, res: Response): Promise<void> => {
    const { callback } = req.body;
    const wallet = req.session.userId
      ? (await getWallet(req.session.userId)) || undefined
      : undefined;
    let result;
    if (callback === "confirm_yes" || callback === "confirm_no") {
      result = await handleExportConfirmation(
        { session: req.session as SessionData, wallet },
        callback === "confirm_yes"
      );
    } else {
      result = await exportHandler.handler({
        session: req.session as SessionData,
        wallet,
      });
    }
    res.json(result);
    return;
  }
);

app.post(
  "/api/balance",
  authenticateFarcaster,
  ensureSessionData,
  async (req: Request, res: Response): Promise<void> => {
    const result = await balanceHandler.handler({
      session: req.session as SessionData,
      wallet: req.session.userId
        ? (await getWallet(req.session.userId)) || undefined
        : undefined,
    });
    res.json(result);
    return;
  }
);

app.post(
  "/api/history",
  authenticateFarcaster,
  ensureSessionData,
  async (req: Request, res: Response): Promise<void> => {
    const { callback } = req.body;
    const wallet = req.session.userId
      ? (await getWallet(req.session.userId)) || undefined
      : undefined;
    let result;
    if (callback?.startsWith("history_")) {
      const timeframe = callback.replace("history_", "") as
        | "day"
        | "week"
        | "month";
      result = await handleTimeframeChange({
        session: req.session as SessionData,
        wallet,
        args: timeframe,
      });
    } else {
      result = await historyHandler.handler({
        session: req.session as SessionData,
        wallet,
      });
    }
    res.json(result);
    return;
  }
);

app.post(
  "/api/buy",
  authenticateFarcaster,
  ensureSessionData,
  async (req: Request, res: Response): Promise<void> => {
    const { args, callback } = req.body;
    const wallet = req.session.userId
      ? (await getWallet(req.session.userId)) || undefined
      : undefined;
    let result;
    if (callback?.startsWith("token_")) {
      const tokenSymbol = callback.replace("token_", "");
      result = await handleTokenSelection({
        session: req.session as SessionData,
        wallet,
        args: tokenSymbol,
      });
    } else if (req.session.currentAction === "buy_custom_token") {
      result = await handleCustomTokenInput({
        session: req.session as SessionData,
        wallet,
        args,
      });
    } else if (req.session.currentAction === "buy_amount") {
      result = await handleBuyAmountInput({
        session: req.session as SessionData,
        wallet,
        args,
      });
    } else if (callback === "confirm_yes" || callback === "confirm_no") {
      result = await handleBuyConfirmation(
        { session: req.session as SessionData, wallet },
        callback === "confirm_yes"
      );
    } else {
      result = await buyHandler.handler({
        session: req.session as SessionData,
        wallet,
      });
    }
    res.json(result);
    return;
  }
);

app.post(
  "/api/sell",
  authenticateFarcaster,
  ensureSessionData,
  async (req: Request, res: Response): Promise<void> => {
    const { args, callback } = req.body;
    const wallet = req.session.userId
      ? (await getWallet(req.session.userId)) || undefined
      : undefined;
    let result;
    if (callback?.startsWith("sell_token_")) {
      const tokenAddress = callback.replace("sell_token_", "");
      result = await handleSellTokenSelection({
        session: req.session as SessionData,
        wallet,
        args: tokenAddress,
      });
    } else if (req.session.currentAction === "sell_custom_token") {
      result = await handleSellCustomTokenInput({
        session: req.session as SessionData,
        wallet,
        args,
      });
    } else if (req.session.currentAction === "sell_amount") {
      result = await handleSellAmountInput({
        session: req.session as SessionData,
        wallet,
        args,
      });
    } else if (callback === "confirm_yes" || callback === "confirm_no") {
      result = await handleSellConfirmation(
        { session: req.session as SessionData, wallet },
        callback === "confirm_yes"
      );
    } else {
      result = await sellHandler.handler({
        session: req.session as SessionData,
        wallet,
      });
    }
    res.json(result);
    return;
  }
);

app.post(
  "/api/settings",
  authenticateFarcaster,
  ensureSessionData,
  async (req: Request, res: Response): Promise<void> => {
    const { callback } = req.body;
    // Settings handlers typically don't need the wallet object directly, they operate on session.settings
    let result;
    if (callback?.startsWith("settings_")) {
      const option = callback.replace("settings_", "") as
        | "slippage"
        | "gasPriority";
      result = await handleSettingsOption(
        { session: req.session as SessionData },
        option
      );
    } else if (callback?.startsWith("slippage_")) {
      const slippage = parseFloat(callback.replace("slippage_", ""));
      result = await updateSlippage(
        { session: req.session as SessionData },
        slippage
      );
    } else if (callback?.startsWith("gas_")) {
      const priority = callback.replace("gas_", "") as
        | "low"
        | "medium"
        | "high";
      result = await updateGasPriority(
        { session: req.session as SessionData },
        priority
      );
    } else if (callback === "back") {
      result = {
        response:
          "🤖 Base MEV-Protected Trading Bot\n\nWhat would you like to do?",
        buttons: [
          [
            { label: "💰 Balance", callback: "check_balance" },
            { label: "📊 History", callback: "check_history" },
          ],
          [
            { label: "💱 Buy Token", callback: "buy_token" },
            { label: "💱 Sell Token", callback: "sell_token" },
          ],
          [{ label: "⚙️ Settings", callback: "open_settings" }],
        ],
      };
    } else {
      result = await settingsHandler.handler({
        session: req.session as SessionData,
      });
    }
    res.json(result);
    return;
  }
);

app.post(
  "/api/deposit",
  authenticateFarcaster,
  ensureSessionData,
  async (req: Request, res: Response): Promise<void> => {
    const result = await depositHandler.handler({
      // depositHandler might need wallet to display address
      session: req.session as SessionData,
      wallet: req.session.userId
        ? (await getWallet(req.session.userId)) || undefined
        : undefined,
    });
    res.json(result);
    return;
  }
);

app.post(
  "/api/withdraw",
  authenticateFarcaster,
  ensureSessionData,
  async (req: Request, res: Response): Promise<void> => {
    const { args, callback } = req.body;
    const wallet = req.session.userId
      ? (await getWallet(req.session.userId)) || undefined
      : undefined;
    let result;
    if (callback?.startsWith("withdraw_confirm_")) {
      result = await handleWithdrawConfirmation(
        { session: req.session as SessionData, wallet },
        callback === "withdraw_confirm_true"
      );
    } else if (req.session.currentAction === "withdraw_amount") {
      result = await handleWithdrawAmount({
        session: req.session as SessionData,
        wallet,
        args,
      });
    } else if (req.session.currentAction === "withdraw_address") {
      result = await handleWithdrawAddress({
        session: req.session as SessionData,
        wallet,
        args,
      });
    } else {
      result = await withdrawHandler.handler({
        session: req.session as SessionData,
        wallet,
      });
    }
    res.json(result);
    return;
  }
);

app.post(
  "/api/cancel",
  authenticateFarcaster,
  ensureSessionData,
  async (req: Request, res: Response): Promise<void> => {
    if (req.session.currentAction) {
      req.session.currentAction = undefined;
      req.session.tempData = {};
      res.json({ response: "✅ Operation cancelled." });
      return;
    } else {
      res.json({ response: "There is no active operation to cancel." });
      return;
    }
  }
);

// Handle text inputs for workflows
app.post(
  "/api/input",
  authenticateFarcaster,
  ensureSessionData,
  async (req: Request, res: Response): Promise<void> => {
    const { args } = req.body;
    const wallet = req.session.userId
      ? (await getWallet(req.session.userId)) || undefined
      : undefined;
    let result;
    switch (req.session.currentAction) {
      case "import_wallet":
        result = await handlePrivateKeyInput({
          session: req.session as SessionData,
          wallet, // Though likely not used by this specific handler
          args,
        });
        break;
      case "buy_custom_token":
        result = await handleCustomTokenInput({
          session: req.session as SessionData,
          wallet,
          args,
        });
        break;
      case "buy_amount":
        result = await handleBuyAmountInput({
          session: req.session as SessionData,
          wallet,
          args,
        });
        break;
      case "sell_custom_token":
        result = await handleSellCustomTokenInput({
          session: req.session as SessionData,
          wallet,
          args,
        });
        break;
      case "sell_amount":
        result = await handleSellAmountInput({
          session: req.session as SessionData,
          wallet,
          args,
        });
        break;
      case "withdraw_address":
        result = await handleWithdrawAddress({
          session: req.session as SessionData,
          wallet,
          args,
        });
        break;
      case "withdraw_amount":
        result = await handleWithdrawAmount({
          session: req.session as SessionData,
          wallet,
          args,
        });
        break;
      default:
        result = {
          response:
            "🤖 Hello! Here are some things you can do:\n\n" +
            "/wallet - View your wallet\n" +
            "/balance - Check your balances\n" +
            "/buy - Buy tokens with ETH\n" +
            "/sell - Sell tokens for ETH\n" +
            "/deposit - Get your deposit address\n" +
            "/withdraw - Withdraw ETH to another address\n" +
            "/settings - Change trading settings\n" +
            "/help - Show this help message",
          buttons: [
            [
              { label: "💰 Balance", callback: "check_balance" },
              { label: "💱 Buy/Sell", callback: "buy_token" },
            ],
            [
              { label: "📥 Deposit", callback: "deposit" },
              { label: "📤 Withdraw", callback: "withdraw" },
            ],
          ],
        };
    }
    res.json(result);
    return;
  }
);

// Callback query handler
app.post(
  "/api/callback",
  authenticateFarcaster,
  ensureSessionData,
  async (req: Request, res: Response): Promise<void> => {
    const { callback } = req.body;
    const wallet = req.session.userId
      ? (await getWallet(req.session.userId)) || undefined
      : undefined;
    let result;
    if (callback === "check_balance") {
      result = await balanceHandler.handler({
        session: req.session as SessionData,
        wallet,
      });
    } else if (callback === "check_history") {
      result = await historyHandler.handler({
        session: req.session as SessionData,
        wallet,
      });
    } else if (callback === "buy_token") {
      result = await buyHandler.handler({
        session: req.session as SessionData,
        wallet,
      });
    } else if (callback === "sell_token") {
      result = await sellHandler.handler({
        session: req.session as SessionData,
        wallet,
      });
    } else if (callback === "open_settings") {
      result = await settingsHandler.handler({
        session: req.session as SessionData,
        // wallet not typically needed for settings main view
      });
    } else if (callback === "deposit") {
      result = await depositHandler.handler({
        session: req.session as SessionData,
        wallet,
      });
    } else if (callback === "withdraw") {
      result = await withdrawHandler.handler({
        session: req.session as SessionData,
        wallet,
      });
    } else if (callback === "help") {
      result = await helpHandler.handler(); // No context needed
    } else if (callback === "export_key") {
      result = await exportHandler.handler({
        session: req.session as SessionData,
        wallet,
      });
    } else if (callback === "create_wallet") {
      result = await createHandler.handler({
        session: req.session as SessionData,
        // wallet might be checked to see if one exists
      });
    } else if (callback === "import_wallet") {
      result = await importHandler.handler({
        session: req.session as SessionData,
        wallet, // To check if one already exists
      });
    } else if (callback === "confirm_create_wallet") {
      req.session.walletAddress = undefined;
      result = await createHandler.handler({
        session: req.session as SessionData,
      });
    } else if (callback === "cancel_create_wallet") {
      result = {
        response:
          "Operation cancelled. Your existing wallet remains unchanged.",
      };
    } else if (callback === "confirm_import_wallet") {
      req.session.walletAddress = undefined;
      result = await importHandler.handler({
        session: req.session as SessionData,
      });
    } else if (callback === "cancel_import_wallet") {
      result = {
        response:
          "Operation cancelled. Your existing wallet remains unchanged.",
      };
    } else {
      result = { response: "❌ Unknown command." };
    }
    res.json(result);
    return;
  }
);

// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🤖 Base MEV-Protected Trading Bot running on port ${PORT}`);
  console.log(`ℹ️ API available at http://localhost:${PORT}`);
  console.log(`ℹ️ Frontend: https://forge-bot.vercel.app`);
});

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("🛑 Stopping server...");
  server.close(() => {
    closeDatabase();
    console.log("👋 Server stopped. Goodbye!");
    process.exit(0);
  });
});
