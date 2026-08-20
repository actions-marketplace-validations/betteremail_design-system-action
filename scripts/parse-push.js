import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function parsePushOutput(output) {
  const version = output.match(/^Created Version ([0-9]+):/m)?.[1] ?? "";
  const staged = /^Staged as Candidate\.$/m.test(output);
  const stagingParsed =
    staged ||
    /^Not staged as Candidate:/m.test(output) ||
    /^Version created, but staging as Candidate failed:/m.test(output);

  return { version, staged, stagingParsed };
}

function emitOutputs(output) {
  const parsed = parsePushOutput(output);

  if (parsed.version === "") {
    console.error(
      "::warning::Could not parse the created Version number from better ds push output.",
    );
  }
  if (!parsed.stagingParsed) {
    console.error(
      "::warning::Could not parse the Candidate staging result from better ds push output; reporting staged=false.",
    );
  }

  console.log(`version=${parsed.version}`);
  console.log(`staged=${parsed.staged}`);
}

const scriptPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (scriptPath === fileURLToPath(import.meta.url)) {
  try {
    emitOutputs(readFileSync(process.argv[2], "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `::warning::Could not parse better ds push output: ${message}`,
    );
    console.log("version=");
    console.log("staged=false");
  }
}
