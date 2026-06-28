import type { HorizontalOption } from "./horizontal-component.ts";
import { padLine, wrapParagraphs } from "./render.ts";

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
  options: HorizontalOption<T>[];
  selected: number;
}): string[] {
  const contentWidth = Math.max(10, args.innerWidth - 2);
  return [
    args.theme.fg("warning", args.theme.bold(args.title)),
    "",
    ...wrapParagraphs(args.body, contentWidth),
    "",
    renderOptions(args.theme, args.options, args.selected),
  ];
}

function renderOptions<T extends string>(theme: ThemeLike, options: HorizontalOption<T>[], selected: number): string {
  return options.map((option, index) => renderOption(theme, option, index === selected)).join("  ");
}

function renderOption<T extends string>(theme: ThemeLike, option: HorizontalOption<T>, selected: boolean): string {
  const text = ` ${option.label} `;
  return selected ? theme.bg("selectedBg", theme.fg("warning", text)) : theme.fg("muted", `[${option.label}]`);
}
