import { describe, it, expect } from "vitest";
import { SESSION_HINT_KEY } from "./sessionHintKey";
import SessionHintInit from "../components/SessionHintInit";

/** SessionHintInit is a Server Component that interpolates SESSION_HINT_KEY
 * into an inline pre-hydration script. When that constant lived in
 * lib/storage.ts — a `"use client"` module — the import arrived as a client
 * reference rather than the string, and the deployed script read
 * `localStorage.getItem(undefined)`: the header's pre-paint nav selection
 * silently stopped working in production while the source, the types and
 * every unit test still looked correct. This asserts the rendered script
 * actually carries the key. */
function renderedScript(): string {
  const element = SessionHintInit() as {
    props: { dangerouslySetInnerHTML: { __html: string } };
  };
  return element.props.dangerouslySetInnerHTML.__html;
}

describe("SESSION_HINT_KEY", () => {
  it("is the key the rest of the app reads and writes", () => {
    expect(SESSION_HINT_KEY).toBe("curio:signedIn");
  });
});

describe("SessionHintInit's inline script", () => {
  it("reads the real key, not an undefined client reference", () => {
    const script = renderedScript();
    expect(script).toContain('localStorage.getItem("curio:signedIn")');
    expect(script).not.toContain("getItem(undefined)");
  });

  it("sets the attribute the signed-in: CSS variant keys off", () => {
    expect(renderedScript()).toContain('setAttribute("data-signed-in"');
  });
});
