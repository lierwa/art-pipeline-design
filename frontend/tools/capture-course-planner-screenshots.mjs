#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromiumExecutableCandidates } from "./course-planner-browser-candidates.mjs";

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(toolsDir, "..");
const workspaceRoot = path.resolve(frontendRoot, "..");
const docsAssetsDir = path.join(workspaceRoot, "docs", "assets");
const outputDir = path.join(workspaceRoot, "output", "verification");
const designDir = path.join(workspaceRoot, "output", "design");
const chromePath = findChrome();
const serveOnly = process.argv.includes("--serve-only");

const screenshotTargets = [
  {
    name: "chapter",
    path: "chapter-route-1920x1080.png",
    url: "/__course-planner-visual?view=chapter",
  },
  {
    name: "assembly",
    path: "assembly-route-1920x1080.png",
    url: "/__course-planner-visual?view=assembly",
  },
  {
    name: "assembly-drawer",
    path: "assembly-drawer-overlay-1920x1080.png",
    url: "/__course-planner-visual?view=assembly-drawer",
  },
];

const cropTargets = [
  ["chapter-progress-rail", "chapter-route-1920x1080.png", 0, 0, 330, 1080],
  ["chapter-left-column", "chapter-route-1920x1080.png", 330, 118, 710, 930],
  ["chapter-right-column", "chapter-route-1920x1080.png", 1040, 118, 880, 930],
  ["assembly-toolbar", "assembly-route-1920x1080.png", 0, 0, 1920, 96],
  ["assembly-assets", "assembly-route-1920x1080.png", 0, 96, 368, 920],
  ["assembly-canvas", "assembly-route-1920x1080.png", 368, 96, 1088, 920],
  ["assembly-inspector", "assembly-route-1920x1080.png", 1456, 96, 464, 920],
  ["assembly-footer", "assembly-route-1920x1080.png", 0, 1010, 1920, 70],
  ["assembly-drawer-overlay", "assembly-drawer-overlay-1920x1080.png", 1180, 56, 740, 1024],
];

const comparisonTargets = [
  {
    current: path.join(outputDir, "chapter-route-1920x1080.png"),
    output: path.join(outputDir, "chapter-reference-vs-current.png"),
    reference: path.join(designDir, "chapter-page-separated-assembly-reference-imagegen.png"),
    title: "Chapter Reference vs Current",
  },
  {
    current: path.join(outputDir, "assembly-route-1920x1080.png"),
    output: path.join(outputDir, "assembly-reference-vs-current.png"),
    reference: path.join(docsAssetsDir, "course-planner-assembly-editor-normal-reference.png"),
    title: "Assembly Reference vs Current",
  },
  {
    current: path.join(outputDir, "assembly-drawer-overlay-1920x1080.png"),
    output: path.join(outputDir, "assembly-drawer-reference-vs-current.png"),
    reference: path.join(docsAssetsDir, "course-planner-assembly-generated-assets-drawer-overlay-on-current-reference.png"),
    title: "Assembly Drawer Reference vs Current",
  },
];

mkdirSync(outputDir, { recursive: true });

const server = await createServer({
  root: frontendRoot,
  configFile: path.join(frontendRoot, "vite.config.ts"),
  server: {
    host: "127.0.0.1",
    port: 5197,
    strictPort: false,
  },
  plugins: [coursePlannerVisualPlugin()],
});

try {
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0]?.replace(/\/$/, "");
  if (!baseUrl) {
    throw new Error("Vite server did not expose a local URL.");
  }
  console.log(`visual server ${baseUrl}`);
  if (serveOnly) {
    console.log(`${baseUrl}/__course-planner-visual?view=chapter`);
    console.log(`${baseUrl}/__course-planner-visual?view=assembly`);
    console.log(`${baseUrl}/__course-planner-visual?view=assembly-drawer`);
    await new Promise(() => undefined);
  }

  for (const target of screenshotTargets) {
    await capture(`${baseUrl}${target.url}`, path.join(outputDir, target.path), 1920, 1080, target.name);
  }

  generateImageArtifacts();
} finally {
  await server.close();
}

