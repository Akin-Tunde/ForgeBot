import { SessionData } from "./types/commands";

export function createInitialSessionData(): SessionData {
  return {
    userId: undefined,
    walletAddress: undefined,
    currentAction: undefined,
    tempData: {},
    settings: undefined,
  };
}
