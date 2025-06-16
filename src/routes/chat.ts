import { Router, Request, Response } from "express";
import { handleCommand } from "../commands";
import { SessionData } from "../types/commands";
import { getWallet } from "../lib/token-wallet";

const router = Router();

interface AppRequest extends Request {
  session: SessionData & { fid?: string };
}

router.post("/command", async (req: AppRequest, res: Response) => {
  const { command, fid } = req.body;
  if (!fid || fid !== req.session.fid) {
    return res.status(401).json({ response: "Unauthorized" });
  }

  const userId = fid;
  req.session.userId = userId;
  const wallet = await getWallet(userId);
  if (wallet) req.session.walletAddress = wallet.address;

  try {
    const { response, buttons } = await handleCommand(command, req.session);
    res.json({ response, buttons });
  } catch (error) {
    res.status(500).json({ response: "Error processing command." });
  }
});

export default router;
