import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isSubagentExecutionContext } from "../forwarding/subagents/subagent-context";
import { subscribeSubagentLifecycle } from "../forwarding/subagents/subagent-lifecycle-events";
import type { GateDescriptor } from "../gates/descriptor";
import { GateRunner } from "../gates/runner";
import { SkillInputGatePipeline } from "../gates/skill-input-gate-pipeline";
import { ToolCallGatePipeline } from "../gates/tool-call-gate-pipeline";
import { registerPermissionRpcHandlers } from "../integrations/permission-event-rpc";
import { emitDecisionEvent } from "../integrations/permission-events";
import { LocalPermissionsService } from "../integrations/permissions-service";
import { PermissionServiceLifecycle } from "../integrations/service-lifecycle";
import { PermissionResolver } from "../policy/permission-resolver";
import type { PermissionCheckResult } from "../policy/types";
import { requestPermissionDecisionFromUi } from "../prompting/permission-dialog";
import { installLocalPrompter } from "../ui/prompter.ts";
import { createRuntime, type Runtime, registerCommand } from "./composition-runtime";
import { AgentPrepHandler } from "./handlers/before-agent-start";
import { SessionLifecycleHandler } from "./handlers/lifecycle";
import { PermissionGateHandler } from "./handlers/permission-gate-handler";

export function installPermissionExtension(pi: ExtensionAPI): void {
  const runtime = createRuntime(pi);
  runtime.config.refresh();
  registerCommand(pi, runtime);
  registerHandlers(pi, runtime);
  installPromptDispatcher(pi, runtime);
}

function registerHandlers(pi: ExtensionAPI, runtime: Runtime): void {
  const resolver = new PermissionResolver(runtime.manager, runtime.rules);
  const toolRegistry = createToolRegistry(pi);
  const lifecycle = new SessionLifecycleHandler({
    session: runtime.session,
    resolver,
    serviceLifecycle: createServiceLifecycle(pi, runtime),
    notifier: runtime.notifier,
  });
  const gates = createGateHandler({
    runtime,
    resolver,
    pi,
    toolRegistry,
    onApproval: (descriptor, check) => sendApprovedPathNotice(pi, descriptor, check),
  });
  const agentPrep = new AgentPrepHandler(runtime.session, resolver, toolRegistry);
  pi.on("session_start", (event, ctx) => lifecycle.handleSessionStart(event, ctx));
  pi.on("resources_discover", (event) => lifecycle.handleResourcesDiscover(event));
  pi.on("session_shutdown", () => lifecycle.handleSessionShutdown());
  pi.on("before_agent_start", (event, ctx) => agentPrep.handle(event, ctx));
  pi.on("input", (event, ctx) => gates.handleInput(event, ctx));
  pi.on("tool_call", (event, ctx) => gates.handleToolCall(event, ctx));
}

function sendApprovedPathNotice(pi: ExtensionAPI, descriptor: GateDescriptor, check: PermissionCheckResult): void {
  const sendMessage = (pi as ExtensionAPI & { sendMessage?: ExtensionAPI["sendMessage"] }).sendMessage;
  const path = getApprovedExternalPath(descriptor, check);
  if (!sendMessage || !path) return;

  const normalizedPath = path.replace(/\/$/, "");
  sendMessage.call(
    pi,
    {
      customType: "permission-path-guidance",
      content: `To allow this path without prompting in the future, add under "permission.path":\n\n${JSON.stringify(`${normalizedPath}/*`)}: "allow"`,
      display: true,
    },
    { deliverAs: "steer" },
  );
}

function getApprovedExternalPath(descriptor: GateDescriptor, check: PermissionCheckResult): string | undefined {
  if (check.source !== "special") return undefined;
  if (descriptor.denialContext.kind !== "path" && descriptor.denialContext.kind !== "bash_path") return undefined;
  if (!descriptor.denialContext.cwd) return undefined;
  return descriptor.promptDetails.path;
}

function createServiceLifecycle(pi: ExtensionAPI, runtime: Runtime): PermissionServiceLifecycle {
  const rpcHandles = registerPermissionRpcHandlers(pi.events, {
    permissionManager: runtime.manager,
    sessionRules: runtime.rules,
    session: runtime.session,
    requestPermissionDecisionFromUi,
  });
  const service = new LocalPermissionsService({
    permissionManager: runtime.manager,
    sessionRules: runtime.rules,
    formatterRegistry: runtime.registries.tools.formatters,
    accessExtractorRegistry: runtime.registries.tools.extractors,
  });
  const unsubSubagents = subscribeSubagentLifecycle(pi.events, runtime.registries.subagents);
  return new PermissionServiceLifecycle({
    service,
    registry: runtime.registries.subagents,
    events: pi.events,
    subscriptions: [rpcHandles.unsubCheck, rpcHandles.unsubPrompt, unsubSubagents],
  });
}

function createGateHandler(args: {
  runtime: Runtime;
  resolver: PermissionResolver;
  pi: ExtensionAPI;
  toolRegistry: ReturnType<typeof createToolRegistry>;
  onApproval: (descriptor: GateDescriptor, check: PermissionCheckResult) => void;
}): PermissionGateHandler {
  const { runtime, resolver, pi, toolRegistry, onApproval } = args;
  const reporter = {
    emitDecision: (event: Parameters<typeof emitDecisionEvent>[1]) => emitDecisionEvent(pi.events, event),
  };
  const runner = new GateRunner({
    resolver,
    recorder: runtime.rules,
    defaultPrompter: runtime.gateway,
    reporter,
    onApproval,
  });
  return new PermissionGateHandler({
    session: runtime.session,
    toolRegistry,
    pipeline: new ToolCallGatePipeline({
      resolver,
      inputs: runtime.session,
      customFormatters: runtime.registries.tools.formatters,
      customExtractors: runtime.registries.tools.extractors,
    }),
    skillInputPipeline: new SkillInputGatePipeline(resolver),
    runner,
  });
}

function createToolRegistry(pi: ExtensionAPI) {
  return {
    getAll: () => pi.getAllTools(),
    getActive: () => pi.getActiveTools(),
    setActive: (names: string[]) => pi.setActiveTools(names),
  };
}

function installPromptDispatcher(pi: ExtensionAPI, runtime: Runtime): void {
  installLocalPrompter(pi, {
    prompter: runtime.prompter,
    canResolve: (ctx) => canResolvePrompt(ctx, runtime),
  });
}

function canResolvePrompt(ctx: ExtensionContext, runtime: Runtime): boolean {
  if (ctx.hasUI) return true;
  return isSubagentExecutionContext(ctx, runtime.paths.subagentSessionsDir, runtime.registries.subagents);
}
