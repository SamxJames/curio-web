export type WordEntry = {
  slug: string;
  word: string;
  respelling: string;
  partOfSpeech: string;
  /** A one-sentence hook shown on the Today page — distinct from `origin`
   * (the full explanation shown on the story page) so clicking through
   * reveals new text rather than repeating what was just read. Written from
   * the same facts as origin/journey/related, just condensed and rephrased,
   * never introducing anything not already established there. */
  teaser: string;
  origin: string;
  journey: string;
  related: string;
  /** The languages this word passed through, oldest first, ending in
   * "English" — only languages explicitly named in this entry's own
   * origin/journey/related text, in the order they're introduced. Powers
   * the etymology lineage breadcrumb (components/EtymologyLineage.tsx). */
  lineage: string[];
  /** Three STANDALONE clues for the /play puzzle (lib/puzzle.ts) — unlike
   * origin/journey/related, each must make sense read in isolation, since
   * only one is shown at a time. Ordered most-to-least oblique: clue[0]
   * must not name the word, its direct translation, or any word sharing a
   * visible stem with it; clue[2] may name cognates and get close to
   * giving the word away outright, but (like all three) must never contain
   * the word itself or its stem — see lib/words.test.ts's "WORDS clues"
   * block for the mechanical half of that check, and this comment for the
   * editorial half a test can't fully capture. */
  clues: [string, string, string];
};

