import { getNonEmptyString, toRecord } from "../../shared/common";
import { parseQualifiedMcpToolName } from "./mcp-qualified-target";

export { parseQualifiedMcpToolName } from "./mcp-qualified-target";

function addDerivedMcpServerTargets(
  toolName: string,
  configuredServerNames: readonly string[],
  targets: Set<string>,
): void {
  const trimmedToolName = toolName.trim();
  if (!trimmedToolName) {
    return;
  }

  for (const serverName of configuredServerNames) {
    const derived = deriveMcpServerTargets(trimmedToolName, serverName);
    if (!derived) continue;

    targets.add(derived.underscore);
    targets.add(derived.qualified);
    targets.add(derived.server);
  }
}

function deriveMcpServerTargets(
  trimmedToolName: string,
  serverName: string,
): { underscore: string; qualified: string; server: string } | null {
  const server = serverName.trim();
  if (!server) return null;
  if (!trimmedToolName.endsWith(`_${server}`)) return null;
  if (trimmedToolName.startsWith(`${server}_`)) return null;
  return { underscore: `${server}_${trimmedToolName}`, qualified: `${server}:${trimmedToolName}`, server };
}

interface McpToolTargetContext {
  serverHint: string | null;
  configuredServerNames: readonly string[];
  targets: Set<string>;
}

function pushMcpToolPermissionTargets(rawReference: string, ctx: McpToolTargetContext): void {
  const reference = resolveMcpReference(rawReference, ctx.serverHint);

  if (reference.server) {
    addResolvedMcpServerTargets(reference.server, reference.tool, ctx.targets);
  } else {
    addDerivedMcpServerTargets(reference.tool, ctx.configuredServerNames, ctx.targets);
  }

  ctx.targets.add(reference.tool);
  ctx.targets.add(rawReference);
}

function resolveMcpReference(rawReference: string, serverHint: string | null): { server: string | null; tool: string } {
  const qualified = parseQualifiedMcpToolName(rawReference);
  return { server: resolveMcpServer(serverHint, qualified), tool: resolveMcpTool(rawReference, qualified) };
}

function resolveMcpServer(
  serverHint: string | null,
  qualified: { server: string; tool: string } | null,
): string | null {
  if (serverHint) return serverHint;
  return qualified ? qualified.server : null;
}

function resolveMcpTool(rawReference: string, qualified: { server: string; tool: string } | null): string {
  return qualified ? qualified.tool : rawReference;
}

function addResolvedMcpServerTargets(server: string, tool: string, targets: Set<string>): void {
  targets.add(`${server}_${tool}`);
  targets.add(`${server}:${tool}`);
  targets.add(server);
}

type McpTargetInput = {
  tool: string | null;
  server: string | null;
  connect: string | null;
  describe: string | null;
  search: string | null;
};

export function createMcpPermissionTargets(input: unknown, configuredServerNames: readonly string[] = []): string[] {
  const values = readMcpTargetInput(input);
  const targets = new Set<string>();
  const resolver = createMcpTargetResolvers(values, configuredServerNames, targets).find((entry) => entry.value);
  if (!resolver?.value) return buildMcpStatusTargets(targets);
  return resolver.build(resolver.value);
}

type McpTargetResolver = { value: string | null; build: (value: string) => string[] };

function createMcpTargetResolvers(
  values: McpTargetInput,
  configuredServerNames: readonly string[],
  targets: Set<string>,
): McpTargetResolver[] {
  const toolArgs = { server: values.server, configuredServerNames, targets };
  return [
    { value: values.tool, build: (tool) => buildMcpToolTargets({ ...toolArgs, tool, fallback: "mcp_call" }) },
    { value: values.connect, build: (connect) => buildMcpConnectTargets(connect, targets) },
    { value: values.describe, build: (tool) => buildMcpToolTargets({ ...toolArgs, tool, fallback: "mcp_describe" }) },
    { value: values.search, build: (search) => buildMcpSearchTargets(search, values.server, targets) },
    { value: values.server, build: (server) => buildMcpServerTargets(server, targets, "mcp_list") },
  ];
}

function readMcpTargetInput(input: unknown): McpTargetInput {
  const record = toRecord(input);
  return {
    tool: getNonEmptyString(record.tool),
    server: getNonEmptyString(record.server),
    connect: getNonEmptyString(record.connect),
    describe: getNonEmptyString(record.describe),
    search: getNonEmptyString(record.search),
  };
}

type BuildMcpToolTargetsArgs = {
  tool: string;
  server: string | null;
  configuredServerNames: readonly string[];
  targets: Set<string>;
  fallback: string;
};

function buildMcpToolTargets(args: BuildMcpToolTargetsArgs): string[] {
  pushMcpToolPermissionTargets(args.tool, {
    serverHint: args.server,
    configuredServerNames: args.configuredServerNames,
    targets: args.targets,
  });
  args.targets.add(args.fallback);
  return [...args.targets];
}

function buildMcpConnectTargets(connect: string, targets: Set<string>): string[] {
  targets.add(`mcp_connect_${connect}`);
  targets.add(connect);
  targets.add("mcp_connect");
  return [...targets];
}

function buildMcpSearchTargets(search: string, server: string | null, targets: Set<string>): string[] {
  if (server) addMcpServerTargets(server, targets);
  targets.add(search);
  targets.add("mcp_search");
  return [...targets];
}

function buildMcpServerTargets(server: string, targets: Set<string>, fallback: string): string[] {
  addMcpServerTargets(server, targets);
  targets.add(fallback);
  return [...targets];
}

function addMcpServerTargets(server: string, targets: Set<string>): void {
  targets.add(`mcp_server_${server}`);
  targets.add(server);
}

function buildMcpStatusTargets(targets: Set<string>): string[] {
  targets.add("mcp_status");
  return [...targets];
}
