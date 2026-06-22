#!/usr/bin/env node
import {
  createSetupPlan,
  npmCommandForRuntime,
} from "./lib/command-plans.mjs";
import { findPythonCommand } from "./lib/python-command.mjs";
import { runPlanSync } from "./lib/run-plan.mjs";

const pythonCommand = findPythonCommand();
const plan = createSetupPlan({
  npmCommand: npmCommandForRuntime(),
  pythonCommand,
});

// WHY: 正式启动依赖“包安装”和“模型权重缓存”两个连续步骤；
// 暴露单一 setup 入口，避免用户在多个 npm script 之间手动拼接并漏跑。
runPlanSync(plan, { successMessage: "Dependencies and models installed." });
