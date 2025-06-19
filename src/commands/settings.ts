// src/commands/settings.ts
import { CommandContext } from "../types/commands";
import { getUserSettings, saveUserSettings } from "../lib/database";
import { SettingsOption } from "../types/commands";
import { isValidGasPriority, isValidSlippage } from "../utils/validators";
import { getGasPriorityLabel } from "../lib/swap";

export const settingsHandler = {
  command: "settings",
  description: "Change slippage or gas priority",
  handler: async ({ session }: CommandContext) => {
    try {
      const userId = session.userId;
      if (!userId) {
        console.error("[Settings] No userId found");
        return {
          response: "❌ Please start the bot first with /start command.",
        };
      }

      console.log("[Settings] Loading settings for userId:", userId);
      let settings = await getUserSettings(userId);

      if (!settings) {
        console.log("[Settings] No settings found, initializing defaults for userId:", userId);
        settings = {
          userId,
          slippage: 1.0,
          gasPriority: "medium",
        };
        await saveUserSettings(userId, {
          slippage: settings.slippage,
          gasPriority: settings.gasPriority,
        });
      }

      session.settings = settings;
      await session.save();
      console.log("[Settings] Settings loaded and session updated for userId:", userId, settings);

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
      console.error("[Settings-error] Error in settings command for userId:", session?.userId, error);
      return { response: "❌ An error occurred. Please try again later." };
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
  try {
    const userId = session.userId;
    if (!userId) {
      console.error("[Settings] No userId found in handleSettingsOption");
      return {
        response: "❌ Session expired. Please use /start to begin again.",
      };
    }

    console.log("[Settings] Handling option:", option, "for userId:", userId);
    // Fetch fresh settings from Supabase
    const settings = (await getUserSettings(userId)) || {
      userId,
      slippage: 1.0,
      gasPriority: "medium",
    };
    console.log("[Settings] Fetched settings for handleSettingsOption:", settings);

    session.currentAction = `settings_${option}`;
    session.settings = settings;
    await session.save();
    console.log("[Settings] Session updated with currentAction and settings for userId:", userId);

    switch (option) {
      case "slippage":
        return {
          response: `🔄 Slippage Tolerance Setting\n\nSlippage tolerance is the maximum price difference you're willing to accept for a trade.\n\nCurrent setting: ${settings.slippage}%\n\nSelect a new slippage tolerance:`,
          buttons: [
            [
              { label: "0.5%", callback: "slippage_0.5" },
              { label: "1.0%", callback: "slippage_1.0" },
              { label: "2.0%", callback: "slippage_2.0" },
            ],
          ],
        };
      case "gasPriority":
        return {
          response: `⛽ Gas Priority Setting\n\nGas priority determines how quickly your transactions are likely to be processed.\n\nCurrent setting: ${getGasPriorityLabel(
            settings.gasPriority
          )}\n\nSelect a new gas priority:`,
          buttons: [
            [
              { label: "Low", callback: "gasPriority_low" },
              { label: "Medium", callback: "gasPriority_medium" },
              { label: "High", callback: "gasPriority_high" },
            ],
          ],
        };
      default:
        console.error("[Settings] Unknown setting option:", option);
        return { response: "❌ Unknown setting option." };
    }
  } catch (error) {
    console.error("[Settings-error] Error handling settings option for userId:", session?.userId, error);
    return { response: "❌ An error occurred. Please try again." };
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
    const userId = session.userId;
    if (!userId) {
      console.error("[Settings] No userId found in updateSlippage");
      return { response: "❌ Session expired." };
    }

    console.log("[Settings] Updating slippage to:", value, "for userId:", userId);
    if (!isValidSlippage(value)) {
      console.warn("[Settings] Invalid slippage value:", value);
      return { response: "❌ Invalid slippage value. Please select 0.5%, 1.0%, or 2.0%." };
    }

    // Fetch latest settings from Supabase to preserve gasPriority
    const currentSettings = (await getUserSettings(userId)) || {
      userId,
      slippage: 1.0,
      gasPriority: "medium",
    };
    console.log("[Settings] Current settings before update:", currentSettings);

    const updatedSettings = {
      ...currentSettings,
      slippage: value,
    };
    session.settings = updatedSettings;

    await saveUserSettings(userId, {
      slippage: updatedSettings.slippage,
      gasPriority: updatedSettings.gasPriority,
    });
    await session.save();
    console.log("[Settings] Slippage updated and saved for userId:", userId, updatedSettings);

    return {
      response: `⚙️ Your Settings\n\nSlippage set to ${value}%.\n\nSlippage Tolerance: ${
        updatedSettings.slippage
      }%\nGas Priority: ${getGasPriorityLabel(
        updatedSettings.gasPriority
      )}\n\nSelect an option to modify:`,
      buttons: [
        [
          { label: "Slippage", callback: "settings_slippage" },
          { label: "Gas Priority", callback: "settings_gasPriority" },
        ],
      ],
    };
  } catch (error) {
    console.error("[Settings-error] Error updating slippage for userId:", session?.userId, error);
    return { response: "❌ An error occurred while updating slippage." };
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
    const userId = session.userId;
    if (!userId) {
      console.error("[Settings] No userId found in updateGasPriority");
      return { response: "❌ Session expired." };
    }

    console.log("[Settings] Updating gas priority to:", priority, "for userId:", userId);
    if (!isValidGasPriority(priority)) {
      console.warn("[Settings] Invalid gas priority:", priority);
      return { response: "❌ Invalid gas priority. Please select Low, Medium, or High." };
    }

    // Fetch latest settings from Supabase to preserve slippage
    const currentSettings = (await getUserSettings(userId)) || {
      userId,
      slippage: 1.0,
      gasPriority: "medium",
    };
    console.log("[Settings] Current settings before update:", currentSettings);

    const updatedSettings = {
      ...currentSettings,
      gasPriority: priority,
    };
    session.settings = updatedSettings;

    await saveUserSettings(userId, {
      slippage: updatedSettings.slippage,
      gasPriority: updatedSettings.gasPriority,
    });
    await session.save();
    console.log("[Settings] Gas priority updated and saved for userId:", userId, updatedSettings);

    return {
      response: `⚙️ Your Settings\n\nGas priority set to ${priority}.\n\nSlippage Tolerance: ${
        updatedSettings.slippage
      }%\nGas Priority: ${getGasPriorityLabel(
        updatedSettings.gasPriority
      )}\n\nSelect an option to modify:`,
      buttons: [
        [
          { label: "Slippage", callback: "settings_slippage" },
          { label: "Gas Priority", callback: "settings_gasPriority" },
        ],
      ],
    };
  } catch (error) {
    console.error("[Settings-error] Error updating gas priority for userId:", session?.userId, error);
    return { response: "❌ An error occurred while updating gas priority." };
  }
}