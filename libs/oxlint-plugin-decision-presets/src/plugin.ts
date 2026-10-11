import { createDecisionPlugin } from "oxlint-plugin-decision";
import type { DecisionPlugin } from "oxlint-plugin-decision";

import type { Preset } from "./presets.ts";

const presetPlugin = (rules: Preset): DecisionPlugin => createDecisionPlugin({ rules });

export { presetPlugin };
