// written by scripts/languages/approveSheets.ts — edit drafts, not this file.
// Facts from Wikipedia and Wikidata (CC BY-SA), drafted by Claude, reviewed and approved by the owner.
import type { LanguageSheet } from "./types";

export const LANGUAGE_SHEETS: LanguageSheet[] = [
  {
    "name": "Ancient Greek",
    "aliases": [],
    "status": "historical",
    "classification": "Hellenic branch; an earlier stage of the Greek language",
    "region": "Ancient Greece and the wider ancient Mediterranean world",
    "map": {
      "lat": 38,
      "lon": 23.7,
      "radiusKm": 600
    },
    "era": {
      "from": -1500,
      "to": -300,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": null,
    "unknownSpeakersNote": "No census of its speakers exists.",
    "parent": null,
    "origin": "Ancient Greek belongs to the Hellenic group and was used in ancient Greece and the ancient world from around 1500 BC to 300 BC. It is often divided into Mycenaean Greek, the Dark Ages, the Archaic or Homeric period, and the Classical period. Its dialects included Attic, Ionic, Doric, Aeolic, and Arcadocypriot, and Attic became the basis of Koine Greek, which followed it.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Ancient_Greek",
    "approved": true
  },
  {
    "name": "Anglo-Norman",
    "aliases": [],
    "status": "extinct",
    "classification": "A dialect of Old Norman",
    "region": "England, and to a lesser extent elsewhere in Great Britain and Ireland",
    "map": {
      "lat": 52.5,
      "lon": -1.5,
      "radiusKm": 500
    },
    "era": null,
    "peakSpeakers": null,
    "unknownSpeakersNote": "No census of its speakers exists.",
    "parent": null,
    "origin": "Anglo-Norman was a dialect of Old Norman, carried to England and used there during the Anglo-Norman period. It was also used, to a lesser extent, in other parts of Great Britain and Ireland. Its names include Anglo-Norman French and Insular French, and it is counted as part of the French of England.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Anglo-Norman_language",
    "approved": true
  },
  {
    "name": "Arabic",
    "aliases": [],
    "status": "living",
    "classification": "Central Semitic language of the Afroasiatic family",
    "region": "Arabian Peninsula → the Arab world, and beyond as the liturgical language of Islam",
    "map": {
      "lat": 24,
      "lon": 45,
      "radiusKm": 1200
    },
    "era": null,
    "peakSpeakers": {
      "count": 422000000,
      "year": 2012,
      "note": "Speakers, Wikidata figure for 2012"
    },
    "unknownSpeakersNote": null,
    "parent": "Semitic",
    "origin": "Arabic belongs to the Central Semitic branch of the Afroasiatic family, and Wikidata places it as indigenous to the Arabian Peninsula. Its standard written form, Modern Standard Arabic, is derived from Classical Arabic. Speakers generally call both al-fuṣḥā, \"the eloquent Arabic\", and the language is a conservative one that kept the full set of Proto-Semitic grammatical cases.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Arabic",
    "approved": true
  },
  {
    "name": "Aramaic",
    "aliases": [],
    "status": "living",
    "classification": "Northwest group of the Semitic language family, alongside the Canaanite languages such as Hebrew and Phoenician",
    "region": "Ancient Syria → Mesopotamia, the southern Levant, Sinai, southeastern Anatolia, the Caucasus and Eastern Arabia",
    "map": {
      "lat": 35,
      "lon": 40,
      "radiusKm": 1000
    },
    "era": {
      "from": -1100,
      "to": null,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": null,
    "unknownSpeakersNote": "Wikidata records 445,000 speakers but gives no date for that figure.",
    "parent": null,
    "origin": "Aramaic began in the ancient region of Syria and spread quickly across much of West Asia. Its earliest inscriptions date from the 11th century BC, which places it among the earliest languages to be written down. The scholar Holger Gzella notes that its history before the first texts of the 9th century BC is unknown.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Aramaic",
    "approved": true
  },
  {
    "name": "Biblical Hebrew",
    "aliases": [],
    "status": "historical",
    "classification": "Canaanitic branch of the Semitic languages; an archaic form of Hebrew",
    "region": "The Land of Israel, roughly west of the Jordan River and east of the Mediterranean Sea",
    "map": {
      "lat": 31.78,
      "lon": 35.17,
      "radiusKm": 100
    },
    "era": {
      "from": -1000,
      "to": 70,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": null,
    "unknownSpeakersNote": "No census of its speakers exists.",
    "parent": null,
    "origin": "Biblical Hebrew was spoken by the Israelites in the Land of Israel. Its early form, Paleo-Hebrew, is attested in inscriptions from about the 10th century BCE, when it was almost identical to Phoenician and other Canaanite languages. The Hebrew Bible itself called the language 'language of Canaan' or 'Judean', not 'Hebrew'.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Biblical_Hebrew",
    "approved": true
  },
  {
    "name": "Byzantine Greek",
    "aliases": [],
    "status": "historical",
    "classification": "Medieval stage of the Greek language",
    "region": "Constantinople and the Byzantine Empire, across Anatolia and the Eastern Mediterranean",
    "map": {
      "lat": 41,
      "lon": 28.98,
      "radiusKm": 1000
    },
    "era": {
      "from": 500,
      "to": 1453,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": null,
    "unknownSpeakersNote": "No census of its speakers exists.",
    "parent": "Koine Greek",
    "origin": "Byzantine Greek is the link between Koine Greek, the older vernacular, and Modern Greek. Alexander the Great's conquests and the Hellenistic period had spread Greek across Anatolia and the Eastern Mediterranean, and from the 7th century it was the only language of administration and government in the Byzantine Empire. Its literature drew on Attic Greek and on vernacular Koine, the language of the New Testament.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Medieval_Greek",
    "approved": true
  },
  {
    "name": "Chinese",
    "aliases": [],
    "status": "living",
    "classification": "Largest branch of the Sino-Tibetan language family",
    "region": "Greater China → overseas Chinese communities, with Dungan and Taz speakers in Central Asia and the Russian Far East",
    "map": {
      "lat": 32,
      "lon": 108,
      "radiusKm": 1500
    },
    "era": {
      "from": -1250,
      "to": null,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": null,
    "unknownSpeakersNote": "Wikidata gives 1,299,877,520 speakers but no date for that figure. Wikipedia gives about 1.39 billion first-language speakers.",
    "parent": null,
    "origin": "Chinese is the largest branch of the Sino-Tibetan languages. Its earliest attested writing is the oracle bone inscriptions of the Shang dynasty, around 1250 BCE. The sounds of Old Chinese can be reconstructed from the rhymes of ancient poetry, and during the Northern and Southern dynasties Middle Chinese split into several varieties after long geographic and political separation.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Chinese_language",
    "approved": true
  },
  {
    "name": "Dutch",
    "aliases": [],
    "status": "living",
    "classification": "Low Franconian, West Germanic branch of the Indo-European family",
    "region": "The Netherlands and Flanders → Suriname, the Dutch Caribbean, and once the Dutch East Indies and South Africa",
    "map": {
      "lat": 52.0001,
      "lon": 5.0001,
      "radiusKm": 250
    },
    "era": null,
    "peakSpeakers": {
      "count": 23100000,
      "year": 2019,
      "note": "Native speakers, Wikidata figure for 2019"
    },
    "unknownSpeakersNote": null,
    "parent": null,
    "origin": "Dutch is a West Germanic language of the Indo-European family, descended from the Low Franconian group. It is often described as roughly in between German and English, and it shares features with both. Its vocabulary is mostly Germanic, with slightly more Romance loans than German but far fewer than English.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Dutch_language",
    "approved": true
  },
  {
    "name": "Egyptian",
    "aliases": [],
    "status": "extinct",
    "classification": "An extinct branch of the Afro-Asiatic language family",
    "region": "Egypt",
    "map": {
      "lat": 26.8,
      "lon": 30.8,
      "radiusKm": 600
    },
    "era": {
      "from": -4000,
      "to": 1700,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": null,
    "unknownSpeakersNote": "No census of its speakers exists.",
    "parent": null,
    "origin": "Egyptian is an extinct branch of the Afro-Asiatic language family, spoken in Egypt. It was first written in hieroglyphs in the late 4th millennium BC and is the longest-attested human language, with a written record of over 5,000 years. Its own name for itself, r n kmt, means 'speech of Egypt'.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Egyptian_language",
    "approved": true
  },
  {
    "name": "Etruscan",
    "aliases": [],
    "status": "extinct",
    "classification": "Tyrsenian (Tyrrhenian) family, related to Raetic and Lemnian; a Pre-Indo-European language",
    "region": "Etruria, central Italy, including Etruria Padana and Etruria Campana",
    "map": {
      "lat": 43,
      "lon": 11.5,
      "radiusKm": 250
    },
    "era": {
      "from": -700,
      "to": 50,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": null,
    "unknownSpeakersNote": "No census of its speakers exists.",
    "parent": null,
    "origin": "Etruscan was the language of the Etruscan civilization in Etruria, in what is now Italy. Most linguists place it in the Tyrrhenian family, closely related to Raetic in the Alps and to Lemnian on Lemnos, and not in the Indo-European family. Its alphabet came from the Greek alphabet, specifically the Euboean script brought to southern Italy by Greek colonists.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Etruscan_language",
    "approved": true
  },
  {
    "name": "Frankish",
    "aliases": [],
    "status": "extinct",
    "classification": "West Germanic language; Wikidata places it within Low Franconian and Weser-Rhine Germanic",
    "region": "Lands of the Franks, including Belgium and the Netherlands, and Roman Gaul (Picardy and Île-de-France)",
    "map": {
      "lat": 50.5,
      "lon": 4.5,
      "radiusKm": 350
    },
    "era": {
      "from": 300,
      "to": 800,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": null,
    "unknownSpeakersNote": "No census of its speakers exists.",
    "parent": null,
    "origin": "Frankish was the West Germanic language of the Franks, spoken between the 4th and 8th centuries. It is poorly attested and mostly reconstructed from Frankish loanwords in Old French and from Old Dutch. The Bergakker inscription may be a primary record of 5th-century Frankish. Between the 5th and 9th centuries, the Frankish of the Salian Franks in Belgium and the Netherlands evolved into Old Dutch.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Frankish_language",
    "approved": true
  },
  {
    "name": "French",
    "aliases": [],
    "status": "living",
    "classification": "Romance language of the Indo-European family, in the Gallo-Romance and Oïl groups",
    "region": "Northern France and southern Belgium → France, Belgium, Switzerland, and onward to the Americas, Africa and Asia",
    "map": {
      "lat": 48.85,
      "lon": 2.35,
      "radiusKm": 500
    },
    "era": null,
    "peakSpeakers": {
      "count": 208157220,
      "year": 2016,
      "note": "Speakers, Wikidata figure for 2016"
    },
    "unknownSpeakersNote": null,
    "parent": "Vulgar Latin",
    "origin": "French descended from the Vulgar Latin of the Roman Empire, as did its closest relatives, the langues d'oïl of northern France and southern Belgium. It was shaped by the native Celtic languages of Northern Roman Gaul and by the Germanic Frankish language of the post-Roman Frankish invaders.",
    "sourceUrl": "https://en.wikipedia.org/wiki/French_language",
    "approved": true
  },
  {
    "name": "Gaulish",
    "aliases": [],
    "status": "extinct",
    "classification": "Continental Celtic language, grouped with Lepontic, Galatian, Celtiberian and possibly Gallaecian",
    "region": "Gaul (modern France and neighboring areas roughly to the Rhine); in a wider sense, parts of central and southeastern Europe and Anatolia",
    "map": {
      "lat": 47,
      "lon": 2.5,
      "radiusKm": 600
    },
    "era": null,
    "peakSpeakers": null,
    "unknownSpeakersNote": "No census of its speakers exists.",
    "parent": "Proto-Celtic",
    "origin": "Gaulish belongs to the Continental Celtic languages, with Lepontic, Galatian, Celtiberian and possibly Gallaecian. How these languages relate to one another, and to the modern Insular Celtic languages, is uncertain because so little of them survives. It was first written in Greek script in southern France and in an Old Italic script in northern Italy, and in Latin script after the Roman conquest of Gaul.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Gaulish",
    "approved": true
  },
  {
    "name": "German",
    "aliases": [],
    "status": "living",
    "classification": "West Germanic branch of the Indo-European family",
    "region": "Western and Central Europe: Germany, Austria, Switzerland, Liechtenstein → official or national status in Luxembourg, Belgium, South Tyrol and Namibia",
    "map": {
      "lat": 50,
      "lon": 10,
      "radiusKm": 500
    },
    "era": null,
    "peakSpeakers": {
      "count": 105000000,
      "year": 2012,
      "note": "Speakers, Wikidata figure for 2012"
    },
    "unknownSpeakersNote": null,
    "parent": "Old High German",
    "origin": "Modern German developed gradually from Old High German, which in turn grew out of Proto-Germanic during the Early Middle Ages. Its closest relatives are other West Germanic languages such as Dutch, English, Afrikaans, the Frisian languages and Scots. Most of its vocabulary comes from the ancient Germanic branch of Indo-European, with a smaller share drawn partly from Latin and Greek.",
    "sourceUrl": "https://en.wikipedia.org/wiki/German_language",
    "approved": true
  },
  {
    "name": "Germanic",
    "aliases": [],
    "status": "living",
    "classification": "Branch of the Indo-European language family, with West, North and East Germanic subgroups",
    "region": "Iron Age Scandinavia and northern Germany → Europe, Northern America, Oceania and Southern Africa",
    "map": {
      "lat": 56,
      "lon": 10,
      "radiusKm": 600
    },
    "era": {
      "from": -500,
      "to": null,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": null,
    "unknownSpeakersNote": "No dated count exists. Wikipedia gives about 515 million native speakers across the branch.",
    "parent": "Proto-Germanic",
    "origin": "All Germanic languages descend from Proto-Germanic, spoken around the middle of the 1st millennium BC in Iron Age Scandinavia and northern Germany. In the 2nd century BC, Germanic tribes moved south to settle in what is now western Germany and along the Baltic coasts. Proto-Germanic is known for features such as the consonant change called Grimm's law.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Germanic_languages",
    "approved": true
  },
  {
    "name": "Greek",
    "aliases": [],
    "status": "living",
    "classification": "Independent Hellenic branch of the Indo-European language family",
    "region": "Greece and Cyprus, with historic communities across the Balkans, the Black Sea coast, the Caucasus and the Eastern Mediterranean",
    "map": {
      "lat": 38,
      "lon": 23.7,
      "radiusKm": 600
    },
    "era": {
      "from": -1400,
      "to": null,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": {
      "count": 13156880,
      "year": 2018,
      "note": "Speakers, Wikidata figure for 2018"
    },
    "unknownSpeakersNote": null,
    "parent": null,
    "origin": "Greek is an Indo-European language that forms its own independent Hellenic branch within that family. It has the longest documented history of any Indo-European language, with at least 3,400 years of written records. Before the Greek alphabet came into use about 2,800 years ago, it was written in Linear B and the Cypriot syllabary.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Greek_language",
    "approved": true
  },
  {
    "name": "Hebrew",
    "aliases": [],
    "status": "living",
    "classification": "Northwest Semitic language of the Afroasiatic family, a Canaanite language",
    "region": "The Land of Israel, spoken by the Israelites → liturgical use in Jewish and Samaritan communities worldwide → revived as the official language of the State of Israel",
    "map": {
      "lat": 31,
      "lon": 35,
      "radiusKm": 150
    },
    "era": {
      "from": -1500,
      "to": null,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": {
      "count": 9303950,
      "year": 2019,
      "note": "Speakers, Wikidata figure for 2019"
    },
    "unknownSpeakersNote": null,
    "parent": null,
    "origin": "Hebrew began as a regional dialect of the Canaanite languages, spoken natively by the Israelites. Its earliest written examples, in Paleo-Hebrew, date to the 10th century BCE, and nearly all of the Hebrew Bible is in Biblical Hebrew. It stopped being a regular spoken language between 200 and 400 CE but stayed in use for liturgy and literature, and in the 19th century it was revived as a spoken language, with Eliezer Ben-Yehuda leading the creation of its modern form.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Hebrew_language",
    "approved": true
  },
  {
    "name": "Hindi",
    "aliases": [],
    "status": "living",
    "classification": "Indo-Aryan language, a Sanskritised register of Hindustani",
    "region": "Northern India → a lingua franca across much of northern, central, eastern, western and northeastern India",
    "map": {
      "lat": 23,
      "lon": 80,
      "radiusKm": 800
    },
    "era": null,
    "peakSpeakers": {
      "count": 341000000,
      "year": 2019,
      "note": "Native speakers, Wikidata figure for 2019"
    },
    "unknownSpeakersNote": null,
    "parent": "Hindustani",
    "origin": "Modern Standard Hindi is an Indo-Aryan language written in the Devanagari script. It shares a common base with standard Urdu, known as Hindi-Urdu or Hindustani, and Hindi is considered the more Sanskritised register of the two. Apart from the script and formal vocabulary, the two are mutually intelligible.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Hindi",
    "approved": true
  },
  {
    "name": "Hindustani",
    "aliases": [],
    "status": "living",
    "classification": "Indo-Aryan language of the Western Hindi group",
    "region": "India's Hindi Belt and Pakistan, plus the Deccani-speaking community in South India",
    "map": {
      "lat": 28.6,
      "lon": 77.2,
      "radiusKm": 800
    },
    "era": {
      "from": 1200,
      "to": null,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": {
      "count": 490100000,
      "year": 2006,
      "note": "Speakers, Wikidata figure for 2006"
    },
    "unknownSpeakersNote": null,
    "parent": "Prakrit",
    "origin": "Its first written poetry, in Old Hindi, is traced to the Delhi Sultanate era of the twelfth and thirteenth centuries. In that period the Prakrit base of Old Hindi took in loanwords from Persian, Arabic and Turkic and developed into the present form of Hindustani. Its core vocabulary comes from Prakrit and Sanskrit (via Prakrit), with many loanwords from Persian and Arabic.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Hindustani_language",
    "approved": true
  },
  {
    "name": "Irish",
    "aliases": [],
    "status": "living",
    "classification": "Goidelic branch of the Celtic languages, within the Indo-European family",
    "region": "Island of Ireland → carried to Scotland, the Isle of Man, Canada and Newfoundland",
    "map": {
      "lat": 53.5,
      "lon": -7.5,
      "radiusKm": 250
    },
    "era": {
      "from": 400,
      "to": null,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": {
      "count": 1030000,
      "year": 2012,
      "note": "Speakers, Wikidata figure for 2012"
    },
    "unknownSpeakersNote": null,
    "parent": null,
    "origin": "Irish is a Celtic language of the Indo-European family, native to the Irish people and indigenous to the island of Ireland. Its earliest writing system, Ogham, dates back to at least the 4th century AD, and Latin script gradually replaced it from the 5th century. Irish speakers took the language to Scotland and the Isle of Man, where Middle Irish gave rise to Scottish Gaelic and Manx.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Irish_language",
    "approved": true
  },
  {
    "name": "Italian",
    "aliases": [],
    "status": "living",
    "classification": "Italo-Romance language of the Romance branch of the Indo-European family",
    "region": "Italy, San Marino, Ticino and part of the Grisons in Switzerland, and Istria → official or minority language in several neighbouring countries, with communities worldwide",
    "map": {
      "lat": 43,
      "lon": 13,
      "radiusKm": 400
    },
    "era": null,
    "peakSpeakers": {
      "count": 64819790,
      "year": 2012,
      "note": "Speakers, Wikidata figure for 2012"
    },
    "unknownSpeakersNote": null,
    "parent": "Latin",
    "origin": "Italian is a Romance language, and it is a standardised form of literary Florentine Tuscan. Together with Sardinian, it is the least differentiated language from Latin, which is why it is often called a conservative Romance language in its sounds, vocabulary and word forms.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Italian_language",
    "approved": true
  },
  {
    "name": "Japanese",
    "aliases": [],
    "status": "living",
    "classification": "Principal language of the Japonic family, which also includes the Ryukyuan languages and Hachijō",
    "region": "Japan, where it is the national language → the Japanese diaspora worldwide",
    "map": {
      "lat": 36,
      "lon": 138,
      "radiusKm": 600
    },
    "era": {
      "from": 700,
      "to": null,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": {
      "count": 128000000,
      "year": 2019,
      "note": "Speakers, Wikidata figure for 2019"
    },
    "unknownSpeakersNote": null,
    "parent": null,
    "origin": "Little is known of the prehistory of Japanese, or of when it first appeared in Japan. Chinese documents from the 3rd century AD recorded a few Japanese words, but substantial Old Japanese texts did not appear until the 8th century. Attempts to link it with Ainu, Austronesian or Koreanic have not gained widespread acceptance.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Japanese_language",
    "approved": true
  },
  {
    "name": "Koine Greek",
    "aliases": [],
    "status": "historical",
    "classification": "Common form of Greek, based mainly on Attic and Ionic",
    "region": "The Mediterranean region and the Middle East, following the conquests of Alexander the Great",
    "map": {
      "lat": 35,
      "lon": 28,
      "radiusKm": 1500
    },
    "era": {
      "from": -300,
      "to": 500,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": null,
    "unknownSpeakersNote": "No census of its speakers exists.",
    "parent": "Ancient Greek",
    "origin": "Koine Greek grew out of the spread of Greek after Alexander the Great's conquests in the fourth century BC. It was based mainly on Attic and related Ionic speech forms, with admixtures from other varieties through dialect levelling. Its name, ἡ κοινὴ διάλεκτος, means 'the common dialect', and it was a lingua franca across the Mediterranean and the Middle East.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Koine_Greek",
    "approved": true
  },
  {
    "name": "Late Latin",
    "aliases": [],
    "status": "extinct",
    "classification": "A written variety of Latin, between Classical Latin and Medieval Latin",
    "region": "The Roman Empire of late antiquity, continuing into the 7th century in the Iberian Peninsula",
    "map": {
      "lat": 41.9,
      "lon": 12.5,
      "radiusKm": 1500
    },
    "era": {
      "from": 200,
      "to": 700,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": null,
    "unknownSpeakersNote": "No census of its speakers exists.",
    "parent": "Latin",
    "origin": "Late Latin took shape as non-Latin-speaking peoples on the empire's borders were absorbed and Christianity spread. This created a need for a standard language that could work across social registers and distant regions. It drew on Classical Latin, Christian Latin with its plain sermo humilis, and the many dialects of Vulgar Latin. Scholars do not agree exactly where it begins or ends.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Late_Latin",
    "approved": true
  },
  {
    "name": "Latin",
    "aliases": [],
    "status": "extinct",
    "classification": "Italic branch of the Indo-European family",
    "region": "Latium, the lower Tiber area around Rome → across the Italian Peninsula and the Roman Empire",
    "map": {
      "lat": 41.4,
      "lon": 13.1,
      "radiusKm": 100
    },
    "era": null,
    "peakSpeakers": {
      "count": 7500000,
      "year": 1,
      "note": "Speakers, Wikidata figure for the year 1"
    },
    "unknownSpeakersNote": null,
    "parent": "Old Latin",
    "origin": "Latin was first spoken by the Latins in Latium, the lower Tiber area around Rome. As the Roman Republic expanded, it became the dominant language of the Italian Peninsula and then of the Roman Empire. Old Latin evolved into standardised Classical Latin by the late Republic, and between the 6th and 9th centuries the everyday speech of different regions grew into the distinct Romance languages.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Latin",
    "approved": true
  },
  {
    "name": "Lombard",
    "aliases": [],
    "status": "living",
    "classification": "Gallo-Italic group of the Romance languages, within the Piedmontese-Lombard grouping",
    "region": "Northern Italy and southern Switzerland: most of Lombardy, parts of eastern Piedmont and western Trentino, and the Swiss cantons of Ticino and Graubünden",
    "map": {
      "lat": 46,
      "lon": 10,
      "radiusKm": 150
    },
    "era": null,
    "peakSpeakers": {
      "count": 3900000,
      "year": 2002,
      "note": "Native speakers, Wikidata figure for 2002"
    },
    "unknownSpeakersNote": null,
    "parent": null,
    "origin": "Lombard belongs to the Gallo-Italic group within the Romance languages. It has a Celtic substratum and a Lombardic superstratum. It is a cluster of homogeneous dialects spoken by millions in Northern Italy and southern Switzerland, and also in Santa Catarina, Brazil, by Lombard immigrants from the Province of Bergamo.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Lombard_language",
    "approved": true
  },
  {
    "name": "Low German",
    "aliases": [],
    "status": "living",
    "classification": "North Sea Germanic group of the West Germanic languages",
    "region": "Northern Germany and the northeastern Netherlands → Russian Mennonite diaspora worldwide (Plautdietsch)",
    "map": {
      "lat": 53,
      "lon": 9.5,
      "radiusKm": 300
    },
    "era": null,
    "peakSpeakers": null,
    "unknownSpeakersNote": "Wikidata gives 5,000,000 speakers but no date for that figure. Wikipedia estimates 2 to 5 million speakers in Germany and 2.15 million in the Netherlands.",
    "parent": "Old Saxon",
    "origin": "Low German evolved from Old Saxon (Old Low German), which is most closely related to Old Frisian and Old English. It was spoken in the area of Old Saxony, in northwestern Germany and the northeastern Netherlands, and later spread to northeastern Germany as speakers migrated east into areas that were originally Slavic-speaking. Unlike Standard High German, it did not undergo the High German consonant shift.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Low_German",
    "approved": true
  },
  {
    "name": "Malay",
    "aliases": [],
    "status": "living",
    "classification": "Malayan group of the Austronesian family; a pluricentric macrolanguage",
    "region": "Islands of Maritime Southeast Asia and the Malay Peninsula → official language in Brunei, Malaysia and Singapore, with Indonesian as the standard form in Indonesia",
    "map": {
      "lat": 4,
      "lon": 102,
      "radiusKm": 1500
    },
    "era": null,
    "peakSpeakers": {
      "count": 77000000,
      "year": 2007,
      "note": "Native speakers, Wikidata figure for 2007"
    },
    "unknownSpeakersNote": null,
    "parent": null,
    "origin": "Malay is an Austronesian language of the Malayan group and the ethnic language of the Malays. Its classical form, also called Court Malay, was the literary standard of the pre-colonial Malacca and Johor Sultanates. Several trade and creole languages, such as Ambonese Malay, are based on a lingua franca derived from Classical Malay.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Malay_language",
    "approved": true
  },
  {
    "name": "Medieval Latin",
    "aliases": [],
    "status": "extinct",
    "classification": "A form of Literary Latin, continuing Classical and Late Latin",
    "region": "Roman Catholic Western Europe, plus Mauretania, Numidia and Africa Proconsularis, and Visigothic Hispania",
    "map": {
      "lat": 46,
      "lon": 8,
      "radiusKm": 1500
    },
    "era": {
      "from": 500,
      "to": 1500,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": null,
    "unknownSpeakersNote": "No census of its speakers exists.",
    "parent": "Late Latin",
    "origin": "Medieval Latin continued Classical Latin and Late Latin, adding words for new concepts and for the growing place of Christianity. Its writers did not see it as a fundamentally different language, and scholars disagree about exactly where Late Latin ends and Medieval Latin begins. Some place the start in the mid-4th century, some around 500, and others around 900, when written Romance languages began to replace written Late Latin.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Medieval_Latin",
    "approved": true
  },
  {
    "name": "Middle Dutch",
    "aliases": [],
    "status": "historical",
    "classification": "Low Franconian group of the West Germanic languages",
    "region": "Not recorded in the sources",
    "map": null,
    "era": {
      "from": 1150,
      "to": 1500,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": null,
    "unknownSpeakersNote": "No census of its speakers exists.",
    "parent": "Old Dutch",
    "origin": "Middle Dutch is the collective name for a number of closely related West Germanic dialects descended from Old Dutch. It was spoken and written between 1150 and 1500, before Modern Dutch emerged. In that period a Medieval Dutch literature developed, which had not existed in Old Dutch.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Middle_Dutch",
    "approved": true
  },
  {
    "name": "Middle English",
    "aliases": [],
    "status": "historical",
    "classification": "Earlier stage of English, in the Anglic group",
    "region": "England after the Norman Conquest → later replaced by Early Modern English in England, Early Scots in Scotland, and Fingallian and Yola in Ireland",
    "map": {
      "lat": 52.8,
      "lon": -1.5,
      "radiusKm": 300
    },
    "era": {
      "from": 1066,
      "to": 1470,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": null,
    "unknownSpeakersNote": "No census of its speakers exists.",
    "parent": "Old English",
    "origin": "Middle English grew out of Old English after the Norman Conquest of 1066, shaped by Anglo-Norman French and Old Norse. Many Old English grammatical features were simplified or lost, and Anglo-Norman words entered the language, especially in politics, law, the arts and religion. By about 1470, a standard based on London dialects had become established, and it largely formed the basis of Modern English spelling.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Middle_English",
    "approved": true
  },
  {
    "name": "Middle French",
    "aliases": [],
    "status": "historical",
    "classification": "Historical stage of the French language, in the Oïl group",
    "region": "Kingdom of France",
    "map": {
      "lat": 47,
      "lon": 2,
      "radiusKm": 500
    },
    "era": {
      "from": 1350,
      "to": 1600,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": null,
    "unknownSpeakersNote": "No census of its speakers exists.",
    "parent": "Old French",
    "origin": "Middle French is the division of French spoken from the mid-14th to the early 17th centuries, a period of transition. During it, French became clearly distinguished from the other competing Oïl languages, which are sometimes grouped under Old French, and was imposed as the official language of the Kingdom of France in place of Latin and other Oïl and Occitan languages. It is the first version of French that is largely intelligible to speakers of Modern French.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Middle_French",
    "approved": true
  },
  {
    "name": "Middle High German",
    "aliases": [],
    "status": "historical",
    "classification": "Stage of High German, the German varieties affected by the Second Sound Shift",
    "region": "High German-speaking lands → eastward beyond the Elbe-Saale line",
    "map": {
      "lat": 49.5,
      "lon": 10.5,
      "radiusKm": 450
    },
    "era": {
      "from": 1050,
      "to": 1350,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": null,
    "unknownSpeakersNote": "No census of its speakers exists.",
    "parent": "Old High German",
    "origin": "Middle High German is the form of High German spoken in the High Middle Ages, conventionally dated 1050 to 1350. It grew out of Old High German and later became Early New High German. Speakers called it diutsch or tiutsch. In the late 12th century the prestige of the Hohenstaufen court gave rise to a literary language based on Swabian, an Alemannic dialect.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Middle_High_German",
    "approved": true
  },
  {
    "name": "Middle Low German",
    "aliases": [],
    "status": "historical",
    "classification": "A developmental stage of Low German, descended from Old Saxon",
    "region": "The north of Central Europe → a lingua franca across the northern half of Europe during the Hanseatic period",
    "map": null,
    "era": {
      "from": 1225,
      "to": 1600,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": null,
    "unknownSpeakersNote": "No census of its speakers exists.",
    "parent": "Old Saxon",
    "origin": "Middle Low German developed from Old Saxon in the Middle Ages and has been documented in writing since about 1225 to 1234, with the Sachsenspiegel. During the Hanseatic period, from about 1300 to about 1600, it was the leading written language in the north of Central Europe. It was used alongside medieval Latin for diplomacy and for deeds.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Middle_Low_German",
    "approved": true
  },
  {
    "name": "Middle Persian",
    "aliases": [],
    "status": "historical",
    "classification": "Western Middle Iranian language, in the Southwestern Iranian group",
    "region": "The Sasanian Empire",
    "map": {
      "lat": 32,
      "lon": 53,
      "radiusKm": 1000
    },
    "era": null,
    "peakSpeakers": null,
    "unknownSpeakersNote": "No census of its speakers exists.",
    "parent": "Old Persian",
    "origin": "Middle Persian descended from Old Persian, the language of the Achaemenid Empire. It became the literary language of the Sasanian Empire, and kept its prestige for some time after that empire collapsed. It is the linguistic ancestor of New Persian, the official language of Iran, Afghanistan (Dari) and Tajikistan (Tajik).",
    "sourceUrl": "https://en.wikipedia.org/wiki/Middle_Persian",
    "approved": true
  },
  {
    "name": "Nahuatl",
    "aliases": [],
    "status": "living",
    "classification": "Nahuan branch of the Uto-Aztecan family, among the Indigenous languages of the Americas",
    "region": "Central Mexico, along the coastline, and in smaller immigrant communities in the United States",
    "map": {
      "lat": 19,
      "lon": -96,
      "radiusKm": 400
    },
    "era": {
      "from": 600,
      "to": null,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": {
      "count": 1925620,
      "year": 2015,
      "note": "Speakers, Wikidata figure for 2015"
    },
    "unknownSpeakersNote": null,
    "parent": null,
    "origin": "Nahuatl has been spoken in central Mexico since at least the seventh century AD. It belongs to the Uto-Aztecan family and developed over a very long period alongside other Indigenous Mesoamerican languages. It was the language of the Mexica, whose influence made the Tenochtitlan variety a prestige language across Mesoamerica.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Nahuatl",
    "approved": true
  },
  {
    "name": "New Latin",
    "aliases": [],
    "status": "extinct",
    "classification": "Style of written Latin from the Renaissance onward",
    "region": "Italy → across northern Europe, later Scandinavia, Russia and eastern Europe",
    "map": {
      "lat": 47,
      "lon": 12,
      "radiusKm": 1500
    },
    "era": {
      "from": 1300,
      "to": 1820,
      "writtenUntil": 2026,
      "approximate": true
    },
    "peakSpeakers": null,
    "unknownSpeakersNote": "No census of its speakers exists.",
    "parent": "Latin",
    "origin": "New Latin, also called Neo-Latin, began in Italy during the Italian Renaissance of the fourteenth and fifteenth centuries, when scholars from Petrarch onwards promoted a Latin closer to that of the ancient Romans in grammar, style and spelling. It spread across northern Europe after about 1500 as part of the humanist movement, in line with its slogan ad fontes. The name is much younger, probably coined in Germany in the late eighteenth century as Neulatein.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Neo-Latin",
    "approved": true
  },
  {
    "name": "Norwegian",
    "aliases": [],
    "status": "living",
    "classification": "North Germanic (West Scandinavian) language of the Indo-European family",
    "region": "Norway, where it is an official language alongside Sámi",
    "map": {
      "lat": 59.913333333333334,
      "lon": 10.738888888888889,
      "radiusKm": 400
    },
    "era": null,
    "peakSpeakers": {
      "count": 5200000,
      "year": 2015,
      "note": "Speakers, Wikidata figure for 2015"
    },
    "unknownSpeakersNote": null,
    "parent": "Old Norse",
    "origin": "Norwegian descends from Old Norse, the common language of the Germanic peoples living in Scandinavia during the Viking Age. Bokmål grew out of the Dano-Norwegian language that replaced Middle Norwegian as the elite language after the union of Denmark-Norway in the 16th and 17th centuries, while Nynorsk was built from a collective of spoken Norwegian dialects.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Norwegian_language",
    "approved": true
  },
  {
    "name": "Occitan",
    "aliases": [],
    "status": "living",
    "classification": "Occitano-Romance language, within the Gallo-Romance group of Romance languages",
    "region": "Southern France, Monaco, Italy's Occitan Valleys and the Val d'Aran in Spain, together sometimes called Occitania",
    "map": {
      "lat": 43,
      "lon": 1,
      "radiusKm": 400
    },
    "era": null,
    "peakSpeakers": {
      "count": 542000,
      "year": 2020,
      "note": "Native speakers, Wikidata figure for 2020"
    },
    "unknownSpeakersNote": null,
    "parent": "Old Occitan",
    "origin": "Occitan is a Romance language of the Occitano-Romance and Gallo-Romance groups. Its closest relative is Catalan, which was considered a dialect of Occitan until the end of the 19th century. Over time, names such as Limousin, Languedocien, Gascon and Provençal have each been used for the whole language, though Provençal now mostly means the dialect of Provence.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Occitan_language",
    "approved": true
  },
  {
    "name": "Old Dutch",
    "aliases": [],
    "status": "historical",
    "classification": "Low Franconian dialects, descended from Frankish",
    "region": "The Low Countries: southern Netherlands, northern Belgium, part of northern France, and parts of the Lower Rhine in Germany",
    "map": {
      "lat": 51.2,
      "lon": 4.9,
      "radiusKm": 200
    },
    "era": {
      "from": 500,
      "to": 1150,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": null,
    "unknownSpeakersNote": "No census of its speakers exists.",
    "parent": "Frankish",
    "origin": "Old Dutch is the set of dialects that evolved from Frankish in the Low Countries during the Early Middle Ages, from around the 6th to the 12th century. It was spoken by the descendants of the Salian Franks and is regarded as the first stage in the development of a separate Dutch language. Around the 12th century it evolved into Middle Dutch.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Old_Dutch",
    "approved": true
  },
  {
    "name": "Old English",
    "aliases": [],
    "status": "historical",
    "classification": "Anglic, West Germanic branch of the Germanic languages; closest relatives are Old Frisian and Old Saxon",
    "region": "England and southern and eastern Scotland",
    "map": {
      "lat": 52,
      "lon": 0,
      "radiusKm": 300
    },
    "era": {
      "from": 450,
      "to": 1066,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": null,
    "unknownSpeakersNote": "No census of its speakers exists.",
    "parent": null,
    "origin": "Old English grew out of Anglo-Frisian, or Ingvaeonic, dialects brought to Great Britain by Anglo-Saxon settlers in the mid-5th century. Those settlers, traditionally called the Angles, Saxons and Jutes, became dominant in England, and their speech replaced Common Brittonic and Latin. The first Old English literature dates from the mid-7th century, and the era is regarded as ending in 1066 with the Norman Conquest, after which English developed into Middle English.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Old_English",
    "approved": true
  },
  {
    "name": "Old French",
    "aliases": [],
    "status": "historical",
    "classification": "Gallo-Romance dialect continuum; the Oïl group of Romance dialects",
    "region": "Northern half of France and parts of the Angevin Empire, Upper and Lower Lorraine → carried to England and the Crusader states",
    "map": {
      "lat": 48.5,
      "lon": 2.5,
      "radiusKm": 350
    },
    "era": {
      "from": 775,
      "to": 1350,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": null,
    "unknownSpeakersNote": "No census of its speakers exists.",
    "parent": null,
    "origin": "Old French was not one unified language but a group of Romance dialects, mutually intelligible yet diverse. Together they came to be known as the langues d'oïl, set against the langues d'oc of Occitania in the south. In the mid-14th century Middle French emerged, a predecessor to Modern French, while other dialects became Norman, Picard, Walloon and more.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Old_French",
    "approved": true
  },
  {
    "name": "Old High German",
    "aliases": [],
    "status": "historical",
    "classification": "Earliest stage of the German language, within the High German group of West Germanic dialects",
    "region": "German-speaking lands of the early medieval period, brought under Charlemagne's single polity by 788",
    "map": null,
    "era": {
      "from": 750,
      "to": 1050,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": null,
    "unknownSpeakersNote": "No census of its speakers exists.",
    "parent": "Germanic",
    "origin": "Old High German is the earliest stage of German, conventionally dated from around 500/750 to 1050. It was not one unified language but a family of West Germanic dialects that shared the consonantal changes known as the Second Sound Shift. Its earliest written traces are glosses from the latter half of the 8th century, notes in the margins of Latin texts made in monastic scriptoria.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Old_High_German",
    "approved": true
  },
  {
    "name": "Old Norse",
    "aliases": [],
    "status": "historical",
    "classification": "North Germanic branch of the Germanic languages",
    "region": "Scandinavia → Norse settlements across the North Atlantic, the British Isles, Normandy and Novgorod Rus",
    "map": {
      "lat": 63.42,
      "lon": 10.38,
      "radiusKm": 800
    },
    "era": {
      "from": 800,
      "to": 1400,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": null,
    "unknownSpeakersNote": "No census of its speakers exists.",
    "parent": "North Germanic",
    "origin": "Old Norse is the conventional name for the medieval West and East Scandinavian dialects that developed from Proto-Norse. It was spoken in Scandinavia and in Norse settlements during the Viking Age and the early Middle Ages. Over time those dialects evolved into Icelandic, Faroese, Norwegian, Danish, and Swedish.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Old_Norse",
    "approved": true
  },
  {
    "name": "Old Northern French",
    "aliases": [],
    "status": "historical",
    "classification": "One of the langues d'oïl of northern France; an earlier stage of Norman",
    "region": "Normandy, northern France → England, Southern Italy, Sicily and the Levant",
    "map": {
      "lat": 49,
      "lon": 0,
      "radiusKm": 200
    },
    "era": null,
    "peakSpeakers": null,
    "unknownSpeakersNote": "No census of its speakers exists.",
    "parent": null,
    "origin": "Old Northern French was one of many varieties of the langues d'oïl native to northern France, rooted in the region now called Normandy. From there it travelled to England, Southern Italy, Sicily and the Levant, where it became an important language of the Principality of Antioch under Crusader rule. It is the ancestor of modern Norman, including insular dialects such as Jèrriais, and of Anglo-Norman.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Old_Norman",
    "approved": true
  },
  {
    "name": "Old Occitan",
    "aliases": [
      "Old Provençal"
    ],
    "status": "historical",
    "classification": "Earliest form of the Occitano-Romance languages",
    "region": "Occitania, the Crown of Aragon, Navarre and Piedmont",
    "map": {
      "lat": 44,
      "lon": 2,
      "radiusKm": 500
    },
    "era": {
      "from": 700,
      "to": 1400,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": null,
    "unknownSpeakersNote": "No census of its speakers exists.",
    "parent": null,
    "origin": "Old Occitan was the earliest form of the Occitano-Romance languages, attested in writings from the 8th to the 14th centuries. The word occitanus only appeared around 1300, so medieval texts call the language \"Romance\" (romans) or \"Provençal\" (proensals). The term generally covers Early and Old Occitan, and sometimes Middle Occitan as well.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Old_Occitan",
    "approved": true
  },
  {
    "name": "Ottoman Turkish",
    "aliases": [
      "Ottoman"
    ],
    "status": "historical",
    "classification": "A standardized register of Turkish",
    "region": "The Ottoman Empire",
    "map": null,
    "era": {
      "from": 1300,
      "to": 1922,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": null,
    "unknownSpeakersNote": "No census of its speakers exists.",
    "parent": null,
    "origin": "Ottoman Turkish was the standardized register of Turkish used in the Ottoman Empire, from roughly the 14th to the 20th centuries. Written in the Ottoman Turkish alphabet, it borrowed extensively from Persian and Arabic. Rural Turks, to whom it was largely unintelligible, kept using kaba Türkçe ('raw' or 'vulgar' Turkish), which had far fewer foreign loanwords and is the basis of modern standard Turkish.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Ottoman_Turkish",
    "approved": true
  },
  {
    "name": "Persian",
    "aliases": [],
    "status": "living",
    "classification": "Western Iranian language of the Iranian branch of the Indo-Iranian subdivision of the Indo-European family",
    "region": "Fars in southwestern Iran → Iran, Afghanistan, Tajikistan and the wider cultural sphere of Greater Iran",
    "map": {
      "lat": 31,
      "lon": 56,
      "radiusKm": 1200
    },
    "era": {
      "from": 800,
      "to": null,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": {
      "count": 70000000,
      "year": 2019,
      "note": "Speakers, Wikidata figure for 2019"
    },
    "unknownSpeakersNote": null,
    "parent": "Middle Persian",
    "origin": "Modern Persian continues Middle Persian, an official language of the Sasanian Empire (224 to 651 CE), which itself continues Old Persian, used in the Achaemenid Empire (550 to 330 BCE). It originated in the region of Fars in southwestern Iran. New Persian literature was first recorded in the ninth century, after the Muslim conquest of Persia.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Persian_language",
    "approved": true
  },
  {
    "name": "Portuguese",
    "aliases": [],
    "status": "living",
    "classification": "Western Romance language of the Indo-European family, in the Ibero-Romance group",
    "region": "Portugal and the Azores → official language in eight countries across Europe, South America, Africa and Asia",
    "map": {
      "lat": 40,
      "lon": -8,
      "radiusKm": 300
    },
    "era": null,
    "peakSpeakers": {
      "count": 254300000,
      "year": 2019,
      "note": "Native speakers, Wikidata figure for 2019"
    },
    "unknownSpeakersNote": null,
    "parent": "Vulgar Latin",
    "origin": "Portuguese belongs to the Ibero-Romance group, which evolved from several dialects of Vulgar Latin in the medieval Kingdom of Galicia and the County of Portugal. Wikidata gives its parent as Galician-Portuguese, and it has kept some Celtic phonology. Its vocabulary is largely Latin, with loanwords from Celtic, Germanic, Arabic, African, Amerindian and Asian languages, brought by wars, trade and colonization.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Portuguese_language",
    "approved": true
  },
  {
    "name": "Proto-Celtic",
    "aliases": [],
    "status": "reconstructed",
    "classification": "Ancestor of the Celtic languages, a descendant of Proto-Indo-European",
    "region": "Western Europe, often associated with the Urnfield and Hallstatt cultures",
    "map": {
      "lat": 48,
      "lon": 8,
      "radiusKm": 800
    },
    "era": {
      "from": -1300,
      "to": -800,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": null,
    "unknownSpeakersNote": "Reconstructed by scholars. Never written down.",
    "parent": "Proto-Indo-European",
    "origin": "Proto-Celtic is the reconstructed ancestor of all known Celtic languages, and it descends from Proto-Indo-European. It is generally thought to have been spoken between 1300 and 800 BC, after which it began to split into different languages. Features shared with the Italic languages suggest there may once have been an Italo-Celtic unity.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Proto-Celtic_language",
    "approved": true
  },
  {
    "name": "Proto-Germanic",
    "aliases": [],
    "status": "reconstructed",
    "classification": "Common ancestor of the Germanic languages, descended from Proto-Indo-European",
    "region": "Homeland of the Germanic people; no precise location is given",
    "map": null,
    "era": null,
    "peakSpeakers": null,
    "unknownSpeakersNote": "Reconstructed by scholars. Never written down.",
    "parent": "Proto-Indo-European",
    "origin": "Proto-Germanic is the reconstructed common ancestor of the Germanic languages. It gradually diverged from Proto-Indo-European, and a defining feature of that process was the completion of Grimm's law, also known as the First Germanic Sound Shift. Because it is not directly attested, scholars rebuild it using the comparative method, early runic inscriptions such as those from Vimose in Denmark, early loanwords like Finnish kuningas 'king', and Roman-era transcriptions such as those in Tacitus's Germania.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Proto-Germanic_language",
    "approved": true
  },
  {
    "name": "Proto-Hellenic",
    "aliases": [],
    "status": "reconstructed",
    "classification": "Indo-European language; the common ancestor of all varieties of Greek",
    "region": "Greece, entered by its speakers during the European Bronze Age",
    "map": {
      "lat": 39,
      "lon": 22,
      "radiusKm": 300
    },
    "era": {
      "from": -2200,
      "to": -1700,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": null,
    "unknownSpeakersNote": "Reconstructed by scholars. Never written down.",
    "parent": null,
    "origin": "Proto-Hellenic, also called Proto-Greek, is the Indo-European language that was the last common ancestor of all varieties of Greek. Its speakers entered Greece sometime during the European Bronze Age, around 2200 to 1900 BC. By about 1700 BC it had begun to diversify into a southern and a northern group, leading on to Mycenaean Greek, the ancient Greek dialects, and ultimately Koine, Byzantine and Modern Greek.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Proto-Greek_language",
    "approved": true
  },
  {
    "name": "Proto-Indo-European",
    "aliases": [],
    "status": "reconstructed",
    "classification": "Common ancestor of the Indo-European language family",
    "region": "Probably the Pontic-Caspian steppe of eastern Europe and central Asia → spread through the Indo-European migrations",
    "map": {
      "lat": 48,
      "lon": 45,
      "radiusKm": 1000
    },
    "era": {
      "from": -4500,
      "to": -2500,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": null,
    "unknownSpeakersNote": "Reconstructed by scholars. Never written down.",
    "parent": null,
    "origin": "No direct record of Proto-Indo-European has been found. Linguists have reconstructed it by comparing documented Indo-European languages. It is thought to have been spoken as a single language from about 4500 to 2500 BCE, perhaps on the Pontic-Caspian steppe. As its speakers spread apart, their dialects diverged and over many centuries became the ancient Indo-European languages, and later their modern descendants.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Proto-Indo-European_language",
    "approved": true
  },
  {
    "name": "Proto-Italic",
    "aliases": [],
    "status": "reconstructed",
    "classification": "Ancestor of the Italic branch of the Indo-European family",
    "region": "Not recorded in the sources",
    "map": null,
    "era": null,
    "peakSpeakers": null,
    "unknownSpeakersNote": "Reconstructed by scholars. Never written down.",
    "parent": "Proto-Indo-European",
    "origin": "Proto-Italic is the ancestor of the Italic languages, among them Latin and its descendants, the Romance languages. It descended from the earlier Proto-Indo-European language. No writing in it survives, so it has been reconstructed to some degree through the comparative method.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Proto-Italic_language",
    "approved": true
  },
  {
    "name": "Sanskrit",
    "aliases": [],
    "status": "living",
    "classification": "Old Indo-Aryan language of the Indo-European family",
    "region": "Northern Afghanistan, northern Pakistan and northwestern India → across South Asia, then Southeast, East and Central Asia as a language of religion and high culture",
    "map": {
      "lat": 26.5,
      "lon": 71.5,
      "radiusKm": 1000
    },
    "era": {
      "from": -1500,
      "to": null,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": {
      "count": 49736,
      "year": 1991,
      "note": "Native speakers, Wikidata figure for 1991"
    },
    "unknownSpeakersNote": null,
    "parent": null,
    "origin": "Sanskrit arose in South Asia after its predecessor languages diffused there from the northwest in the late Bronze Age. Its most archaic form, Vedic Sanskrit, is found in the Rigveda, 1,028 hymns composed between 1500 and 1200 BCE. Along the way it absorbed the names of newly encountered plants and animals, and Dravidian languages influenced its phonology and syntax.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Sanskrit",
    "approved": true
  },
  {
    "name": "Scots",
    "aliases": [],
    "status": "living",
    "classification": "Anglic language variety of the West Germanic branch, a sister language of Modern English",
    "region": "Scottish Lowlands, Orkney and Shetland (the Northern Isles) → northern Ulster in Ireland, where it is called Ulster Scots",
    "map": {
      "lat": 57,
      "lon": -3,
      "radiusKm": 250
    },
    "era": null,
    "peakSpeakers": {
      "count": 1500000,
      "year": 2022,
      "note": "People in Scotland able to speak Scots, 2022 census"
    },
    "unknownSpeakersNote": null,
    "parent": "Middle English",
    "origin": "Scots is a West Germanic language variety descended from Early Middle English, which makes Modern Scots a sister language of Modern English. It is sometimes called Lowland Scots to set it apart from Scottish Gaelic, and Broad Scots to set it apart from Scottish Standard English. Scholars and others often disagree about whether it counts as a dialect of English or a separate language, since there are no universally accepted criteria for deciding.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Scots_language",
    "approved": true
  },
  {
    "name": "Spanish",
    "aliases": [],
    "status": "living",
    "classification": "Ibero-Romance, West Iberian branch of the Romance languages in the Indo-European family",
    "region": "North-central Iberia, in the Kingdom of Castile → across Spain and the Americas",
    "map": {
      "lat": 40.4,
      "lon": -3.7,
      "radiusKm": 400
    },
    "era": {
      "from": 800,
      "to": null,
      "writtenUntil": null,
      "approximate": true
    },
    "peakSpeakers": {
      "count": 485000000,
      "year": 2023,
      "note": "Speakers, Wikidata figure for 2023"
    },
    "unknownSpeakersNote": null,
    "parent": "Vulgar Latin",
    "origin": "Spanish evolved from the Vulgar Latin spoken on the Iberian Peninsula, in dialects that developed after the Western Roman Empire collapsed in the 5th century. The oldest Latin texts with traces of Spanish come from mid-northern Iberia in the 9th century, and its first systematic written use came in Toledo in the 13th century. Spanish colonialism in the early modern period carried it overseas, above all to the Americas.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Spanish_language",
    "approved": true
  },
  {
    "name": "Vulgar Latin",
    "aliases": [],
    "status": "extinct",
    "classification": "A range of non-formal registers of Latin, standing between Latin and the Romance languages",
    "region": "Ancient Rome → wherever Latin was spoken in conversation",
    "map": {
      "lat": 41.9,
      "lon": 12.5,
      "radiusKm": 300
    },
    "era": null,
    "peakSpeakers": null,
    "unknownSpeakersNote": "No census of its speakers exists.",
    "parent": "Latin",
    "origin": "Vulgar Latin is the range of non-formal registers of Latin spoken from the Late Roman Republic onward, used in conversation across many centuries, places and contexts. Scholars disagree about how far it differed from Classical Latin, and whether it was ever a distinct language or speech variety. Changes in its spoken forms help explain how Latin became Proto-Romance and then the Romance languages.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Vulgar_Latin",
    "approved": true
  }
] satisfies LanguageSheet[];
