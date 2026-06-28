import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

export function renderPromptBody(preview: string): string {
  const normalized = preview.replace(/\r/g, "");
  const rawLines = normalized.split("\n");

  if (rawLines.length === 1) {
    return rawLines[0] || "";
  }

  const previewLines = rawLines.slice(0, 6);
  return previewLines
    .map((line, i) => {
      const suffix = i === previewLines.length - 1 && rawLines.length > previewLines.length ? "…" : "";
      return `${line || ""}${suffix}`;
    })
    .join("\n");
}

export function wrapParagraphs(text: string, width: number): string[] {
  return text.split("\n").flatMap((line) => {
    if (!line) return [""];
    return wrapTextWithAnsi(line, width);
  });
}

export function padLine(text: string, width: number): string {
  const truncated = truncateToWidth(text, width, "");
  return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
}
