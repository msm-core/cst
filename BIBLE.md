# CST — Canonical Specification (BIBLE)

> **This document is the contract.**
> Every tokenizer, test, model integration, and language adapter
> must agree with what is written here.
> When code and this document disagree, fix the code.

---

## 0. The Idea in One Sentence

CST applies the **Arabic morphological algebra** — root + pattern = word — as a
**universal, language-agnostic** tokenization system.
Every word in any language is expressed as a ROOT (semantic meaning) and optionally a
ROLE (derivational pattern), just as Arabic builds كَاتِب from جذر ك-ت-ب + وزن فَاعِل.

---

## 1. The Arabic Algebra Principle

Arabic is the foundation because it has the world's most explicit morphological system.
Every Arabic word is derived from a **trilateral root (جذر)** by applying a
**vowel pattern / verb form (وزن)**.
The same algebra operates across the entire language:

```
جذر  (root)  ×  وزن (pattern)  =  كلمة (word)
```

| Root (جذر)    | Pattern (وزن) | Word      | Meaning                  |
| ------------- | ------------- | --------- | ------------------------ |
| ك-ت-ب (write) | فَاعِل        | كَاتِب    | writer (agent)           |
| ك-ت-ب (write) | مَفْعُول      | مَكْتُوب  | written (patient)        |
| ك-ت-ب (write) | مَفْعَلة      | مَكْتَبة  | library (place)          |
| ك-ت-ب (write) | فِعَال        | كِتَاب    | book (instance)          |
| ك-ت-ب (write) | مُفَاعَلة     | مُكَاتَبة | correspondence (process) |
| ك-ت-ب (write) | مَفْعَال      | مِكْتَاب  | typewriter (instrument)  |

**CST's key insight**: this algebra is not Arabic-specific.
It is the universal structure of human language — only Arabic makes it visible.

```
ROOT:write  ×  ROLE:agent   →  كاتب  (Arabic)
ROOT:write  ×  ROLE:agent   →  writer (English)
ROOT:write  ×  ROLE:agent   →  écrivain (French)
ROOT:write  ×  ROLE:agent   →  yazar (Turkish)
```

**The compact token stream is the same for all four sentences.**
CST outputs language-neutral tokens; downstream models (nemo, HDC, LLM) never
see the original surface form, only the algebra.

This means:

- 42 fields × 23 roles = **966 distinct meanings** from 65 atomic tokens
- A system trained on Arabic data immediately understands equivalent English, and vice versa
- Adding a new language = writing an adapter that maps surface forms to the shared algebra
- You do **not** need a new model per language

### 1.1 The Universal Atom Space

The **42 field names** (`write`, `know`, `govern`, `health`…) are the جذر of CST at the
semantic layer — above any language's surface forms.
Every Arabic كتب, English "write", French "écrire", Turkish "yazmak" is a
**path to the same atom**: `write`.

This means the atom space must be defined **once**, in a single source of truth,
and every language adapter must validate against it:

```
vocab/
  spec/            ← The universal atom space — not a language adapter
    fields.json    ← all field names (L1 + L2)          ← جذر at semantic level
    roles.json     ← all 23 role names                  ← وزن catalogue
    relations.json ← all 20 REL category names
    structural.json← all 11 STR marker names
```

`spec/` is not a language. It is the algebra itself.
No vocab file in any language adapter may reference a field, role, REL, or STR
that does not exist in the corresponding `spec/` file.
Violation is caught by `scripts/validate-vocab.ts`, which runs inside `npm test`.

---

## 2. Token Types

Five types. No others.

```
ROOT  ROLE  REL  STR  LIT
```

### 2.1 ROOT — Semantic Root

The content word, reduced to its semantic field (the جذر).

```
compact:  ROOT:<field>
examples: ROOT:write   ROOT:tech.code   ROOT:time.alarm   ROOT:health
```

**Rules:**

