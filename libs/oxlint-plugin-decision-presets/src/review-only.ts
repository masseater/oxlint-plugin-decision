import type { DecisionPlugin } from "@r_masseater/oxlint-plugin-decision";

import { presetPlugin } from "./plugin.ts";
import { reviewOnly } from "./presets.ts";

const plugin: DecisionPlugin = presetPlugin(reviewOnly);

export default plugin;
