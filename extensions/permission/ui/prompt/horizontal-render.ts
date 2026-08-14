import type { HorizontalOption } from "./horizontal-component.ts";
import { padLine, wrapParagraphs } from "./render.ts";

const BODY_VIEWPORT_LINES = 8;

export type ThemeLike = {
  fg(color: string, text: string): string;
  bg(color: string, text: string): string;
  bold(text: string): string;
};

export function renderComponent<T extends string>(args: {
  width: number;
  theme: ThemeLike;
  title: string;
  body: string;
  bodyOffset?: number;
  options: HorizontalOption<T>[];
  selected: number;
}): string[] {
  const innerWidth = Math.max(20, args.width - 2);
  const content = buildContent({ ...args, innerWidth });
  return [
    args.theme.fg("warning", `┌${"─".repeat(innerWidth)}┐`),
    ...content.map((line) => args.theme.fg("warning", "│") + padLine(line, innerWidth) + args.theme.fg("warning", "│")),
    args.theme.fg("warning", `└${"─".repeat(innerWidth)}┘`),
  ];
}

function buildContent<T extends string>(args: {
  innerWidth: number;
  theme: ThemeLike;
  title: string;
  body: string;
  bodyOffset?: number;
  options: HorizontalOption<T>[];
  selected: number;
}): string[] {
  const contentWidth = Math.max(10, args.innerWidth - 2);
  const body = buildBody({
    body: args.body,
    width: contentWidth,
    requestedOffset: args.bodyOffset ?? 0,
    theme: args.theme,
  });
  return [
    args.theme.fg("warning", args.theme.bold(args.title)),
    "",
    ...body,
    renderOptions(args.theme, args.options, args.selected),
  ];
}

function buildBody(args: { body: string; width: number; requestedOffset: number; theme: ThemeLike }): string[] {
  if (!args.body.trim()) return [];
  const lines = wrapParagraphs(args.body, args.width);
  const maxOffset = Math.max(0, lines.length - BODY_VIEWPORT_LINES);
  const offset = Math.min(args.requestedOffset, maxOffset);
  const visible = lines.slice(offset, offset + BODY_VIEWPORT_LINES);
  if (maxOffset > 0) {
    visible.push(
      args.theme.fg("dim", `lines ${offset + 1}-${offset + visible.length} of ${lines.length} (up/down to scroll)`),
    );
  }
  return [...visible, ""];
}

export function bodyScrollLimit(body: string, width: number): number {
  const innerWidth = Math.max(20, width - 2);
  const contentWidth = Math.max(10, innerWidth - 2);
  return Math.max(0, wrapParagraphs(body, contentWidth).length - BODY_VIEWPORT_LINES);
}

function renderOptions<T extends string>(theme: ThemeLike, options: HorizontalOption<T>[], selected: number): string {
  return options.map((option, index) => renderOption(theme, option, index === selected)).join("  ");
}

function renderOption<T extends string>(theme: ThemeLike, option: HorizontalOption<T>, selected: boolean): string {
  const text = ` ${option.label} `;
  return selected ? theme.bg("selectedBg", theme.fg("warning", text)) : theme.fg("muted", `[${option.label}]`);
}
