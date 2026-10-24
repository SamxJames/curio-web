/* Shared sample data + game engine for the rarity-game mockups.
 * Inlined into each option by build.mjs so every mockup opens from disk
 * with no network and no build step for the reader. Edit here, then run
 * `node docs/rarity-game/mockups/build.mjs`. */

/* ---------- Sample data (hand-made, plausible; real Curio story slugs) ---------- */

const STORY = "https://curioword.com/story/";

const TIER_POINTS = { common: 10, clever: 15, familiar: 30, uncommon: 60, rare: 85, gem: 100 };
const TIER_ORDER = ["common", "clever", "familiar", "uncommon", "rare", "gem"];

/* a = answer, t = tier, s = Curio story slug (only where a story page exists),
 * al = aliases / alternative spellings, f = one-line fact (gems only). */
const DAY = {
  number: 1,
  date: "2026-11-16",
  dateLabel: "Monday 16 November",
  prompts: [
    {
      kind: "theme",
      text: "Name a word from sailing",
      short: "Sailing",
      answers: [
        { a: "sail", t: "common", s: "sail" }, { a: "boat", t: "common" }, { a: "anchor", t: "common" },
        { a: "ship", t: "common" }, { a: "starboard", t: "clever" }, { a: "mast", t: "familiar" },
        { a: "keel", t: "familiar", s: "keel" }, { a: "rudder", t: "familiar", s: "rudder" },
        { a: "port", t: "familiar", s: "port" }, { a: "harbour", t: "familiar", al: ["harbor"] },
        { a: "skipper", t: "uncommon", s: "skipper" }, { a: "dinghy", t: "uncommon", s: "dinghy" },
        { a: "ballast", t: "uncommon" }, { a: "bilge", t: "uncommon" }, { a: "halyard", t: "rare" },
        { a: "gunwale", t: "rare", al: ["gunnel"] }, { a: "bowsprit", t: "rare" }, { a: "binnacle", t: "rare" },
        { a: "flotilla", t: "gem", s: "flotilla", f: "Spanish for 'a little fleet': a nickname that makes a fleet sound friendlier than it is." },
      ],
    },
    {
      kind: "origin",
      text: "Name a word English borrowed from Arabic",
      short: "From Arabic",
      answers: [
        { a: "coffee", t: "common", s: "coffee" }, { a: "sugar", t: "common" }, { a: "algebra", t: "common" },
        { a: "alcohol", t: "common" }, { a: "algorithm", t: "clever" }, { a: "candy", t: "familiar", s: "candy" },
        { a: "lemon", t: "familiar" }, { a: "sofa", t: "familiar" }, { a: "magazine", t: "familiar" },
        { a: "saffron", t: "uncommon", s: "saffron" }, { a: "monsoon", t: "uncommon", s: "monsoon" },
        { a: "mattress", t: "uncommon", s: "mattress" }, { a: "chemistry", t: "uncommon", s: "chemistry" },
        { a: "nadir", t: "rare", s: "nadir" }, { a: "gauze", t: "rare", s: "gauze" },
        { a: "caraway", t: "rare", s: "caraway" }, { a: "almanac", t: "rare", s: "almanac" },
        { a: "tabby", t: "gem", s: "tabby", f: "Named after al-'Attabiyya, a Baghdad quarter famous for striped silk." },
      ],
    },
    {
      kind: "theme",
      text: "Name something you'd find in a kitchen",
      short: "Kitchen",
      answers: [
        { a: "pan", t: "common" }, { a: "fork", t: "common" }, { a: "oven", t: "common" }, { a: "knife", t: "common" },
        { a: "colander", t: "clever" }, { a: "whisk", t: "familiar" }, { a: "ladle", t: "familiar" },
        { a: "kettle", t: "familiar" }, { a: "spatula", t: "uncommon" }, { a: "skillet", t: "uncommon" },
        { a: "ramekin", t: "uncommon" }, { a: "mandoline", t: "rare" }, { a: "bain-marie", t: "rare", al: ["bain marie"] },
        { a: "chinois", t: "gem", f: "A cone-shaped sieve whose name is simply French for 'Chinese', after its hat-like shape." },
      ],
    },
    {
      kind: "theme",
      text: "Name a word for weather",
      short: "Weather",
      answers: [
        { a: "rain", t: "common" }, { a: "snow", t: "common" }, { a: "wind", t: "common" }, { a: "fog", t: "common" },
        { a: "petrichor", t: "clever" }, { a: "drizzle", t: "familiar" }, { a: "sleet", t: "familiar" },
        { a: "hail", t: "familiar" }, { a: "typhoon", t: "familiar", s: "typhoon" },
        { a: "monsoon", t: "uncommon", s: "monsoon" }, { a: "squall", t: "uncommon" }, { a: "mizzle", t: "uncommon" },
        { a: "graupel", t: "rare" }, { a: "virga", t: "rare" },
        { a: "haar", t: "gem", f: "A cold sea fog that rolls onto the east coasts of Scotland and England." },
      ],
    },
    {
      kind: "origin",
      text: "Name a word that came to English from Persian",
      short: "From Persian",
      answers: [
        { a: "pyjamas", t: "common", al: ["pajamas"] }, { a: "caravan", t: "common" }, { a: "bazaar", t: "common" },
        { a: "paradise", t: "clever" }, { a: "chess", t: "familiar", s: "chess" }, { a: "lilac", t: "familiar", s: "lilac" },
        { a: "azure", t: "uncommon", s: "azure" }, { a: "shawl", t: "uncommon" }, { a: "kiosk", t: "uncommon" },
        { a: "taffeta", t: "rare" }, { a: "seersucker", t: "rare" },
        { a: "mummy", t: "gem", s: "mummy", f: "From a Persian word for wax: embalmed bodies were thought to be coated in bitumen." },
      ],
    },
    {
      kind: "theme",
      text: "Name a musical instrument",
      short: "Instruments",
      answers: [
        { a: "guitar", t: "common" }, { a: "piano", t: "common" }, { a: "drum", t: "common", al: ["drums"] },
        { a: "violin", t: "common" }, { a: "theremin", t: "clever" }, { a: "lute", t: "familiar", s: "lute" },
        { a: "tambourine", t: "familiar", s: "tambourine" }, { a: "harp", t: "familiar" }, { a: "oboe", t: "uncommon" },
        { a: "timpani", t: "uncommon" }, { a: "theorbo", t: "rare" }, { a: "hurdy-gurdy", t: "rare", al: ["hurdy gurdy"] },
        { a: "sackbut", t: "gem", f: "The Renaissance trombone. Its name meant 'pull-push', from Old French." },
      ],
    },
    {
      kind: "theme",
      text: "Name a colour",
      short: "Colours",
      answers: [
        { a: "red", t: "common" }, { a: "blue", t: "common" }, { a: "green", t: "common" }, { a: "yellow", t: "common" },
        { a: "cerulean", t: "clever" }, { a: "azure", t: "familiar", s: "azure" }, { a: "lilac", t: "familiar", s: "lilac" },
        { a: "turquoise", t: "familiar" }, { a: "saffron", t: "uncommon", s: "saffron" }, { a: "ochre", t: "uncommon", al: ["ocher"] },
        { a: "vermilion", t: "uncommon" }, { a: "smalt", t: "rare" }, { a: "fulvous", t: "rare" },
        { a: "gamboge", t: "gem", f: "A mustard-yellow pigment named after Cambodia, where the resin came from." },
      ],
    },
  ],
};

