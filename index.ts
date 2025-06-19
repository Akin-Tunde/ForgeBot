import express, { Request, Response, NextFunction } from "express";
import session from "express-session";
import dotenv from "dotenv";
import cors from "cors";

import { initDatabase, closeDatabase } from "./src/lib/database";
import { verifyEncryptionKey } from "./src/lib/encryption";
import { CommandContext, SessionData } from "./src/types/commands";
import { verifyFarcasterSignature } from "./src/lib/farcaster";
import { getWallet } from "./src/lib/token-wallet"; // Import getWallet

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
import { isValidAddress } from "./src/utils/validators";

// Extend express-session to include SessionData
declare module "express-session" {
  interface SessionData {
    userId: string;
    currentAction?: string;
    tempData: Record<string, any>;
    settings: { slippage: number; gasPriority: string };
    walletAddress?: string;
    fid?: string;
    username?: string; // Added
    displayName?: string; // Added
  }
}

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

// ✅ Create Express app
const app = express();

// ✅ Use CORS middleware BEFORE anything else
app.use(
  cors({
    origin: [
      "https://mini-testf.netlify.app",
      "http://localhost:3000",
      "http://localhost:5173", // Add this if your frontend runs on port 5173
    ],
    credentials: true,
  })
);

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
app.get("/", (req, res) => {
  res.send("🔧 ForgeBot backend is running.");
});

// Farcaster authentication middleware

const authenticateFarcaster = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const fid = req.body.fid;
  const username = req.body.username;
  const displayName = req.body.displayName;
  console.log("authenticateFarcaster: fid =", fid);
  console.log("authenticateFarcaster: username =", username);
  console.log("authenticateFarcaster: displayName =", displayName);

  if (!fid) {
    console.log(
      "authenticateFarcaster: No FID provided, skipping authentication"
    );
    return next(); // Proceed without setting session data
  }

  // Set session data
  req.session.userId = fid.toString();
  req.session.fid = fid.toString();
  req.session.username = username || undefined; // Store undefined if not provided
  req.session.displayName = displayName || undefined;
  console.log(
    "authenticateFarcaster: Set session.userId =",
    req.session.userId
  );
  console.log("authenticateFarcaster: Set session.fid =", req.session.fid);
  console.log(
    "authenticateFarcaster: Set session.username =",
    req.session.username
  );
  console.log(
    "authenticateFarcaster: Set session.displayName =",
    req.session.displayName
  );

  // Explicitly save the session
  req.session.save((err) => {
    if (err) {
      console.error("Error saving session:", err);
      return res.status(500).send("Failed to save session");
    }
    next();
  });
};
// Initialize session data middleware
const ensureSessionData = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.log(
    "ensureSessionData: req.session.userId =",
    req.session.userId,
    "req.body.fid =",
    req.body.fid
  );
  if (!req.session.userId && !req.body.fid) {
    req.session.userId = `guest_${Date.now()}`;
    console.log("ensureSessionData: Set guest userId =", req.session.userId);
  }
  if (!req.session.currentAction) {
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
  const result = await helpHandler.handler(); // TS2554
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
        if (isValidAddress(args)) {
          req.session.currentAction = "buy_custom_token"; // Prompt for buy flow
          result = await handleCustomTokenInput({
            session: req.session as SessionData,
            wallet,
            args,
          });
        } else {
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
    }
    res.json(result);
    return;
  }
);

// index.ts (partial)

