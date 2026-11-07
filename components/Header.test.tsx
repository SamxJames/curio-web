import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ usePathname: () => "/dig" }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "authenticated" }) }));
vi.mock("@/lib/useShowArrival", () => ({ useShowArrival: () => false }));

const { default: Header } = await import("./Header");

describe("Header", () => {
  it("lets the nav wrap rather than widen the page on a narrow phone", () => {
    // Unwrapped, the row needs ~366px. On a 320px screen (iPhone Display Zoom, or a larger
    // Safari text size) that widened every page, and the player had to pinch it to fit.
    const html = renderToStaticMarkup(<Header />);
    const nav = html.match(/<nav[^>]*>/)![0];
    expect(nav).toContain("flex-wrap");
    expect(nav).toContain("min-w-0");
  });

  it("shows a Dig link only when the dig is open", () => {
    expect(renderToStaticMarkup(<Header digOpen />)).toContain('href="/dig"');
    expect(renderToStaticMarkup(<Header />)).not.toContain('href="/dig"');
  });
});
