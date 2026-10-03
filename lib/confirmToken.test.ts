import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CONFIRM_TTL_SECONDS, signConfirmToken, verifyConfirmToken } from "./confirmToken";
import { signUnsubscribeToken } from "./unsubscribeToken";

const SECRET = "test-secret";
const NOW = new Date("2026-10-03T12:00:00Z");
const later = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

describe("confirm tokens", () => {
  it("round-trips the normalised email and the source", () => {
    const token = signConfirmToken("  Sam@Example.com ", "search", SECRET, NOW);
    expect(verifyConfirmToken(token, SECRET, NOW)).toEqual({ email: "sam@example.com", source: "search" });
  });

  it("is valid for 7 days and not a second longer", () => {
    expect(CONFIRM_TTL_SECONDS).toBe(7 * 24 * 60 * 60);
    const token = signConfirmToken("a@example.com", "direct", SECRET, NOW);
    expect(verifyConfirmToken(token, SECRET, later(CONFIRM_TTL_SECONDS))).not.toBeNull();
    expect(verifyConfirmToken(token, SECRET, later(CONFIRM_TTL_SECONDS + 1))).toBeNull();
  });

  it("rejects a token issued more than 5 minutes in the future", () => {
    const token = signConfirmToken("a@example.com", "direct", SECRET, later(301));
    expect(verifyConfirmToken(token, SECRET, NOW)).toBeNull();
    const nearly = signConfirmToken("a@example.com", "direct", SECRET, later(299));
    expect(verifyConfirmToken(nearly, SECRET, NOW)).not.toBeNull();
  });

  it("rejects a different secret, a tampered payload and a tampered signature", () => {
    const token = signConfirmToken("a@example.com", "share", SECRET, NOW);
    expect(verifyConfirmToken(token, "other-secret", NOW)).toBeNull();

    const [payload, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ e: "victim@example.com", s: "share", t: 1790000000 })).toString("base64url");
    expect(verifyConfirmToken(`${forged}.${mac}`, SECRET, NOW)).toBeNull();

    // Flip a character in the middle of the signature (not the last one,
    // whose low bits can be base64url padding and decode identically).
    const mid = Math.floor(mac.length / 2);
    const flipped = mac.slice(0, mid) + (mac[mid] === "A" ? "B" : "A") + mac.slice(mid + 1);
    expect(verifyConfirmToken(`${payload}.${flipped}`, SECRET, NOW)).toBeNull();
  });

  it("never accepts an unsubscribe token, even for the same address and secret", () => {
    const unsub = signUnsubscribeToken("a@example.com", SECRET);
    expect(verifyConfirmToken(unsub, SECRET, NOW)).toBeNull();
  });

  it("rejects a MAC computed without the curio:confirm:v1: context prefix", () => {
    const payload = Buffer.from(JSON.stringify({ e: "a@example.com", s: "direct", t: Math.floor(NOW.getTime() / 1000) })).toString("base64url");
    const mac = createHmac("sha256", SECRET).update(payload).digest("base64url");
    expect(verifyConfirmToken(`${payload}.${mac}`, SECRET, NOW)).toBeNull();
    // Control: the same payload with the prefixed MAC does verify.
    const good = createHmac("sha256", SECRET).update("curio:confirm:v1:" + payload).digest("base64url");
    expect(verifyConfirmToken(`${payload}.${good}`, SECRET, NOW)).not.toBeNull();
  });

  it("rejects well-signed payloads with bad contents", () => {
    const sign = (obj: unknown) => {
      const p = Buffer.from(JSON.stringify(obj)).toString("base64url");
      const m = createHmac("sha256", SECRET).update("curio:confirm:v1:" + p).digest("base64url");
      return `${p}.${m}`;
    };
    const t = Math.floor(NOW.getTime() / 1000);
    expect(verifyConfirmToken(sign({ e: "no-at-sign", s: "direct", t }), SECRET, NOW)).toBeNull();
    expect(verifyConfirmToken(sign({ e: "Upper@Example.com", s: "direct", t }), SECRET, NOW)).toBeNull();
    expect(verifyConfirmToken(sign({ e: "a@example.com", s: "myspace", t }), SECRET, NOW)).toBeNull();
    expect(verifyConfirmToken(sign({ e: "a@example.com", s: "direct", t: "soon" }), SECRET, NOW)).toBeNull();
    expect(verifyConfirmToken(sign("just a string"), SECRET, NOW)).toBeNull();
  });

  it("rejects malformed shapes without throwing", () => {
    for (const bad of ["", ".", "abc", "a.b.c", "!!!.???"]) {
      expect(verifyConfirmToken(bad, SECRET, NOW)).toBeNull();
    }
  });
});
