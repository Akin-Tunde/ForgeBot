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
        return {
          response: "❌ Please start the bot first with /start command.",
        };
      }

      let settings = session.settings;
      if (!settings) {
        settings = (await getUserSettings(userId)) || undefined;

        if (settings) {
          session.settings = settings;
        } else {
          settings = {
            userId,
            slippage: 1.0,
            gasPriority: "medium",
          };
          saveUserSettings(userId, {
            slippage: settings.slippage,
            gasPriority: settings.gasPriority,
          });
          session.settings = settings;
        }
      }

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
      console.error("Error in settings command:", error);
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
      return {
        response: "❌ Session expired. Please use /start to begin again.",
      };
    }

    session.currentAction = `settings_${option}`;

    switch (option) {
      case "slippage":
        return {
          response: `🔄 Slippage Tolerance Setting\n\nSlippage tolerance is the maximum price difference you're willing to accept for a trade.\n\nCurrent setting: ${session.settings?.slippage}%\n\nSelect a new slippage tolerance:`,
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
            session.settings?.gasPriority || "medium"
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
        return { response: "❌ Unknown setting option." };
    }
  } catch (error) {
    console.error("Error handling settings option:", error);
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
      return { response: "❌ Session expired." };
    }

    if (!isValidSlippage(value)) {
      return { response: "❌ Invalid slippage value." };
    }

    const settings = session.settings || {
      userId,
      slippage: 1.0,
      gasPriority: "medium",
    };

    settings.slippage = value;
    session.settings = settings;

    saveUserSettings(userId, {
      slippage: settings.slippage,
      gasPriority: settings.gasPriority,
    });

    return {
      response: `⚙️ Your Settings\n\nSlippage set to ${value}%.\n\nSlippage Tolerance: ${
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
    console.error("Error updating slippage:", error);
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
    const userId = session.userId;
    if (!userId) {
      return { response: "❌ Session expired." };
    }

    if (!isValidGasPriority(priority)) {
      return { response: "❌ Invalid gas priority." };
    }

    const settings = session.settings || {
      userId,
      slippage: 1.0,
      gasPriority: "medium",
    };

    settings.gasPriority = priority;
    session.settings = settings;

    saveUserSettings(userId, {
      slippage: settings.slippage,
      gasPriority: settings.gasPriority,
    });

    return {
      response: `⚙️ Your Settings\n\nGas priority set to ${priority}.\n\nSlippage Tolerance: ${
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
    console.error("Error updating gas priority:", error);
    return { response: "❌ An error occurred." };
  }
}
