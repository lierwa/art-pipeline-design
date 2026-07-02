export type CoursePlannerFetcher = typeof fetch;

export const API_ROOT = "/api/course-planner";

const AI_TASK_PUBLIC_ERROR = "Course Planner AI task failed. Check the AI task record for diagnostics.";

export function encodePathPart(value: string): string {
  return encodeURIComponent(value);
}

export function jsonRequest(method: "PATCH" | "POST" | "PUT", body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export async function requestVoid(fetcher: CoursePlannerFetcher, input: RequestInfo | URL, init: RequestInit, fallbackError: string): Promise<void> {
  await requestJson(fetcher, input, init, fallbackError);
}

export async function requestJson(fetcher: CoursePlannerFetcher, input: RequestInfo | URL, init: RequestInit, fallbackError: string): Promise<unknown> {
  const response = await fetcher(input, init);
  if (!response.ok) {
    throw await responseError(response, fallbackError);
  }
  return response.status === 204 ? null : response.json();
}

export async function responseError(response: Response, fallbackError: string): Promise<Error> {
  const payload = await response.json().catch(() => null) as unknown;
  return new Error(extractErrorMessage(payload) ?? fallbackError);
}

export function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") {
    return publicErrorMessage(detail);
  }
  if (detail && typeof detail === "object") {
    const message = (detail as { message?: unknown }).message;
    return typeof message === "string" ? publicErrorMessage(message) : null;
  }
  return null;
}

export function publicErrorMessage(message: string): string {
  // WHY: AI provider/Codex 的内部 schema 诊断写入 task artifact；页面只展示可读摘要，避免大段协议错误打断操作流。
  return message.includes("Course Planner AI task failed")
    ? AI_TASK_PUBLIC_ERROR
    : message;
}

export function toCamel(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toCamel);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [camelKey(key), toCamel(item)]),
  );
}

export function camelKey(key: string): string {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

export function toSnake(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toSnake);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [snakeKey(key), toSnake(item)]),
  );
}

export function snakeKey(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function payloadValue<T>(payload: unknown, key: string): T {
  if (payload && typeof payload === "object" && key in payload) {
    return (payload as Record<string, unknown>)[key] as T;
  }
  return payload as T;
}

export function arrayFromPayload<T>(payload: unknown, key: string): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }
  if (payload && typeof payload === "object") {
    const value = (payload as Record<string, unknown>)[key];
    return Array.isArray(value) ? value as T[] : [];
  }
  return [];
}

export function appendOptionalStringField(body: FormData, key: string, value: string | undefined): void {
  if (value !== undefined) {
    body.append(key, value);
  }
}

export function appendStringListField(body: FormData, key: string, values: string[] | undefined): void {
  values?.forEach((value) => body.append(key, value));
}
