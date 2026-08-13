import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { installPermissionExtension } from "./app/composition-root";

export default function piPermissionSystemExtension(pi: ExtensionAPI): void {
  installPermissionExtension(pi);
}
