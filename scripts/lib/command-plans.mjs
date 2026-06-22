export function npmCommandForRuntime({
  env = process.env,
  nodePath = process.execPath,
  platform = process.platform,
} = {}) {
  if (env.npm_execpath) {
    return {
      command: nodePath,
      args: [env.npm_execpath],
    };
  }

  return {
    command: platform === "win32" ? "npm.cmd" : "npm",
    args: [],
  };
}

export function parseInstallArgs(argv) {
  return {
    includeModel: argv.includes("--model"),
    skipBackend: argv.includes("--skip-backend"),
    skipFrontend: argv.includes("--skip-frontend"),
  };
}

export function parseDevArgs(argv) {
  return {
    useDemoProvider: argv.includes("--demo"),
  };
}

export function createInstallPlan({
  includeModel = false,
  skipBackend = false,
  skipFrontend = false,
  npmCommand = npmCommandForRuntime(),
  pythonCommand,
} = {}) {
  const plan = [];
  const python = pythonCommand ?? { command: "python", args: [] };

  if (!skipBackend) {
    plan.push({
      label: "backend",
      command: python.command,
      args: [
        ...python.args,
        "-m",
        "pip",
        "install",
        "-e",
        includeModel ? "backend[dev,model]" : "backend[dev]",
      ],
    });
  }

  if (!skipFrontend) {
    plan.push({
      label: "frontend",
      command: npmCommand.command,
      args: [...npmCommand.args, "--prefix", "frontend", "install"],
    });
  }

  return plan;
}

export function createDownloadModelPlan({
  pythonCommand,
} = {}) {
  const python = pythonCommand ?? { command: "python", args: [] };

  return [
    {
      label: "grounding-dino-model",
      command: python.command,
      args: [
        ...python.args,
        "-m",
        "art_pipeline.model_runners.download_grounding_dino",
      ],
    },
    {
      label: "sam2-model",
      command: python.command,
      args: [
        ...python.args,
        "-m",
        "art_pipeline.model_runners.download_sam2",
      ],
    },
  ];
}

export function createSetupPlan({
  npmCommand = npmCommandForRuntime(),
  pythonCommand,
} = {}) {
  return [
    ...createInstallPlan({
      includeModel: true,
      npmCommand,
      pythonCommand,
    }),
    ...createDownloadModelPlan({
      pythonCommand,
    }),
  ];
}

export function createDevPlan({
  env = process.env,
  host = "127.0.0.1",
  npmCommand = npmCommandForRuntime(),
  pythonCommand,
  useDemoProvider = false,
} = {}) {
  const python = pythonCommand ?? { command: "python", args: [] };
  const detectionProvider =
    useDemoProvider
      ? "demo"
      // WHY: 常规 demo 流程应优先走真实 Grounding DINO；只有显式 --demo 或 env=demo 才使用硬编码检测。
      : env.ART_PIPELINE_DETECTION_PROVIDER?.trim() || "grounding_dino";
  const sam2Provider = env.ART_PIPELINE_SAM2_PROVIDER?.trim() || "transformers";
  // WHY: uvicorn 默认 8000 很容易被本机旧后端或其他 Python 服务占用；
  // dev 脚本显式绑定一个可配置端口，并同步注入 Vite 代理，避免前后端端口漂移。
  const backendPort = env.ART_PIPELINE_BACKEND_PORT?.trim() || "8766";
  const apiProxyTarget = env.ART_PIPELINE_API_PROXY?.trim() || `http://${host}:${backendPort}`;
  const frontendPort = env.ART_PIPELINE_FRONTEND_PORT?.trim() || "5176";

  return [
    {
      label: "backend",
      command: python.command,
      args: [
        ...python.args,
        "-m",
        "uvicorn",
        "art_pipeline.api:app",
        "--reload",
        "--app-dir",
        "backend",
        "--host",
        host,
        "--port",
        backendPort,
      ],
      env: {
        ART_PIPELINE_DETECTION_PROVIDER: detectionProvider,
        // WHY: Segment 是正常流程的一环；dev 启动时不注入 SAM2 会让用户在面板里点 Suggest mask 后才发现链路断掉。
        ART_PIPELINE_SAM2_PROVIDER: sam2Provider,
      },
    },
    {
      label: "frontend",
      command: npmCommand.command,
      args: [
        ...npmCommand.args,
        "--prefix",
        "frontend",
        "run",
        "dev",
        "--",
        "--host",
        host,
        "--port",
        frontendPort,
      ],
      env: {
        ART_PIPELINE_API_PROXY: apiProxyTarget,
      },
    },
  ];
}
