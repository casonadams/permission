import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { installPermissionExtension } from "./composition-root";

export default function piPermissionSystemExtension(pi: ExtensionAPI): void {
  installPermissionExtension(pi);
}
