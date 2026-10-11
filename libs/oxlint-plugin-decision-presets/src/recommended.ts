import type { DecisionPlugin } from "oxlint-plugin-decision";

import { presetPlugin } from "./plugin.ts";
import { recommended } from "./presets.ts";

const plugin: DecisionPlugin = presetPlugin(recommended);

export default plugin;