/* Past days for the archive screen. score: null = not played on this device.
 * Copy must never say "missed": an unplayed day is simply open to play. */
const ARCHIVE = [
  { number: 1, dateLabel: "Mon 16 Nov", themes: "Sailing, from Arabic, kitchen, weather, from Persian, instruments, colours", score: null, today: true },
  { number: 0, dateLabel: "Sun 15 Nov", themes: "Birds, from Norse, cheese, the law, from Hindi, fabrics, games", score: 410 },
  { number: -1, dateLabel: "Sat 14 Nov", themes: "Trees, from French, medicine, money, from Dutch, dances, tools", score: null },
  { number: -2, dateLabel: "Fri 13 Nov", themes: "Horses, from Greek, bread, the sea, from Italian, hats, insects", score: 275 },
  { number: -3, dateLabel: "Thu 12 Nov", themes: "Gardening, from Spanish, war, the body, from Japanese, cards, spices", score: null },
  { number: -4, dateLabel: "Wed 11 Nov", themes: "Rivers, from Latin, sweets, school, from Malay, shoes, the night sky", score: 520 },
];

/* A plausible finished run so the jump menu can show later screens without playing. */
const SAMPLE_RUN = ["skipper", "tabby", "colander", "drizzle", null, "theorbo", "ochre"];

