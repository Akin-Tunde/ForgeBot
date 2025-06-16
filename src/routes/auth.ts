import { Router, Request, Response } from "express";
import { createClient, Errors } from "@farcaster/quick-auth";
import { SessionData } from "../types/commands"; // Import SessionData for type assertion

const client = createClient();
const router = Router();

router.post(
  "/farcaster",
  async (req: Request, res: Response): Promise<void> => {
    // Use standard Request and explicitly type return as Promise<void>
    try {
      const { token } = req.body; // Ensure 'token' is passed in the request body
      const payload = await client.verifyJwt({
        token,
        domain: process.env.DOMAIN!,
      });
      (req.session as SessionData).fid = payload.sub; // Use type assertion for fid
      res.json({ success: true });
      return;
    } catch (e: any) {
      // Check if 'e' and 'e.message' are defined before accessing them
      const errorMessage =
        e && typeof e.message === "string" ? e.message : "Unknown auth error";
      if (e instanceof Errors.InvalidTokenError) {
        console.info("Invalid token:", e.message);
        res.status(401).json({ error: "Invalid token" });
        return;
      }
      console.error("Auth error:", e);
      res.status(500).json({ error: "Internal server error" });
      return;
    }
  }
);

export default router;