app.post(
  "/api/chat/command",
  authenticateFarcaster,
  ensureSessionData,
  async (req: Request, res: Response): Promise<void> => {
    const { command, fid } = req.body;
    let result;

    console.log(`Received command: ${command}, FID: ${fid}`);
    console.log("Session userId:", req.session.userId);

    switch (command) {
      case "/start":
        result = await startHandler.handler({
          session: req.session as SessionData,
        });
        break;
      case "/balance":
        result = await balanceHandler.handler({
          session: req.session as SessionData,
          wallet: req.session.userId
            ? (await getWallet(req.session.userId)) || undefined
            : undefined,
        });
        break;
      case "/buy":
        result = await buyHandler.handler({
          session: req.session as SessionData,
          wallet: req.session.userId
            ? (await getWallet(req.session.userId)) || undefined
            : undefined,
        });
        break;
      case "/sell":
        result = await sellHandler.handler({
          session: req.session as SessionData,
          wallet: req.session.userId
            ? (await getWallet(req.session.userId)) || undefined
            : undefined,
        });
        break;
      case "/deposit":
        result = await depositHandler.handler({
          session: req.session as SessionData,
          wallet: req.session.userId
            ? (await getWallet(req.session.userId)) || undefined
            : undefined,
        });
        break;
      case "/withdraw":
        result = await withdrawHandler.handler({
          session: req.session as SessionData,
          wallet: req.session.userId
            ? (await getWallet(req.session.userId)) || undefined
            : undefined,
        });
        break;
      case "/wallet":
        result = await walletHandler.handler({
          session: req.session as SessionData,
        });
        break;
      case "/settings":
        result = await settingsHandler.handler({
          session: req.session as SessionData,
        });
        break;
      case "/help":
        result = await helpHandler.handler();
        break;
      case "/create":
        result = await createHandler.handler({
          session: req.session as SessionData,
        });
        break;
      case "/import":
        result = await importHandler.handler({
          session: req.session as SessionData,
          wallet: req.session.userId
            ? (await getWallet(req.session.userId)) || undefined
            : undefined,
        });
        break;
      case "/export":
        result = await exportHandler.handler({
          session: req.session as SessionData,
          wallet: req.session.userId
            ? (await getWallet(req.session.userId)) || undefined
            : undefined,
        });
        break;
      case "/cancel":
        (req.session as SessionData).currentAction = undefined;
        result = { response: "Operation cancelled." };
        break;
      default:
        result = { response: `Unknown command: ${command}. Please try /help.` };
        break;
    }
    res.json(result);
    return;
  }
);

// index.ts (updated /api/callback)

// index.ts (updated /api/callback)

app.post(
  "/api/callback",
  authenticateFarcaster,
  ensureSessionData,
  async (req: Request, res: Response): Promise<void> => {
    const { callback, args } = req.body;
    const session = req.session as SessionData;
    const wallet = session.userId
      ? (await getWallet(session.userId)) || undefined
      : undefined;
    let result;

    console.log(`Received callback: ${callback}, args: ${args}, currentAction: ${session.currentAction}, userId: ${session.userId}, walletAddress: ${session.walletAddress}, sessionId: ${req.sessionID}`);

    if (callback === "import_wallet" && args) {
      console.log("Processing private key input with args:", args);
      if (session.currentAction !== "import_wallet") {
        console.warn("currentAction was undefined or incorrect, setting to import_wallet");
        session.currentAction = "import_wallet";
      }
      result = await handlePrivateKeyInput({
        session,
        args,
        wallet,
      });
    } else if (session.currentAction === "import_wallet" && args) {
      console.log("Processing private key input (legacy condition):", args);
      result = await handlePrivateKeyInput({
        session,
        args,
        wallet,
      });
    } else if (callback === "check_balance") {
      console.log("Handling check_balance callback");
      result = await balanceHandler.handler({ session, wallet });
    } else if (callback === "check_history") {
      console.log("Handling check_history callback");
      result = await historyHandler.handler({ session, wallet });
    } else if (callback === "buy_token") {
      console.log("Handling buy_token callback");
      result = await buyHandler.handler({ session, wallet });
    } else if (callback === "sell_token") {
      console.log("Handling sell_token callback");
      result = await sellHandler.handler({ session, wallet });
    } else if (callback === "open_settings") {
      console.log("Handling open_settings callback");
      result = await settingsHandler.handler({ session });
    } else if (callback === "help") {
      console.log("Handling help callback");
      result = await helpHandler.handler();
    } else if (callback === "import_wallet") {
      console.log("Triggering importHandler for import_wallet callback");
      result = await importHandler.handler({ session, wallet });
    } else if (callback === "confirm_import_wallet") {
      session.walletAddress = undefined;
      console.log("Confirming import wallet, clearing walletAddress");
      result = await importHandler.handler({ session, wallet });
    } else if (callback === "export_key") {
      result = await exportHandler.handler({ session, wallet });
    } else if (callback === "cancel_import_wallet") {
      session.currentAction = undefined;
      result = {
        response: "Operation cancelled. Your existing wallet remains unchanged.",
      };
    } else {
      console.log("Unknown callback received:", callback);
      result = { response: "❌ Unknown callback." };
    }

    req.session.save((err) => {
      if (err) console.error("Error saving session:", err);
    });

    res.json(result);
    return;
  }
);
// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🤖 Base MEV-Protected Trading Bot running on port ${PORT}`);
  console.log(`ℹ️ API available at http://localhost:${PORT}`);
  console.log(`ℹ️ Frontend: http://localhost:5173/`);
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
