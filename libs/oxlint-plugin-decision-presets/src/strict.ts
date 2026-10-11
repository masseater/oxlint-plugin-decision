import type { DecisionPlugin } from "@r_masseater/oxlint-plugin-decision";

import { presetPlugin } from "./plugin.ts";
import { strict } from "./presets.ts";

const plugin: DecisionPlugin = presetPlugin(strict);

export default plugin;
