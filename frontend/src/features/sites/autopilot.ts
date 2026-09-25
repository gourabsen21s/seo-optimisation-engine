import { Hand, ShieldCheck, Zap, type LucideIcon } from "lucide-react";
import type { AutopilotMode } from "@/lib/types";

export const AUTOPILOT_OPTIONS: { value: AutopilotMode; label: string; description: string; icon: LucideIcon }[] = [
  { value: "off", label: "Off — I approve everything", description: "The team proposes fixes; nothing changes on your site until you apply it.", icon: Hand },
  { value: "safe", label: "Safe — apply low-risk fixes", description: "Schema, alt text, missing meta, ads.txt and drafts go live automatically.", icon: ShieldCheck },
  { value: "full", label: "Full — fully autonomous", description: "Everything Jev verifies is applied, measured and rolled back if rankings drop.", icon: Zap },
];

export const autopilotMeta = (v: AutopilotMode) => AUTOPILOT_OPTIONS.find((o) => o.value === v) ?? AUTOPILOT_OPTIONS[0];
