"use server";

import { createAdminClient } from "@/lib/supabase/server";

export interface WhatsAppInstanceConfig {
  instance1Name: string;
  instance1Alias: string;
  instance2Name: string;
  instance2Alias: string;
}

const DEFAULT_CONFIG: WhatsAppInstanceConfig = {
  instance1Name: "clickpar-1",
  instance1Alias: "Número 1",
  instance2Name: "clickpar-2",
  instance2Alias: "Número 2",
};

/**
 * Get WhatsApp instance names and aliases for use in sale UIs.
 * Lightweight server action — only returns the instance config, not full settings.
 */
export async function getWhatsAppInstanceConfig(): Promise<WhatsAppInstanceConfig> {
  try {
    const supabase = await createAdminClient();
    const { data } = await (supabase.from("whatsapp_settings") as any)
      .select(
        "instance_1_name, instance_2_name, instance_1_alias, instance_2_alias"
      )
      .limit(1)
      .single();

    if (data) {
      return {
        instance1Name: data.instance_1_name || DEFAULT_CONFIG.instance1Name,
        instance1Alias: data.instance_1_alias || DEFAULT_CONFIG.instance1Alias,
        instance2Name: data.instance_2_name || DEFAULT_CONFIG.instance2Name,
        instance2Alias: data.instance_2_alias || DEFAULT_CONFIG.instance2Alias,
      };
    }
    return DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}
