import { describe, expect, it } from "vitest";

import { type RequestedToolValidation, validateRequestedTool } from "#src/app/handlers/permission-gate-handler";

function makeTools(names: string[]): { name: string }[] {
  return names.map((name) => ({ name }));
}

const TOOLS = makeTools(["read", "bash", "edit"]);

describe("validateRequestedTool", () => {
  describe("missing / unresolvable tool name", () => {
    it("blocks when event has no name field", () => {
      const result = validateRequestedTool({ type: "tool_call" }, TOOLS);
      expect(result.status).toBe("block");
      expect((result as Extract<RequestedToolValidation, { status: "block" }>).reason).toBeTruthy();
    });

    it("blocks when name field is an empty string", () => {
      const result = validateRequestedTool({ name: "" }, TOOLS);
      expect(result.status).toBe("block");
    });

    it("blocks when name field is null", () => {
      const result = validateRequestedTool({ name: null }, TOOLS);
      expect(result.status).toBe("block");
    });

    it("blocks when event is a primitive", () => {
      const result = validateRequestedTool("not-an-object", TOOLS);
      expect(result.status).toBe("block");
    });
  });

  describe("unregistered tool", () => {
    it("blocks when the tool name is not in the registered list", () => {
      const result = validateRequestedTool({ name: "unknown-tool" }, TOOLS);
      expect(result.status).toBe("block");
    });

    it("includes available tool names in the block reason", () => {
      const result = validateRequestedTool({ name: "unknown-tool" }, TOOLS);
      expect(result.status).toBe("block");
      const { reason } = result as Extract<RequestedToolValidation, { status: "block" }>;
      expect(reason).toContain("read");
      expect(reason).toContain("bash");
      expect(reason).toContain("edit");
    });

    it("blocks with empty available list when no tools are registered", () => {
      const result = validateRequestedTool({ name: "anything" }, []);
      expect(result.status).toBe("block");
    });
  });

  describe("registered tool (ok path)", () => {
    it("returns ok with the raw tool name for a known tool", () => {
      const result = validateRequestedTool({ name: "read" }, TOOLS);
      expect(result).toEqual({ status: "ok", toolName: "read" });
    });

    it("returns the raw name as it appeared in the event (not normalised)", () => {
      const result = validateRequestedTool({ name: "bash" }, TOOLS);
      expect(result).toEqual({ status: "ok", toolName: "bash" });
    });

    it("resolves tool name via the `arguments` field naming convention", () => {
      const result = validateRequestedTool({ name: "edit" }, TOOLS);
      expect(result).toEqual({ status: "ok", toolName: "edit" });
    });
  });
});