// Seed content. Each entry is written from general etymological knowledge
// (Wiktextract-style facts, rewritten in Curio's voice) — swap this array
// for the output of the offline content pipeline described in the brief
// once it's ported over from the mobile app.
export const WORDS: WordEntry[] = [
  {
    slug: "quarantine",
    word: "quarantine",
    respelling: "KWOR-uhn-teen",
    partOfSpeech: "noun",
    teaser:
      "Venice once made incoming ships wait offshore for exactly forty days — no more, no less.",
    origin:
      "From Italian quaranta giorni, \u201cforty days\u201d — the wait Venice imposed on ships arriving from plague-affected ports in the 14th century before anyone could come ashore.",
    journey:
      "The word stayed tied to that exact span for centuries: forty days, no more, no less. Only in modern use did it loosen from the number itself, coming to mean any isolation period imposed to stop disease from spreading — regardless of how long it actually lasts.",
    related:
      "Quarantine's root, quaranta, traces back to Latin quadraginta (forty), which makes it a distant cousin of quarter and quart — all ultimately from quattuor, four.",
    lineage: ["Latin", "Italian", "English"],
    clues: [
      "A European port city once forced incoming ships to sit offshore for a set stretch of time before anyone could disembark.",
      "Venice imposed this on ships from plague-affected ports in the 1300s — specifically, a wait of exactly forty days.",
      "The Italian phrase behind it literally means “forty days”; quarter and quart are distant cousins, both from the Latin word for four.",
    ],
  },
  {
    slug: "salary",
    word: "salary",
    respelling: "SAL-uh-ree",
    partOfSpeech: "noun",
    teaser: "A Roman soldier's stipend, tied to an unlikely ingredient: salt.",
    origin:
      "From Latin salarium, a stipend paid to Roman soldiers, traditionally connected to sal, salt — a commodity valuable enough that it may once have been part of a soldier's pay.",
    journey:
      "The word drifted from a specific soldier's allowance to any regular payment for work at all, shedding its connection to salt so completely that no English speaker today thinks of seasoning when they mention a salary.",
    related:
      "The same Latin sal gives English salad, sauce, and sausage, and lives on in the phrase \u201cworth one's salt.\u201d",
    lineage: ["Latin", "English"],
    clues: [
      "Roman soldiers' pay was once connected, in a roundabout way, to an everyday seasoning.",
      "That seasoning was salt — this word's Latin ancestor was built directly from the Latin word for it.",
      "The same Latin word for salt also gives English salad, sauce, and sausage — and lives on in the phrase “worth one's salt.”",
    ],
  },
  {
    slug: "disaster",
    word: "disaster",
    respelling: "dih-ZAS-ter",
    partOfSpeech: "noun",
    teaser: "Once a literal verdict from the stars — being “ill-starred” in the most direct sense.",
    origin:
      "From Italian disastro, built from dis- (bad) and astro (star) — reflecting the old belief that misfortune arrived by way of an unfavorable alignment of the stars.",
    journey:
      "What began as a literal astrological verdict — \u201cill-starred\u201d — broadened over time into any sudden catastrophe, with the stargazing entirely forgotten.",
    related:
      "The astro- root resurfaces in astronomy and astronaut; the dis- prefix shows up again in disgrace and discord.",
    lineage: ["Italian", "English"],
    clues: [
      "This word for a sudden catastrophe was once a literal verdict handed down by the position of the sky.",
      "Its two Italian building blocks mean “bad” and “star” — misfortune was once blamed directly on an unlucky alignment overhead.",
      "The “star” half also shows up in astronomy and astronaut; the “bad” half resurfaces in disgrace and discord.",
    ],
  },
  {
    slug: "clue",
    word: "clue",
    respelling: "KLOO",
    partOfSpeech: "noun",
    teaser: "A ball of thread that became, through a Greek myth, the word for finding your way.",
    origin:
      "A variant spelling of clew, meaning a ball of thread, from Old English cliewen.",
    journey:
      "The meaning shifted through the myth of Theseus, who used a thread to retrace his steps out of the Minotaur's labyrinth. From there, clue came to mean anything that helps you find your way through a problem — the thread itself dropped out of everyday use entirely.",
    related:
      "Clew survives today only as a sailing term for the corner of a sail; clue and clew are, at root, the very same word.",
    lineage: ["Old English", "English"],
    clues: [
      "In an ancient Greek myth, a hero unwound a ball of thread behind him so he could find his way back out of a maze.",
      "That myth is where this word for a hint that helps you solve something comes from — it was originally the literal thread itself.",
      "It's spelled almost like its own ancestor, clew — today surviving only as a sailing term for the corner of a sail.",
    ],
  },
  {
    slug: "muscle",
    word: "muscle",
    respelling: "MUSS-uhl",
    partOfSpeech: "noun",
    teaser: "Named for a little mouse — because that's what a flexing bicep looked like to the Romans.",
    origin:
      "From Latin musculus, literally \u201clittle mouse\u201d — a flexing bicep was thought to look like a small mouse moving under the skin.",
    journey:
      "The nickname stuck so thoroughly that it became the standard anatomical term, while the image of a mouse under the skin faded out of how people actually think about the word.",
    related:
      "Musculus is a diminutive of mus (mouse) — the same root behind mouse itself, and, much later, the computer mouse.",
    lineage: ["Latin", "English"],
    clues: [
      "To Roman anatomists, a flexing body part looked like a small animal moving just beneath the skin.",
      "That resemblance is Latin for “little mouse” — the nickname stuck so well it became the official word for it.",
      "The same Latin root for “mouse” gives us the small rodent itself, and much later, the computer accessory named after it.",
    ],
  },
  {
    slug: "robot",
    word: "robot",
    respelling: "ROH-bot",
    partOfSpeech: "noun",
    teaser: "Invented for a 1920s stage play, from a Slavic word for forced labor.",
    origin:
      "Coined by Czech writer Karel \u010Capek for his 1920 play R.U.R., from robota, a Czech and Slavic word for forced labor or drudgery.",
    journey:
      "The word entered English almost as soon as the play was translated and quickly outgrew the stage, moving from \u201cartificial forced laborer\u201d to any mechanical or programmable machine.",
    related:
      "Robota is related to rab, an old Slavic word for slave. English has no native cognates for it, making robot one of the few everyday English words borrowed wholesale from Czech.",
    lineage: ["Slavic", "Czech", "English"],
    clues: [
      "This word for a mechanical worker was invented for a 1920s stage play, not borrowed from everyday speech.",
      "Its Czech root means forced labor or drudgery, coined by the writer Karel Čapek.",
      "That root is related to an old Slavic word for slave — English has no native relatives for it at all, making this one of the few everyday words borrowed wholesale from Czech.",
    ],
  },
  {
    slug: "avocado",
    word: "avocado",
    respelling: "av-uh-KAH-doh",
    partOfSpeech: "noun",
    teaser:
      "A Nahuatl word for a rather personal part of the body, reshaped by Spanish into something else entirely.",
    origin:
      "From Nahuatl \u0101huacatl, which also meant \u201ctesticle,\u201d likely describing how the fruit hangs from the tree in pairs.",
    journey:
      "Spanish reshaped the unfamiliar Nahuatl word into aguacate, and a later folk-etymological twist produced avocado — nudged along by the unrelated Spanish word abogado (lawyer). That detour is also why avocados were once called \u201calligator pears\u201d in English.",
    related:
      "Guacamole comes from the same Nahuatl root, combining \u0101huacatl with molli (sauce).",
    lineage: ["Nahuatl", "Spanish", "English"],
    clues: [
      "This fruit's original name in Nahuatl referred to a rather personal part of the body — a nod to how it hangs in pairs from the tree.",
      "Spanish speakers reshaped that word, and a later mix-up with the Spanish word for lawyer helped push it toward its modern form — which is also why English once called it an “alligator pear.”",
      "Guacamole comes from the very same Nahuatl root, just combined with the word for sauce.",
    ],
  },
  {
    slug: "companion",
    word: "companion",
    respelling: "kuhm-PAN-yuhn",
    partOfSpeech: "noun",
    teaser: "Literally: someone you break bread with.",
    origin:
      "From Latin com- (together) and panis (bread), by way of Old French compaignon — literally \u201cone who breaks bread with you.\u201d",
    journey:
      "The concrete image of a shared meal broadened into the general sense of anyone who accompanies you, with no bread — or food at all — required anymore.",
    related:
      "The same panis gives English pantry (where bread was kept), and, through French, company and accompany.",
    lineage: ["Latin", "Old French", "English"],
    clues: [
      "This word for someone who's with you started as a description of a very specific shared activity.",
      "Literally, in Latin, it means “one who breaks bread with you” — together plus the word for bread.",
      "That same root for bread also gives us pantry, where it was kept, and — through French — company and accompany.",
    ],
  },
  {
    slug: "alarm",
    word: "alarm",
    respelling: "uh-LAHRM",
    partOfSpeech: "noun",
    teaser: "Somewhere behind this word is a shout across a battlefield.",
    origin: "Alarm comes from Middle English alarme or alarom, borrowed from Middle French alarme, which came from Old Italian all'arme! — literally 'to arms!, to the weapons!' — ultimately rooted in Latin arma, meaning 'arms, weapons.'",
    journey: "The word began as an actual battle cry telling soldiers to grab their weapons, and over time it settled into English as a general word for any signal of danger.",
    related: "It shares its root with 'arms,' both tracing back to Latin arma — one word stayed literal, the other became a cry of warning.",
    lineage: ["Latin","Old Italian","Middle French","Middle English","English"],
    clues: ["It began as a shouted command urging soldiers to grab what they'd fight with.","Its Old Italian ancestor literally meant 'to the weapons!'","It's a distant cousin of the everyday word 'arms,' both from Latin arma."],
  },
  {
    slug: "apron",
    word: "apron",
    respelling: "AY-pruhn",
    partOfSpeech: "noun",
    teaser: "This word for kitchen wear stole its first letter from the word 'a' by mistake.",
    origin: "Apron comes from Middle English napron, borrowed from Old French napperon, a diminutive of nappe meaning 'tablecloth,' which traces back to Latin mappa, 'napkin.'",
    journey: "The shift happened through rebracketing: 'a napron' was misheard and reanalyzed as 'an apron,' so the n slid over and stuck to the article instead of the noun.",
    related: "It shares this exact kind of slip-of-the-ear reshaping with words like adder, newt, and umpire, which also lost or gained a letter by trading it with 'a' or 'an.'",
    lineage: ["Latin","Old French","Middle English","English"],
    clues: ["Its first sound didn't originally belong to it — it wandered over from the little word beside it.","It once began with an 'n,' back when it meant a small tablecloth.","Like 'adder' and 'newt,' it lost a letter to the article 'a' standing next to it."],
  },
  {
    slug: "barrel",
    word: "barrel",
    respelling: "BAIR-uhl",
    partOfSpeech: "noun",
    teaser: "A round wooden container that may have started out as something you simply carried.",
    origin: "English barrel comes from Middle English barel, from Anglo-Norman and Old French baril, a word of uncertain origin. Its likeliest source is Frankish or Gothic, from Proto-Germanic *barilaz/*bērilaz, itself from Proto-Indo-European *bʰer- meaning 'to carry, transport' — the same root behind the word bear.",
    journey: "The link to *barre (bar, rod) fits the sound but not the sense, so the more convincing story ties the word to carrying and containers rather than to bars or bolts.",
    related: "It's built the same way as bear, with a -le suffix added to the root for carrying — making a barrel, at its core, 'a thing for bearing or transporting.'",
    lineage: ["Proto-Indo-European","Proto-Germanic","Frankish","Old French","Anglo-Norman","Middle English","English"],
    clues: ["Its likely deep root just means 'to carry' — the same ancient idea behind the English word for holding weight or enduring something.","One guess ties it to a word for a bar or rod, but scholars say that link fails on meaning, not sound.","It may share a root with 'bear,' as if it were simply a thing built for bearing things."],
  },
  {
    slug: "bedlam",
    word: "bedlam",
    respelling: "BED-luhm",
    partOfSpeech: "noun",
    teaser: "A word for total chaos that started life as the name of a hospital.",
    origin: "Bedlam comes from Bethlem, a shortened, corrupted form of Bethlehem — the hospital known as Bethlem Royal Hospital (a priory from 1247, later a hospital for the mentally ill from 1403) was commonly called Bedlam by 1450. Bethlehem itself traces back through Ancient Greek Βηθλεέμ to Biblical Hebrew בֵּית לֶחֶם, meaning 'house of bread.'",
    journey: "What began as a place name for a specific London hospital became a general word for any scene of madness and chaos, as the hospital's reputation gave its name a life of its own.",
    related: "Spanish speakers reached for a similar idea with belén, which also means 'confusion, disorder' — worth noting as a parallel, though the facts don't establish a direct link between the two words.",
    lineage: ["Hebrew","Greek","English"],
    clues: ["Its name traces back to a phrase meaning 'house of bread,' borrowed from a town in the Bible.","It began as the nickname for a London hospital that cared for the mentally ill from the 1400s onward.","In Spanish, belén carries a strikingly similar sense of confusion and disorder."],
  },
  {
    slug: "bench",
    word: "bench",
    respelling: "BENCH",
    partOfSpeech: "noun",
    teaser: "A humble piece of furniture that's been holding people up since Old English times.",
    origin: "Bench comes from Middle English bench, benk, or bynk, from Old English benċ, tracing back through Proto-West Germanic *banki to Proto-Germanic *bankiz, and ultimately to a Proto-Indo-European root *bʰeg-.",
    journey: "The word has stayed remarkably close to its original meaning — a long seat — across all these centuries and languages. More recently, it's also been shortened from 'bench press,' giving it a second life as gym shorthand.",
    related: "It's a doublet of bank, banc, and banco — words that split off from the same root but drifted toward money and finance instead of furniture. Its closest cousins are found across Germanic languages: Dutch and West Frisian bank, German Bank, Danish bænk, Swedish bänk, and Icelandic bekkur.",
    lineage: ["Proto-Indo-European","Proto-Germanic","Proto-West Germanic","Old English","Middle English","English"],
    clues: ["In several Germanic tongues, the word for where you sit is the same word for where you keep your money.","Its Old English ancestor meant simply a long seat, and it hasn't strayed far from that since.","It shares a root with 'bank' — both once named the same humble wooden seat."],
  },
  {
    slug: "blanket",
    word: "blanket",
    respelling: "BLANG-kit",
    partOfSpeech: "noun",
    teaser: "This cozy word for a bed-cover started life describing the color of a cloth, not its warmth.",
    origin: "Blanket comes from Middle English blanket, borrowed from Old Northern French blanket/blancet, a diminutive of blanc meaning 'white' — literally 'that which is white,' used for white woollen cloth or flannel. Blanc itself traces to a Germanic root, the same one behind Old English blanca, 'white horse.'",
    journey: "The French word for white woollen cloth was likely also shaped by Old English hwītel, a native word for 'blanket' or 'cloak' built from hwīt ('white') plus a diminutive suffix — so English speakers already had a near-identical idea in their own tongue. Eventually the French-derived blanket pushed out that native word, whytel, from everyday use.",
    related: "Blanket shares its 'white' root with blank, both descending from the same Germanic source for whiteness or blankness. It's also quietly related to whittle, which comes from that displaced Old English word hwītel for a blanket or cloak.",
    lineage: ["Germanic","Old Northern French","Middle English","English"],
    clues: ["Its name once simply meant the color of fresh snow, not the comfort it gives.","In Old French, this word was a small version of 'blanc' — white.","It's a cousin of 'blank,' and it quietly nudged out an English word that became 'whittle.'"],
  },
  {
    slug: "blueprint",
    word: "blueprint",
    respelling: "BLOO-print",
    partOfSpeech: "noun",
    teaser: "A word for a plan so exact it once literally came out a particular color.",
    origin: "Formed from blue + print, this word was introduced by the astronomer Sir John Herschel in 1842.",
    journey: "The facts available only note its coinage in 1842 by Herschel — no further shift in meaning is recorded here.",
    related: "It's built directly from two familiar English words, blue and print, joined together to name something new.",
    lineage: ["English"],
    clues: ["One 19th-century scientist needed a name for a plan rendered in a single, unmistakable hue.","It joins a color and a mark left by pressing something onto paper.","Its two halves are simply 'blue' and 'print,' fused by Sir John Herschel in 1842."],
  },
  {
    slug: "bottle",
    word: "bottle",
    respelling: "BOT-uhl",
    partOfSpeech: "noun",
    teaser: "A small cask that shrank its way into English through French kitchens.",
    origin: "English bottle comes from Middle English botel, from Old French boteille, from Late Latin butticula, a diminutive of buttis, meaning 'cask.' So a bottle is literally, at its root, a little cask.",
    journey: "The word entered English already meaning a container for liquid, and it partially displaced the native Old English word flasce as the everyday term for such a vessel.",
    related: "Bottle is a doublet of botija, meaning both descend from the same Latin ancestor, buttis, but arrived in English by different routes.",
    lineage: ["Latin","Late Latin","Old French","Middle English","English"],
    clues: ["Its name once simply meant 'a little cask' in the language that gave it shape.","It comes from a Late Latin diminutive, butticula, built on the word for 'cask.'","It shares an ancestor with the word botija, making the two doublets of buttis."],
  },
  {
    slug: "cabinet",
    word: "cabinet",
    respelling: "KAB-uh-nit",
    partOfSpeech: "noun",
    teaser: "A small room's name grew up to run a country.",
    origin: "Cabinet comes from cabin plus the suffix -et, shaped along the way by the French word cabinet. It originally named a small private room.",
    journey: "From a literal little chamber, the word came to describe the group of advisors who met in such a room to discuss state affairs — the meeting place lending its name to the meeting itself.",
    related: "It works much like salon, another word that started as the name of a room and came to mean the gathering that happened inside it.",
    lineage: ["French","English"],
    clues: ["It began as a word for a tiny private chamber, not the people inside it.","The word for a government's inner circle once just meant a small room.","Like salon, it lets a room's name stand in for the group that meets there."],
  },
  {
    slug: "candle",
    word: "candle",
    respelling: "KAN-dl",
    partOfSpeech: "noun",
    teaser: "A small flame owes its name to the Latin word for glowing white.",
    origin: "English candle comes from Middle English candel, from Old English candel, itself borrowed from Latin candēla (\"candle\"). That Latin word traces back to candeō, meaning \"be white, bright, shining\".",
    journey: "The word passed quietly from Latin into Old English, then Middle English, keeping essentially the same meaning of a wax light throughout.",
    related: "It's a doublet of candela (the unit of light intensity) and chandelle, both descending from the same Latin root, and it's related to candid, which also comes from candeō.",
    lineage: ["Latin","Old English","Middle English","English"],
    clues: ["Its root originally described something glowing white or shining bright, long before it meant an object at all.","The word for this waxy light-source came into English by way of Latin, through Old and Middle English forms almost identical to today's.","It shares a Latin ancestor with 'candid' and is a doublet of both 'candela' and 'chandelle'."],
  },
  {
    slug: "carpet",
    word: "carpet",
    respelling: "KAHR-pit",
    partOfSpeech: "noun",
    teaser: "The floor covering under your feet once traveled a long trade route from an Armenian kingdom to Florence before it ever reached English.",
    origin: "English carpet comes from late Middle English carpette, from Old French carpite, from Medieval Latin carpita (or Italian carpita), which Florentines introduced in the 13th century from Middle Armenian կարպետ (karpet, \"carpet, rug\"), itself from earlier Armenian կապերտ (kapert).",
    journey: "The word passed from Armenian into Medieval Latin and Italian, then into Old French, and finally into Middle English as carpette before settling into its modern English spelling and meaning.",
    related: "The facts given don't point to any other English cognate — carpet's trail runs straight back through French, Latin, and Italian to its Armenian root, with no branching relative named along the way.",
    lineage: ["Old Armenian","Middle Armenian","Medieval Latin","Old French","Middle English","English"],
    clues: ["Its name was carried west by 13th-century Florentine merchants trading with an Armenian kingdom.","Before it wore an English coat, it wore an Italian and French one — carpita and carpite.","Trace it back far enough and you land on Armenian կապերտ (kapert), the word's oldest known form."],
  },
  {
    slug: "chandelier",
    word: "chandelier",
    respelling: "shan-duh-LEER",
    partOfSpeech: "noun",
    teaser: "This glittering fixture traces back to a single small flame.",
    origin: "Chandelier was borrowed from French chandelier, which comes from Latin candelabrum, itself from candela, meaning \"a candle.\"",
    journey: "The facts don't describe a shift in meaning — the word seems to have carried the idea of a candle-holder from Latin through French into English.",
    related: "Chandelier is a doublet of candelabrum, meaning both words descend from the same Latin root, candela — the same root that gives English candle.",
    lineage: ["Latin","French","English"],
    clues: ["Its name hides a single small flame that once lit every branch of it.","The word for this fixture came into English by way of French, tracing back to Latin for a burning wax stick.","It shares a Latin root with candelabrum — and with candle itself."],
  },
  {
    slug: "closet",
    word: "closet",
    respelling: "KLOZ-it",
    partOfSpeech: "noun",
    teaser: "This word for your storage nook once meant a little patch of walled-off garden.",
    origin: "From Middle English closet, borrowed from Old French closet, itself built from clos (\"private space\") plus the diminutive suffix -et, going back to Latin clausum. It's essentially close + -et.",
    journey: "In French, this word was used only for small open-air enclosures — a fenced-off bit of outdoor space, not a room. English took the word and moved it indoors, applying it to small private rooms and, eventually, the enclosed storage spaces we call closets today.",
    related: "It shares its root with the English word close, both tracing back to Latin clausum, meaning shut or enclosed.",
    lineage: ["Latin","Old French","Middle English","English"],
    clues: ["Long before it held your coats, this word named a fenced-in patch of open ground, not a room at all.","Its French ancestor meant a small, private, walled-off space — but out under the sky, not inside a house.","It's built the same way as the word close plus a diminutive ending — literally, a 'little shut-off place.'"],
  },
  {
    slug: "coffin",
    word: "coffin",
    respelling: "KAW-fin",
    partOfSpeech: "noun",
    teaser: "The box that holds the dead started out holding loaves of bread.",
    origin: "Coffin comes from Middle English coffyn, borrowed from Old Northern French cofin (\"sarcophagus,\" earlier \"basket, coffer\"), which traces to Latin cophinus (\"basket\"), itself a loan from Ancient Greek κόφινος (kóphinos, \"a basket\").",
    journey: "The word began as a simple term for a woven basket, then broadened in French to mean any coffer or box, and finally narrowed to its grim modern sense of a burial case — replacing the native Old English word þrūh along the way.",
    related: "Coffin is a doublet of coffer, the two words having split off from the same Latin root cophinus to describe different kinds of containers.",
    lineage: ["Ancient Greek","Latin","Old Northern French","Middle English","English"],
    clues: ["Long before it held the dead, this container held something you might carry home from a market stall.","Its root word simply means \"basket\" — a humble start for something so solemn.","It shares a Latin ancestor with the word \"coffer,\" both once meaning nothing more than a box for keeping things safe."],
  },
  {
    slug: "cork",
    word: "cork",
    respelling: "KORK",
    partOfSpeech: "noun",
    teaser: "The stopper in your wine bottle traveled through Dutch and Spanish before it ever touched English.",
    origin: "English cork comes from Middle English cork (\"oak bark, cork\"), borrowed from Middle Dutch curc, which itself came either from Spanish corcho or Old Spanish alcorque (\"cork sole\"). Further back, corcho traces to Latin cortex, meaning bark or rind — making cork a doublet of cortex.",
    journey: "The word began by naming oak bark itself, then narrowed to the material and objects made from it, like stoppers and soles, as it passed from Spanish into Dutch and finally into English.",
    related: "Cork is a doublet of cortex, both descending from the same Latin word for bark or rind — one term stayed close to its Latin roots in science, the other wandered through Dutch and Spanish shoemaking before settling into everyday English.",
    lineage: ["Latin","Spanish","Middle Dutch","Middle English","English"],
    clues: ["It started as a word for the rough outer layer of a tree, long before it meant anything you'd pull from a bottle.","Its ancestor once meant a shoe sole made from bark, on its journey through Spanish and Dutch.","It shares a Latin root with 'cortex' — both once simply meant bark or rind."],
  },
  {
    slug: "cot",
    word: "cot",
    respelling: "KAHT",
    partOfSpeech: "noun",
    teaser: "The small bed you'd fold up and carry with you once traveled all the way from a word for a wooden bedstead.",
    origin: "English \"cot\" meaning a light bed was borrowed from Hindi खाट (khāṭ), which goes back to Sanskrit खट्वा (khaṭvā), meaning bedstead. A separate \"cot\" meaning a small dwelling comes instead from Old English cot and cote, rooted in Proto-Germanic *kutą.",
    journey: "The bedstead sense traveled from Sanskrit through Hindi into English essentially unchanged in meaning, still describing a simple frame for sleeping. The cottage sense, from Old English, developed along its own separate path referring to small shelters rather than beds.",
    related: "The cottage-sense \"cot\" is a doublet of \"cote\" (as in dovecote) and is more distantly related to \"cottage.\"",
    lineage: ["Sanskrit","Hindi","English"],
    clues: ["It began as a word for a simple wooden frame you'd sleep on, carried into English from a language of South Asia.","Its ancestor is the Sanskrit word khaṭvā, meaning bedstead.","It arrived in English by way of Hindi khāṭ, naming a portable bed."],
  },
  {
    slug: "cupboard",
    word: "cupboard",
    respelling: "KUHB-erd",
    partOfSpeech: "noun",
    teaser: "A storage spot named for what it once literally held on a shelf.",
    origin: "Cupboard comes from Middle English cuppeborde or cupbord, formed from cup and board — literally a board for holding cups.",
    journey: "By the 16th century the middle /p/ sound had softened into a /b/, giving the pronunciation we use today, even though the older 'cup' spelling stuck around and became standard again from the 18th century onward.",
    related: "It's built directly from two words still very much in use on their own — cup and board — making it a small fossil of everyday furniture-naming.",
    lineage: ["Middle English","English"],
    clues: ["Once, its two halves named a drinking vessel and a flat plank, joined into one household word.","Literally a plank meant to hold cups, before it grew doors and became something to shut.","Say 'cup' and 'board' quickly enough, and centuries of sound-shift do the rest."],
  },
  {
    slug: "cushion",
    word: "cushion",
    respelling: "KOO-shuhn",
    partOfSpeech: "noun",
    teaser: "The soft thing you sit on takes its name, quite literally, from your hip.",
    origin: "Cushion comes from Middle English quysshyn, borrowed from Old French coissin, which traces back to Vulgar Latin *coxīnus, meaning 'seat pad.' That word was built on Latin coxa, 'hip, thigh,' and may have taken its ending from pulvīnus, 'pillow.'",
    journey: "The word began as a term rooted in the body part it supported — the hip — and settled into English as the padded object itself, with its bodily origin fading from view.",
    related: "Its root, Latin coxa ('hip, thigh'), traces back to the Proto-Indo-European *koḱs-, meaning 'joint, limb,' linking cushion to an ancient family of words about the body's moving parts.",
    lineage: ["Latin","Old French","Middle English","English"],
    clues: ["Its earliest name may honor the part of your body it was built to support.","Before it meant a soft pad, its Latin ancestor named the hip or thigh.","It shares a root with coxa, the Latin word still used for the hip joint."],
  },
];

