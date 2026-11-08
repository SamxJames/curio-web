import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { bannedHits } from "./copyAudit";
import Intro from "@/components/dig/Intro";
import PromptScreen from "@/components/dig/PromptScreen";
import Reveal, { announceReveal } from "@/components/dig/Reveal";
import EndScreen, { announceDone } from "@/components/dig/EndScreen";
import Strata from "@/components/dig/Strata";
import PastList from "@/components/dig/PastList";
import { shareImageLines } from "@/components/dig/shareImage";
import { noop, promptBase, secret } from "@/components/dig/testFixtures";
import { digLineText } from "./digLineText";
import { shareText } from "./share";
import { staleChallengeLine } from "./challenge";
import { ogDayTitle, OG_DIG_TAGLINE, OG_DIG_TITLE } from "./ogText";
import { devDay } from "./devDay";
import { prepareDay } from "./game";
import { encodeDay } from "./payload";
import { TIERS } from "./types";
import type { Tier } from "./types";
import { TIER_LABEL, TIER_POINTS, STRATUM } from "./score";
import { buildDigestHtml, buildDigestMessage } from "@/lib/email";
import { buildBlueskyPost } from "@/lib/blueskyPost";
import { buildInstagramCaption, buildThreadsPost } from "@/lib/socialPost";
import DigPage, { metadata as digMetadata } from "@/app/dig/page";
import { metadata as pastMetadata } from "@/app/dig/past/page";
import { WORDS, type WordEntry } from "@/lib/words";

// A signed-out reader, so SignupOffer renders the email form.
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "unauthenticated" }) }));

/** The one end-to-end copy audit (archive, never backlog). Every surface a player sees renders
 * here and is checked against the single banned list in ./copyAudit. Fix a hit in the owning
 * component, never in the list. */

const day = prepareDay({ ...encodeDay(devDay("2026-12-05")), number: 5 });
const tiers: (Tier | null)[] = ["common", "popular", null, "uncommon", "rare", "fossil", "familiar"];
const answers = ["apple", "tea", null, "quince", "gimlet", "halyard", "keel"];
const finished = (spread: Record<string, number>) => ({ answers, tiers: tiers as never, score: 125, finishedAt: "x", spread });
const few = finished({ "10": 40, "30": 9 });
const many = finished({ "1": 60, "10": 40, "30": 90 });
const word = WORDS.find((w) => w.slug === "ketchup") as WordEntry;
const dig = { prompt: "Name a beverage" };

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

// The /dig page's own words: search and share snippets, plus the no-JavaScript fallback.
vi.stubEnv("DIG_LAUNCH_DATE", "2026-01-01");
const digPageHtml = html(DigPage());
vi.unstubAllEnvs();

const reveals: Record<string, string> = {};
for (const tier of TIERS) {
  for (const variantIndex of [0, 1, 2]) {
    const result = { answer: tier === "fossil" ? "halyard" : "keel", tier, rejected: [], lastGuess: null };
    reveals[`reveal ${tier} v${variantIndex}`] = html(
      <Reveal secret={{ ...secret, stories: { keel: "keel" } }} result={result} variantIndex={variantIndex}
        isLast={false} onNext={noop} onClaim={noop} claimed={false} canClaim kind="theme" promptText="Name a word from sailing" onStory={noop} />,
    );
    reveals[`announce ${tier}`] = announceReveal(result, secret, false);
  }
}
for (const passed of [true, false]) {
  const result = { answer: null, tier: null, rejected: [], lastGuess: null };
  reveals[`reveal miss passed=${passed}`] = html(<Reveal secret={secret} result={result} passed={passed} isLast onNext={noop} onClaim={noop} claimed canClaim={false} />);
  reveals[`announce miss passed=${passed}`] = announceReveal(result, secret, passed);
}

