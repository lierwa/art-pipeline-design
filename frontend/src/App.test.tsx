import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { App } from "./App";


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
});
