import { spawnSync } from "node:child_process";

export function runPlanSync(plan, { cwd = process.cwd(), env = process.env, successMessage } = {}) {
  for (const step of plan) {
    console.log(`\n[${step.label}] ${step.command} ${step.args.join(" ")}`);
    const result = spawnSync(step.command, step.args, {
      cwd,
      env,
      stdio: "inherit",
    });

    if (result.error) {
      console.error(`[${step.label}] failed to start: ${result.error.message}`);
    }

    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }

  if (successMessage) {
    // WHY: 安装、下载、完整 setup 都跨进程执行；集中出口避免各脚本对失败状态的处理漂移。
    console.log(`\n${successMessage}`);
  }
}
