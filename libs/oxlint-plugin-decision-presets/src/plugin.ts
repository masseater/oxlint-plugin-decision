import { createDecisionPlugin } from "@r_masseater/oxlint-plugin-decision";
import type { DecisionPlugin } from "@r_masseater/oxlint-plugin-decision";

import type { Preset } from "./presets.ts";

const PLUGIN_NAME = "decision-presets";

const presetPlugin = (rules: Preset): DecisionPlugin =>
  createDecisionPlugin({ name: PLUGIN_NAME, rules });

export { presetPlugin };