/** Anchor date for the deterministic daily rotation (UTC midnight). */
const START_DATE = Date.UTC(2026, 0, 1); // 2026-01-01
const DAY_MS = 24 * 60 * 60 * 1000;

export function daysSinceStart(date: Date): number {
  const utcMidnight = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
  return Math.floor((utcMidnight - START_DATE) / DAY_MS);
}

/** Deterministic word-of-the-day: same date always maps to the same word,
 *  for every visitor and in every emailed digest, with no server-side
 *  scheduling beyond the hourly send job. */
export function getWordForDate(date: Date): WordEntry {
  const index =
    ((daysSinceStart(date) % WORDS.length) + WORDS.length) % WORDS.length;
  return WORDS[index];
}

export function getTodayWord(): WordEntry {
  return getWordForDate(new Date());
}

export function getWordBySlug(slug: string): WordEntry | undefined {
  return WORDS.find((w) => w.slug === slug);
}

export type HistoryDay = { date: string; word: WordEntry };

/** Every day from START_DATE through today, most recent first. */
export function getHistory(today: Date = new Date()): HistoryDay[] {
  const days: HistoryDay[] = [];
  const totalDays = daysSinceStart(today);
  for (let i = totalDays; i >= 0; i--) {
    const d = new Date(START_DATE + i * DAY_MS);
    days.push({
      date: d.toISOString().slice(0, 10),
      word: getWordForDate(d),
    });
  }
  return days;
}

