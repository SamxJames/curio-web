# Curio — priority word candidates

**1317 words**, grouped by category. The flat one-word-per-line version
(`curio-word-candidates.txt`) is what the pipeline actually consumes; this
file is for reading and for pruning by hand before a run.

The 8 words already in `lib/words.ts` are excluded.

Expect attrition — words with thin or missing `etymology_text` in the
Wiktextract dump drop out at the extract step. This list is sized so that
~1,000 survive to approval. If it undershoots, draw from the 3209-word
reserve (`curio-reserve-words.txt`) rather than inventing candidates.

Categories are weighted by expected etymology richness, not by size:
eponyms and loanwords carry the highest hit rate (a named person or a
borrowing *is* the story), while abstract Latinate verbs and generic
adjectives are deliberately capped low — many reduce to a formulaic
"from Latin X, from Y" with no narrative worth reading.

## Everyday objects & household (80)

alarm, apron, bandage, barrel, bedlam, bench, blanket, blueprint
bottle, cabinet, candle, carpet, chandelier, cistern, closet, coffin
cork, cot, cupboard, cushion, desk, dish, doily, drawer
fan, fender, fork, funnel, furnace, furniture, gadget, grate
hammer, hamper, hourglass, jar, kettle, knife, lamp, latch
lever, lock, lumber, mattress, mirror, mortar, mug, nail
napkin, pail, pantry, parcel, pedestal, pencil, pewter, pitcher
pocket, porcelain, pouch, quilt, rake, rug, saucer, shelf
shovel, sieve, spade, spatula, spoon, string, table, thimble
tinder, tool, towel, trunk, umbrella, upholstery, vase, wardrobe

## Food & drink (109)

ale, almond, aperitif, apple, artichoke, asparagus, baguette, batter
beer, beetroot, bourbon, bread, brunch, buffet, butter, cafeteria
candy, caper, caraway, casserole, celery, cheddar, cherry, chestnut
cider, citrus, coffee, coleslaw, corn, cranberry, croissant, crouton
curry, custard, dinner, dough, doughnut, eggplant, escargot, espresso
fig, flour, frankfurter, ginger, gingham, gnocchi, guacamole, ham
ketchup, lager, lard, lasagna, lemonade, liquor, macaroni, margarine
marzipan, meal, mince, molasses, muffin, mushroom, mussel, mutton
nectar, oatmeal, olive, omelette, onion, parsley, parsnip, pasta
peach, pecan, pepper, picnic, pineapple, plum, potato, prune
pudding, pumpkin, quiche, raisin, rhubarb, rice, saffron, sage
sardine, scone, seasoning, semolina, sourdough, spaghetti, squash, steak
strawberry, tangerine, tapioca, tofu, tomato, treacle, turmeric, vermicelli
vodka, walnut, wheat, whisky, wine

## Body, health & medicine (70)

abscess, amnesia, anemia, anesthesia, aneurysm, antibiotic, anxiety, aorta
arsenic, aspirin, bladder, bone, brain, capillary, cartilage, cataract
cheek, cranium, dementia, dose, eczema, enamel, epidemic, epilepsy
eyebrow, gallbladder, gangrene, germ, gum, heel, hip, immune
insulin, jaundice, liver, lobe, melancholy, migraine, mouth, nose
obesity, opium, organ, pain, paralysis, plague, pollen, pore
pulse, rash, rheumatism, rib, scab, scar, scurvy, shin
sinew, sinus, spine, stethoscope, suture, symptom, syringe, tendon
therapy, tonsil, ulcer, vaccine, vertebra, womb

## Animals (85)

alligator, ape, baboon, badger, bear, bee, beetle, bird
bobcat, bug, bumblebee, buzzard, camel, caribou, cat, catfish
chicken, chipmunk, clam, cockroach, cod, colt, crab, deer
dog, dragon, eagle, finch, fox, goat, goose, guppy
halibut, hare, hedgehog, heron, hornet, horse, hound, jackal
jellyfish, ladybird, lamprey, lemur, leopard, llama, louse, magpie
marten, mastiff, mockingbird, moose, moth, muskrat, nightingale, ocelot
octopus, owl, ox, panda, partridge, peacock, pelican, penguin
pheasant, poodle, porcupine, quail, rattlesnake, rhinoceros, robin, salamander
scorpion, seagull, sloth, sow, starling, stingray, swallow, swan
swine, tarantula, thrush, toad, tusk

## Plants & nature (70)

acre, alder, algae, bark, bulb, climate, cloud, cove
dahlia, daisy, desert, dusk, earth, earthquake, equinox, erosion
fertilizer, fog, fungus, glade, hawthorn, heath, herb, horizon
iceberg, jungle, kelp, lagoon, landscape, larch, leaf, lightning
lilac, marigold, marsh, mist, moor, mould, mud, mulberry
oat, oleander, orchard, pine, rainbow, redwood, reed, reef
sand, sandstone, sap, seed, sequoia, shrub, silt, snow
soil, spring, summer, thicket, thistle, thorn, thunder, tulip
tundra, twig, typhoon, valley, vine, violet

