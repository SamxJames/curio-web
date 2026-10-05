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
    "origin": "Late Latin took shape as non-Latin-speaking peoples on the empire's borders were absorbed and Christianity spread, creating a need for a standard language that could bridge social registers and distant regions. It drew on Classical Latin, Christian Latin with its plain sermo humilis, and the many dialects of Vulgar Latin. Scholars do not agree exactly where it begins or ends.",
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
    "region": "Not recorded in our sources",
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
    "origin": "Middle Dutch is the collective name for a number of closely related West Germanic dialects descended from Old Dutch. It was spoken and written between 1150 and 1500, before Modern Dutch emerged. In that period a rich Medieval Dutch literature developed, something that had not yet existed in Old Dutch.",
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
    "origin": "Old English grew out of Anglo-Frisian, or Ingvaeonic, dialects brought to Great Britain by Anglo-Saxon settlers in the mid-5th century. Those settlers, traditionally called the Angles, Saxons and Jutes, became dominant in England, and their speech replaced Common Brittonic and Latin. The first Old English literature dates from the mid-7th century, and the era is regarded as ending in 1066, when the Norman Conquest set English on the path to Middle English.",
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
    "origin": "Modern Persian continues Middle Persian, an official language of the Sasanian Empire (224–651 CE), which itself continues Old Persian, used in the Achaemenid Empire (550–330 BCE). It originated in the region of Fars in southwestern Iran. New Persian literature was first recorded in the ninth century, after the Muslim conquest of Persia.",
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
    "origin": "Portuguese belongs to the Ibero-Romance group, which evolved from several dialects of Vulgar Latin in the medieval Kingdom of Galicia and the County of Portugal. Its parent in Wikidata is Galician–Portuguese, and it has kept some Celtic phonology. Its vocabulary is largely Latin, with loanwords from Celtic, Germanic, Arabic, African, Amerindian and Asian languages, brought by wars, trade and colonization.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Portuguese_language",
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
    "unknownSpeakersNote": "Reconstructed by scholars — never written down.",
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
    "unknownSpeakersNote": "Reconstructed by scholars — never written down.",
    "parent": null,
    "origin": "Proto-Hellenic, also called Proto-Greek, is the Indo-European language that was the last common ancestor of all varieties of Greek. Its speakers entered Greece sometime during the European Bronze Age, around 2200–1900 BC. By about 1700 BC it had begun to diversify into a southern and a northern group, leading on to Mycenaean Greek, the ancient Greek dialects, and ultimately Koine, Byzantine and Modern Greek.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Proto-Greek_language",
    "approved": true
  },
  {
    "name": "Proto-Indo-European",
    "aliases": [],
    "status": "reconstructed",
    "classification": "Common ancestor of the Indo-European language family",
    "region": "Probably the Pontic–Caspian steppe of eastern Europe and central Asia → spread through the Indo-European migrations",
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
    "unknownSpeakersNote": "Reconstructed by scholars — never written down.",
    "parent": null,
    "origin": "No direct record of Proto-Indo-European has ever been found; linguists have pieced it together by comparing documented Indo-European languages. It is thought to have been spoken as a single language from about 4500 to 2500 BCE, perhaps on the Pontic–Caspian steppe. As its speakers spread apart, their dialects diverged and over many centuries became the ancient Indo-European languages, and later their modern descendants.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Proto-Indo-European_language",
    "approved": true
  },
  {
    "name": "Proto-Italic",
    "aliases": [],
    "status": "reconstructed",
    "classification": "Ancestor of the Italic branch of the Indo-European family",
    "region": "Not recorded in our sources",
    "map": null,
    "era": null,
    "peakSpeakers": null,
    "unknownSpeakersNote": "Reconstructed by scholars — never written down.",
    "parent": "Proto-Indo-European",
    "origin": "Proto-Italic is the ancestor of the Italic languages, most notably Latin and its descendants, the Romance languages. It descended from the earlier Proto-Indo-European language. No writing in it survives, so it has been reconstructed to some degree through the comparative method.",
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
    "origin": "Spanish evolved from the Vulgar Latin spoken on the Iberian Peninsula, in dialects that developed after the Western Roman Empire collapsed in the 5th century. The oldest Latin texts with traces of Spanish come from mid-northern Iberia in the 9th century, and its first systematic written use came in Toledo in the 13th century. Spanish colonialism in the early modern period carried it overseas, most notably to the Americas.",
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
    "origin": "Vulgar Latin is the range of non-formal registers of Latin spoken from the Late Roman Republic onward, used in conversation across many centuries, places and contexts. Scholars disagree about how far it differed from Classical Latin, and whether it was ever a distinct language or speech variety. The shifts in spoken forms are still important for understanding the path from Latin through Proto-Romance to the Romance languages.",
    "sourceUrl": "https://en.wikipedia.org/wiki/Vulgar_Latin",
    "approved": true
  }
] satisfies LanguageSheet[];