/** Every word that's appeared so far, once each, tagged with the date it was
 * most recently featured — most-recently-seen first. Once the calendar
 * rotation has run for more days than WORDS.length, getHistory() starts
 * repeating (the same handful of words over and over), which is a
 * meaningless way to "browse the vocabulary": it's the same ~10 rows
 * copy-pasted dozens of times. This collapses that down to one row per word,
 * which is what "browse everything" actually means with a rotation this
 * short. */
export function getUniqueWordsMostRecent(today: Date = new Date()): HistoryDay[] {
  const seen = new Set<string>();
  const unique: HistoryDay[] = [];
  for (const day of getHistory(today)) {
    if (seen.has(day.word.slug)) continue;
    seen.add(day.word.slug);
    unique.push(day);
    if (unique.length === WORDS.length) break;
  }
  return unique;
}

/** Simple deterministic string hash (djb2 variant) → 32-bit unsigned int.
 * Doesn't need to be cryptographically strong, just a stable per-user seed
 * so the same account always gets the same shuffle back. */
export function hashSeed(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return hash >>> 0;
}

/** Mulberry32 — a small, fast, deterministic PRNG for a given seed. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic per-account shuffle of WORDS (Fisher-Yates driven by a
 * seeded PRNG) — every account gets its own fixed order, and the same
 * account always gets the same order back.
 *
 * The word for `anchorDate` (a new account's join date) is pinned to slot 0
 * rather than falling wherever the shuffle happens to put it: without this,
 * someone who saw a word on Today, then signed in, would immediately see a
 * *different* word from their newly-started personal rotation — a jarring
 * swap for no visible reason. Pinning it means their first personalized day
 * carries on from what they already saw; every day after that is the normal
 * per-account shuffle. */