## Clothing & appearance (55)

armor, attire, bandana, cape, cardigan, clog, coat, corduroy
corset, cosmetic, costume, crinoline, diadem, earring, fabric, garter
girdle, glove, hat, helmet, hem, hood, jacket, jeans
jumper, kilt, loafer, mask, mitten, muff, negligee, pantaloon
parka, patch, poncho, raincoat, rouge, sash, satchel, satin
scarf, shirt, silk, slacks, sneaker, sock, stocking, suede
sweater, taffeta, tartan, tattoo, tie, tweed, wool

## Money, trade & work (59)

agent, bid, bill, boycott, broker, bullion, cartel, cash
client, collateral, commerce, company, cost, creditor, currency, discount
economy, embargo, enterprise, entrepreneur, equity, excise, export, fee
freelance, freight, gild, import, income, inventory, invest, luxury
manager, manufacture, market, mercantile, mill, mint, nickel, notary
payroll, pension, piracy, price, quota, rate, rent, retail
revenue, salvage, scrivener, shareholder, smuggle, subsidy, surplus, traffic
venture, wage, warehouse

## War, weapons & military (55)

ambush, ammunition, arena, armada, armistice, armory, arsenal, artillery
assault, belligerent, besiege, blockade, bombard, buccaneer, bunker, campaign
casualty, catapult, citadel, civilian, colonel, conquer, dagger, dungeon
flotilla, fortress, garrison, gladiator, gun, halberd, javelin, lance
legion, marine, martial, missile, munition, mutiny, pillage, platoon
rebel, reinforce, reprisal, rifleman, saber, sabotage, salvo, sentry
shield, shrapnel, skirmish, surrender, torpedo, tournament, weapon

## Law, politics & governance (50)

aristocracy, arraign, autocracy, bureaucracy, canon, census, civic, congress
constitution, county, court, crime, curfew, delegate, democracy, dictator
edict, elect, espionage, evidence, extradite, felony, feudal, heresy
impeach, injunction, jail, jury, justice, legislature, magistrate, monarch
partisan, passport, police, precinct, prefect, prison, probate, regent
republic, sentence, shire, statute, summons, testify, tithe, tyrant
warrant, witness

## Science, technology & measurement (70)

acid, alloy, ampere, arc, argon, astronomy, atom, calculate
carbon, caustic, chemistry, cogwheel, coil, concrete, copper, crankshaft
cursor, data, electron, energy, engine, equation, filament, fraction
friction, fulcrum, glucose, gram, graphite, gyroscope, hypothesis, inch
iron, kiln, laser, lathe, lens, lithium, matrix, meridian
millimeter, nitrogen, ohm, petroleum, plastic, platinum, pliers, potassium
propeller, pulley, quantum, radar, radio, radius, resistor, satellite
solar, spectrum, sprocket, steel, telephone, turbine, valve, vertex
volume, watt, wavelength, wedge, wire, xenon

## Music, art & performance (50)

adagio, alto, anthem, ballad, band, cadence, carol, chime
coda, crescendo, drama, drum, encore, flute, harmony, harp
hymn, jig, keyboard, lute, minuet, museum, musical, mute
oboe, octave, operetta, painting, palette, pitch, playwright, poetry
prop, quartet, quintet, rehearse, rhythm, saxophone, scale, soprano
stanza, tambourine, tempo, theater, timbre, treble, tuba, vocal
waltz, zither

## Mind, emotion & character (55)

admire, altruism, ambition, apathy, attitude, bias, bravery, charisma
charm, clemency, courage, curiosity, decorum, delight, dignity, disdain
envy, fervor, fortitude, fury, gentle, greed, grief, happiness
hope, humor, instinct, intuition, kindness, laughter, longing, love
loyalty, mirth, morale, outrage, panic, peace, pity, pride
rage, reproach, resolve, reverence, sadness, sanguine, sincere, sorrow
suspicion, temperance, tolerance, tranquil, vengeance, wisdom, wonder

## Time, calendar & astronomy (35)

December, January, Jupiter, May, October, Pluto, Thursday, Wednesday
annual, calendar, century, chronicle, dial, epoch, fortnight, future
generation, instant, interval, journal, leap, menstrual, minute, month
morning, nadir, past, period, quarter, schedule, season, stellar
temporal, tomorrow, zodiac

## Travel, transport & places (55)

aerodrome, balcony, boulevard, bridge, bungalow, canal, canoe, carousel
cathedral, causeway, chateau, city, coach, cobblestone, corridor, cottage
culvert, dome, escalator, estuary, expedition, ferry, gangway, gondola
granary, hut, kayak, keel, landmark, lift, lodge, mansion
mast, mosque, nave, pilgrim, port, portico, pyramid, rampart
route, rudder, sail, sidewalk, skyscraper, spire, station, street
temple, tenement, terrace, tourist, veranda, yard, zeppelin

