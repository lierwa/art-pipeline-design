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
      : env.ART_PIPELINE_DETECTION_PROVIDER?.trim() || "grounding_dino";
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
      ],
      env: {
        ART_PIPELINE_DETECTION_PROVIDER: detectionProvider,
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
    },
  ];
}