async function capture(url, outputPath, width, height, waitFor) {
  const userDataDir = mkdtempSync(path.join(tmpdir(), "course-planner-chrome-"));
  const debuggingPort = await findFreePort();
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--disable-gpu",
    "--disable-sync",
    "--hide-scrollbars",
    "--no-default-browser-check",
    "--no-first-run",
    `--remote-debugging-port=${debuggingPort}`,
    "--remote-allow-origins=*",
    `--user-data-dir=${userDataDir}`,
    `--window-size=${width},${height}`,
    "about:blank",
  ], {
    cwd: workspaceRoot,
    stdio: "pipe",
  });

  try {
    const browserUrl = await waitForBrowserUrl(debuggingPort);
    const page = await createPage(browserUrl, url);
    const client = await connectCdp(page.webSocketDebuggerUrl);
    try {
      await client.send("Page.enable");
      await client.send("Runtime.enable");
      await client.send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await client.send("Page.navigate", { url });
      await delay(250);
      await waitForPageReady(client, waitFor);
      const screenshot = await client.send("Page.captureScreenshot", {
        captureBeyondViewport: false,
        fromSurface: true,
        format: "png",
      });
      writeFileSync(outputPath, Buffer.from(screenshot.data, "base64"));
    } finally {
      client.close();
    }
  } finally {
    stopProcessTree(chrome);
    await delay(500);
    try {
      rmSync(userDataDir, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
    } catch (error) {
      console.warn(`could not remove temporary browser profile ${userDataDir}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`captured ${outputPath}`);
}

async function findFreePort() {
  const server = createNetServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  if (!address || typeof address === "string") {
    throw new Error("Could not allocate a local debugging port.");
  }
  return address.port;
}

async function waitForBrowserUrl(port) {
  const endpoint = `http://127.0.0.1:${port}/json/version`;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    try {
      const response = await fetch(endpoint);
      if (response.ok) {
        return `http://127.0.0.1:${port}`;
      }
    } catch {
      await delay(120);
    }
  }
  throw new Error("Chrome DevTools endpoint did not become available.");
}

async function createPage(browserUrl, url) {
  const response = await fetch(`${browserUrl}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!response.ok) {
    throw new Error(`Could not create Chrome page: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function waitForPageReady(client, waitFor) {
  const expression = readyExpression(waitFor);
  const startedAt = Date.now();
  let lastValue = null;
  while (Date.now() - startedAt < 60000) {
    const result = await client.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
    });
    lastValue = result.result?.value;
    if (lastValue === true) {
      await delay(waitFor.startsWith("assembly") ? 2500 : 500);
      return;
    }
    await delay(150);
  }
  const debugText = await client.send("Runtime.evaluate", {
    expression: "document.body.textContent.slice(0, 500)",
    returnByValue: true,
  });
  throw new Error(`Timed out waiting for page readiness (${waitFor}); last value: ${String(lastValue)}; text: ${debugText.result?.value ?? ""}`);
}

function readyExpression(waitFor) {
  if (waitFor === "chapter") {
    return "document.body.textContent.includes('Chapter 02 - Breakfast Time') && document.body.textContent.includes('Studio Progress')";
  }
  if (waitFor === "assembly") {
    return "document.body.textContent.includes('Assembly') && document.body.textContent.includes('Placement')";
  }
  if (waitFor === "assembly-drawer") {
    return "document.body.textContent.includes('Generated Chapter Assets') && document.body.textContent.includes('Generated cat variant') && Boolean(document.querySelector('.course-planner-drawer-overlay'))";
  }
  return "Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0)";
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function connectCdp(webSocketDebuggerUrl) {
  if (typeof WebSocket === "undefined") {
    throw new Error("This Node.js runtime does not provide WebSocket.");
  }
  const socket = new WebSocket(webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();
  const waiters = new Map();

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
    socket.addEventListener("message", handleMessage);
  });

  return {
    close: () => socket.close(),
    send,
    waitForEvent,
  };

  function send(method, params = {}) {
    const id = nextId;
    nextId += 1;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      pending.set(id, { reject, resolve });
    });
  }

  function waitForEvent(method, timeoutMs) {
    return new Promise((resolve, reject) => {
      const waiter = (message) => {
        clearTimeout(timeout);
        resolve(message.params);
      };
      const timeout = setTimeout(() => {
        const methodWaiters = waiters.get(method) ?? [];
        waiters.set(method, methodWaiters.filter((item) => item !== waiter));
        reject(new Error(`Timed out waiting for CDP event ${method}.`));
      }, timeoutMs);
      const current = waiters.get(method) ?? [];
      waiters.set(method, [...current, waiter]);
    });
  }

  function handleMessage(event) {
    const message = JSON.parse(typeof event.data === "string" ? event.data : String(event.data));
    if (message.id) {
      const item = pending.get(message.id);
      if (!item) {
        return;
      }
      pending.delete(message.id);
      if (message.error) {
        item.reject(new Error(`${message.error.message}: ${message.error.data ?? ""}`));
        return;
      }
      item.resolve(message.result);
      return;
    }
    const methodWaiters = waiters.get(message.method);
    if (!methodWaiters?.length) {
      return;
    }
    const [waiter, ...rest] = methodWaiters;
    waiters.set(message.method, rest);
    waiter(message);
  }
}

