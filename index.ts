//index.ts 

import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import cors from "cors";

import { initDatabase, closeDatabase, getUserSettings } from "./src/lib/database";
import { verifyEncryptionKey } from "./src/lib/encryption";
import { getWallet } from "./src/lib/token-wallet";
import { BotState } from "./src/types/commands";

// Import all command handlers
import { startHandler, helpHandler } from "./src/commands/start-help";
import { walletHandler, createHandler } from "./src/commands/wallet";
import { importHandler, exportHandler, handlePrivateKeyInput, handleExportConfirmation } from "./src/commands/import-export";
import { balanceHandler, historyHandler, handleTimeframeChange } from "./src/commands/balance-history";
import { buyHandler, handleTokenSelection, handleCustomTokenInput, handleBuyAmountInput, handleBuyConfirmation } from "./src/commands/buy";
import { sellHandler, handleSellTokenSelection, handleSellCustomTokenInput, handleSellAmountInput, handleSellConfirmation } from "./src/commands/sell";
import { settingsHandler, handleSettingsOption, updateSlippage, updateGasPriority } from "./src/commands/settings";
import { depositHandler } from "./src/commands/deposit";
import { withdrawHandler, handleWithdrawAddress, handleWithdrawAmount, handleWithdrawConfirmation } from "./src/commands/withdraw";

dotenv.config();
initDatabase();

if (!verifyEncryptionKey()) {
    console.error("⛔ ERROR: Wallet encryption key is not properly configured.");
    process.exit(1);
}

const app = express();
app.set('trust proxy', 1);

