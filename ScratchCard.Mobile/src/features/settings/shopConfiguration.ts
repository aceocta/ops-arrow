import { SellingOrder } from "../../types/enums";
import { ConfigurationItem } from "../../types/models";
import { parseSellingOrder } from "../../utils/enumParsers";

export const SHOP_CONFIG_KEYS = {
  timeZone: "TimeZone",
  shiftStartTime: "ShiftStartTime",
  shiftEndTime: "ShiftEndTime",
  shiftDefaultName: "ShiftDefaultName",
  shiftTemplates: "ShiftTemplates",
  enforceShiftTimeWindow: "EnforceShiftTimeWindow",
  allowCustomShiftName: "AllowCustomShiftName",
  packSellingOrder: "PackSellingOrder",
  scratchCardDisplayCount: "ScratchCardDisplayCount",
} as const;

export type ShiftTemplateSetup = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
};

export type ShopOperationalSetup = {
  timeZone: string;
  shiftStartTime: string;
  shiftEndTime: string;
  shiftDefaultName: string;
  shiftTemplates: ShiftTemplateSetup[];
  enforceShiftTimeWindow: boolean;
  allowCustomShiftName: boolean;
  packSellingOrder: SellingOrder;
  scratchCardDisplayCount: number;
};

function getValue(items: ConfigurationItem[] | undefined, key: string, fallback: string) {
  const matched = items?.find((item) => item.configKey.toLowerCase() === key.toLowerCase());
  const value = matched?.configValue?.trim();
  return value && value.length > 0 ? value : fallback;
}

function parseBool(value: string, fallback: boolean) {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }

  return fallback;
}

function parsePositiveInteger(value: string, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function normalizeTemplateId(value: string, index: number) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!normalized) {
    return `shift-${index + 1}`;
  }

  return normalized;
}

function buildFallbackShiftTemplates(
  shiftDefaultName: string,
  shiftStartTime: string,
  shiftEndTime: string,
): ShiftTemplateSetup[] {
  return [
    {
      id: normalizeTemplateId(shiftDefaultName || "Main Shift", 0),
      name: shiftDefaultName || "Main Shift",
      startTime: shiftStartTime,
      endTime: shiftEndTime,
      isActive: true,
    },
  ];
}

export function buildShiftTemplateId(value: string, index: number) {
  return normalizeTemplateId(value, index);
}

function parseShiftTemplates(raw: string, fallbackTemplates: ShiftTemplateSetup[]): ShiftTemplateSetup[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return fallbackTemplates;
  }

  try {
    const parsed = JSON.parse(trimmed);
    const source: any[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.templates)
        ? parsed.templates
        : [];

    if (source.length === 0) {
      return fallbackTemplates;
    }

    const usedNames = new Set<string>();
    const usedIds = new Set<string>();
    const templates: ShiftTemplateSetup[] = [];

    source.forEach((item, index) => {
      const rawName = `${item?.name ?? item?.shiftName ?? ""}`.trim();
      const rawStart = `${item?.startTime ?? ""}`.trim();
      const rawEnd = `${item?.endTime ?? ""}`.trim();

      if (!rawName || !/^\d{2}:\d{2}$/.test(rawStart) || !/^\d{2}:\d{2}$/.test(rawEnd)) {
        return;
      }

      let name = rawName.slice(0, 100);
      let suffix = 2;
      while (usedNames.has(name.toLowerCase())) {
        const extra = ` ${suffix}`;
        name = `${rawName.slice(0, Math.max(1, 100 - extra.length)).trimEnd()}${extra}`;
        suffix += 1;
      }
      usedNames.add(name.toLowerCase());

      const baseId = normalizeTemplateId(`${item?.id ?? item?.templateId ?? name}`, index).slice(0, 80);
      let id = baseId;
      let idSuffix = 2;
      while (usedIds.has(id)) {
        id = `${baseId}-${idSuffix}`.slice(0, 80);
        idSuffix += 1;
      }
      usedIds.add(id);

      templates.push({
        id,
        name,
        startTime: rawStart,
        endTime: rawEnd,
        isActive: item?.isActive !== false,
      });
    });

    if (templates.length === 0) {
      return fallbackTemplates;
    }

    return templates.sort((a, b) => a.startTime.localeCompare(b.startTime));
  } catch {
    return fallbackTemplates;
  }
}

export function serializeShiftTemplates(templates: ShiftTemplateSetup[]): string {
  const normalized = templates.map((template, index) => ({
    id: buildShiftTemplateId(template.id || template.name || `shift-${index + 1}`, index),
    name: (template.name ?? "").slice(0, 100),
    startTime: template.startTime,
    endTime: template.endTime,
    isActive: template.isActive !== false,
  }));

  return JSON.stringify(normalized);
}

export function deriveShopOperationalSetup(items: ConfigurationItem[] | undefined): ShopOperationalSetup {
  const timeZone = getValue(items, SHOP_CONFIG_KEYS.timeZone, "Europe/London");
  const shiftStartTime = getValue(items, SHOP_CONFIG_KEYS.shiftStartTime, "06:00");
  const shiftEndTime = getValue(items, SHOP_CONFIG_KEYS.shiftEndTime, "23:00");
  const shiftDefaultName = getValue(items, SHOP_CONFIG_KEYS.shiftDefaultName, "Main Shift");
  const fallbackTemplates = buildFallbackShiftTemplates(shiftDefaultName, shiftStartTime, shiftEndTime);
  const shiftTemplatesRaw = getValue(items, SHOP_CONFIG_KEYS.shiftTemplates, "");
  const shiftTemplates = parseShiftTemplates(shiftTemplatesRaw, fallbackTemplates);
  const primaryTemplate = shiftTemplates[0] ?? fallbackTemplates[0];
  const enforceShiftTimeWindow = parseBool(getValue(items, SHOP_CONFIG_KEYS.enforceShiftTimeWindow, "false"), false);
  const allowCustomShiftName = parseBool(getValue(items, SHOP_CONFIG_KEYS.allowCustomShiftName, "true"), true);
  const packSellingOrder = parseSellingOrder(getValue(items, SHOP_CONFIG_KEYS.packSellingOrder, "Ascending"));
  const scratchCardDisplayCount = parsePositiveInteger(
    getValue(items, SHOP_CONFIG_KEYS.scratchCardDisplayCount, "24"),
    24
  );

  return {
    timeZone,
    shiftStartTime: primaryTemplate.startTime,
    shiftEndTime: primaryTemplate.endTime,
    shiftDefaultName: primaryTemplate.name,
    shiftTemplates,
    enforceShiftTimeWindow,
    allowCustomShiftName,
    packSellingOrder,
    scratchCardDisplayCount,
  };
}
