#!/usr/bin/env node
import { spawnSync } from "node:child_process";

import {
  createInstallPlan,
  npmCommandForRuntime,
  parseInstallArgs,
} from "./lib/command-plans.mjs";
import { findPythonCommand } from "./lib/python-command.mjs";

const options = parseInstallArgs(process.argv.slice(2));
const plan = createInstallPlan({
  ...options,
  npmCommand: npmCommandForRuntime(),
  pythonCommand: findPythonCommand(),
});

for (const step of plan) {
  console.log(`\n[${step.label}] ${step.command} ${step.args.join(" ")}`);
  const result = spawnSync(step.command, step.args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`[${step.label}] failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("\nDependencies installed.");
