import { FoodCategory, TemperatureResult } from "../../types/enums";

// Client-side mirror of the backend TemperatureEvaluator so the capture screen can show the live
// Pass/Warning/Fail verdict as staff type. Keep in step with ScratchCard.Application/Services/
// TemperatureEvaluator.cs — the server is still the source of truth on save.

// Legal FAIL lines (constants — the law/FSA guidance).
const HOT_FAIL_BELOW = 60;
const COLD_FAIL_ABOVE = 8;
const FROZEN_FAIL_ABOVE = -12;

// Guidance Pass lines — the effective Pass boundary is clamped to at least these, so a looser stored
// band can never hide the Warning tier.
const HOT_GUIDANCE_PASS_FLOOR = 63;
const COLD_GUIDANCE_PASS_CEILING = 5;
const FROZEN_GUIDANCE_PASS_CEILING = -18;

export type TemperatureBand = { minCelsius: number; maxCelsius: number };

export function defaultTargetBand(category: FoodCategory): TemperatureBand {
  switch (category) {
    case FoodCategory.HotFood:
      return { minCelsius: 63, maxCelsius: 70 };
    case FoodCategory.Frozen:
      return { minCelsius: -30, maxCelsius: -18 };
    case FoodCategory.ColdFood:
    default:
      return { minCelsius: 0, maxCelsius: 5 };
  }
}

export function evaluateTemperature(
  category: FoodCategory,
  temperatureCelsius: number,
  target: TemperatureBand,
): TemperatureResult {
  switch (category) {
    case FoodCategory.HotFood: {
      if (temperatureCelsius < HOT_FAIL_BELOW) return TemperatureResult.Fail;
      const passFloor = Math.max(target.minCelsius, HOT_GUIDANCE_PASS_FLOOR);
      return temperatureCelsius >= passFloor ? TemperatureResult.Pass : TemperatureResult.Warning;
    }
    case FoodCategory.Frozen: {
      if (temperatureCelsius > FROZEN_FAIL_ABOVE) return TemperatureResult.Fail;
      const passCeiling = Math.min(target.maxCelsius, FROZEN_GUIDANCE_PASS_CEILING);
      return temperatureCelsius <= passCeiling ? TemperatureResult.Pass : TemperatureResult.Warning;
    }
    case FoodCategory.ColdFood:
    default: {
      if (temperatureCelsius > COLD_FAIL_ABOVE) return TemperatureResult.Fail;
      const passCeiling = Math.min(target.maxCelsius, COLD_GUIDANCE_PASS_CEILING);
      return temperatureCelsius <= passCeiling ? TemperatureResult.Pass : TemperatureResult.Warning;
    }
  }
}

// A short instruction shown under the verdict on the capture screen (spec §11/§13/§28).
export function verdictGuidance(category: FoodCategory, result: TemperatureResult): string {
  if (result === TemperatureResult.Pass) return "Within the safe range.";
  const hot = category === FoodCategory.HotFood;
  if (result === TemperatureResult.Fail) {
    return hot
      ? "Hot food has failed. Do not treat as a normal pass — follow the food-safety procedure immediately."
      : "Temperature has failed. Immediate action is required.";
  }
  return hot
    ? "Below the required hot-holding temperature — immediate action is required."
    : "Higher than ideal. Check the door, stock level and airflow, then recheck.";
}

export type CorrectiveActionOption = { value: string; label: string };

// §17 corrective-action lists. Values are the backend TemperatureCorrectiveAction enum NAMES; the
// reading/issue stores a comma-separated list of these. Frozen reuses the cold list.
const HOT_ACTIONS: CorrectiveActionOption[] = [
  { value: "TemperatureAdjusted", label: "Temperature adjusted" },
  { value: "FoodReheated", label: "Food reheated (if appropriate)" },
  { value: "MovedToAnotherHotUnit", label: "Moved to another hot unit" },
  { value: "SoldWithinAllowedTime", label: "Sold within allowed time" },
  { value: "FoodDiscarded", label: "Food discarded" },
  { value: "HotCabinetChecked", label: "Hot cabinet checked" },
  { value: "PowerSupplyChecked", label: "Power supply checked" },
  { value: "ManagerInformed", label: "Manager informed" },
  { value: "EngineerContacted", label: "Engineer contacted" },
  { value: "Other", label: "Other" },
];

const COLD_ACTIONS: CorrectiveActionOption[] = [
  { value: "MovedToAnotherFridge", label: "Moved to another fridge" },
  { value: "FoodDiscarded", label: "Food discarded" },
  { value: "FridgeDoorClosed", label: "Fridge door closed" },
  { value: "StockLevelReduced", label: "Stock level reduced" },
  { value: "AirflowChecked", label: "Airflow checked" },
  { value: "TemperatureSettingChecked", label: "Temperature setting checked" },
  { value: "PowerSupplyChecked", label: "Power supply checked" },
  { value: "ManagerInformed", label: "Manager informed" },
  { value: "EngineerContacted", label: "Engineer contacted" },
  { value: "Other", label: "Other" },
];

export function correctiveActionOptions(category: FoodCategory): CorrectiveActionOption[] {
  return category === FoodCategory.HotFood ? HOT_ACTIONS : COLD_ACTIONS;
}

// True when the selected corrective actions include "Other" (notes then become required — §17).
export function correctiveActionsRequireNotes(selected: string[]): boolean {
  return selected.includes("Other");
}
