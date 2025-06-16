import { Router, Request, Response } from "express";
// Assuming handleCommand is exported from src/commands/index.ts
import { handleCommand } from "../commands/index";
// SessionData is augmented globally via index.ts, so req.session will have its properties including 'fid'
import { getWallet } from "../lib/token-wallet";
import { SessionData } from "../types/commands"; // Import SessionData for type assertion

const router = Router();

router.post("/command", async (req: Request, res: Response): Promise<void> => {
  const { command, fid, args } = req.body; // Extract command, fid, and optional args

  // Use type assertion for session properties
  if (!fid || fid !== (req.session as SessionData).fid) {
    res.status(401).json({ response: "Unauthorized" });
    return;
  }

  const userId = fid; // Use Farcaster ID as the primary userId for the bot
  (req.session as SessionData).userId = userId; // Set userId on session

  const wallet = await getWallet(userId);
  if (wallet) {
    (req.session as SessionData).walletAddress = wallet.address; // Set walletAddress on session
  }

  try {
    const { response, buttons } = await handleCommand(
      command,
      req.session as SessionData,
      args
    );
    res.json({ response, buttons });
  } catch (error) {
    res.status(500).json({ response: "Error processing command." });
  }
});

export default router;
