// FILE: src/commands/settings.ts

import { CommandContext } from "../types/commands";
import { getUserSettings, saveUserSettings } from "../lib/database";

import { SettingsOption } from "../types/commands"; 
import { UserSettings } from "../types/config"; // Correct import path
 // Import UserSettings if not already
import { isValidGasPriority, isValidSlippage } from "../utils/validators";
import { getGasPriorityLabel } from "../lib/swap";

// Helper function to ensure we always have a valid settings object
function getValidSettings(session: CommandContext['session']): UserSettings {
    // If settings exist and have all required properties, return them.
    if (session.settings?.userId && session.settings?.slippage && session.settings?.gasPriority) {
        return session.settings as UserSettings;
    }
    // Otherwise, return a complete default object.
    return {
        userId: session.userId,
        slippage: 1.0,
        gasPriority: 'medium',
    };
}


export const settingsHandler = {
  command: "settings",
  description: "Change slippage or gas priority",
  handler: async ({ session }: CommandContext) => {
    try {
      const settings = getValidSettings(session);

      return {
        response: `⚙️ Your Settings\n\nSlippage Tolerance: ${
          settings.slippage
        }%\nGas Priority: ${getGasPriorityLabel(
          settings.gasPriority
        )}\n\nSelect an option to modify:`,
        buttons: [
          [
            { label: "Slippage", callback: "settings_slippage" },
            { label: "Gas Priority", callback: "settings_gasPriority" },
          ],
        ],
      };
    } catch (error) {
      console.error("[Settings-error]", error);
      return { response: "❌ An error occurred." };
    }
  },
};

export async function handleSettingsOption(
  { session }: CommandContext,
  option: SettingsOption
): Promise<{
  response: string;
  buttons?: { label: string; callback: string }[][];
}> {
    const settings = getValidSettings(session);
    session.currentAction = `settings_${option}`;

    switch (option) {
      case "slippage":
        return {
          response: `🔄 Slippage Tolerance Setting...\nCurrent setting: ${settings.slippage}%\n\nSelect a new slippage tolerance:`,
          buttons: [
            [{ label: "0.5%", callback: "slippage_0.5" }, { label: "1.0%", callback: "slippage_1.0" }, { label: "2.0%", callback: "slippage_2.0" }],
          ],
        };
      case "gasPriority":
        return {
          response: `⛽ Gas Priority Setting...\nCurrent setting: ${getGasPriorityLabel(
            settings.gasPriority
          )}\n\nSelect a new gas priority:`,
          buttons: [
            [{ label: "Low", callback: "gas_low" }, { label: "Medium", callback: "gas_medium" }, { label: "High", callback: "gas_high" }],
          ],
        };
      default:
        return { response: "❌ Unknown setting option." };
    }
}

export async function updateSlippage(
  { session }: CommandContext,
  value: number
): Promise<{
  response: string;
  buttons?: { label: string; callback: string }[][];
}> {
  try {
    if (!isValidSlippage(value)) {
      return { response: "❌ Invalid slippage value." };
    }
    
    // Start with a guaranteed valid settings object
    const currentSettings = getValidSettings(session);

    const updatedSettings: UserSettings = {
      ...currentSettings,
      slippage: value,
    };
    
    // This will now be type-safe
    await saveUserSettings(session.userId, updatedSettings);

    session.settings = updatedSettings;
    session.currentAction = undefined;

    return {
      response: `✅ Slippage Tolerance set to ${value}%.`,
    };
  } catch (error) {
    console.error("[Settings-error] Error updating slippage:", error);
    return { response: "❌ An error occurred." };
  }
}

export async function updateGasPriority(
  { session }: CommandContext,
  priority: "low" | "medium" | "high"
): Promise<{
  response: string;
  buttons?: { label: string; callback: string }[][];
}> {
  try {
    if (!isValidGasPriority(priority)) {
      return { response: "❌ Invalid gas priority." };
    }

    const currentSettings = getValidSettings(session);

    const updatedSettings: UserSettings = {
      ...currentSettings,
      gasPriority: priority,
    };

    await saveUserSettings(session.userId, updatedSettings);
    
    session.settings = updatedSettings;
    session.currentAction = undefined;

    return {
      response: `✅ Gas Priority set to ${priority}.`,
    };
  } catch (error) {
    console.error("[Settings-error] Error updating gas priority:", error);
    return { response: "❌ An error occurred." };
  }
}