function stopProcessTree(child) {
  if (!child.pid || child.exitCode !== null) {
    return;
  }
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  child.kill("SIGTERM");
}

function generateImageArtifacts() {
  const python = findPython();
  const result = spawnSync(python.command, [...python.args, "-"], {
    cwd: workspaceRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      COURSE_PLANNER_COMPARISONS: JSON.stringify(comparisonTargets),
      COURSE_PLANNER_CROPS: JSON.stringify(cropTargets),
      COURSE_PLANNER_OUTPUT_DIR: outputDir,
    },
    input: imageArtifactPython(),
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error([result.stdout, result.stderr].filter(Boolean).join("\n"));
  }
  process.stdout.write(result.stdout);
}

function findPython() {
  const candidates = process.platform === "win32"
    ? [
        { command: "py", args: ["-3"] },
        { command: "python", args: [] },
        { command: "python3", args: [] },
      ]
    : [
        { command: "python3", args: [] },
        { command: "python", args: [] },
      ];
  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, [...candidate.args, "-c", "import PIL"], { stdio: "ignore" });
    if (result.status === 0) {
      return candidate;
    }
  }
  throw new Error("Could not find Python with Pillow for image crops and comparisons.");
}

function imageArtifactPython() {
  return String.raw`
import json
import os
from PIL import Image, ImageDraw

output_dir = os.environ["COURSE_PLANNER_OUTPUT_DIR"]
crops = json.loads(os.environ["COURSE_PLANNER_CROPS"])
comparisons = json.loads(os.environ["COURSE_PLANNER_COMPARISONS"])

def paste_fit(canvas, image, box):
    x, y, width, height = box
    image = image.convert("RGB")
    image.thumbnail((width, height), Image.Resampling.LANCZOS)
    offset_x = x + (width - image.width) // 2
    offset_y = y + (height - image.height) // 2
    canvas.paste(image, (offset_x, offset_y))

for name, source_name, x, y, width, height in crops:
    source_path = os.path.join(output_dir, source_name)
    image = Image.open(source_path).convert("RGB")
    crop = Image.new("RGB", (width, height), (5, 8, 13))
    region = image.crop((x, y, min(x + width, image.width), min(y + height, image.height)))
    crop.paste(region, (0, 0))
    output_path = os.path.join(output_dir, f"{name}.png")
    crop.save(output_path)
    print(f"captured {output_path}")

for target in comparisons:
    canvas = Image.new("RGB", (3840, 1080), (17, 24, 39))
    reference = Image.open(target["reference"])
    current = Image.open(target["current"])
    paste_fit(canvas, reference, (0, 0, 1920, 1080))
    paste_fit(canvas, current, (1920, 0, 1920, 1080))
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((16, 16, 140, 52), fill=(17, 24, 39))
    draw.rectangle((1936, 16, 2044, 52), fill=(17, 24, 39))
    draw.text((28, 25), "Reference", fill=(255, 255, 255))
    draw.text((1948, 25), "Current", fill=(255, 255, 255))
    canvas.save(target["output"])
    print(f"captured {target['output']}")
`;
}

function coursePlannerVisualPlugin() {
  return {
    name: "course-planner-visual-screenshots",
    configureServer(viteServer) {
      viteServer.middlewares.use((request, response, next) => {
        const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
        if (requestUrl.pathname === "/__course-planner-visual") {
          void viteServer.transformIndexHtml(request.url ?? "/", visualHarnessHtml())
            .then((html) => sendHtml(response, html))
            .catch(next);
          return;
        }
        if (isScenePackageMediaRequest(requestUrl.pathname)) {
          sendSvg(response, placeholderSvg(requestUrl.pathname));
          return;
        }
        next();
      });
    },
  };
}

