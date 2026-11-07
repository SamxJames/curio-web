import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LoadFailed } from "./DigGame";

describe("LoadFailed", () => {
  it("names today for today's dig and not for a past one", () => {
    expect(renderToStaticMarkup(<LoadFailed past={false} />)).toContain("Today&#x27;s dig didn&#x27;t load. Refresh to try again.");
    const past = renderToStaticMarkup(<LoadFailed past />);
    expect(past).toContain("This dig didn&#x27;t load. Refresh to try again.");
    expect(past).not.toContain("Today");
  });
});
