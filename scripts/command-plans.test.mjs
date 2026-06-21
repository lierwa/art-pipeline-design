import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createDownloadModelPlan,
  createDevPlan,
  createInstallPlan,
  npmCommandForRuntime,
  parseDevArgs,
  parseInstallArgs,
} from "./lib/command-plans.mjs";
import {
  findPythonCommand,
  pythonCandidates,
} from "./lib/python-command.mjs";

test("createInstallPlan installs backend dev package and frontend dependencies", () => {
  const plan = createInstallPlan({
    npmCommand: { command: "npm", args: [] },
    pythonCommand: { command: "python3", args: [] },
  });

  assert.deepEqual(plan, [
    {
      label: "backend",
      command: "python3",
      args: ["-m", "pip", "install", "-e", "backend[dev]"],
    },
    {
      label: "frontend",
      command: "npm",
      args: ["--prefix", "frontend", "install"],
    },
  ]);
});

test("createInstallPlan can include optional model dependencies", () => {
  const plan = createInstallPlan({
    includeModel: true,
    npmCommand: { command: "npm", args: [] },
    pythonCommand: { command: "python3", args: [] },
  });

  assert.equal(plan[0].args.at(-1), "backend[dev,model]");
});

test("createDevPlan starts backend and frontend from repository root", () => {
  const plan = createDevPlan({
    npmCommand: { command: "npm", args: [] },
    pythonCommand: { command: "python3", args: [] },
  });

  assert.deepEqual(plan, [
    {
      label: "backend",
      command: "python3",
      args: [
        "-m",
        "uvicorn",
        "art_pipeline.api:app",
        "--reload",
        "--app-dir",
        "backend",
        "--host",
        "127.0.0.1",
        "--port",
        "8766",
      ],
      env: {
        ART_PIPELINE_DETECTION_PROVIDER: "grounding_dino",
        ART_PIPELINE_SAM2_PROVIDER: "transformers",
      },
    },
    {
      label: "frontend",
      command: "npm",
      args: [
        "--prefix",
        "frontend",
        "run",
        "dev",
        "--",
        "--host",
        "127.0.0.1",
        "--port",
        "5176",
      ],
      env: {
        ART_PIPELINE_API_PROXY: "http://127.0.0.1:8766",
      },
    },
  ]);
});

test("createDevPlan lets the backend dev port avoid other local services", () => {
  const plan = createDevPlan({
    env: { ART_PIPELINE_BACKEND_PORT: "8787" },
    npmCommand: { command: "npm", args: [] },
    pythonCommand: { command: "python3", args: [] },
  });

  assert.deepEqual(plan[0].args.slice(-4), ["--host", "127.0.0.1", "--port", "8787"]);
  assert.deepEqual(plan[1].env, {
    ART_PIPELINE_API_PROXY: "http://127.0.0.1:8787",
  });
});

test("createDevPlan preserves an explicitly configured API proxy target", () => {
  const plan = createDevPlan({
    env: {
      ART_PIPELINE_BACKEND_PORT: "8787",
      ART_PIPELINE_API_PROXY: "http://127.0.0.1:9900",
    },
    npmCommand: { command: "npm", args: [] },
    pythonCommand: { command: "python3", args: [] },
  });

  assert.deepEqual(plan[1].env, {
    ART_PIPELINE_API_PROXY: "http://127.0.0.1:9900",
  });
});

test("createDevPlan lets the frontend dev port avoid other local services", () => {
  const plan = createDevPlan({
    env: { ART_PIPELINE_FRONTEND_PORT: "5186" },
    npmCommand: { command: "npm", args: [] },
    pythonCommand: { command: "python3", args: [] },
  });

  assert.deepEqual(plan[1].args.slice(-2), ["--port", "5186"]);
});

test("createDevPlan preserves python launcher prefix arguments", () => {
  const plan = createDevPlan({
    npmCommand: { command: "npm.cmd", args: [] },
    pythonCommand: { command: "py", args: ["-3"] },
  });

  assert.deepEqual(plan[0].args.slice(0, 3), ["-3", "-m", "uvicorn"]);
  assert.equal(plan[1].command, "npm.cmd");
});

test("createDevPlan preserves an explicitly configured detection provider", () => {
  const plan = createDevPlan({
    env: { ART_PIPELINE_DETECTION_PROVIDER: "grounding_dino" },
    npmCommand: { command: "npm", args: [] },
    pythonCommand: { command: "python3", args: [] },
  });

  assert.equal(plan[0].env.ART_PIPELINE_DETECTION_PROVIDER, "grounding_dino");
});

