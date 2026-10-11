import { createDecisionPlugin } from "@r_masseater/oxlint-plugin-decision";
import type { DecisionPlugin } from "@r_masseater/oxlint-plugin-decision";

import type { Preset } from "./presets.ts";

const presetPlugin = (rules: Preset): DecisionPlugin => createDecisionPlugin({ rules });

export { presetPlugin };
