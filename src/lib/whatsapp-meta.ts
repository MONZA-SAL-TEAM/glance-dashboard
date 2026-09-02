import { attempt, graph } from "./meta";

/**
 * Read-only WhatsApp number health from the Graph API.
 *
 * SAFETY CONTRACT — this module makes exactly one kind of request: a GET on
 * the phone-number object. It never calls /register, /deregister, /request_code,
 * or any endpoint that could alter the number's registration, and therefore
 * cannot affect the WhatsApp Business app login on the phone. graph() issues
 * a GET whenever no method is specified, and nothing here specifies one.
 *
 * It also degrades to "not connected" rather than failing: the current
 * META_ACCESS_TOKEN was issued without WhatsApp permissions, which is a
 * perfectly fine state — the panel then shows what granting read access
 * would add, and the rest of the WhatsApp view works regardless.
 */

const PHONE_NUMBER_ID = process.env.META_WA_PHONE_ID || "984244264767607";

export interface WhatsAppNumberHealth {
  configured: boolean;
  displayNumber?: string;
  verifiedName?: string;
  nameStatus?: string;
  qualityRating?: string;
  status?: string;
  messagingLimit?: string;
  platformType?: string;
  notes: string[];
}

interface PhoneNumberFields {
  display_phone_number?: string;
  verified_name?: string;
  name_status?: string;
  quality_rating?: string;
  status?: string;
  messaging_limit_tier?: string;
  platform_type?: string;
}

export async function fetchNumberHealth(): Promise<WhatsAppNumberHealth> {
  const notes: string[] = [];
  if (!process.env.META_ACCESS_TOKEN) {
    return { configured: false, notes: [] };
  }

  const res = await attempt("WhatsApp number health", notes, () =>
    graph<PhoneNumberFields>(PHONE_NUMBER_ID, {
      fields:
        "display_phone_number,verified_name,name_status,quality_rating,status,messaging_limit_tier,platform_type",
    }),
  );

  if (!res) return { configured: false, notes };

  return {
    configured: true,
    displayNumber: res.display_phone_number,
    verifiedName: res.verified_name,
    nameStatus: res.name_status,
    qualityRating: res.quality_rating,
    status: res.status,
    messagingLimit: res.messaging_limit_tier,
    platformType: res.platform_type,
    notes,
  };
}
