import { Key, matchesKey } from "@earendil-works/pi-tui";
import { bodyScrollLimit } from "./horizontal-render";

type TuiLike = { requestRender(): void };

export class BodyScroller {
  private offset = 0;
  private maxOffset = 0;

  constructor(private readonly tui: TuiLike) {}

  prepare(body: string, width: number): number {
    this.maxOffset = bodyScrollLimit(body, width);
    this.offset = Math.min(this.offset, this.maxOffset);
    return this.offset;
  }

  handleInput(data: string): boolean {
    if (matchesKey(data, Key.up) || data === "k") return this.move(-1);
    if (matchesKey(data, Key.down) || data === "j") return this.move(1);
    return false;
  }

  reset(): void {
    this.offset = 0;
  }

  private move(delta: number): true {
    this.offset = Math.max(0, Math.min(this.maxOffset, this.offset + delta));
    this.tui.requestRender();
    return true;
  }
}
