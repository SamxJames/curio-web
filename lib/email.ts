import { Resend } from "resend";
import type { WordEntry } from "./words";
import { dayKey, formatDay } from "./day";
import { absoluteUrl, siteUrl } from "./siteUrl";
import { signUnsubscribeToken } from "./unsubscribeToken";
import { signConfirmToken } from "./confirmToken";
import type { TrafficSource } from "./traffic";
import { sendInBatches, type BatchResult, type SendOutcome } from "./digestSend";

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

const FROM_ADDRESS = process.env.CURIO_FROM_EMAIL ?? "Curio <word@curio.example>";

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

/** The digest's story link. Tagged like lib/bluesky.ts's links, and for a
 * second reason: the story page reads utm_source=email to hide its signup
 * pitch from people who already get this email (see
 * components/StoryFrontDoor.tsx). */
export function digestStoryUrl(slug: string): string {
  const url = new URL(`/story/${slug}`, siteUrl());
  url.searchParams.set("utm_source", "email");
  url.searchParams.set("utm_medium", "email");
  url.searchParams.set("utm_campaign", "daily-word");
  return url.toString();
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
  const storyUrl = digestStoryUrl(word.slug);
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

/** Signed, so the link can only unsubscribe the address it was sent to. The
 * same URL is the List-Unsubscribe target: a GET lands on a confirm page,
 * and only a POST (the page's button, or a mailbox's one-click) unsubscribes. */
export function unsubscribeUrl(email: string, secret: string): string {
  const url = new URL(absoluteUrl("/api/unsubscribe"));
  url.searchParams.set("token", signUnsubscribeToken(email, secret));
  return url.toString();
}

/** The link in a signup's confirmation email. It opens the confirm page,
 * which changes nothing until its button is pressed (scanners prefetch
 * links — see app/subscribe/confirm/page.tsx). Tagged utm_source=email so
 * the visit counts as email, not direct. */
export function confirmUrl(email: string, source: TrafficSource, secret: string, now: Date = new Date()): string {
  const url = new URL(absoluteUrl("/subscribe/confirm"));
  url.searchParams.set("token", signConfirmToken(email, source, secret, now));
  url.searchParams.set("utm_source", "email");
  return url.toString();
}

function buildConfirmHtml(url: string) {
  return buildShell(`
      <p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.02em;color:#5b665f;margin:0 0 24px;">
        Curio
      </p>
      <h1 style="font-size:28px;line-height:1.25;margin:0 0 12px;font-weight:600;">
        Confirm your subscription
      </h1>
      <p style="font-size:16px;line-height:1.55;margin:0 0 28px;">
        One tap and Curio&rsquo;s word of the day starts arriving each morning. This link works for 7 days.
      </p>
      <a href="${url}" style="display:inline-block;background:#9c6b30;color:#f1ece0;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:6px;">
        Confirm subscription
      </a>
      <p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#8a9089;margin-top:48px;border-top:1px solid #d8cfbc;padding-top:16px;">
        If you didn&rsquo;t ask for this, ignore this email &mdash; you won&rsquo;t hear from Curio again.
      </p>`);
}

export function buildConfirmMessage(email: string, url: string) {
  return {
    to: email,
    subject: "Confirm your Curio subscription",
    html: buildConfirmHtml(url),
    text: `Confirm your Curio subscription\n\nOne tap and Curio's word of the day starts arriving each morning:\n${url}\n\nThis link works for 7 days. If you didn't ask for this, ignore this email — you won't hear from Curio again.`,
  };
}

/** Sends the double opt-in email. Same shape as sendSignInEmail: a dev
 * fallback that logs instead of sending, and a thrown error on a Resend
 * failure (the caller logs only the error's name). */
export async function sendConfirmEmail(email: string, url: string): Promise<void> {
  const msg = buildConfirmMessage(email, url);
  if (!resend) {
    // Fail closed in production: never log an address or a live token, and
    // never let the caller believe an email went out when none did.
    if (process.env.NODE_ENV === "production") throw new Error("Resend not configured");
    console.log(`[curio:email:dev-fallback] would send "${msg.subject}" to ${email}: ${url}`);
    return;
  }
  const { error } = await resend.emails.send({ from: FROM_ADDRESS, ...msg });
  if (error) throw new Error(`Resend send failed: ${error.name}`);
}

export type DigestMessage = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
};

