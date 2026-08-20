import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function resolvePushName(template, sha, ref) {
  return template.replaceAll("{sha}", sha).replaceAll("{ref}", ref);
}

const scriptPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (scriptPath === fileURLToPath(import.meta.url)) {
  process.stdout.write(
    resolvePushName(
      process.argv[2] ?? "",
      process.argv[3] ?? "",
      process.argv[4] ?? "",
    ),
  );
}
