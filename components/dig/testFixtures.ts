export const noop = () => {};
export const prompt = { id: "theme:sailing", kind: "theme" as const, text: "Name a word from sailing" };
export const secret = { answers: [], aliases: {}, guard: [], fossil: { word: "halyard", fact: "From haul + yard.", story: "halyard" }, stories: {} };
export const promptBase = { index: 2, total: 7, prompt, onSubmit: noop, onPass: noop };