## Sport, games & leisure (40)

athlete, bingo, bishop, champion, chess, compete, dart, derby
dice, diving, dominoes, dribble, gambit, jockey, joust, karate
lacrosse, league, marathon, marbles, mascot, opponent, paddle, pentathlon
puzzle, quoits, racket, referee, regatta, rodeo, scrimmage, scuba
slalom, sledge, snooker, sprint, tobogganing, trapeze, volley, wrestle

## Religion, myth & the supernatural (60)

acolyte, apocalypse, augur, catholic, cherub, church, crypt, curse
demon, devil, disciple, eden, elf, evangelist, fate, gargoyle
ghoul, harpy, idol, incense, jinx, karma, kraken, leprechaun
limbo, martyr, mermaid, miracle, mummy, necromancy, nemesis, nymph
occult, ordain, phantom, pharaoh, phoenix, prayer, preach, psalm
rabbi, reliquary, sacrament, saint, sanctuary, scripture, sin, siren
spirit, sprite, synagogue, taboo, totem, trance, trident, vicar
witch, worship, wraith, zealot

## Language, learning & communication (50)

analogy, anecdote, biography, catalogue, chapter, colon, comma, compendium
conjunction, consonant, conversation, dedication, definition, diploma, discipline, doctrine
document, encyclopedia, euphemism, exercise, glossary, graduate, ink, lexicon
linguistics, monograph, monologue, orthography, phrase, preposition, primer, print
quotation, riddle, rubric, satire, scribe, script, seminar, spell
student, syllable, symbol, syntax, teach, text, textbook, thesaurus
thesis, translate

## Movement, action & abstract verbs (45)

appease, applaud, assume, burgeon, cascade, confer, contend, decay
deceive, demolish, designate, disclose, earn, elicit, elude, embellish
endure, exhaust, gesture, hover, incline, infer, inspect, intercept
legislate, manifest, mitigate, motivate, nurture, obstruct, overcome, overlook
overwhelm, plunder, preside, proceed, radiate, recover, relax, replace
respond, reverse, thwart, triumph, urge

## Eponyms, toponyms & brand-origin words (79)

alcatraz, babel, bakelite, begonia, bicycle, bloomers, bobby, braille
bunsen, celsius, chauvinist, chesterfield, china, cologne, crapper, czar
decibel, doberman, draconian, dunce, ferris, frisbee, fuchsia, gardenia
gauze, guy, hooligan, jacuzzi, jumbo, laconic, leotard, lesbian
limousine, luddite, lynch, macadam, machiavellian, macintosh, magenta, maudlin
maverick, mentor, mercerize, mesmerize, morse, muslin, narcissism, nicotine
odyssey, ottoman, pants, pasteurize, philippic, pilates, platonic, poinsettia
praline, quisling, quixotic, sadism, sardonic, sideburns, silhouette, sousaphone
spartan, spoonerism, stentorian, stetson, tantalize, tarmac, tawdry, teddy
thespian, titanic, turquoise, utopia, valentine, vandal, wellington

## Loanwords & culturally borrowed terms (100)

abattoir, almanac, ambience, amok, atoll, avatar, azure, banshee
bedouin, blitz, bolero, bonanza, bravado, cabaret, cadre, cafe
caftan, caliph, camaraderie, casino, catamaran, cinema, connoisseur, coolie
coup, critique, debris, debut, delicatessen, dengue, dinghy, diva
elite, emir, ennui, facade, fatwa, fiasco, fiesta, finesse
futon, ghetto, glitch, gnu, graffiti, grotto, gung, guru
gymkhana, harem, kamikaze, kaput, khaki, kudos, lasso, lava
maharaja, memento, menagerie, milieu, monsoon, moped, mulatto, musk
nirvana, okra, origami, paella, paparazzi, papaya, pariah, pasha
pastiche, plethora, potpourri, pundit, repertoire, ricochet, rococo, saga
sago, sampan, sauna, savvy, schnapps, sepoy, sheikh, skipper
sleigh, spa, stucco, tabby, tamale, tandem, tequila, trousseau
vigilante, virtuoso, vista, wok

## Qualities, adjectives & descriptors (45)

adroit, ample, arid, audacious, benign, brief, capacious, drab
drowsy, eager, enigmatic, famous, ferocious, fervent, frigid, genteel
glib, hollow, inclement, innate, lenient, lugubrious, meek, nocturnal
notorious, paltry, prolific, quaint, rabid, repugnant, resolute, rotund
sinister, sluggish, somber, sparse, spontaneous, stark, tacit, vapid
vehement, vulgar, wily, winsome, zealous

