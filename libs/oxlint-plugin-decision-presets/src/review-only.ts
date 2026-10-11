import type { DecisionPlugin } from "oxlint-plugin-decision";

import { presetPlugin } from "./plugin.ts";
import { reviewOnly } from "./presets.ts";

const plugin: DecisionPlugin = presetPlugin(reviewOnly);

export default plugin;