const prompts: Record<string, string> = {};
for (const noTimer of [false, true]) {
  for (const phase of ["reading", "answering"] as const) {
    prompts[`prompt ${phase} noTimer=${noTimer}`] = html(<PromptScreen {...promptBase} phase={phase} clock={10} noTimer={noTimer} feedback={null} onTimer={noop} />);
  }
}
for (const feedback of [
  { kind: "near", guess: "halyrd", suggestion: "halyard", index: 0 },
  { kind: "miss", guess: "zz" }, { kind: "empty" }, { kind: "letters" },
] as const) {
  prompts[`prompt feedback ${feedback.kind}`] = html(<PromptScreen {...promptBase} phase="answering" clock={10} noTimer={false} feedback={feedback as never} />);
}
prompts["prompt feedback miss claimable"] = html(<PromptScreen {...promptBase} phase="answering" clock={10} noTimer={false} feedback={{ kind: "miss", guess: "medlar" }} canClaim onClaim={noop} />);

const surfaces: Record<string, string> = {
  intro: html(<Intro noTimer={false} onToggleTimer={noop} onStart={noop} />),
  introNoTimer: html(<Intro noTimer onToggleTimer={noop} onStart={noop} />),
  ...prompts,
  ...reveals,
  endTodayFew: html(<EndScreen day={day} game={few} isToday />),
  endTodayMany: html(<EndScreen day={day} game={many} isToday />),
  endTodayHint: html(<EndScreen day={{ ...day, tomorrow: "a word English took from Japanese" }} game={many} isToday autoFocus />),
  endPast: html(<EndScreen day={day} game={many} isToday={false} />),
  announceDone: announceDone(125, tiers),
  staleChallenge: staleChallengeLine("12.01234-0", 14) ?? "",
  strataFull: html(<Strata tiers={tiers} words={answers} label="Your dig" />),
  strataCompact: html(<Strata compact tiers={[...tiers.slice(0, 3), undefined, undefined, undefined, undefined]} label="" current={3} justDropped={2} />),
  pastList: html(<PastList days={[{ date: "2026-12-05", number: 5 }]} />),
  digPage: digPageHtml,
  digMetadata: `${digMetadata.title} ${digMetadata.description}`,
  pastMetadata: `${pastMetadata.title} ${pastMetadata.description}`,
  digLine: digLineText("Name a beverage"),
  digLineShort: digLineText("Name a beverage", { short: true }),
  share: shareText(5, 125, tiers),
  shareImage: shareImageLines(5, 125, true).join("\n"),
  ogImage: [OG_DIG_TITLE, OG_DIG_TAGLINE, ogDayTitle(5), ogDayTitle(null)].join("\n"),
  digest: buildDigestHtml(word, "7 Nov 2026", "#", "https://curioword.com/story/ketchup", dig),
  digestSample: buildDigestHtml(word, "7 Nov 2026", "#", "https://curioword.com/story/ketchup", dig, "sample"),
  digestText: buildDigestMessage("sam@example.com", word, new Date("2026-11-07T09:00:00Z"), "s3cret", dig).text,
  bluesky: buildBlueskyPost(word, dig),
  threads: buildThreadsPost(word, dig),
  instagram: buildInstagramCaption(word, dig),
};

describe("copy audit: archive, never backlog", () => {
  for (const [name, text] of Object.entries(surfaces)) {
    it(`${name} is clean`, () => expect(bannedHits(text)).toEqual([]));
  }
  it("tier copy and the stratum names are clean", () => {
    expect(bannedHits(Object.values(TIER_LABEL).join(" "))).toEqual([]);
    expect(bannedHits(Object.values(STRATUM).join(" "))).toEqual([]);
    expect(TIER_POINTS.fossil).toBeGreaterThan(0);
  });
  it("only the exact depth-percentile phrase is allowed, and only from 100 finishers", () => {
    expect(surfaces.endTodayMany).toContain("Deeper than");
    expect(surfaces.endTodayFew).not.toContain("Deeper than");
    expect(surfaces.endPast).not.toContain("Deeper than");
  });
});
