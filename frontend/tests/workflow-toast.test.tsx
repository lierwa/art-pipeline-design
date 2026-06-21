import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkflowToast } from "../src/app/components/WorkflowToast";

describe("WorkflowToast", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("dismisses error feedback after the default two second duration", async () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const defaultErrorDurationMs = 2000;

    render(
      <WorkflowToast
        toast={{
          tone: "danger",
          title: "Detection failed.",
          message: "Detection provider is not configured.",
        }}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByText("Detection provider is not configured.")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(defaultErrorDurationMs - 1);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("lets callers override the error dismissal duration through props", async () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const errorDurationMs = 3500;

    render(
      <WorkflowToast
        toast={{
          tone: "danger",
          title: "Detection failed.",
          message: "Detection provider is not configured.",
        }}
        errorDurationMs={errorDurationMs}
        onDismiss={onDismiss}
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(errorDurationMs - 1);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("positions the feedback toast at the top center of the page", async () => {
    // The app tsconfig omits Node typings, but this regression reads authored CSS in Vitest.
    // @ts-expect-error Test-only Node import without widening app compiler types.
    const { readFileSync } = await import("node:fs");
    // @ts-expect-error Test-only Node import without widening app compiler types.
    const { dirname, resolve } = await import("node:path");
    // @ts-expect-error Test-only Node import without widening app compiler types.
    const { fileURLToPath } = await import("node:url");
    const stylesheet = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../src/styles.css"),
      "utf8",
    );

    expect(stylesheet).toMatch(
      /\.workflow-toast-viewport\s*\{[\s\S]*top:\s*72px;[\s\S]*left:\s*50%;[\s\S]*transform:\s*translateX\(-50%\);/,
    );
    expect(stylesheet).not.toMatch(/\.workflow-toast-viewport\s*\{[\s\S]*right:\s*0\.88rem;/);
  });
});
