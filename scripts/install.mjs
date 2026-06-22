#!/usr/bin/env node
import {
  createInstallPlan,
  npmCommandForRuntime,
  parseInstallArgs,
} from "./lib/command-plans.mjs";
import { findPythonCommand } from "./lib/python-command.mjs";
import { runPlanSync } from "./lib/run-plan.mjs";

const options = parseInstallArgs(process.argv.slice(2));
const plan = createInstallPlan({
  ...options,
  npmCommand: npmCommandForRuntime(),
  pythonCommand: findPythonCommand(),
});

runPlanSync(plan, { successMessage: "Dependencies installed." });
