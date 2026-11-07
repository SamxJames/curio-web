import { describe, expect, it, vi } from "vitest";
vi.mock("./server", () => ({ readDay: vi.fn() }));
vi.mock("./clock", () => ({ digLaunchDate: () => "2026-11-07", isDigOpen: () => true }));
import { readDay } from "./server";
import { getDigLine } from "./digLine";

describe("getDigLine", () => {
  it("uses only the first prompt's text", async () => {
    vi.mocked(readDay).mockResolvedValue({ prompts: [{ id: "a", kind: "theme", text: "Name a beverage", payload: "SECRET" }, { id: "b", kind: "theme", text: "Second", payload: "S2" }] } as never);
    expect(await getDigLine()).toEqual({ prompt: "Name a beverage" });
  });
  it("is null when there is no day or the read throws", async () => {
    vi.mocked(readDay).mockResolvedValueOnce(null);
    expect(await getDigLine()).toBeNull();
    vi.mocked(readDay).mockRejectedValueOnce(new Error("redis"));
    expect(await getDigLine()).toBeNull();
  });
  it("is null when the first prompt has no text", async () => {
    vi.mocked(readDay).mockResolvedValueOnce({ prompts: [{ id: "a", kind: "theme", text: "  ", payload: "x" }] } as never);
    expect(await getDigLine()).toBeNull();
  });
});
