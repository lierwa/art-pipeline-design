import {
  App,
  createdManualElement,
  describe,
  detectedElement,
  detectedState,
  expect,
  installFetchMock,
  it,
  jsonResponse,
  loadedState,
  loadedStateWithoutElements,
  render,
  screen,
  userEvent,
  within,
} from "./appTestHarness";

describe("App flow 01 status and top-bar behavior", () => {
  it("renders reference-style model status metric details", async () => {
    const statusState = {
      source: loadedState.source,
      elements: [
        loadedState.elements[0],
        {
          ...createdManualElement,
          id: "element_accepted_002",
          label: "Manual Lamp",
          sourceProvider: "manual",
          sourcePrompt: "Manual Lamp",
          history: [],
          mergedInto: null,
          exportParent: false,
        },
        {
          ...detectedElement,
          id: "element_proposal_001",
          status: "proposal",
          name: "plant",
          label: "plant",
        },
        {
          ...detectedElement,
          id: "element_proposal_002",
          status: "edited",
          name: "mirror",
          label: "mirror",
        },
      ],
    };
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(statusState);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      const providerLabel = await screen.findByText("Model Chain");
      const statusStrip = providerLabel.closest("footer");
      expect(statusStrip).not.toBeNull();
      const metrics = within(statusStrip as HTMLElement);

      expect(metrics.getByText("test_provider + SAM2")).toBeInTheDocument();
      expect(metrics.getByText("Candidates")).toBeInTheDocument();
      expect(metrics.getByText("from detector")).toBeInTheDocument();
      expect(metrics.getByText("Masks Ready")).toBeInTheDocument();
      expect(metrics.getByText("SAM2 accepted")).toBeInTheDocument();
      expect(metrics.getByText("Export Ready")).toBeInTheDocument();
      expect(metrics.getByText("final assets")).toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("keeps the uploaded-source workspace focused on the canvas before detection", async () => {
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedStateWithoutElements);
      }
      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      await screen.findByText(/original\.png - 120 x 90/i);

      expect(screen.getAllByRole("button", { name: /run detection/i })).toHaveLength(1);
      expect(screen.queryByText(/model proposals pending/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("checkbox", { name: /show rejected/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/extraction preview/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/export pack/i)).not.toBeInTheDocument();
    } finally {
      restoreFetch();
    }
  });

  it("runs detection from the top app bar", async () => {
    const user = userEvent.setup();
    const restoreFetch = installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/state" && (!init || init.method === "GET")) {
        return jsonResponse(loadedStateWithoutElements);
      }

      if (input === "/api/workspace/detect" && init?.method === "POST") {
        return jsonResponse(detectedState);
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    try {
      render(<App />);

      const topAppBar = await screen.findByRole("banner");
      await user.click(within(topAppBar).getByRole("button", { name: /run detection/i }));

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/workspace/detect",
        expect.objectContaining({ method: "POST" }),
      );
    } finally {
      restoreFetch();
    }
  });
});
