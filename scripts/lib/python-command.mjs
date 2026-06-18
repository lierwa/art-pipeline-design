import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

function canRunPython(command, runCommand = spawnSync) {
  const result = runCommand(command.command, [
    ...command.args,
    "-c",
    "import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)",
  ]);

  return result.status === 0;
}

export function pythonCandidates({
  platform = process.platform,
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  const candidates = [];

  if (env.PYTHON) {
    candidates.push({ command: env.PYTHON, args: [] });
  }

  const localVenvPython =
    platform === "win32"
      ? join(cwd, ".venv", "Scripts", "python.exe")
      : join(cwd, ".venv", "bin", "python");
  if (existsSync(localVenvPython)) {
    candidates.push({ command: localVenvPython, args: [] });
  }

  if (platform === "win32") {
    candidates.push({ command: "py", args: ["-3"] });
    candidates.push({ command: "python", args: [] });
    candidates.push({ command: "python3", args: [] });
  } else {
    candidates.push({ command: "python3", args: [] });
    candidates.push({ command: "python", args: [] });
  }

  return candidates;
}

export function findPythonCommand(options = {}) {
  const normalizedOptions =
    typeof options === "string" ? { platform: options } : options;
  const found = pythonCandidates(normalizedOptions).find((candidate) =>
    canRunPython(candidate, normalizedOptions.spawnSync ?? spawnSync),
  );
  if (!found) {
    throw new Error(
      "Python 3.11+ was not found. Install Python 3.11+ or set PYTHON to a compatible interpreter.",
    );
  }

  return found;
}
