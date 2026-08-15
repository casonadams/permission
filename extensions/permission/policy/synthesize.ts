import type { Rule, RuleOrigin, Ruleset } from "./rule";
import type { PermissionState } from "./types";

export function synthesizeDefaults(universalDefault: PermissionState, origin: RuleOrigin = "builtin"): Ruleset {
  return [
    {
      surface: "*",
      pattern: "*",
      action: universalDefault,
      layer: "default",
      origin,
    },
  ];
}

const MCP_BASELINE_TARGETS: readonly string[] = ["mcp_status", "mcp_list", "mcp_search", "mcp_describe", "mcp_connect"];

export function synthesizeBaseline(configRules: Ruleset): Ruleset {
  const hasAnyMcpAllow = configRules.some((r) => r.surface === "mcp" && r.action === "allow");
  if (!hasAnyMcpAllow) {
    return [];
  }
  return MCP_BASELINE_TARGETS.map(
    (target): Rule => ({
      surface: "mcp",
      pattern: target,
      action: "allow",
      layer: "baseline",
      origin: "baseline",
    }),
  );
}

export function composeRuleset(defaults: Ruleset, baseline: Ruleset, config: Ruleset): Ruleset {
  return [...defaults, ...baseline, ...config];
}
