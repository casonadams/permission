import { describe, expect, test } from "vitest";
import { formatBashCommandPreview } from "#src/prompting/bash-command-preview";

describe("formatBashCommandPreview", () => {
  test("places flags and chained commands on separate lines", () => {
    expect(formatBashCommandPreview("pnpm vitest run --coverage && pnpm lint --write")).toBe(
      ["pnpm vitest run \\", "  --coverage &&", "pnpm lint \\", "  --write"].join("\n"),
    );
  });

  test("keeps command separators on the preceding line", () => {
    expect(formatBashCommandPreview("test --file config.json || echo missing")).toBe(
      ["test \\", "  --file config.json ||", "echo missing"].join("\n"),
    );
    expect(formatBashCommandPreview('printf "hi"; echo "hello"')).toBe('printf "hi";\necho "hello"');
    expect(formatBashCommandPreview("cat file | grep foo")).toBe("cat file |\ngrep foo");
    expect(formatBashCommandPreview("cat file |& head")).toBe("cat file |&\nhead");
    expect(formatBashCommandPreview("npm start & sleep 1")).toBe("npm start &\nsleep 1");
  });

  test("keeps a flag value with its flag", () => {
    expect(formatBashCommandPreview("rg --glob '*.ts' permission extensions")).toBe(
      ["rg \\", "  --glob '*.ts' permission extensions"].join("\n"),
    );
  });

  test("does not treat quoted flags or operators as syntax", () => {
    expect(formatBashCommandPreview("printf '%s && %s' '--flag' value && echo done")).toBe(
      ["printf '%s && %s' '--flag' value &&", "echo done"].join("\n"),
    );
  });

  test("keeps file-descriptor redirections intact", () => {
    expect(formatBashCommandPreview("cat --number file 2>&1 && echo done")).toBe(
      ["cat \\", "  --number file 2>&1 &&", "echo done"].join("\n"),
    );
  });

  test("leaves simple and already multiline commands unchanged", () => {
    expect(formatBashCommandPreview("git status")).toBe("git status");
    expect(formatBashCommandPreview("git status \\\n  --short")).toBe("git status \\\n  --short");
  });

  test("formats operators in multiline previews", () => {
    expect(
      formatBashCommandPreview(
        "set -e\nprintf 'alpha\\n'; printf 'beta\\n' && printf 'gamma\\n' || printf 'fallback\\n'",
      ),
    ).toBe("set -e\nprintf 'alpha\\n';\nprintf 'beta\\n' &&\nprintf 'gamma\\n' ||\nprintf 'fallback\\n'");
  });
});