function visualHarnessHtml() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Course Planner Visual Harness</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/tools/course-planner-visual-harness.tsx"></script>
  </body>
</html>`;
}

function sendHtml(response, html) {
  response.statusCode = 200;
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.end(html);
}

function sendSvg(response, svg) {
  response.statusCode = 200;
  response.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(svg);
}

function isScenePackageMediaRequest(pathname) {
  return pathname.startsWith("/api/course-planner/chapters/") && pathname.includes("/scene-package/media/");
}

function placeholderSvg(pathname) {
  const mediaKind = pathname.split("/scene-package/media/")[1]?.split("/")[0] ?? "media";
  if (mediaKind === "empty_scene_images" || mediaKind === "complete_images" || mediaKind === "final_scene") {
    return kitchenSceneSvg(mediaKind);
  }
  return assetSvg(pathname);
}

function kitchenSceneSvg(mediaKind) {
  const accent = mediaKind === "final_scene" ? "#456a8d" : mediaKind === "complete_images" ? "#6a8d4e" : "#8f6a4a";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768" viewBox="0 0 1024 768">
    <defs>
      <linearGradient id="wall" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f7efe2"/>
        <stop offset="1" stop-color="#dfeaf1"/>
      </linearGradient>
      <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#d8c3a3"/>
        <stop offset="1" stop-color="#b89565"/>
      </linearGradient>
    </defs>
    <rect width="1024" height="500" fill="url(#wall)"/>
    <rect y="500" width="1024" height="268" fill="url(#floor)"/>
    <rect x="70" y="80" width="220" height="210" rx="8" fill="#d9ecf4" stroke="#8fb3c6" stroke-width="10"/>
    <rect x="350" y="115" width="520" height="110" rx="10" fill="#d0b187"/>
    <rect x="330" y="225" width="560" height="120" fill="#f4f0e8"/>
    <rect x="380" y="258" width="86" height="62" fill="#bfcbd2"/>
    <rect x="500" y="258" width="86" height="62" fill="#bfcbd2"/>
    <rect x="620" y="258" width="86" height="62" fill="#bfcbd2"/>
    <rect x="760" y="120" width="96" height="220" rx="12" fill="#dfe7ea"/>
    <rect x="230" y="405" width="570" height="120" rx="28" fill="${accent}"/>
    <rect x="270" y="368" width="490" height="76" rx="24" fill="#fff3d6"/>
    <ellipse cx="520" cy="535" rx="350" ry="58" fill="rgba(102,72,42,0.22)"/>
    <circle cx="365" cy="405" r="34" fill="#f0c15f"/>
    <rect x="430" y="365" width="72" height="84" rx="10" fill="#f4f6fb"/>
    <rect x="552" y="358" width="86" height="92" rx="12" fill="#d96045"/>
    <path d="M150 545 C250 495, 340 505, 450 548 C355 580, 244 594, 150 545Z" fill="rgba(255,230,144,0.45)"/>
  </svg>`;
}

function assetSvg(pathname) {
  const id = pathname.split("/").pop() ?? "asset";
  const hue = Math.abs(hash(id)) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="72" fill="hsl(${hue}, 44%, 88%)"/>
    <circle cx="256" cy="234" r="118" fill="hsl(${hue}, 54%, 54%)"/>
    <rect x="128" y="328" width="256" height="54" rx="27" fill="rgba(17,24,39,0.22)"/>
    <circle cx="215" cy="220" r="18" fill="#ffffff"/>
    <circle cx="298" cy="220" r="18" fill="#ffffff"/>
  </svg>`;
}

function hash(value) {
  return [...value].reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0);
}

function findChrome() {
  for (const candidate of chromiumExecutableCandidates()) {
    if (path.isAbsolute(candidate)) {
      if (existsSync(candidate)) {
        return candidate;
      }
      continue;
    }
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8", stdio: "pipe", timeout: 5000 });
    if (result.status === 0) {
      return candidate;
    }
  }
  throw new Error("Could not find Chrome or Edge. Set CHROME_PATH to a Chromium browser executable.");
}
