import type { DecisionPlugin } from "@r_masseater/oxlint-plugin-decision";

import { presetPlugin } from "./plugin.ts";
import { recommended } from "./presets.ts";

const plugin: DecisionPlugin = presetPlugin(recommended);

export default plugin;
