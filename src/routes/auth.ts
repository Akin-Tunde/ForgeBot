import { Router, Request, Response } from "express";
import { createClient, Errors } from "@farcaster/quick-auth";

const client = createClient();
const router = Router();

interface AppRequest extends Request {
  session: { fid?: number };
}

router.post("/farcaster", async (req: AppRequest, res: Response) => {
  try {
    const { token } = req.body;
    const payload = await client.verifyJwt({
      token,
      domain: process.env.DOMAIN!,
    });
    req.session.fid = payload.sub;
    return res.json({ success: true });
  } catch (e: any) {
    if (e instanceof Errors.InvalidTokenError) {
      console.info("Invalid token:", e.message);
      return res.status(401).json({ error: "Invalid token" });
    }
    console.error("Auth error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