test("createDevPlan starts the real SAM2 provider by default", () => {
  const plan = createDevPlan({
    env: {},
    npmCommand: { command: "npm", args: [] },
    pythonCommand: { command: "python3", args: [] },
  });

  assert.equal(plan[0].env.ART_PIPELINE_SAM2_PROVIDER, "transformers");
});

test("createDevPlan preserves an explicitly configured SAM2 provider", () => {
  const plan = createDevPlan({
    env: { ART_PIPELINE_SAM2_PROVIDER: "hf" },
    npmCommand: { command: "npm", args: [] },
    pythonCommand: { command: "python3", args: [] },
  });

  assert.equal(plan[0].env.ART_PIPELINE_SAM2_PROVIDER, "hf");
});

test("createDevPlan preserves demo provider only when explicitly configured", () => {
  const plan = createDevPlan({
    env: { ART_PIPELINE_DETECTION_PROVIDER: "demo" },
    npmCommand: { command: "npm", args: [] },
    pythonCommand: { command: "python3", args: [] },
  });

  assert.equal(plan[0].env.ART_PIPELINE_DETECTION_PROVIDER, "demo");
});

test("createDevPlan can explicitly start the demo provider", () => {
  const plan = createDevPlan({
    env: { ART_PIPELINE_DETECTION_PROVIDER: "grounding_dino" },
    useDemoProvider: true,
    npmCommand: { command: "npm", args: [] },
    pythonCommand: { command: "python3", args: [] },
  });

  assert.equal(plan[0].env.ART_PIPELINE_DETECTION_PROVIDER, "demo");
});

test("createDownloadModelPlan downloads the formal detection and segmentation models", () => {
  assert.deepEqual(
    createDownloadModelPlan({
      pythonCommand: { command: "python3", args: [] },
    }),
    [
      {
        label: "grounding-dino-model",
        command: "python3",
        args: ["-m", "art_pipeline.model_runners.download_grounding_dino"],
      },
      {
        label: "sam2-model",
        command: "python3",
        args: ["-m", "art_pipeline.model_runners.download_sam2"],
      },
    ],
  );
});

test("findPythonCommand prefers the repository virtual environment", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "art-pipeline-python-"));
  const venvBin = join(tempRoot, ".venv", "bin");
  const venvPython = join(venvBin, "python");
  mkdirSync(venvBin, { recursive: true });
  writeFileSync(venvPython, "#!/bin/sh\nexit 0\n");
  chmodSync(venvPython, 0o755);

  try {
    assert.deepEqual(
      pythonCandidates({ platform: "darwin", cwd: tempRoot, env: {} }).slice(0, 3),
      [
        { command: venvPython, args: [] },
        { command: "python3", args: [] },
        { command: "python", args: [] },
      ],
    );

    const calls = [];
    const found = findPythonCommand({
      platform: "darwin",
      cwd: tempRoot,
      env: {},
      spawnSync(command) {
        calls.push(command);
        return { status: command === venvPython ? 0 : 1 };
      },
    });

    assert.equal(found.command, venvPython);
    assert.deepEqual(calls, [venvPython]);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("npmCommandForRuntime uses npm_execpath when npm launched the script", () => {
  assert.deepEqual(
    npmCommandForRuntime({
      env: { npm_execpath: "/opt/npm/bin/npm-cli.js" },
      nodePath: "/usr/local/bin/node",
      platform: "linux",
    }),
    {
      command: "/usr/local/bin/node",
      args: ["/opt/npm/bin/npm-cli.js"],
    },
  );
});

test("npmCommandForRuntime falls back to platform npm command", () => {
  assert.deepEqual(npmCommandForRuntime({ env: {}, platform: "win32" }), {
    command: "npm.cmd",
    args: [],
  });
  assert.deepEqual(npmCommandForRuntime({ env: {}, platform: "linux" }), {
    command: "npm",
    args: [],
  });
  assert.deepEqual(npmCommandForRuntime({ env: {}, platform: "darwin" }), {
    command: "npm",
    args: [],
  });
});

test("parseInstallArgs supports model dependencies and skips", () => {
  assert.deepEqual(parseInstallArgs(["--model", "--skip-frontend"]), {
    includeModel: true,
    skipBackend: false,
    skipFrontend: true,
  });
});

test("parseDevArgs supports explicit demo mode", () => {
  assert.deepEqual(parseDevArgs(["--demo"]), {
    useDemoProvider: true,
  });
  assert.deepEqual(parseDevArgs([]), {
    useDemoProvider: false,
  });
});
