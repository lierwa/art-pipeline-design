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
const marqueeProbeOnly = process.argv.includes("--marquee-probe-only");

ensureScreenshotWebSocketRuntime();

const screenshotTargets = [
  {
    name: "board",
    path: "board-route-1920x1080.png",
    url: "/__course-planner-visual?view=board",
  },
  {
    name: "library",
    path: "global-reference-library-drawer-1920x1080.png",
    url: "/__course-planner-visual?view=library",
  },
  {
    name: "library-create",
    path: "global-reference-library-create-character-1920x1080.png",
    url: "/__course-planner-visual?view=library-create",
  },
  {
    name: "library-edit",
    path: "global-reference-library-edit-character-1920x1080.png",
    url: "/__course-planner-visual?view=library-edit",
  },
  {
    name: "library-style",
    path: "global-reference-library-scene-style-1920x1080.png",
    url: "/__course-planner-visual?view=library-style",
  },
  {
    name: "chapter-loading",
    path: "chapter-loading-1920x1080.png",
    url: "/__course-planner-visual?view=chapter-loading",
  },
  {
    name: "chapter",
    path: "chapter-route-1920x1080.png",
    url: "/__course-planner-visual?view=chapter",
  },
  {
    name: "assembly-loading",
    path: "assembly-loading-1920x1080.png",
    url: "/__course-planner-visual?view=assembly-loading",
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
  {
    name: "assembly-multiselect",
    path: "assembly-multiselect-1920x1080.png",
    url: "/__course-planner-visual?view=assembly-multiselect",
  },
  {
    name: "assembly-grouping",
    path: "assembly-grouping-1920x1080.png",
    url: "/__course-planner-visual?view=assembly-grouping",
  },
  {
    name: "assembly-delete",
    path: "assembly-delete-dialog-1920x1080.png",
    url: "/__course-planner-visual?view=assembly-delete",
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

function ensureScreenshotWebSocketRuntime() {
  if (serveOnly || typeof WebSocket !== "undefined") {
    return;
  }
  if (process.env.COURSE_PLANNER_SCREENSHOT_WEBSOCKET_REEXEC === "1") {
    return;
  }
  // WHY: Task 7 文档要求裸 `node tools/capture-course-planner-screenshots.mjs` 可运行；
  // Node 21 的 WebSocket 仍需显式 flag，这里用同一 Node 重启，避免把平台细节交给调用者记忆。
  const result = spawnSync(process.execPath, [
    ...process.execArgv,
    "--experimental-websocket",
    ...process.argv.slice(1),
  ], {
    env: {
      ...process.env,
      COURSE_PLANNER_SCREENSHOT_WEBSOCKET_REEXEC: "1",
    },
    stdio: "inherit",
  });
  process.exit(result.status ?? 1);
}

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
    console.log(`${baseUrl}/__course-planner-visual?view=board`);
    console.log(`${baseUrl}/__course-planner-visual?view=library`);
    console.log(`${baseUrl}/__course-planner-visual?view=library-create`);
    console.log(`${baseUrl}/__course-planner-visual?view=library-edit`);
    console.log(`${baseUrl}/__course-planner-visual?view=library-style`);
    console.log(`${baseUrl}/__course-planner-visual?view=chapter-loading`);
    console.log(`${baseUrl}/__course-planner-visual?view=chapter`);
    console.log(`${baseUrl}/__course-planner-visual?view=assembly-loading`);
    console.log(`${baseUrl}/__course-planner-visual?view=assembly`);
    console.log(`${baseUrl}/__course-planner-visual?view=assembly-drawer`);
    console.log(`${baseUrl}/__course-planner-visual?view=assembly-multiselect`);
    console.log(`${baseUrl}/__course-planner-visual?view=assembly-grouping`);
    console.log(`${baseUrl}/__course-planner-visual?view=assembly-delete`);
    await new Promise(() => undefined);
  }

  const browser = await startBrowser(1920, 1080);
  try {
    if (marqueeProbeOnly) {
      await captureScaledMarqueeProbe(
        browser,
        `${baseUrl}/__course-planner-visual?view=assembly`,
        path.join(outputDir, "assembly-marquee-scaled-drag-1920x1080.png"),
        1920,
        1080,
      );
    } else {
      for (const target of screenshotTargets) {
        await captureWithBrowser(browser, `${baseUrl}${target.url}`, path.join(outputDir, target.path), 1920, 1080, target.name);
      }
      await captureScaledMarqueeProbe(
        browser,
        `${baseUrl}/__course-planner-visual?view=assembly`,
        path.join(outputDir, "assembly-marquee-scaled-drag-1920x1080.png"),
        1920,
        1080,
      );
    }
  } finally {
    stopBrowser(browser);
  }

  if (!marqueeProbeOnly) {
    generateImageArtifacts();
  }
} finally {
  await server.close();
}

async function startBrowser(width, height) {
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
    const browserUrl = await waitForBrowserUrl(debuggingPort, chrome);
    return { browserUrl, chrome, userDataDir };
  } catch (error) {
    stopBrowser({ chrome, userDataDir });
    throw error;
  }
}