app.use(cors({
    origin: ["https://mini-testf.netlify.app", "http://localhost:3000", "http://localhost:5173"],
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json());

const loadStateMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const { fid, currentAction, tempData, settings, username, displayName } = req.body;

    if (!fid) {
        res.status(401).json({ response: "User FID is missing from request." });
        return;
    }

    (req as any).state = {
        userId: fid.toString(),
        fid: fid.toString(),
        username,
        displayName,
        currentAction: currentAction || undefined,
        tempData: tempData || {},
        settings: settings || (await getUserSettings(fid.toString())) || { slippage: 1.0, gasPriority: 'medium' },
        wallet: await getWallet(fid.toString()),
    } as BotState;

    next();
};

const sendResponse = (req: Request, res: Response, result: any) => {
    // This is where the error was happening. 'result' was undefined.
    if (!result) {
        console.error("FATAL: result object is undefined. A handler did not return a value.", {
            action: req.body.action,
            callback: req.body.callback,
        });
        res.json({ response: "An unexpected server error occurred." });
        return;
    }

    const state = (req as any).state;
    res.json({
        response: result.response,
        buttons: result.buttons,
        newState: {
            currentAction: state.currentAction,
            tempData: state.tempData,
            settings: state.settings,
        }
    });
};

app.get("/", (req: Request, res: Response) => {
  res.send("🔧 ForgeBot backend is running.");
});

app.post("/api/action", loadStateMiddleware, async (req: Request, res: Response) => {
    const { action } = req.body;
    const state: BotState = (req as any).state;
    let result;

    const context = { session: state, wallet: state.wallet, args: action };

    let actionToPerform = action;
    if (state.currentAction && !action.startsWith('/')) {
        actionToPerform = state.currentAction;
        context.args = action;
    }

    switch (actionToPerform) {
        case "/start": result = await startHandler.handler(context); break;
        case "/help": result = await helpHandler.handler(context); break;
        case "/buy": result = await buyHandler.handler(context); break;
        case "/sell": result = await sellHandler.handler(context); break;
        case "/wallet": result = await walletHandler.handler(context); break;
        case "/balance": result = await balanceHandler.handler(context); break;
        case "/history": result = await historyHandler.handler(context); break;
        case "/settings": result = await settingsHandler.handler(context); break;
        case "/deposit": result = await depositHandler.handler(context); break;
        case "/withdraw": result = await withdrawHandler.handler(context); break;
        case "/create": result = await createHandler.handler(context); break;
        case "/import": result = await importHandler.handler(context); break;
        case "/export": result = await exportHandler.handler(context); break;
        case "/cancel":
            state.currentAction = undefined;
            state.tempData = {};
            result = { response: "Operation cancelled." };
            break;
        case "import_wallet": result = await handlePrivateKeyInput(context); break;
        case "buy_custom_token": result = await handleCustomTokenInput(context); break;
        case "buy_amount": result = await handleBuyAmountInput(context); break;
        case "sell_custom_token": result = await handleSellCustomTokenInput(context); break;
        case "sell_amount": result = await handleSellAmountInput(context); break;
        case "withdraw_address": result = await handleWithdrawAddress(context); break;
        case "withdraw_amount": result = await handleWithdrawAmount(context); break;
        default: result = { response: `Unknown command or action: ${actionToPerform}` }; break;
    }
    sendResponse(req, res, result);
});

app.post("/api/callback", loadStateMiddleware, async (req: Request, res: Response) => {
    const { callback } = req.body;
    const state: BotState = (req as any).state;
    let result;
    const context = { session: state, wallet: state.wallet, args: callback };

    if (callback.startsWith("sell_token_")) {
        context.args = callback.replace("sell_token_", "");
        result = await handleSellTokenSelection(context);
    } else if (["USDC", "DAI", "WBTC", "custom"].includes(callback)) {
        result = await handleTokenSelection(context);
    } else if (callback === 'confirm_yes' || callback === 'confirm_no') {
        const confirmed = callback === 'confirm_yes';
        if (state.currentAction === 'buy_confirm') result = await handleBuyConfirmation(context, confirmed);
        else if (state.currentAction === 'sell_confirm') result = await handleSellConfirmation(context, confirmed);
        else if (state.currentAction === 'export_wallet') result = await handleExportConfirmation(context, confirmed);
        else result = { response: "Invalid confirmation state." };
    } else if (callback.startsWith("withdraw_confirm_")) {
        result = await handleWithdrawConfirmation(context, callback === "withdraw_confirm_true");
    } else if (callback.startsWith("history_")) {
        context.args = callback.replace("history_", "");
        result = await handleTimeframeChange(context);
    } else if (callback.startsWith("settings_")) {
        context.args = callback.replace("settings_", "");
        result = await handleSettingsOption(context, context.args as any);
    } else if (callback.startsWith("slippage_")) {
        const slippage = parseFloat(callback.replace("slippage_", ""));
        result = await updateSlippage(context, slippage);
    } else if (callback.startsWith("gas_")) {
        const priority = callback.replace("gas_", "") as "low" | "medium" | "high";
        result = await updateGasPriority(context, priority);
    } else {
        switch (callback) {
            case "check_balance": result = await balanceHandler.handler(context); break;
            case "check_history": result = await historyHandler.handler(context); break;
            case "buy_token": result = await buyHandler.handler(context); break;
            case "sell_token": result = await sellHandler.handler(context); break;
            case "open_settings": result = await settingsHandler.handler(context); break;
            case "deposit": result = await depositHandler.handler(context); break;
            case "withdraw": result = await withdrawHandler.handler(context); break;
        case "help": result = await helpHandler.handler(context); break;
       case "/cancel":
            state.currentAction = undefined;
            state.tempData = {};
            result = { response: "Operation cancelled." };
            break;
            case "create_wallet": case "confirm_create_wallet": result = await createHandler.handler(context); break;
            case "import_wallet": case "confirm_import_wallet": result = await importHandler.handler(context); break;
            case "export_key": result = await exportHandler.handler(context); break; // <-- THIS IS THE FIX
            case "cancel_create_wallet": case "cancel_import_wallet":
                state.currentAction = undefined;
                result = { response: "Operation cancelled." };
                break;
            default: result = { response: `Unknown callback: ${callback}` }; break;
        }
    }
    sendResponse(req, res, result);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🤖 Bot server running on port ${PORT}`));

process.on("SIGINT", () => {
    console.log("🛑 Stopping server...");
    closeDatabase();
    process.exit(0);
});