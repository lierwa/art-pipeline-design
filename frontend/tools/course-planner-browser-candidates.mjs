import path from "node:path";

export function chromiumExecutableCandidates({
  env = process.env,
  platform = process.platform,
} = {}) {
  const candidates = [
    env.CHROME_PATH?.trim(),
    ...platformBrowserCandidates(platform, env),
    "google-chrome",
    "chrome",
    "chromium",
    "msedge",
  ];

  return candidates.filter(Boolean);
}

function platformBrowserCandidates(platform, env) {
  if (platform === "win32") {
    return windowsBrowserCandidates(env);
  }
  if (platform === "darwin") {
    return macBrowserCandidates(env);
  }
  return [];
}

function windowsBrowserCandidates(env) {
  const winPath = path.win32;
  return [
    winPath.join(env.PROGRAMFILES ?? "", "Google", "Chrome", "Application", "chrome.exe"),
    winPath.join(env["PROGRAMFILES(X86)"] ?? "", "Google", "Chrome", "Application", "chrome.exe"),
    winPath.join(env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe"),
    winPath.join(env.PROGRAMFILES ?? "", "Microsoft", "Edge", "Application", "msedge.exe"),
    winPath.join(env["PROGRAMFILES(X86)"] ?? "", "Microsoft", "Edge", "Application", "msedge.exe"),
    winPath.join(env.LOCALAPPDATA ?? "", "Microsoft", "Edge", "Application", "msedge.exe"),
  ];
}

function macBrowserCandidates(env) {
  const macPath = path.posix;
  const homeApplications = env.HOME
    ? [
        macPath.join(env.HOME, "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome"),
        macPath.join(env.HOME, "Applications", "Chromium.app", "Contents", "MacOS", "Chromium"),
        macPath.join(env.HOME, "Applications", "Microsoft Edge.app", "Contents", "MacOS", "Microsoft Edge"),
      ]
    : [];

  return [
    macPath.join("/", "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome"),
    macPath.join("/", "Applications", "Chromium.app", "Contents", "MacOS", "Chromium"),
    macPath.join("/", "Applications", "Microsoft Edge.app", "Contents", "MacOS", "Microsoft Edge"),
    ...homeApplications,
  ];
}
