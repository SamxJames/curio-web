import { afterEach, describe, expect, it, vi } from "vitest";
import { shareOrCopy } from "./shareOrCopy";

const abort = () => Object.assign(new Error("x"), { name: "AbortError" });
// The project has no DOM environment installed, so window and navigator are stubbed on node.
function stub(coarse: boolean, share?: unknown, writeText?: unknown) {
  vi.stubGlobal("window", { matchMedia: (q: string) => ({ matches: coarse && q === "(pointer: coarse)" }) });
  vi.stubGlobal("navigator", { share, clipboard: writeText ? { writeText } : undefined });
}
afterEach(() => vi.unstubAllGlobals());

describe("shareOrCopy", () => {
  it("opens the sheet first on a touch device and does not copy", async () => {
    const share = vi.fn().mockResolvedValue(undefined), writeText = vi.fn().mockResolvedValue(undefined);
    stub(true, share, writeText);
    await expect(shareOrCopy("hi")).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({ text: "hi" });
    expect(writeText).not.toHaveBeenCalled();
  });
  it("treats a cancelled sheet as dismissed and does not copy", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stub(true, vi.fn().mockRejectedValue(abort()), writeText);
    await expect(shareOrCopy("hi")).resolves.toBe("dismissed");
    expect(writeText).not.toHaveBeenCalled();
  });
  it("copies when the sheet errors on a touch device", async () => {
    stub(true, vi.fn().mockRejectedValue(new Error("nope")), vi.fn().mockResolvedValue(undefined));
    await expect(shareOrCopy("hi")).resolves.toBe("copied");
  });
  it("copies first on desktop even when a share API exists", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stub(false, share, vi.fn().mockResolvedValue(undefined));
    await expect(shareOrCopy("hi")).resolves.toBe("copied");
    expect(share).not.toHaveBeenCalled();
  });
  it("copies on a touch device with no share API (in-app browsers)", async () => {
    stub(true, undefined, vi.fn().mockResolvedValue(undefined));
    await expect(shareOrCopy("hi")).resolves.toBe("copied");
  });
  it("fails when neither works", async () => {
    stub(false, undefined, vi.fn().mockRejectedValue(new Error("blocked")));
    await expect(shareOrCopy("hi")).resolves.toBe("failed");
  });
});
