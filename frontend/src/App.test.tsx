import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { App } from "./App";

const uploadedState = {
  source: {
    filename: "original.png",
    path: "source/original.png",
    width: 120,
    height: 90,
  },
  elements: [],
};

const annotatedState = {
  source: {
    filename: "original.png",
    path: "source/original.png",
    width: 120,
    height: 90,
  },
  elements: [
    {
      id: "element_001",
      name: "Region 1",
      status: "proposal",
      mode: "visible_only",
      bbox: { x: 12, y: 16, w: 30, h: 32 },
      canvas: { x: 12, y: 16, w: 30, h: 32 },
      layer: 1,
      thumbnail: "elements/element_001/thumb.png",
      mask: null,
      parentId: null,
      source: "auto_cv",
      notes: "",
      visible: true,
      confidence: 0.84,
    },
    {
      id: "element_002",
      name: "Region 2",
      status: "proposal",
      mode: "visible_only",
      bbox: { x: 64, y: 28, w: 38, h: 42 },
      canvas: { x: 64, y: 28, w: 38, h: 42 },
      layer: 2,
      thumbnail: "elements/element_002/thumb.png",
      mask: null,
      parentId: null,
      source: "imported",
      notes: "",
      visible: true,
      confidence: 0.91,
    },
  ],
};


describe("App", () => {
  it("renders the workbench shell", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /elements/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/upload png/i)).toBeInTheDocument();
    expect(screen.getByTestId("canvas-area")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /inspector/i })).toBeInTheDocument();
  });

  it("displays an uploaded image preview", async () => {
    const user = userEvent.setup();
    const originalFetch = global.fetch;
    const mockFetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          source: {
            filename: "original.png",
            path: "source/original.png",
            width: 8,
            height: 6,
          },
          elements: [],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });

    global.fetch = mockFetch as typeof fetch;

    try {
      render(<App />);
      const input = screen.getByLabelText(/upload png/i);
      const file = new File(["fake"], "scene.png", { type: "image/png" });

      await user.upload(input, file);

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/workspace/source",
        expect.objectContaining({ method: "POST" }),
      );
      expect(screen.getByRole("img", { name: /uploaded source/i })).toBeInTheDocument();
      expect(screen.getByText(/original\.png - 8 x 6/i)).toBeInTheDocument();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("clears the optimistic preview when upload fails", async () => {
    const user = userEvent.setup();
    const originalFetch = global.fetch;
    const createObjectUrl = vi.spyOn(URL, "createObjectURL");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL");

    global.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({ detail: "Only PNG uploads are supported." }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as typeof fetch;

    try {
      render(<App />);
      const input = screen.getByLabelText(/upload png/i);
      const file = new File(["fake"], "scene.png", { type: "image/png" });

      await user.upload(input, file);

      expect(createObjectUrl).toHaveBeenCalledWith(file);
      expect(revokeObjectUrl).toHaveBeenCalledWith("blob:mock-preview");
      expect(screen.queryByRole("img", { name: /uploaded source/i })).not.toBeInTheDocument();
      expect(screen.getByText(/upload a png to populate the workbench canvas/i)).toBeInTheDocument();
      expect(screen.getByText(/only png uploads are supported\./i)).toBeInTheDocument();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("renders proposal cards after auto annotate", async () => {
    const user = userEvent.setup();
    const originalFetch = global.fetch;
    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/source" && init?.method === "POST") {
        return new Response(JSON.stringify(uploadedState), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (input === "/api/workspace/auto-annotate" && init?.method === "POST") {
        return new Response(JSON.stringify(annotatedState), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    global.fetch = mockFetch as typeof fetch;

    try {
      render(<App />);
      const input = screen.getByLabelText(/upload png/i);
      const file = new File(["fake"], "scene.png", { type: "image/png" });

      await user.upload(input, file);
      await user.click(screen.getByRole("button", { name: /auto annotate/i }));

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/workspace/auto-annotate",
        expect.objectContaining({ method: "POST" }),
      );
      expect(screen.getByAltText("Region 1 thumbnail")).toBeInTheDocument();
      expect(screen.getByAltText("Region 2 thumbnail")).toBeInTheDocument();
      expect(screen.getByText("auto_cv")).toBeInTheDocument();
      expect(screen.getByText("imported")).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /accept/i })).toHaveLength(2);
      expect(screen.getAllByRole("button", { name: /reject/i })).toHaveLength(2);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("hides box and name overlays when toggles are turned off", async () => {
    const user = userEvent.setup();
    const originalFetch = global.fetch;
    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/source" && init?.method === "POST") {
        return new Response(JSON.stringify(uploadedState), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (input === "/api/workspace/auto-annotate" && init?.method === "POST") {
        return new Response(JSON.stringify(annotatedState), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    global.fetch = mockFetch as typeof fetch;

    try {
      render(<App />);
      const input = screen.getByLabelText(/upload png/i);
      const file = new File(["fake"], "scene.png", { type: "image/png" });

      await user.upload(input, file);
      await user.click(screen.getByRole("button", { name: /auto annotate/i }));

      expect(screen.getByTestId("overlay-box-element_001")).toBeInTheDocument();
      expect(screen.getByTestId("overlay-label-element_001")).toBeInTheDocument();

      await user.click(screen.getByRole("checkbox", { name: /show boxes/i }));
      await user.click(screen.getByRole("checkbox", { name: /show names/i }));

      expect(screen.queryByTestId("overlay-box-element_001")).not.toBeInTheDocument();
      expect(screen.queryByTestId("overlay-label-element_001")).not.toBeInTheDocument();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("hides rejected proposals until show rejected is enabled", async () => {
    const user = userEvent.setup();
    const originalFetch = global.fetch;
    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/workspace/source" && init?.method === "POST") {
        return new Response(JSON.stringify(uploadedState), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (input === "/api/workspace/auto-annotate" && init?.method === "POST") {
        return new Response(JSON.stringify(annotatedState), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (input === "/api/workspace/state" && init?.method === "PUT") {
        return new Response(String(init.body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    global.fetch = mockFetch as typeof fetch;

    try {
      render(<App />);
      const input = screen.getByLabelText(/upload png/i);
      const file = new File(["fake"], "scene.png", { type: "image/png" });

      await user.upload(input, file);
      await user.click(screen.getByRole("button", { name: /auto annotate/i }));
      await user.click(screen.getAllByRole("button", { name: /reject/i })[1]);

      expect(screen.queryByAltText("Region 2 thumbnail")).not.toBeInTheDocument();

      await user.click(screen.getByRole("checkbox", { name: /show rejected/i }));

      expect(screen.getByAltText("Region 2 thumbnail")).toBeInTheDocument();
    } finally {
      global.fetch = originalFetch;
    }
  });
});
