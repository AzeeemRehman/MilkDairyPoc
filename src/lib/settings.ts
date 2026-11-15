import { prisma, type Db } from "./db";
import { DEFAULT_DISPLAY, type DisplaySettings } from "./format";

export interface BusinessSettings extends DisplaySettings {
  businessName: string;
  businessNameUr: string;
  address: string;
  phone: string;
  statementFooter: string;
  receiptPrefix: string;
  defaultLanguage: "en" | "ur";
}

export const DEFAULT_SETTINGS: BusinessSettings = {
  ...DEFAULT_DISPLAY,
  businessName: "S.S.N Dairy Farm",
  businessNameUr: "",
  address: "",
  phone: "",
  statementFooter: "Please check your statement on the day it is received. Thank you.",
  receiptPrefix: "RC",
  defaultLanguage: "en",
};

export async function getSettings(db: Db = prisma): Promise<BusinessSettings> {
  const rows = await db.businessSetting.findMany();
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out as unknown as BusinessSettings;
}

export async function saveSettings(values: Partial<BusinessSettings>, db: Db = prisma) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    await db.businessSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
}