- Every content word that can be mapped emits exactly one ROOT token
- `field` is always a registered name from `spec.ts` — no freeform strings
- Field may use dot notation for a level-2 refinement: `ROOT:tech.code`
- ROOT carries `.field` and optionally `.gloss`
- ROOT does **not** carry morphological role (that is ROLE's job)

### 2.2 ROLE — Morphological Pattern

The derivational pattern of the preceding ROOT (the وزن).

```
compact:  ROLE:<role>
examples: ROLE:agent   ROLE:patient   ROLE:place   ROLE:instance
```

**Rules:**

- ROLE is emitted **only when the morphological form is detected**
- ROLE is always paired with the ROOT that precedes it; they share the same `surface` and `offset`
- A ROOT without a detectable pattern emits no ROLE token — this is normal and expected
- ROLE carries `.role` (a name from the 23-role set in `spec.ts`)
- ROLE is separate from ROOT so models compose them freely:
  `ROOT:write + ROLE:agent` = any language's word for "writer"
  without enumerating all 798 field×role pairs as atoms

### 2.3 REL — Relational Word

A function word expressing a grammatical or logical relation.

```
compact:  REL:<relation>
examples: REL:in   REL:to   REL:from   REL:causes   REL:and   REL:of
```

**Rules:**

- Prepositions, conjunctions, and relative words map to REL
- `relation` is a registered category from `spec.ts`
- The surface word is preserved in `.surface`

### 2.4 STR — Structure Marker

A sentence-level structure marker. Emitted before the clause it governs.

```
compact:  STR:<marker>
examples: STR:question   STR:negation   STR:modal   STR:future   STR:imperative
```

**Rules:**

- STR markers represent the speaker's intent and tense frame for the whole clause
- They are emitted **before** the content tokens of the clause they mark
- Multiple STR tokens may appear in one sentence (e.g., STR:modal STR:future)
- `structure` is a registered marker from `spec.ts`

### 2.5 LIT — Literal Fallback

An unknown word, named entity, or proper noun that has no mapping.

```
compact:  LIT:<surface>
examples: LIT:iPhone   LIT:GPT-4   LIT:محمد   LIT:42
```

**Rules:**

- Surface is preserved verbatim in both `.surface` and `.compact`
- LIT is the correct output for proper nouns and brand names — it is not an error
- Low LIT ratio (< 0.2) indicates good vocabulary coverage

---

## 3. Compact Format

Every token serializes to a single string for model consumption.

| Type      | Format               | Example          |
| --------- | -------------------- | ---------------- |
| ROOT      | `ROOT:<field>`       | `ROOT:write`     |
| ROOT (L2) | `ROOT:<field>.<sub>` | `ROOT:tech.code` |
| ROLE      | `ROLE:<role>`        | `ROLE:agent`     |
| REL       | `REL:<relation>`     | `REL:in`         |
| STR       | `STR:<marker>`       | `STR:negation`   |
| LIT       | `LIT:<surface>`      | `LIT:iPhone`     |

A sentence becomes a compact sequence:

```
"the writer published a book"
→  ROOT:write ROLE:agent ROOT:write ROLE:instance
```

```
"لا تكتب على الجدار"
→  STR:negation STR:imperative ROOT:write REL:on ROOT:structure
```

---

## 4. Semantic Fields

### 4.1 Level-1 Fields (42)

These are stable. Renaming one is a **breaking change** (invalidates nemo HDC atom vectors, SEED=42).

| Group                      | Fields                                                               |
| -------------------------- | -------------------------------------------------------------------- |
| Cognition & Communication  | `know` `think` `speak` `write` `see` `feel` `decide`                 |
| Action & Creation          | `make` `create` `destroy` `change` `fix` `work` `enable`             |
| Movement & Transfer        | `move` `send` `give` `take` `gather` `hold` `open` `hide` `connect`  |
| Existence & State          | `exist` `rest` `want`                                                |
| Social & Power             | `govern` `fight` `trade` `social` `possess`                          |
| Domain Knowledge           | `science` `health` `tech` `art` `sport`                              |
| Physical World             | `nature` `weather` `animal` `plant` `body` `food` `material` `color` |
| Space, Time & Measure      | `time` `place` `dwell` `structure` `size` `measure` `quality`        |
| Classification & Reference | `person` `name` `contain` `force`                                    |

### 4.2 Level-2 Fields (dot notation)

Level-2 fields refine a level-1 parent. A model that only knows level-1 still works — it uses the parent field.

```
tech.code      tech.ai       tech.hardware   tech.network   tech.iot      tech.security
health.symptom health.drug   health.treatment health.fitness
social.family  social.org    social.contact  social.community
time.alarm     time.calendar time.duration
trade.price    trade.order   trade.stock     trade.currency
know.search    know.read     know.news       know.question
speak.command  speak.greeting speak.farewell
move.drive     move.fly      move.walk       move.ride
place.city     place.country place.home      place.route
weather.rain   weather.temp  weather.forecast
art.music      art.film      art.visual      art.book
food.recipe    food.restaurant food.nutrition
```

**HDC encoding of L2:** `bind(atom(level1), atom(qualifier))`
Retrieving `tech.code` automatically decomposes to `tech` + `code` in the vector space.

---

## 5. Morphological Roles (23)

These are the وزن patterns, expressed as language-agnostic role names.
The role names are **not Arabic labels** — they are universal derivational relationships.
Every language has these concepts; Arabic just makes them structurally explicit.

| Role          | Arabic وزن                        | Arabic Example       | English Example               | Meaning                      |
| ------------- | --------------------------------- | -------------------- | ----------------------------- | ---------------------------- |
| `agent`       | فَاعِل                            | كَاتِب               | writer, teacher               | one who does                 |
| `patient`     | مَفْعُول / فَعِيل                 | مَكْتُوب، كَبِير     | written, employed             | one affected / quality adj   |
| `instance`    | فِعَال / تَفْعِيل / فُعُول        | كِتَاب، تَعْلِيم     | writing, teaching             | the act/noun itself (مصدر)   |
| `state`       | فَعَالة / فِعَالة / فَعلان        | كِتَابة، غَضبان      | kindness, strength            | quality noun / ongoing state |
| `place`       | مَفْعَلة / مَفْعَل / مَفْعِل      | مَكْتَبة، مَدرَسة    | library, factory              | where it happens (اسم مكان)  |
| `instrument`  | مِفْعَال / فَاعُول / مِفْعَل      | مِفتاح، حاسوب        | key, computer, typewriter     | tool used to do it (اسم آلة) |
| `possible`    | قَابِل / مَفعُول                  | مَقْرُوء             | readable, buildable           | can be done                  |
| `comparative` | أَفْعَل                           | أَكْبَر، أَجمَل      | bigger, better, more          | comparative / superlative    |
| `negate`      | —                                 | —                    | unwrite, disconnect           | reversal                     |
| `repeat`      | —                                 | —                    | rewrite, rebuild              | again                        |
| `before`      | —                                 | —                    | pre-arrange                   | prior                        |
| `wrong`       | —                                 | —                    | misread, misjudge             | error                        |
| `excess`      | —                                 | —                    | overwrite, overload           | too much                     |
| `mutual`      | تَفَاعُل / فِعَال (Form III/VI)   | تَعاوُن، مُكاتَبة    | cooperate, correspond         | reciprocal / shared action   |
| `reflexive`   | اِفْتِعَال (Form VIII)            | اِجتِماع، اِشتِراء   | self-organize, buy (for self) | self-directed action         |
| `result`      | اِنْفِعَال (Form VII)             | اِنكِسَار، اِنحِلال  | it broke, dissolved           | passive resultative          |
| `manner`      | —                                 | بِسُرْعة             | quickly, carefully            | adverb                       |
| `past`        | فَعَلَ (past)                     | كَتَبَ               | wrote, built                  | completed action             |
| `plural`      | فُعَلاء / أَفعال / فِعَل / فُعُول | كُتَّاب، أَقلام      | writers, books, pens          | multiple (broken plural)     |
| `intensifier` | فَعَّال / تَفعيل (Form II)        | كَتَّاب، عَلَّمَ     | prolific writer, to intensify | intensive action / amplified |
| `causer`      | مُفْعِل / إِفعال (Form IV)        | مُعَلِّم، أَرسَلَ    | teacher, caused sending       | causes the root action       |
| `seeker`      | مُسْتَفعِل / اِستِفعال (Form X)   | مُستَكتِب، استَعمَلَ | one who seeks, to employ      | seeks / requests the root    |
| `process`     | مُفَاعَلة (Form III masdar)       | مُكَاتَبة            | correspondence                | ongoing mutual process       |

### 5.1 Arabic Pattern Detection — Full Specification

Patterns are matched on the **normalized, clitic-stripped stem** (diacritics removed, ة→ه, ى→ي).
Patterns are tested **longest/most-specific first** so longer prefixes win.
Where possible, use regex capture groups to extract the three root consonants (ف ع ل).

Let `C` = any Arabic letter `[\u0621-\u064A]`.

**Tier 1 — 7+ char patterns (most specific):**

| Pattern   | Wazn    | Regex shape        | Role     |
| --------- | ------- | ------------------ | -------- |
| اِستِفعال | استفعال | `^استC₁C₂اC₃$` (7) | `seeker` |

**Tier 2 — 6-char patterns:**

| Pattern   | Wazn   | Regex shape                 | Role          |
| --------- | ------ | --------------------------- | ------------- |
| مُفاعَلة  | مفاعلة | `^مC₁اC₂C₃ه$` (6, ends ه=ة) | `process`     |
| تَفعيل    | تفعيل  | `^تC₁C₂يC₃$` (6)            | `intensifier` |
| مَفعُول+ه | —      | `^مC₁C₂وC₃ه$` (6)           | `patient`     |
| مَفعَلة   | مفعلة  | `^مC₁C₂C₃ه$` (6, stem[3]≠و) | `place`       |

**Tier 3 — 5-char patterns:**

| Pattern   | Wazn   | Regex shape                               | Role         |
| --------- | ------ | ----------------------------------------- | ------------ |
| اِستَفعَل | استفعل | `^استC₁C₂C₃$` (6)                         | `seeker`     |
| اِنفَعَل  | انفعل  | `^انC₁C₂C₃$` (5)                          | `result`     |
| اِفتَعَل  | افتعل  | `^اC₁تC₂C₃$` (5)                          | `reflexive`  |
| تَفاعُل   | تفاعل  | `^تC₁اC₂C₃$` (5, stem[2]=ا)               | `mutual`     |
| مَفعُول   | مفعول  | `^مC₁C₂وC₃$` (5, stem[3]=و)               | `patient`    |
| مِفعال    | مفعال  | `^مC₁C₂اC₃$` (5, stem[3]=ا)               | `instrument` |
| مَفعِل    | مفعل   | `^مC₁C₂C₃$` (5, stem[0]=م, no trailing ه) | `place`      |
| فاعِل+ه   | —      | `^C₁اC₂C₃ه$` (5)                          | `agent`      |
| فَعلان    | فعلان  | `^C₁C₂لان$` or ends `ان`                  | `state`      |

**Tier 4 — 4-char patterns:**

| Pattern | Wazn  | Regex shape                            | Role          |
| ------- | ----- | -------------------------------------- | ------------- |
| فاعِل   | فاعل  | `^C₁اC₂C₃$` (4, stem[1]=ا)             | `agent`       |
| مَفعَل  | مفعل  | `^مC₁C₂C₃$` (4, stem[0]=م)             | `place`       |
| فاعول   | فاعول | `^C₁اC₂وC₃$` (5, stem[3]=و after alef) | `instrument`  |
| فَعيل   | فعيل  | `^C₁C₂يC₃$` (4, stem[2]=ي)             | `patient`     |
| فِعال   | فعال  | `^C₁C₂اC₃$` (4, stem[2]=ا)             | `instance`    |
| أَفعَل  | افعل  | `^اC₁C₂C₃$` (4, stem[0]=ا)             | `comparative` |

**Implementation note (current code):** The existing `detectRoleAr()` only covers 6 conditions (basic فاعل, مفعول, مفعلة, تفاعل). The full regex-based table above is the **target specification** for the improved implementation.

### 5.2 English Pattern Detection

Morphological stripping maps suffix/prefix → role.
Longest match wins (e.g., `-ation` before `-tion` before `-ion`).

**Suffix rules:**

| Suffix                               | Role          | Example               | Arabic analog  |
| ------------------------------------ | ------------- | --------------------- | -------------- |
| `-er` / `-or`                        | `agent`       | writer, director      | فاعِل          |
| `-ation` / `-tion` / `-sion`         | `instance`    | creation, discussion  | تَفعيل / فِعال |
| `-ment`                              | `instance`    | movement, agreement   | مصدر           |
| `-ness` / `-ity` / `-ance` / `-ence` | `state`       | kindness, clarity     | فَعالة         |
| `-able` / `-ible`                    | `possible`    | readable, buildable   | —              |
| `-ive`                               | `agent`       | creative, destructive | فاعِل (active) |
| `-ing`                               | `instance`    | writing, building     | مصدر           |
| `-ed`                                | `past`        | wrote, built          | فَعَلَ past    |
| `-ly`                                | `manner`      | quickly, carefully    | بِفَعالة       |
| `-er` / `-est` (comparative)         | `comparative` | bigger, fastest       | أَفعَل         |

**Prefix rules:**

| Prefix        | Role        | Example              | Arabic analog       |
| ------------- | ----------- | -------------------- | ------------------- |
| `un-`         | `negate`    | unwrite, unclear     | نفي                 |
| `re-`         | `repeat`    | rewrite, rebuild     | إعادة               |
| `dis-`        | `negate`    | disconnect, disagree | نفي                 |
| `mis-`        | `wrong`     | misread, misjudge    | خطأ                 |
| `over-`       | `excess`    | overload, overwrite  | مبالغة              |
| `pre-`        | `before`    | pre-arrange, pre-set | قبل                 |
| `en-` / `em-` | `causer`    | enable, empower      | أَفعَلَ Form IV     |
| `self-`       | `reflexive` | self-organize        | اِفتَعَلَ Form VIII |

### 5.3 Arabic Verb Forms — الأبواب العشرة

Arabic has 10 derived verbal stems (أبواب). Each applies a predictable semantic
transformation to the root meaning. This is the core of Arabic morphological algebra.

When a verb form is detected on an input word (clitic-stripped), emit the ROOT for the
underlying root field **plus** the ROLE that the form implies.

| Form | Wazn       | Transformation                      | Masdar Pattern       | Maps to ROLE              |
| ---- | ---------- | ----------------------------------- | -------------------- | ------------------------- |
| I    | فَعَلَ     | base action                         | فِعال / فَعل / فُعول | _(no ROLE — just ROOT)_   |
| II   | فَعَّلَ    | INTENSIFY(root) / CAUSE(root)       | تَفعيل               | `intensifier` or `causer` |
| III  | فاعَلَ     | WITH(root) — mutual/shared          | مُفاعَلة             | `mutual`                  |
| IV   | أَفعَلَ    | CAUSE(root) — transitive causation  | إفعال                | `causer`                  |
| V    | تَفَعَّلَ  | BECOME(Form II) — reflexive         | تَفَعُّل             | `reflexive`               |
| VI   | تَفاعَلَ   | RECIPROCAL(root) — mutual reflexive | تَفاعُل              | `mutual`                  |
| VII  | اِنفَعَلَ  | RESULT(root) — passive/resultative  | اِنفِعال             | `result`                  |
| VIII | اِفتَعَلَ  | SELF(root) — reflexive/middle       | اِفتِعال             | `reflexive`               |
| IX   | اِفعَلَّ   | color/defect intransitive (rare)    | اِفعِلال             | `state`                   |
| X    | اِستَفعَلَ | REQUEST(root) — seek/request action | اِستِفعال            | `seeker`                  |

**Examples (root ك-ت-ب):**

| Form | Surface    | Meaning                            | Tokens                        |
| ---- | ---------- | ---------------------------------- | ----------------------------- |
| I    | كَتَبَ     | he wrote                           | `ROOT:write`                  |
| II   | كَتَّبَ    | he made (many) write               | `ROOT:write ROLE:intensifier` |
| III  | كاتَبَ     | he corresponded with               | `ROOT:write ROLE:mutual`      |
| IV   | أَكتَبَ    | he dictated to (caused writing)    | `ROOT:write ROLE:causer`      |
| V    | تَكَتَّبَ  | he got enrolled (reflexive)        | `ROOT:write ROLE:reflexive`   |
| VI   | تَكاتَبَ   | they wrote to each other           | `ROOT:write ROLE:mutual`      |
| VII  | اِنكَتَبَ  | it got registered / was written up | `ROOT:write ROLE:result`      |
| VIII | اِكتَتَبَ  | he subscribed / wrote himself in   | `ROOT:write ROLE:reflexive`   |
| X    | اِستَكتَبَ | he asked for writing / dictated    | `ROOT:write ROLE:seeker`      |

**Form II vs Form IV disambiguation:**

- Form II (فَعَّلَ): intensification of existing action — `علَّمَ` (to teach = intensify knowing)
  → ROLE:intensifier when the meaning is amplified, ROLE:causer when causative
- Form IV (أَفعَلَ): direct causation with أ prefix — `أَرسَلَ` (sent = caused to go)
  → ROLE:causer (the أ prefix is a reliable marker)

### 5.4 Arabic Nominal Taxonomy — اسم المشتق

Arabic derives seven canonical noun types from every root.
This is the full taxonomy every Arabic adapter must recognize:

| Arabic Name                                   | Wazn / Pattern                | Role          | Example (root ك-ت-ب)               | English analog           |
| --------------------------------------------- | ----------------------------- | ------------- | ---------------------------------- | ------------------------ |
| اسم الفاعل (active participle)                | فاعِل                         | `agent`       | كاتِب (writer)                     | -er suffix               |
| اسم المفعول (passive participle)              | مَفعُول                       | `patient`     | مَكتُوب (written)                  | past participle          |
| اسم المكان / الزمان (place/time noun)         | مَفعَل / مَفعِل / مَفعَلة     | `place`       | مَكتَب (office), مَكتَبة (library) | -ry, -ory suffix         |
| اسم الآلة (instrument noun)                   | مِفعال / فاعول / مِفعَل       | `instrument`  | مِكتاب (typewriter), مِفتاح (key)  | -er (tool sense)         |
| اسم التفضيل (elative / comparative)           | أَفعَل                        | `comparative` | أَكثَر (more), أَكبَر (bigger)     | -er / -est / more        |
| المصدر (verbal noun / masdar)                 | فِعال / فَعل / فُعول / تَفعيل | `instance`    | كِتابة (writing), دُخول (entry)    | -ing / -tion             |
| الصفة المشبهة (quasi-adj / permanent quality) | فَعيل / فَعلان / فَعِل        | `state`       | كَبير (big), غَضبان (angry)        | adjectives in -ish, -ful |

**Key distinction — `instrument` vs `agent` vs `causer`:**

- `agent` (فاعِل كاتِب): the **person** who performs the action
- `instrument` (مِفعال مِكتاب): the **tool/device** used for the action
- `causer` (مُفعِل مُعَلِّم): the **entity that causes** another to perform the action

These three are commonly confused. Always check prefix: م+C+... without initial ا/أ and with kasra on م = مِفعال = instrument.

---

## 6. Structural Markers (STR)

Eleven markers. Emitted **before** the clause they govern.
Multiple STR tokens may appear in one sentence.

| Marker        | Arabic Triggers                                                      | English Triggers                                       | Notes                                                                                                                                                                                                                 |
| ------------- | -------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `question`    | ؟، هل، أ، ما، من، أين، متى، كيف، لماذا                               | ?, is, are, do, does, what, who, where, when, why, how |                                                                                                                                                                                                                       |
| `negation`    | **لا** (present)، **لم** (past)، **لن** (future)، ليس، ما            | not, no, never, cannot                                 | Tense-aware. **لا** → `STR:negation` only. **لم** → `STR:past` + `STR:negation` (two tokens — لم carries past tense itself). **لن** → `STR:future` + `STR:negation` (two tokens). **ليس / ما** → `STR:negation` only. |
| `modal`       | يمكن، ابغي، أريد، ممكن، أقدر                                         | can, could, should, would, want, need, must            |                                                                                                                                                                                                                       |
| `past`        | (past verb form detected)                                            | past tense verbs, did, was, were                       |                                                                                                                                                                                                                       |
| `future`      | سـ، سوف، بكرة، غداً                                                  | will, going to, tomorrow, soon                         |                                                                                                                                                                                                                       |
| `imperative`  | verb-initial command form                                            | imperative verb form, please, go, stop                 |                                                                                                                                                                                                                       |
| `conditional` | **إذا** (real/likely)، **لو** (hypothetical)، **إن** (general)، لولا | if, unless, provided, whether                          | إذا = likely condition; لو = counterfactual. Both → STR:conditional.                                                                                                                                                  |
| `cause`       | لأن، بسبب، لذلك، إذن                                                 | because, since, therefore, so, thus                    |                                                                                                                                                                                                                       |
| `emphasis`    | إنّ، إنَّ، لَـ (laam tawkid)، قد + past verb                         | indeed, certainly, definitely, surely, already         | إنّ reinforces the whole clause. قد + past = "already did". قد + present = "might" (→ STR:modal instead).                                                                                                             |
| `greeting`    | مرحبا، أهلا، السلام عليكم، صباح الخير                                | hello, hi, good morning, hey                           |                                                                                                                                                                                                                       |
| `farewell`    | مع السلامة، وداعاً، باي، إلى اللقاء                                  | bye, goodbye, see you, take care                       |

---

## 7. Relational Categories (REL)

Twenty categories. Covers prepositions, conjunctions, and relative words.

**Critical distinction:**

- `in` (في) — location/containment: "in the room", "in the morning"
- `on` (على) — surface/obligation/against: "on the table", "obligated to pay", "against them"
- These two are **not interchangeable** and must be separate categories.

| Category    | Arabic                     | English                              | Notes                                                      |
| ----------- | -------------------------- | ------------------------------------ | ---------------------------------------------------------- |
| `in`        | في                         | in, at, within, inside               | containment / location                                     |
| `on`        | على                        | on, upon, against, must (obligation) | surface / obligation / opposition — distinct from `in`     |
| `to`        | إلى                        | to, toward, into                     |                                                            |
| `from`      | من                         | from, out of, since, of (partitive)  |                                                            |
| `with`      | بـ (instrument)، مع        | with, by means of, using             | بـ = instrument; مع = accompaniment                        |
| `for`       | لـ، من أجل                 | for, in order to, because of         | beneficiary / purpose                                      |
| `before`    | قبل                        | before, prior to                     |                                                            |
| `after`     | بعد                        | after, following                     |                                                            |
| `until`     | حتى، إلى أن                | until, up to, as far as              | limit / deadline                                           |
| `during`    | أثناء، خلال                | while, during, throughout            | بينما belongs to `contrast` (whereas); do NOT list it here |
| `about`     | عن، حول                    | about, regarding, concerning, away   | عن = away-from / about                                     |
| `of`        | إضافة (genitive construct) | of, 's                               | possessive / composition                                   |
| `like`      | مثل، كـ                    | like, similar to, as                 |                                                            |
| `than`      | من (تفضيل)                 | than, more than, compared to         | comparative context only                                   |
| `and`       | و، ثم، كذلك، أيضا          | and, also, plus, then                |                                                            |
| `or`        | أو، إما                    | or, either                           |                                                            |
| `contrast`  | لكن، رغم، بينما، بل        | but, however, despite, rather        |                                                            |
| `causes`    | لأن، بسبب، لذا، فـ         | because, since, therefore, so        | logical causation                                          |
| `condition` | لو، إذا، إن، إلا           | if, unless, provided that            |                                                            |
| `without`   | بدون، دون، من غير          | without, lacking, absent             |

---

## 8. Language Adapter Specification

CST is language-agnostic. The algebra (ROOT, ROLE, REL, STR) is fixed.
A **language adapter** maps surface forms to this algebra.

### 8.1 What Every Adapter Must Provide

1. **Normalization** — canonical form (lowercase, diacritics, encoding normalization)
2. **Function word table** — words to skip entirely (articles, copula, pronouns not carrying meaning)
3. **STR table** — surface triggers → STR marker
4. **REL table** — surface prepositions/conjunctions → REL category
5. **Words vocab** (`words.json`) — surface forms → field name; for irregular words, loanwords, broken plurals, and forms that do not reduce cleanly to a stem. Consulted at lookup step 5 (before segmentation).
6. **Stems vocab** (`stems.json`) — stripped stems/roots → field name; consulted at lookup step 6 (after segmentation).
7. **Compound vocab** (`compounds.json`) — multi-word phrases → field name (bigrams at minimum).
8. **Role detection** — morphological pattern → ROLE (the وزن mapping)
9. **Segmentation** — strip affixes/clitics to expose the root before lookup

### 8.2 Adapter Priority Order (lookup ladder)

Every adapter must follow this lookup order for each word:

```
1. Function word?           → skip (emit nothing)
2. STR map hit?             → emit STR token, continue sentence
3. REL map hit?             → emit REL token
4. Compound bigram match?   → emit ROOT token
5. words.json hit?          → emit ROOT token (+ ROLE if detected)
6. stems.json hit?          → emit ROOT token (+ ROLE if detected)
7. Segmentation + retry 5/6 → strip clitics/affixes, retry steps 5–6
8. Aug-verb strip + retry   → strip derivational prefixes, retry steps 5–6
9. No match                 → emit LIT token
```

ROLE detection runs **after** a ROOT match at step 5, 6, 7, or 8.

### 8.3 Adding a New Language

To add language X (e.g., French, Turkish, Hindi):

1. Create `src/tokenizer/xx.ts` implementing the adapter interface
2. Add vocab files under `vocab/xx/`:
   - `words.json` — surface form → field; irregular words, loanwords, direct lookups (step 5)
   - `stems.json` — stripped stem → field; reached after segmentation (step 6)
   - `compounds.json` — multi-word phrases → field
   - `structural.json` — STR triggers (values must exist in `spec/structural.json`)
   - `relations.json` — REL triggers (values must exist in `spec/relations.json`)
   - `function-words.json` — skip list
3. Implement `detectRole(stem)` using language X's morphological patterns
4. Map those patterns to the **same 23 roles** from `spec/roles.json`
5. The output tokens are identical in structure to English and Arabic tokens

**The Arabic morphological role names are not Arabic-specific labels.**
They describe universal derivational relationships that exist in every language.
French `-eur` → `agent`, Turkish `-ici` → `agent`, Hindi `-कार` → `agent`.

### 8.4 Vocab Directory Structure

This is the canonical layout every CST installation must follow:

```
vocab/
  spec/                    ← universal atoms — shared by all language adapters
    fields.json            ← all field names (L1 + L2)
    roles.json             ← all 23 role names
    relations.json         ← all 20 REL category names
    structural.json        ← all 11 STR marker names

  ar/                      ← Arabic adapter
    words.json             ← surface forms: loanwords, broken plurals, irregular forms
    stems.json             ← normalized Arabic root stems (post-segmentation lookup)
    compounds.json         ← multi-word Arabic phrases
    relations.json         ← Arabic surface triggers → REL atom
    structural.json        ← Arabic surface triggers → STR atom
    function-words.json    ← Arabic words to skip entirely

  en/                      ← English adapter
    words.json             ← irregular English words, direct lookups
    stems.json             ← English base stems (verb/noun base forms)
    compounds.json         ← English multi-word phrases
    relations.json         ← English prepositions → REL atom
    structural.json        ← English STR triggers (not, will, can, if, because…)
    function-words.json    ← English words to skip entirely

  xx/                      ← Any future language follows the same layout
```

**The ratio of stems.json to words.json differs by language:**

- Arabic: HIGH stems coverage — most words derive from a root + pattern via segmentation
- English: MEDIUM stems coverage — base forms cover most nouns/verbs; irregular forms go in words.json
- Morphology-free languages (e.g., Mandarin): empty stems.json; all entries in words.json

---

## 9. Arabic Adapter — Full Specification

### 9.1 Normalization

Applied to the full input text before any lookup:

1. Strip all diacritics (U+064B–U+065F, U+0670)
2. Remove tatweel / kashida (U+0640)
3. Unify alef variants (أ إ آ ٱ → ا)
4. ى → ي
5. ؤ → و
6. ة → ه (tā-marbūṭah — applied at text level, so lookup keys use ه)

### 9.2 Clitic Segmentation (strict order — DO NOT reorder)

```
1. Conjunction prefix:   و / ف  →  strip if remaining len > 2
2. لل contraction     →  strip 2 chars (للكتاب → كتاب)
   OR prep prefix:    ب / ل / ك  →  strip if remaining len > 2
3. Definite article:  ال  →  strip if remaining len > 1
4. Object/possessive suffix (longest first):
   هم / هن / كم / ها / ه / ك / نا / ي  →  strip if remaining len ≥ 2
5. ة → ه  (tā-marbūṭah on stem — after suffix strip)
6. Trailing accusative alef  →  strip if len > 3
```

After segmentation, retry the vocab lookup (step 5/6 of the priority ladder).

### 9.3 Augmented Verb Prefix Stripping

After clitic segmentation fails, attempt:

| Prefix | Represents           | Strip if remaining len > |
| ------ | -------------------- | ------------------------ |
| است    | Form X (استفعل)      | 5                        |
| ت      | Form V/VI            | 4                        |
| ا      | 1st-person imperfect | 3                        |

### 9.4 Morphological Role Detection

Apply the full pattern-detection tier system from **§5.1** in order (Tier 1 → Tier 2 → Tier 3 → Tier 4).
The input is the **normalized, clitic-stripped, aug-stripped stem**.

**Role emission decision — the critical rule:**

| Condition                                             | Action                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| Pattern matches AND extracted root is in `stems.json` | emit `ROOT:<field>` + `ROLE:<role>`                                               |
| Pattern matches BUT root is **not** in `stems.json`   | emit `LIT:<surface>` — pattern alone is insufficient; ROOT requires a valid field |
| No pattern matches AND stem is in `stems.json`        | emit `ROOT:<field>` only (no ROLE)                                                |
| No pattern matches AND stem not in any vocab          | emit `LIT:<surface>`                                                              |

> **Current code status:** `detectRoleAr()` implements only the 6 basic heuristics
> (فاعل, مفعول, مفعلة, تفاعل). Upgrading to the full §5.1 tier system is the next
> implementation milestone.

### 9.5 Special Arabic Constructs

**Compound negation — لم / لن emit two STR tokens:**

| Particle | STR tokens emitted            | Reason                          |
| -------- | ----------------------------- | ------------------------------- |
| لا       | `STR:negation`                | negates present / imperative    |
| لم       | `STR:past` + `STR:negation`   | inherently carries past tense   |
| لن       | `STR:future` + `STR:negation` | inherently carries future tense |
| ليس / ما | `STR:negation`                | tense provided by context       |

**Idafa — الإضافة (genitive construct):**
Arabic expresses possession/composition by direct noun adjacency with no particle.

```
مكتبةُ المدرسة  (the school's library)
→  ROOT:write ROLE:place  ROOT:govern ROLE:place
```

No `REL:of` is inserted for Idafa. The model learns the genitive relation from
adjacent ROOT tokens. If an explicit relation token is required, the phrase
must be entered as a compound in `compounds.json`.

**Vocative يا (direct address particle):**
يا is a pre-name particle (يا محمد = O Muhammad). It carries no root-level content.
Treat as a function word → **skip** (emit nothing). Only the following name emits `LIT`.

**Dual — المثنى (ان / ين suffix):**
Arabic duals suffix with ان (nominative) or ين (accusative/genitive): كاتبان (two writers).
These suffixes are NOT in the clitic-strip list and will NOT be auto-stripped.
Dual forms that matter for the domain should be added to `words.json` as individual entries.
Unrecognized duals fall through to `LIT`. Number is not tracked by the tokenizer — it is a
model concern.

**Broken plurals — جمع التكسير:**
Arabic broken plurals (كُتَّاب، كُتُب، مكاتب) do not share the singular pattern.
They must be entered explicitly in `stems.json` or `words.json`.
The `plural` ROLE is emitted only when the broken plural form IS in vocab and is
identified as such (either via the فُعَلاء/أَفعال pattern or a vocab flag).

---

## 10. English Adapter — Full Specification

### 10.1 Normalization

```
1. NFKC Unicode normalization
2. Curly/smart quotes → straight quotes
3. n't → " not"   (can't → can not)
4. 's  → drop     (John's → John)
5. 're → " are"
6. 've → " have"
7. 'll → " will"
8. 'd  → " would"
9. 'm  → " am"
```

### 10.2 Function Words (skip list)

```
a, an, the, is, are, be, been, being,
i, you, he, she, it, we, they, me, him, her, us, them,
my, your, his, its, our, their,
this, that, these, those,
have, has, do, does, am, get, got
```

### 10.3 Morphological Role Detection

See **§5.2** for the full English pattern detection spec including Arabic analogues.

Suffix rules (longest match wins). `-ation` must be tried before `-tion` before `-ion`.

**Critical ambiguity for `-er`:** the role depends on the stripped stem's field:

- stripped stem is an **action field** (write, build, teach) → `agent` (writer, builder)
- stripped stem is a **quality / size / state field** (big, tall, fast) → `comparative` (bigger)
- If the comparative form is irregular (good→better), add it to `words.json` with `ROLE:comparative`.

| Suffix                                  | Role          |
| --------------------------------------- | ------------- |
| `-er`, `-or` (action-field stem)        | `agent`       |
| `-er`, `-est` (quality/size-field stem) | `comparative` |
| `-ation`, `-tion`, `-sion`              | `instance`    |
| `-ment`                                 | `instance`    |
| `-ness`, `-ity`, `-ance`, `-ence`       | `state`       |
| `-able`, `-ible`                        | `possible`    |
| `-ive`                                  | `agent`       |
| `-ing`                                  | `instance`    |
| `-ed`                                   | `past`        |
| `-ly`                                   | `manner`      |

Prefix rules:

| Prefix        | Role        |
| ------------- | ----------- |
| `un-`         | `negate`    |
| `re-`         | `repeat`    |
| `dis-`        | `negate`    |
| `mis-`        | `wrong`     |
| `over-`       | `excess`    |
| `pre-`        | `before`    |
| `en-` / `em-` | `causer`    |
| `self-`       | `reflexive` |

---

## 11. Worked Examples

### 11.1 Arabic — Simple Statement

Input: `كاتب مشهور`

```
Word      Norm    Lookup             Tokens emitted
───────────────────────────────────────────────────────
كاتب      كاتب    stems.json → write  ROOT:write
                  detectRoleAr: فاعل  ROLE:agent
مشهور     مشهور   no match            LIT:مشهور
```

Token stream: `ROOT:write  ROLE:agent  LIT:مشهور`

---

### 11.2 Arabic — Negation + Command

Input: `لا تكتب على الجدار`

```
Word    Norm    Lookup               Tokens emitted
────────────────────────────────────────────────────────
لا      لا      structural → negation STR:negation
تكتب    تكتب    aug-strip → كتب       ROOT:write
                (no role pattern)
على     على     relations → on        REL:on
الجدار  جدار    direct → structure    ROOT:structure
```

Token stream: `STR:negation  ROOT:write  REL:on  ROOT:structure`

---

### 11.3 Arabic — Future Tense with Prep

Input: `سأكتب رسالة للمعلم`

```
Word     Norm     Lookup                Tokens emitted
──────────────────────────────────────────────────────────────
سأكتب    ساكتب    STR → future (سـ)     STR:future
                  aug-strip a → كتب      ROOT:write
رسالة    رساله    direct → send         ROOT:send
للمعلم   المعلم   segment (لل→) → معلم   ROOT:know  ROLE:causer
                  detectRoleAr: causer
```

Token stream: `STR:future  ROOT:write  ROOT:send  ROOT:know  ROLE:causer`

---

### 11.4 English — Agent + Instance

Input: `the writer published a book`

```
Word       Lower    Lookup                     Tokens emitted
─────────────────────────────────────────────────────────────────
the        —        function word → skip
writer     writer   morph strip (-er) → write   ROOT:write  ROLE:agent
published  published morph strip (-ed) → publish  ROOT:write  ROLE:past
a          —        function word → skip
book       book     stems → write               ROOT:write  ROLE:instance
```

Token stream: `ROOT:write  ROLE:agent  ROOT:write  ROLE:past  ROOT:write  ROLE:instance`

---

### 11.5 English — Modal + L2 Field

Input: `can you set an alarm for tomorrow`

```
Word      Lower    Lookup               Tokens emitted
────────────────────────────────────────────────────────
can       can      structural → modal   STR:modal
you       —        function word → skip
set       set      stems → time.alarm   ROOT:time.alarm
an        —        function word → skip
alarm     alarm    stems → time.alarm   ROOT:time.alarm
for       for      relations → for      REL:for
tomorrow  tomorrow structural → future  STR:future
```

Token stream: `STR:modal  ROOT:time.alarm  ROOT:time.alarm  REL:for  STR:future`

---

### 11.6 Cross-Language Equivalence

These three sentences produce **identical token streams**:

| Language                | Input                  |
| ----------------------- | ---------------------- |
| Arabic                  | كاتب الكتاب            |
| English                 | the writer of the book |
| French (future adapter) | l'écrivain du livre    |

Token stream (all three): `ROOT:write  ROLE:agent  REL:of  ROOT:write  ROLE:instance`

This is the proof that CST's algebra is language-agnostic.

---

## 12. What CST Does NOT Do

| What                              | Why Not                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CMP:write:agent` compound tokens | Replaced by ROOT + separate ROLE — composes better                                                                                                                 |
| `FEAT:def` / `FEAT:f` / `FEAT:m`  | Gender, definiteness, number are not semantic — they are surface noise                                                                                             |
| `FEAT:asp:i`                      | Aspect/tense is captured by STR:past / STR:future — not per-token                                                                                                  |
| Dependency parse tree             | Not needed for field/role algebra; models infer syntax from order                                                                                                  |
| Named entity typing               | LIT preserves names; type classification is a model concern, not a tokenizer concern                                                                               |
| Part-of-speech tags               | Subsumed by ROOT (noun/verb) + ROLE (derivation); finer POS adds no semantic value here                                                                            |
| Word sense disambiguation         | Handled by field (semantic space) + role; fine-grained WSD is a model concern                                                                                      |
| Attached pronoun referents        | Possessive/object suffixes (ـه/ـها/ـهم/ـك) are stripped during clitic segmentation; the referenced entity is discarded — coreference resolution is a model concern |
| Idafa implicit REL:of             | الإضافة (genitive construct) emits consecutive ROOT tokens with no REL:of between them — see §9.5                                                                  |
| Vocative يا / address particle    | يا is a function word (skip); only the name after it emits LIT — see §9.5                                                                                          |
| Dual / broken plural inflection   | Dual ان/ين and broken plural forms are not auto-derived; enter in `words.json` or they fall to LIT — see §9.5                                                      |

---

## 13. Hard Constraints

These must never be violated without a major version bump:

1. `FIELDS_L1` has exactly 42 names. Renaming or removing any is a breaking change for nemo (HDC atom vectors, SEED=42).
2. `ROLES` has exactly 23 names (agent, patient, instance, state, place, instrument, possible, comparative, negate, repeat, before, wrong, excess, mutual, reflexive, result, manner, past, plural, intensifier, causer, seeker, process).
3. `STR_MARKERS` has exactly 11 names (includes `emphasis`).
4. `RELATION_CATS` has exactly 20 names (includes `on` and `until`).
5. Token types are exactly: `ROOT | ROLE | REL | STR | LIT`. No others.
6. `compact` format is exactly: `TYPE:value` — colon-separated, no spaces.
7. `surface` is never modified, never dropped.
8. ROLE shares the same `surface` and `offset` as its ROOT.
9. Clitic segmentation order in Arabic is fixed (Section 9.2). Reordering causes false strips.
10. Single-word vocab entries go in `words.json` (surface, pre-segmentation) or `stems.json` (post-segmentation). Multi-word phrases go in `compounds.json`. A phrase with a space in either single-word file will silently never match.
11. All vocab keys in Arabic files use the **normalized** form (no diacritics, ة→ه, ى→ي, etc.).
12. New fields must be added to `spec/fields.json`, `src/spec.ts`, both language tokenizers, `encoder.ts`, and `prep.ts` before any vocab file uses them.
13. No key may appear in BOTH `stems.json` AND `words.json` of the same language adapter. This is a duplicate and is caught by `scripts/validate-vocab.ts`.
14. Every field value in any `stems.json`, `words.json`, or `compounds.json` must exist in `spec/fields.json`. Every REL value in any `relations.json` must exist in `spec/relations.json`. Every STR value in any `structural.json` must exist in `spec/structural.json`. Validated by `scripts/validate-vocab.ts`.
15. No key in `stems.json` or `words.json` may contain a space — entries with spaces belong in `compounds.json`.
16. `spec/` files are append-only at the minor version level. Removing or renaming any atom in `spec/` is a major version bump.

---

## 14. Token Stream Validation Rules

A valid CST output satisfies:

1. Every token has `type ∈ {ROOT, ROLE, REL, STR, LIT}`
2. Every token has `surface` (non-empty)
3. Every token has `compact` matching `^(ROOT|ROLE|REL|STR|LIT):[^\s]+$`
4. ROOT tokens have `field` in `FIELDS_L1 ∪ FIELDS_L2`
5. ROLE tokens have `role` in `ROLES`
6. REL tokens have `relation` in `RELATION_CATS`
7. STR tokens have `structure` in `STR_MARKERS`
8. LIT tokens have `compact === "LIT:" + surface`
9. Every ROLE token is immediately preceded (in the array) by a ROOT token with the same `surface`
10. `litRatio = lit / total ≤ 1.0`; good coverage is `litRatio < 0.2`

---

## 15. Versioning

| Change                                                         | Bump          |
| -------------------------------------------------------------- | ------------- |
| Bug fix, vocabulary addition                                   | Patch (0.2.x) |
| New field, new language adapter                                | Minor (0.x.0) |
| Rename/remove field, change token types, change compact format | Major (x.0.0) |

---

## 16. Improvements Over Previous Version

This revision incorporates lessons from the arabic-algebra-engine project and deeper analysis of Arabic صرف (morphology):

| Area                     | Previous            | Now                                        | Reason                                                    |
| ------------------------ | ------------------- | ------------------------------------------ | --------------------------------------------------------- |
| Roles                    | 19                  | 23                                         | Added `instrument`, `result`, `reflexive`, `comparative`  |
| Arabic pattern detection | 6 heuristics        | Full regex-based tier system               | More وزن patterns; proper instrument vs causer separation |
| Verb forms               | Undocumented        | Full الأبواب العشرة table                  | Each form predicts ROLE; critical for Arabic              |
| Nominal taxonomy         | Implicit            | Explicit 7-type اسم المشتق table           | Prevents instrument/agent/causer confusion                |
| STR markers              | 10                  | 11                                         | Added `emphasis` (إنّ / قد / لَـ)                         |
| REL categories           | 18                  | 20                                         | Added `on` (على, distinct from `in`), `until` (حتى)       |
| على mapping              | REL:in (wrong)      | REL:on (correct)                           | على ≠ في semantically                                     |
| Form II vs IV            | Both → `causer`     | II → `intensifier`/`causer`, IV → `causer` | Different derivational semantics                          |
| Negation detail          | All negation = same | لا/لم/لن noted as tense-aware              | Tense context from co-occurring STR:past/future           |

---

_Last updated: 2026-05-30_
_Source of truth: `/Users/emad/projects/msm-ai/cst/src/spec.ts` and `src/types.ts`_