/** One subscriber's digest. Always exactly one recipient: the unsubscribe
 * link and headers are specific to them, so a shared to/cc/bcc would let
 * one person unsubscribe another. */
export function buildDigestMessage(email: string, word: WordEntry, date: Date, secret: string): DigestMessage {
  const dateStr = formatDay(dayKey(date));
  const storyUrl = digestStoryUrl(word.slug);
  const unsubscribe = unsubscribeUrl(email, secret);
  return {
    from: FROM_ADDRESS,
    to: email,
    // The word stays prominent in the body (the <h1>, and the text version's
    // first line); only the subject carries the teaser, so curiosity about it
    // survives long enough to get the email opened.
    subject: buildDigestSubject(word.teaser),
    html: buildDigestHtml(word, dateStr, unsubscribe),
    // HTML-only email is itself a spam signal most filters weigh directly.
    text: `${word.word} (${word.respelling}, ${word.partOfSpeech})\n\n${word.origin}\n\nRead the full story: ${storyUrl}\n\nUnsubscribe: ${unsubscribe}`,
    // RFC 2369 + RFC 8058: mailbox providers show their own unsubscribe
    // button from these and weigh them for inbox placement.
    headers: {
      "List-Unsubscribe": `<${unsubscribe}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

/** The morning digest for every subscriber, through Resend's batch endpoint
 * (see lib/digestSend.ts for chunking, retries and idempotency). `runKey`
 * must be unique per run, because Resend dedupes on it for 24 hours. */
export async function sendDailyDigests(
  emails: string[],
  word: WordEntry,
  date: Date,
  opts: { secret: string; runKey: string; deadline?: number; onSent?: (recipients: string[]) => Promise<void> }
): Promise<SendOutcome> {
  const messages = emails.map((email) => buildDigestMessage(email, word, date, opts.secret));

  if (!resend) {
    // Local/dev fallback: no RESEND_API_KEY configured, so log instead of
    // sending. A count, never the addresses.
    if (messages.length > 0) {
      console.log(`[curio:email:dev-fallback] would send "${messages[0].subject}" to ${messages.length} subscriber(s)`);
    }
    if (messages.length > 0) await opts.onSent?.(messages.map((m) => m.to));
    return { attempted: messages.length, sent: messages.length, failed: 0, errors: [], failedRecipients: [] };
  }

  const client = resend;
  return sendInBatches(messages, {
    keyPrefix: opts.runKey,
    deadline: opts.deadline,
    onSent: opts.onSent,
    // Permissive: one malformed address shouldn't sink the other 99 in its chunk.
    sendBatch: (chunk, idempotencyKey) =>
      withBatchTimeout(client.batch.send(chunk, { batchValidation: "permissive", idempotencyKey })),
  });
}

/** Per batch request. The sender only checks its 240s budget between
 * attempts, so without a cap one hung request could run into the 300s
 * kill; with it, an attempt started just before 240s still settles by
 * ~270s, leaving time to respond. */
export const BATCH_TIMEOUT_MS = 30_000;

/** A timeout comes back as a retryable application_error, like a network
 * failure. Retrying is safe: it reuses the same idempotency key. */
function withBatchTimeout(request: Promise<BatchResult>): Promise<BatchResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<BatchResult>((resolve) => {
    timer = setTimeout(
      () =>
        resolve({
          data: null,
          error: { name: "application_error", statusCode: null, message: "Resend batch request timed out" },
          headers: null,
        }),
      BATCH_TIMEOUT_MS
    );
  });
  return Promise.race([request, timeout]).finally(() => clearTimeout(timer));
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
