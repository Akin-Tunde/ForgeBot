import {
  createAppClient,
  viemConnector,
  generateNonce,
} from "@farcaster/auth-client";
import { Request } from "express";
import { SessionData } from "../types/commands"; // Import SessionData

// Configuration
const FARCSTER_DOMAIN = process.env.FARCSTER_DOMAIN || "forge-bot.vercel.app";
const BASE_RPC_URL =
  "https://base-mainnet.g.alchemy.com/v2/" + process.env.ALCHEMY_API_KEY;

// Initialize Farcaster auth client
const farcasterClient = createAppClient({
  relay: "https://relay.farcaster.xyz",
  ethereum: viemConnector({ rpcUrl: BASE_RPC_URL }),
});

// Verify Farcaster signature
export async function verifyFarcasterSignature(req: Request): Promise<boolean> {
  try {
    const { user } = req.body;
    if (!user?.nonce || !user?.signature || !user?.message) {
      console.error("Missing Farcaster auth data");
      return false;
    }

    const signatureHex = user.signature.startsWith("0x")
      ? user.signature
      : (`0x${user.signature}` as const);

    const verifyResult = await farcasterClient.verifySignInMessage({
      nonce: user.nonce,
      message: user.message,
      signature: signatureHex,
      domain: FARCSTER_DOMAIN,
    });

    if (verifyResult.isError) {
      console.error("Farcaster verification failed:", verifyResult.error);
      return false;
    }

    if (!verifyResult.success || !verifyResult.fid) {
      console.error(
        "Farcaster verification failed: success is false or fid is missing",
        verifyResult
      );
      return false;
    }

    (req.session as SessionData).userId = verifyResult.fid.toString();
    return true;
  } catch (error) {
    console.error("Error verifying Farcaster signature:", error);
    return false;
  }
}

// Get nonce for client authentication
export function getFarcasterNonce(): string {
  try {
    const newNonce = generateNonce();
    return newNonce;
  } catch (error) {
    console.error("Error generating Farcaster nonce:", error);
    throw new Error("Failed to generate nonce");
  }
}