/* Pretend aggregate: share of today's finishers with a lower score. */
const PERCENTILE_TABLE = [[0, 3], [100, 18], [200, 41], [300, 62], [350, 70], [400, 79], [500, 91], [600, 98], [700, 100]];

/* ---------- Matching ---------- */

function norm(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
}
function variants(s) {
  const n = norm(s);
  const out = new Set([n, n.replace(/ /g, "")]);
  if (n.endsWith("ies")) out.add(n.slice(0, -3) + "y");
  if (n.endsWith("es")) out.add(n.slice(0, -2));
  if (n.endsWith("s")) out.add(n.slice(0, -1));
  out.add(n.replace(/our\b/g, "or")).add(n.replace(/or\b/g, "our")).add(n.replace(/re\b/g, "er"));
  return out;
}
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/* hit: exact after generous normalising. near: one edit away (two for long words)
 * and must be confirmed by the player, so freak fuzzy matches never score silently. */
function matchAnswer(prompt, raw) {
  const vs = variants(raw);
  for (const ans of prompt.answers) {
    const keys = [ans.a, ...(ans.al || [])].map(norm);
    if (keys.some((k) => vs.has(k) || vs.has(k.replace(/ /g, "")))) return { kind: "hit", answer: ans };
  }
  const n = norm(raw);
  if (n.length >= 4) {
    let best = null;
    for (const ans of prompt.answers) {
      for (const k of [ans.a, ...(ans.al || [])].map(norm)) {
        const dist = lev(n, k);
        const allowed = k.length >= 8 ? 2 : 1;
        if (dist <= allowed && (!best || dist < best.dist)) best = { dist, answer: ans };
      }
    }
    if (best) return { kind: "near", answer: best.answer };
  }
  return { kind: "miss" };
}

function percentileFor(score) {
  let p = 0;
  for (const [s, pct] of PERCENTILE_TABLE) if (score >= s) p = pct;
  return p;
}

function summarise(results) {
  const score = results.reduce((t, r) => t + r.points, 0);
  return {
    score, max: 700, results, percentile: percentileFor(score),
    gems: results.filter((r) => r.answer && r.answer.t === "gem").length,
  };
}

/* "Words worth knowing" per prompt: the gem first, then answers with Curio stories
 * (rarest first), then everything else. Never framed as "missed". */
function wordsWorthKnowing(prompt) {
  const byRarity = [...prompt.answers].sort((x, y) => TIER_ORDER.indexOf(y.t) - TIER_ORDER.indexOf(x.t));
  const gem = byRarity.find((a) => a.t === "gem");
  const stories = byRarity.filter((a) => a.s && a !== gem);
  const rest = byRarity.filter((a) => !a.s && a !== gem);
  return { gem, stories, rest };
}

