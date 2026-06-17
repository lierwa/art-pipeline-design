#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import readline from "node:readline";

import {
  createDevPlan,
  npmCommandForRuntime,
  parseDevArgs,
} from "./lib/command-plans.mjs";
import { findPythonCommand } from "./lib/python-command.mjs";

const options = parseDevArgs(process.argv.slice(2));
const plan = createDevPlan({
  ...options,
  npmCommand: npmCommandForRuntime(),
  pythonCommand: findPythonCommand(),
});

const children = new Set();
let shuttingDown = false;

function prefixOutput(label, stream, output) {
  const rl = readline.createInterface({ input: stream });
  rl.on("line", (line) => output.write(`[${label}] ${line}\n`));
}

function stopProcess(child) {
  if (!child.pid || child.exitCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of children) {
    stopProcess(child);
  }
  process.exit(exitCode);
}

for (const step of plan) {
  console.log(`[${step.label}] ${step.command} ${step.args.join(" ")}`);
  const child = spawn(step.command, step.args, {
    cwd: process.cwd(),
    env: { ...process.env, ...(step.env ?? {}) },
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });

  children.add(child);
  prefixOutput(step.label, child.stdout, process.stdout);
  prefixOutput(step.label, child.stderr, process.stderr);

  child.on("error", (error) => {
    console.error(`[${step.label}] failed to start: ${error.message}`);
    shutdown(1);
  });

  child.on("exit", (code, signal) => {
    children.delete(child);
    if (!shuttingDown) {
      const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
      console.error(`[${step.label}] exited with ${reason}; stopping dev server.`);
      shutdown(code ?? 1);
    }
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
