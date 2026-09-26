import { Resend } from "resend";
import type { WordEntry } from "./words";
import { dayKey, formatDay } from "./day";

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

const FROM_ADDRESS = process.env.CURIO_FROM_EMAIL ?? "Curio <word@curio.example>";
const SITE_URL = process.env.CURIO_SITE_URL ?? "http://localhost:3000";

/** Not cryptographically secure — good enough to keep an unsubscribe link
 * from being casually guessed for a v1. Swap for a signed (HMAC) token
 * before relying on this for anything sensitive. */
export function unsubscribeToken(email: string): string {
  return Buffer.from(email.trim().toLowerCase()).toString("base64url");
}

export function decodeUnsubscribeToken(token: string): string {
  return Buffer.from(token, "base64url").toString("utf-8");
}

const DEFAULT_SUBJECT_MAX_LENGTH = 60;

/** Truncates a teaser to a safe email-subject length, breaking on a word
 * boundary (never mid-word) and stripping any trailing punctuation left
 * dangling right before the ellipsis — "...arrived," followed by "…" reads
 * worse than "...arrived…". Returns the teaser unchanged if it already
 * fits. */
export function buildDigestSubject(
  teaser: string,
  maxLength: number = DEFAULT_SUBJECT_MAX_LENGTH
): string {
  if (teaser.length <= maxLength) return teaser;
  const truncated = teaser
    .slice(0, maxLength)
    .replace(/\s+\S*$/, "")
    .replace(/[\s.,;:!?—–-]+$/, "");
  return `${truncated}…`;
}

/** Shared chrome for every Curio email (daily digest, sign-in link, etc.) so
 * they read as one product rather than a mix of a custom template and
 * whatever a library's stock default looks like — the latter is also a
 * meaningfully worse spam signal, since generic auth-library email templates
 * are extremely common and well-known to spam filters. */
function buildShell(bodyHtml: string): string {
  return `
<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#f1ece0;font-family:Georgia,'Times New Roman',serif;color:#24302b;">
    <div style="max-width:480px;margin:0 auto;">
      ${bodyHtml}
    </div>
  </body>
</html>`;
}

function buildDigestHtml(word: WordEntry, dateStr: string, unsubscribeUrl: string) {
  const storyUrl = `${SITE_URL}/story/${word.slug}`;
  return buildShell(`
      <p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.02em;color:#5b665f;margin:0 0 24px;">
        Curio &middot; ${dateStr}
      </p>
      <h1 style="font-size:36px;line-height:1.1;margin:0 0 4px;font-weight:600;">
        ${word.word}
      </h1>
      <p style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#8a9089;margin:0 0 24px;">
        ${word.respelling} &middot; ${word.partOfSpeech}
      </p>
      <p style="font-size:17px;line-height:1.55;margin:0 0 28px;">
        ${word.origin}
      </p>
      <a href="${storyUrl}" style="display:inline-block;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#7a4f1e;text-decoration:none;border-bottom:1px solid #7a4f1e;padding-bottom:2px;">
        Read the full story &rarr;
      </a>
      <p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#8a9089;margin-top:48px;border-top:1px solid #d8cfbc;padding-top:16px;">
        One word, once a day.
        <a href="${unsubscribeUrl}" style="color:#8a9089;">Unsubscribe</a>
      </p>`);
}

function buildSignInHtml(url: string) {
  return buildShell(`
      <p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.02em;color:#5b665f;margin:0 0 24px;">
        Curio
      </p>
      <h1 style="font-size:28px;line-height:1.25;margin:0 0 12px;font-weight:600;">
        Sign in to Curio
      </h1>
      <p style="font-size:16px;line-height:1.55;margin:0 0 28px;">
        Click below to sign in. This link expires in 24 hours and can only be used once.
      </p>
      <a href="${url}" style="display:inline-block;background:#9c6b30;color:#f1ece0;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:6px;">
        Sign in to Curio
      </a>
      <p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#8a9089;margin-top:48px;border-top:1px solid #d8cfbc;padding-top:16px;">
        If you didn&rsquo;t request this, you can safely ignore this email &mdash; no changes will be made to any account.
      </p>`);
}

export async function sendDailyDigest(email: string, word: WordEntry, date: Date) {
  const dateStr = formatDay(dayKey(date));
  const storyUrl = `${SITE_URL}/story/${word.slug}`;
  const unsubscribeUrl = `${SITE_URL}/api/unsubscribe?token=${unsubscribeToken(email)}`;
  const html = buildDigestHtml(word, dateStr, unsubscribeUrl);
  // A plain-text alternative alongside the HTML body isn't just a nicety —
  // HTML-only email is itself a spam signal most filters weigh directly.
  const text = `${word.word} (${word.respelling}, ${word.partOfSpeech})\n\n${word.origin}\n\nRead the full story: ${storyUrl}\n\nUnsubscribe: ${unsubscribeUrl}`;
  // The word itself stays prominent in the body (the <h1> in the HTML, the
  // first line of the plain-text version) — only the subject line changed,
  // so curiosity about the *teaser* survives long enough to get the email
  // opened, instead of being spent in the inbox preview.
  const subject = buildDigestSubject(word.teaser);

  if (!resend) {
    // Local/dev fallback: no RESEND_API_KEY configured, so log instead of sending.
    console.log(`[curio:email:dev-fallback] would send "${subject}" to ${email}`);
    return { id: "dev-fallback", sent: false as const };
  }

  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: email,
    subject,
    html,
    text,
  });

  if (error) throw new Error(`Resend send failed: ${error.message}`);
  return { id: data?.id, sent: true as const };
}

/** Sends the Auth.js magic-link sign-in email, replacing the library's stock
 * default template so it (a) reads as part of Curio rather than a generic
 * "click here to sign in" pattern spam filters have learned to recognize
 * broadly, and (b) carries a plain-text alternative, which the default
 * template also omits. Used as the Resend provider's `sendVerificationRequest`
 * in lib/auth.ts. */
export async function sendSignInEmail(email: string, url: string): Promise<void> {
  const html = buildSignInHtml(url);
  const text = `Sign in to Curio\n\n${url}\n\nThis link expires in 24 hours. If you didn't request this, you can safely ignore this email.`;
  const subject = "Sign in to Curio";

  if (!resend) {
    console.log(`[curio:email:dev-fallback] would send "${subject}" to ${email}: ${url}`);
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: email,
    subject,
    html,
    text,
  });

  if (error) throw new Error(`Resend send failed: ${error.message}`);
}
