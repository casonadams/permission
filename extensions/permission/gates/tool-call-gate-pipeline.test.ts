import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToolCallGatePipeline } from "#src/gates/tool-call-gate-pipeline";

import { makeGateInputs, makeGateRunner, makeResolver, makeTcc } from "#test/helpers/gate-fixtures";
import { makeCheckResult } from "#test/helpers/handler-fixtures";

const { mockBashProgramParse } = vi.hoisted(() => ({
  mockBashProgramParse: vi.fn(),
}));

vi.mock("#src/gates/bash-program", () => ({
  BashProgram: { parse: mockBashProgramParse },
}));

function makeMockBashProgram() {
  return {
    commands: vi.fn<() => []>(() => []),
    pathRuleCandidates: vi.fn<() => []>(() => []),
    externalPaths: vi.fn<() => []>(() => []),
  };
}

describe("ToolCallGatePipeline", () => {
  beforeEach(() => {
    mockBashProgramParse.mockReset();
    mockBashProgramParse.mockResolvedValue(makeMockBashProgram());
  });

  describe("evaluate — non-bash tool", () => {
    it("returns allow when all gates pass", async () => {
      const resolver = makeResolver(makeCheckResult());
      const inputs = makeGateInputs();
      const { runner } = makeGateRunner();
      const pipeline = new ToolCallGatePipeline({ resolver, inputs });

      const result = await pipeline.evaluate(makeTcc({ toolName: "read", input: {} }), runner);

      expect(result).toEqual({ action: "allow" });
    });

    it("returns block when the tool gate denies", async () => {
      const resolver = makeResolver(makeCheckResult({ state: "deny", matchedPattern: "*" }));
      const inputs = makeGateInputs();
      const { runner } = makeGateRunner();
      const pipeline = new ToolCallGatePipeline({ resolver, inputs });

      const result = await pipeline.evaluate(makeTcc({ toolName: "read", input: {} }), runner);

      expect(result).toMatchObject({ action: "block" });
    });

    it("short-circuits after the first blocking gate without evaluating later ones", async () => {
      const resolver = makeResolver(makeCheckResult());
      const inputs = makeGateInputs();
      const { runner } = makeGateRunner();
      const runSpy = vi.spyOn(runner, "run").mockResolvedValue({ action: "block", reason: "first gate blocked" });

      const pipeline = new ToolCallGatePipeline({ resolver, inputs });
      const result = await pipeline.evaluate(makeTcc({ toolName: "read", input: {} }), runner);

      expect(result).toEqual({ action: "block", reason: "first gate blocked" });
      expect(runSpy).toHaveBeenCalledTimes(1);
    });

    it("calls getInfrastructureReadDirs() during evaluate", async () => {
      const getInfrastructureReadDirs = vi.fn<() => string[]>(() => []);
      const resolver = makeResolver(makeCheckResult());
      const inputs = makeGateInputs({ getInfrastructureReadDirs });
      const { runner } = makeGateRunner();
      const pipeline = new ToolCallGatePipeline({ resolver, inputs });

      await pipeline.evaluate(makeTcc({ toolName: "read", input: {} }), runner);

      expect(getInfrastructureReadDirs).toHaveBeenCalled();
    });

    it("calls getActiveSkillEntries() during evaluate", async () => {
      const getActiveSkillEntries = vi.fn<() => []>(() => []);
      const resolver = makeResolver(makeCheckResult());
      const inputs = makeGateInputs({ getActiveSkillEntries });
      const { runner } = makeGateRunner();
      const pipeline = new ToolCallGatePipeline({ resolver, inputs });

      await pipeline.evaluate(makeTcc({ toolName: "read", input: {} }), runner);

      expect(getActiveSkillEntries).toHaveBeenCalled();
    });

    it("does not call BashProgram.parse for non-bash tools", async () => {
      const resolver = makeResolver(makeCheckResult());
      const inputs = makeGateInputs();
      const { runner } = makeGateRunner();
      const pipeline = new ToolCallGatePipeline({ resolver, inputs });

      await pipeline.evaluate(makeTcc({ toolName: "read", input: {} }), runner);

      expect(mockBashProgramParse).not.toHaveBeenCalled();
    });
  });

  describe("evaluate — bash tool", () => {
    it("returns allow when the bash command is permitted", async () => {
      const resolver = makeResolver(makeCheckResult());
      const inputs = makeGateInputs();
      const { runner } = makeGateRunner();
      const pipeline = new ToolCallGatePipeline({ resolver, inputs });

      const result = await pipeline.evaluate(makeTcc({ toolName: "bash", input: { command: "echo hello" } }), runner);

      expect(result).toEqual({ action: "allow" });
    });

    it("parses BashProgram exactly once per evaluate for bash tools with a command", async () => {
      const resolver = makeResolver(makeCheckResult());
      const inputs = makeGateInputs();
      const { runner } = makeGateRunner();
      const pipeline = new ToolCallGatePipeline({ resolver, inputs });

      await pipeline.evaluate(makeTcc({ toolName: "bash", input: { command: "echo hello" } }), runner);

      expect(mockBashProgramParse).toHaveBeenCalledTimes(1);
      expect(mockBashProgramParse).toHaveBeenCalledWith("echo hello");
    });

    it("carries one approval across the remaining gates of the same bash call", async () => {
      const resolver = makeResolver(makeCheckResult({ state: "ask", matchedPattern: "*" }));
      const inputs = makeGateInputs();
      const { runner } = makeGateRunner();
      let callCount = 0;
      const runSpy = vi.spyOn(runner, "run").mockImplementation(async () => {
        callCount++;
        return callCount === 2 ? { action: "allow", toolCallApproved: true } : { action: "allow" };
      });
      mockBashProgramParse.mockResolvedValue({
        ...makeMockBashProgram(),
        externalPaths: vi.fn(() => ["/outside/file"]),
      });
      const pipeline = new ToolCallGatePipeline({ resolver, inputs });

      await pipeline.evaluate(
        makeTcc({ toolName: "bash", input: { command: "cat /outside/file; echo done" } }),
        runner,
      );

      expect(runSpy.mock.calls[2]?.[3]).toBe(true);
      expect(runSpy.mock.calls[3]?.[3]).toBe(true);
    });

    it("does not parse BashProgram when the bash command is empty", async () => {
      const resolver = makeResolver(makeCheckResult());
      const inputs = makeGateInputs();
      const { runner } = makeGateRunner();
      const pipeline = new ToolCallGatePipeline({ resolver, inputs });

      await pipeline.evaluate(makeTcc({ toolName: "bash", input: { command: "" } }), runner);

      expect(mockBashProgramParse).not.toHaveBeenCalled();
    });
  });

  describe("evaluate — customExtractors threading (#352)", () => {
    function pathDenyingResolver() {
      const resolver = makeResolver();
      resolver.resolve.mockImplementation((surface) =>
        surface === "path" ? makeCheckResult({ state: "deny", matchedPattern: "*" }) : makeCheckResult(),
      );
      return resolver;
    }

    const extractors = {
      get: (name: string) =>
        name === "ffgrep"
          ? (input: Record<string, unknown>) => (typeof input.target === "string" ? input.target : undefined)
          : undefined,
    };

    it("forwards extractors so a custom-shaped tool is path-gated", async () => {
      const resolver = pathDenyingResolver();
      const inputs = makeGateInputs();
      const { runner } = makeGateRunner();
      const pipeline = new ToolCallGatePipeline({ resolver, inputs, customExtractors: extractors });

      const result = await pipeline.evaluate(
        makeTcc({
          toolName: "ffgrep",
          input: { target: "/test/project/secret.env" },
        }),
        runner,
      );

      expect(result).toMatchObject({ action: "block" });
    });

    it("without extractors the custom-shaped tool is not path-gated", async () => {
      const resolver = pathDenyingResolver();
      const inputs = makeGateInputs();
      const { runner } = makeGateRunner();
      const pipeline = new ToolCallGatePipeline({ resolver, inputs });

      const result = await pipeline.evaluate(
        makeTcc({
          toolName: "ffgrep",
          input: { target: "/test/project/secret.env" },
        }),
        runner,
      );

      expect(result).toEqual({ action: "allow" });
    });
  });
});