function stopBrowser(browser) {
  stopProcessTree(browser.chrome);
  try {
    rmSync(browser.userDataDir, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
  } catch (error) {
    console.warn(`could not remove temporary browser profile ${browser.userDataDir}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function captureWithBrowser(browser, url, outputPath, width, height, waitFor) {
  const page = await createPage(browser.browserUrl, url);
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
  console.log(`captured ${outputPath}`);
}

async function captureScaledMarqueeProbe(browser, url, outputPath, width, height) {
  const page = await createPage(browser.browserUrl, url);
  const client = await connectCdp(page.webSocketDebuggerUrl);
  let drag = null;
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
    await waitForPageReady(client, "assembly");
    await client.send("Page.bringToFront");
    await client.send("Runtime.evaluate", {
      expression: `(() => {
        document.querySelector('button[aria-label="Zoom out"]')?.click();
        document.querySelector('button[aria-label="Zoom out"]')?.click();
        return true;
      })()`,
      returnByValue: true,
    });
    await delay(300);
    const dragResult = await client.send("Runtime.evaluate", {
      expression: `(() => {
        const artboard = document.querySelector('[data-testid="canvas-artboard"]');
        if (!artboard) {
          throw new Error("Missing assembly artboard for marquee probe.");
        }
        const rect = artboard.getBoundingClientRect();
        const startX = rect.left + rect.width * 0.18;
        const startY = rect.top + rect.height * 0.88;
        const target = document.elementFromPoint(startX, startY);
        return {
          startX,
          startY,
          endX: rect.left + rect.width * 0.38,
          endY: rect.top + rect.height * 0.98,
          targetTag: target?.tagName ?? null,
          targetClass: typeof target?.className === "string" ? target.className : String(target?.className ?? ""),
          targetTestId: target?.getAttribute?.("data-testid") ?? null,
          targetClosestDrawingSurface: Boolean(target?.closest?.(".canvas-drawing-surface"))
        };
      })()`,
      returnByValue: true,
    });
    drag = dragResult.result?.value;
    if (!drag) {
      throw new Error("Could not compute marquee drag coordinates.");
    }
    await client.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      button: "left",
      clickCount: 1,
      x: drag.startX,
      y: drag.startY,
    });
    for (let step = 1; step <= 6; step += 1) {
      await client.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        button: "left",
        buttons: 1,
        x: drag.startX + ((drag.endX - drag.startX) * step) / 6,
        y: drag.startY + ((drag.endY - drag.startY) * step) / 6,
      });
      await delay(20);
    }
    await delay(120);
    const verification = await client.send("Runtime.evaluate", {
      expression: `(() => {
        const artboard = document.querySelector('[data-testid="canvas-artboard"]');
        const marquee = document.querySelector('.assembly-marquee');
        if (!artboard) {
          return { ok: false, reason: "missing artboard", drag: ${JSON.stringify(drag)} };
        }
        if (!marquee) {
          const target = document.elementFromPoint(${drag.startX}, ${drag.startY});
          return {
            ok: false,
            reason: "missing marquee",
            drag: ${JSON.stringify(drag)},
            targetAfterDrag: {
              tag: target?.tagName ?? null,
              className: typeof target?.className === "string" ? target.className : String(target?.className ?? ""),
              testId: target?.getAttribute?.("data-testid") ?? null,
              closestDrawingSurface: Boolean(target?.closest?.(".canvas-drawing-surface"))
            }
          };
        }
        const rect = marquee.getBoundingClientRect();
        const expected = {
          left: Math.min(${drag.startX}, ${drag.endX}),
          top: Math.min(${drag.startY}, ${drag.endY}),
          right: Math.max(${drag.startX}, ${drag.endX}),
          bottom: Math.max(${drag.startY}, ${drag.endY})
        };
        const tolerance = 3;
        const parentOk = marquee.parentElement === artboard;
        const rectOk = Math.abs(rect.left - expected.left) <= tolerance
          && Math.abs(rect.top - expected.top) <= tolerance
          && Math.abs(rect.right - expected.right) <= tolerance
          && Math.abs(rect.bottom - expected.bottom) <= tolerance;
        return {
          ok: parentOk && rectOk,
          parentOk,
          rectOk,
          rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
          expected
        };
      })()`,
      returnByValue: true,
    });
    const value = verification.result?.value;
    if (!value?.ok) {
      throw new Error(`Scaled marquee probe failed: ${JSON.stringify(value)}`);
    }
    const screenshot = await client.send("Page.captureScreenshot", {
      captureBeyondViewport: false,
      fromSurface: true,
      format: "png",
    });
    writeFileSync(outputPath, Buffer.from(screenshot.data, "base64"));
  } finally {
    if (drag) {
      await client.send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        button: "left",
        clickCount: 1,
        x: drag.endX,
        y: drag.endY,
      }).catch(() => undefined);
    }
    client.close();
  }
  console.log(`verified scaled marquee and captured ${outputPath}`);
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

async function waitForBrowserUrl(port, chrome) {
  const endpoint = `http://127.0.0.1:${port}/json/version`;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    if (chrome.exitCode !== null) {
      throw new Error(`Chrome exited before DevTools endpoint became available (code ${chrome.exitCode}).`);
    }
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
  if (waitFor === "board") {
    return "document.body.textContent.includes('Scene Pack / Chapter Board') && document.body.textContent.includes('Scene Packs') && document.body.textContent.includes('Chapter List')";
  }
  if (waitFor === "library") {
    return "document.body.textContent.includes('Scene Pack / Chapter Board') && document.body.textContent.includes('资料库') && document.body.textContent.includes('角色 IP') && Boolean(document.querySelector('.course-planner-drawer'))";
  }
  if (waitFor === "library-create") {
    return "document.body.textContent.includes('创建角色 IP') && document.body.textContent.includes('选择 PNG') && Boolean(document.querySelector('input[name=displayName]'))";
  }
  if (waitFor === "library-edit") {
    return "document.body.textContent.includes('编辑角色 IP') && document.body.textContent.includes('保留当前图片') && Boolean(document.querySelector('input[name=displayName]'))";
  }
  if (waitFor === "library-style") {
    return "document.querySelector('[role=tab][data-state=active]')?.textContent.includes('场景风格') === true";
  }
  if (waitFor === "chapter-loading" || waitFor === "assembly-loading") {
    return "document.body.textContent.includes('Loading Scene Package') && document.body.textContent.includes('Loading the latest chapter scene-package snapshot.')";
  }
  if (waitFor === "chapter") {
    return "Boolean(document.querySelector('.chapter-scene-studio')) && document.body.textContent.includes('Prompt Generation') && document.body.textContent.includes('Final')";
  }
  if (waitFor === "assembly") {
    return "document.body.textContent.includes('Assembly') && document.body.textContent.includes('Placement')";
  }
  if (waitFor === "assembly-drawer") {
    return "document.body.textContent.includes('Generated Chapter Assets') && document.body.textContent.includes('Generated cat variant') && Boolean(document.querySelector('.course-planner-drawer'))";
  }
  if (waitFor === "assembly-multiselect") {
    return "document.body.textContent.includes('2 placements selected') && Array.from(document.querySelectorAll('input')).some((input) => input.getAttribute('placeholder') === 'Mixed') && document.querySelectorAll('.assembly-layer-item.is-selected').length >= 2";
  }
  if (waitFor === "assembly-grouping") {
    return "document.body.textContent.includes('Group 1') && document.body.textContent.includes('2 placements grouped.') && document.querySelectorAll('.assembly-layer-item.is-selected').length >= 1";
  }
  if (waitFor === "assembly-delete") {
    return "Boolean(document.querySelector('[role=\"alertdialog\"]')) && document.body.textContent.includes('Confirm delete')";
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
  const venvPython = path.join(
    workspaceRoot,
    "backend",
    ".venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
  const candidates = process.platform === "win32"
    ? [
        { command: venvPython, args: [] },
        { command: "py", args: ["-3"] },
        { command: "python", args: [] },
        { command: "python3", args: [] },
      ]
    : [
        { command: venvPython, args: [] },
        { command: "python3", args: [] },
        { command: "python", args: [] },
      ];
  for (const candidate of candidates) {
    if (path.isAbsolute(candidate.command) && !existsSync(candidate.command)) {
      continue;
    }
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
        if (isScenePackageMediaRequest(requestUrl.pathname) || isGlobalLibraryMediaRequest(requestUrl.pathname)) {
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

function isGlobalLibraryMediaRequest(pathname) {
  return pathname.startsWith("/api/course-planner/character-ips/")
    || pathname.startsWith("/api/course-planner/scene-style-references/");
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