export function getPersonalOrder(userId: string, anchorDate: Date): WordEntry[] {
  const anchorWord = getWordForDate(anchorDate);
  const rand = mulberry32(hashSeed(userId));
  const rest = WORDS.filter((w) => w.slug !== anchorWord.slug);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [anchorWord, ...rest];
}

/** Resolves which word a single daily-digest recipient should get: the
 * shared calendar word for anonymous subscribers (or accounts with no
 * recorded join date), otherwise that account's own personalized rotation —
 * matching what they'd already see on the signed-in Today page, instead of
 * a second word that only ever shows up in their inbox. Takes the account
 * lookup already resolved rather than performing it itself, so this stays a
 * pure, easily-tested function; see app/api/cron/send-daily/route.ts for the
 * Redis lookups that feed it. */
export function getDigestWordForSubscriber(
  userId: string | null,
  joinedAtStr: string | null,
  now: Date,
  sharedWord: WordEntry
): WordEntry {
  if (!userId || !joinedAtStr) return sharedWord;
  return getWordForUser(userId, new Date(joinedAtStr + "T00:00:00Z"), now);
}

function daysBetweenUtcMidnights(start: Date, end: Date): number {
  const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.floor((endUtc - startUtc) / DAY_MS);
}

/** Personalized word-of-the-day for a signed-in account: same rotation
 * length as the shared list, shuffled per account, anchored to their join
 * date instead of the global calendar anchor used by getWordForDate. */
export function getWordForUser(userId: string, joinedAt: Date, today: Date = new Date()): WordEntry {
  const order = getPersonalOrder(userId, joinedAt);
  const dayIndex = daysBetweenUtcMidnights(joinedAt, today);
  const idx = ((dayIndex % order.length) + order.length) % order.length;
  return order[idx];
}

/** Every day from a user's join date through today, most recent first,
 * using their personal word order instead of the shared calendar mapping. */
export function getHistoryForUser(
  userId: string,
  joinedAt: Date,
  today: Date = new Date()
): HistoryDay[] {
  const order = getPersonalOrder(userId, joinedAt);
  const totalDays = daysBetweenUtcMidnights(joinedAt, today);
  const joinedUtcMidnight = Date.UTC(
    joinedAt.getUTCFullYear(),
    joinedAt.getUTCMonth(),
    joinedAt.getUTCDate()
  );
  const days: HistoryDay[] = [];
  for (let i = totalDays; i >= 0; i--) {
    const d = new Date(joinedUtcMidnight + i * DAY_MS);
    const idx = ((i % order.length) + order.length) % order.length;
    days.push({ date: d.toISOString().slice(0, 10), word: order[idx] });
  }
  return days;
}
