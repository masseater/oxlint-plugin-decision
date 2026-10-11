import type { DecisionPlugin } from "oxlint-plugin-decision";

import { presetPlugin } from "./plugin.ts";
import { strict } from "./presets.ts";

const plugin: DecisionPlugin = presetPlugin(strict);

export default plugin;
