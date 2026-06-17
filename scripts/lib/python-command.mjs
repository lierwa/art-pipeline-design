import { spawnSync } from "node:child_process";

function canRunPython(command) {
  const result = spawnSync(command.command, [
    ...command.args,
    "-c",
    "import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)",
  ]);

  return result.status === 0;
}

export function findPythonCommand(platform = process.platform) {
  const candidates = [];

  if (process.env.PYTHON) {
    candidates.push({ command: process.env.PYTHON, args: [] });
  }

  if (platform === "win32") {
    candidates.push({ command: "py", args: ["-3"] });
    candidates.push({ command: "python", args: [] });
    candidates.push({ command: "python3", args: [] });
  } else {
    candidates.push({ command: "python3", args: [] });
    candidates.push({ command: "python", args: [] });
  }

  const found = candidates.find(canRunPython);
  if (!found) {
    throw new Error(
      "Python 3.11+ was not found. Install Python 3.11+ or set PYTHON to a compatible interpreter.",
    );
  }

  return found;
}
