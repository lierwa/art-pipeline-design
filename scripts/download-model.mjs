#!/usr/bin/env node
import { createDownloadModelPlan } from "./lib/command-plans.mjs";
import { findPythonCommand } from "./lib/python-command.mjs";
import { runPlanSync } from "./lib/run-plan.mjs";

const plan = createDownloadModelPlan({
  pythonCommand: findPythonCommand(),
});

runPlanSync(plan, { successMessage: "Model downloaded." });