/* ---------- Controller ----------
 * Each option supplies `ui` with render hooks and marks up screens with
 * data-screen="start|prompt|feedback|end|share|words|archive". Buttons use
 * data-action. The controller owns timing, matching and state. */

const PROMPT_SECONDS = 25;
const GRACE_SECONDS = 3;

function startMock(ui) {
  const $ = (sel, root = document) => root.querySelector(sel);
  const state = { i: 0, results: [], noTimer: false, pendingNear: null, timer: null, left: PROMPT_SECONDS, grace: 0 };
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function show(name) {
    document.querySelectorAll("main [data-screen]").forEach((el) => { el.hidden = el.dataset.screen !== name; });
    document.documentElement.dataset.current = name;
    window.scrollTo(0, 0);
    const focusTarget = $(`[data-screen="${name}"] [data-autofocus]`) || $(`[data-screen="${name}"] h1, [data-screen="${name}"] h2`);
    if (focusTarget) { focusTarget.setAttribute("tabindex", focusTarget.matches("input,button,a") ? "0" : "-1"); focusTarget.focus({ preventScroll: true }); }
    ui.onShow && ui.onShow(name, state);
  }

  function announce(msg) { const live = $("[data-live]"); if (live) { live.textContent = ""; setTimeout(() => (live.textContent = msg), 30); } }

  function stopTimer() { clearInterval(state.timer); state.timer = null; }

  function startPrompt() {
    stopTimer();
    state.pendingNear = null;
    state.left = PROMPT_SECONDS;
    state.grace = state.noTimer ? 0 : GRACE_SECONDS;
    const prompt = DAY.prompts[state.i];
    show("prompt");
    ui.renderPrompt(prompt, state.i, DAY.prompts.length, state);
    ui.renderTimer(state);
    const input = $("[data-input]");
    if (input) { input.value = ""; input.focus(); }
    if (state.noTimer) return;
    state.timer = setInterval(() => {
      if (document.hidden) return; // pause while the tab is hidden
      if (state.grace > 0) state.grace -= 1;
      else state.left -= 1;
      ui.renderTimer(state);
      if (state.grace === 0 && (state.left === 10 || state.left === 5)) announce(`${state.left} seconds left`);
      if (state.left <= 0) record(null, true);
    }, 1000);
  }

  function record(answer, timedOut, raw = "") {
    stopTimer();
    const result = { prompt: DAY.prompts[state.i], raw, answer, timedOut, points: answer ? TIER_POINTS[answer.t] : 0 };
    state.results[state.i] = result;
    show("feedback");
    ui.renderFeedback(result, state.i, summarise(state.results.filter(Boolean)), state);
    announce(answer ? `${answer.a}: ${ui.tierName(answer.t)}, ${result.points} points` : "Time's up, no answer this round");
  }

  function submit(raw) {
    const prompt = DAY.prompts[state.i];
    if (!raw.trim()) return;
    if (state.pendingNear && norm(raw) === norm(state.pendingNear.raw)) return record(state.pendingNear.answer, false, raw);
    const m = matchAnswer(prompt, raw);
    if (m.kind === "hit") return record(m.answer, false, raw);
    if (m.kind === "near") { state.pendingNear = { raw, answer: m.answer }; ui.renderNear(raw, m.answer); announce(`Did you mean ${m.answer.a}? Press enter again to confirm, or edit.`); return; }
    state.pendingNear = null;
    ui.renderMiss(raw);
    announce(`${raw} isn't on the list. Try another.`);
  }

  function next() {
    state.i += 1;
    if (state.i >= DAY.prompts.length) return finish();
    startPrompt();
  }

  function finish() {
    const s = summarise(state.results);
    show("end");
    ui.renderEnd(s, state);
  }

  function fillSampleRun() {
    state.results = DAY.prompts.map((p, i) => {
      const w = SAMPLE_RUN[i];
      const ans = w ? p.answers.find((a) => a.a === w) : null;
      return { prompt: p, raw: w || "", answer: ans, timedOut: !ans, points: ans ? TIER_POINTS[ans.t] : 0 };
    });
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const a = btn.dataset.action;
    if (a === "start") { state.i = 0; state.results = []; startPrompt(); }
    else if (a === "next") next();
    else if (a === "toggle-timer") { state.noTimer = !state.noTimer; ui.renderTimerSetting && ui.renderTimerSetting(state); }
    else if (a === "share") { show("share"); ui.renderShare(summarise(state.results.length === 7 ? state.results : (fillSampleRun(), state.results)), state); }
    else if (a === "copy") {
      const text = ui.shareText(summarise(state.results));
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(
        () => { btn.textContent = "Copied"; announce("Result copied"); },
        () => { btn.textContent = "Select the text above to copy"; });
    }
    else if (a === "words") { show("words"); ui.renderWords(state.results.length === 7 ? state.results : (fillSampleRun(), state.results), state); }
    else if (a === "archive") { show("archive"); ui.renderArchive(ARCHIVE, state); }
    else if (a === "end") { if (state.results.length < 7) fillSampleRun(); finish(); }
    else if (a === "home") { stopTimer(); show("start"); }
    else if (a === "signup") { e.preventDefault(); ui.renderSignupDone && ui.renderSignupDone(btn); }
  });

  document.addEventListener("submit", (e) => {
    const form = e.target;
    if (form.matches("[data-answer-form]")) { e.preventDefault(); submit($("[data-input]").value); }
    if (form.matches("[data-signup-form]")) { e.preventDefault(); ui.renderSignupDone && ui.renderSignupDone(form); }
  });

  /* Mockup-only jump menu: lets the reviewer reach any screen without playing. */
  const jump = document.createElement("details");
  jump.className = "mock-jump";
  jump.innerHTML = `<summary>Mockup: jump to a screen</summary><div>
    <button type="button" data-jump="start">Start</button>
    <button type="button" data-jump="prompt">Prompt + timer</button>
    <button type="button" data-jump="near">Near-miss confirm</button>
    <button type="button" data-jump="feedback">Answer reveal</button>
    <button type="button" data-jump="end">End screen</button>
    <button type="button" data-jump="share">Share cards</button>
    <button type="button" data-jump="words">Words worth knowing</button>
    <button type="button" data-jump="archive">Past days</button>
    <button type="button" data-jump="signup">Daily-word signup</button>
    <a href="index.html">All options</a></div>`;
  document.body.appendChild(jump);
  jump.addEventListener("click", (e) => {
    const b = e.target.closest("[data-jump]");
    if (!b) return;
    const to = b.dataset.jump;
    stopTimer();
    if (to === "start") show("start");
    if (to === "prompt") { state.i = 0; state.results = []; startPrompt(); }
    if (to === "near") { state.i = 0; state.results = []; state.noTimer = true; startPrompt(); $("[data-input]").value = "flotila"; submit("flotila"); state.noTimer = false; }
    if (to === "feedback") { state.i = 1; state.results = []; record(DAY.prompts[1].answers.find((a) => a.a === "tabby"), false, "tabby"); }
    if (to === "end") { fillSampleRun(); finish(); }
    if (to === "share") { fillSampleRun(); show("share"); ui.renderShare(summarise(state.results), state); }
    if (to === "words") { fillSampleRun(); show("words"); ui.renderWords(state.results, state); }
    if (to === "archive") { show("archive"); ui.renderArchive(ARCHIVE, state); }
    if (to === "signup") { fillSampleRun(); finish(); const el = $("[data-signup]"); if (el) el.scrollIntoView({ block: "center" }); }
    jump.open = false;
  });

  ui.init && ui.init(state);
  ui.renderTimerSetting && ui.renderTimerSetting(state);
  show("start");
  return { state, reduceMotion };
}
