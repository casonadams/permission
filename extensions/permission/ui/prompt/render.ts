import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

export function renderPromptBody(preview: string): string {
  return preview.replace(/\r/g, "");
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
