# @msm-core/cst

**Contextual Semantic Tokenizer** — zero-dependency, multilingual, reversible.

CST converts raw text into structured semantic tokens: each word is mapped to a field, role, relation, or structural marker. The token stream is designed to feed directly into HDC (Hyperdimensional Computing) models, LLM context injection, intent routing, and semantic search — without any external library.

```
"the teacher writes books"
→ ROOT:person  ROLE:agent  ROOT:write  ROLE:plural  ROOT:art.book  ROLE:plural
```

```
"سيكتب الكتاب"  (He will write the book)
→ STR:future  ROOT:write  ROOT:write
```

---

## Install

```bash
npm install @msm-core/cst
```

No runtime dependencies. Node 18+.

---

## Quick Start

```typescript
import {
  tokenize,
  tokenizeEn,
  tokenizeAr,
  digest,
  toLLMContext,
} from "@msm-core/cst";

// Auto-detect language
const { tokens } = tokenize("Can you help me write a report?");

// English
const en = tokenizeEn("I can't find the document");
console.log(digest(en.tokens));
// STR:negation ROOT:know.search ROOT:write

// Arabic
const ar = tokenizeAr("لا أعرف كيف أكتب التقرير");
console.log(digest(ar.tokens));
// STR:negation STR:question ROOT:write ROOT:work

// LLM context injection
console.log(toLLMContext(en.tokens));
// Intent: negation | Topics: know.search, write | Meaning: find=find, locate or discover; document=document, write down
```

---

## Token Types

Every token has one of five types. A content word emits a `ROOT` token and,
when a morphological pattern is detected, a **separate** `ROLE` token sharing the
same surface and offset (the "root × role" algebra):

| Type   | Meaning                                                   | compact format                 |
| ------ | --------------------------------------------------------- | ------------------------------ |
| `ROOT` | Content word mapped to a semantic field                   | `ROOT:write`, `ROOT:tech.code` |
| `ROLE` | Morphological role of the preceding ROOT (separate token) | `ROLE:agent`, `ROLE:past`      |
| `REL`  | Relational/function word (prep, conjunction)              | `REL:in`, `REL:causes`         |
| `STR`  | Sentence-level structural marker                          | `STR:negation`, `STR:future`   |
| `LIT`  | Unknown word, named entity, fallback                      | `LIT:iPhone`                   |

### CSTToken interface

```typescript
interface CSTToken {
  type: "ROOT" | "ROLE" | "REL" | "STR" | "LIT";
  surface: string; // exact word from input — never dropped
  compact: string; // serializable single string
  field?: string; // "write" | "tech.code" — ROOT only
  role?: string; // "agent" | "patient" — ROLE only
  relation?: string; // "in" | "causes" — REL only
  structure?: string; // "negation" | "modal" — STR only
  gloss?: string; // human-readable meaning from vocab
  lang: "en" | "ar" | "mixed";
  offset: [number, number]; // [start, end] char positions in input
  confidence: number; // 0.0 – 1.0
}
```

---

## Semantic Fields

CST uses a two-level field taxonomy. All 42 level-1 fields are stable and backwards-compatible with [@msm-core/nemo](https://github.com/msm-core/nemo).

### Level-1 (42 fields)

| Category              | Fields                                                               |
| --------------------- | -------------------------------------------------------------------- |
| Cognition & Comm.     | `know` `think` `speak` `write` `see` `feel` `decide`                 |
| Action & Creation     | `make` `create` `destroy` `change` `fix` `work` `enable`             |
| Movement & Transfer   | `move` `send` `give` `take` `gather` `hold` `open` `hide` `connect`  |
| Existence & State     | `exist` `rest` `want`                                                |
| Social & Power        | `govern` `fight` `trade` `social` `possess`                          |
| Domain Knowledge      | `science` `health` `tech` `art` `sport`                              |
| Physical World        | `nature` `weather` `animal` `plant` `body` `food` `material` `color` |
| Space, Time & Measure | `time` `place` `dwell` `structure` `size` `measure` `quality`        |
| Classification & Ref. | `person` `name` `contain` `force`                                    |

### Level-2 (dot notation)

Level-2 fields refine a level-1 parent. A model trained on level-1 still works — it just uses the parent field.

```
tech.code   tech.ai   tech.hardware   tech.network   tech.security
health.symptom   health.drug   health.treatment   health.fitness
social.family   social.org   social.contact
time.alarm   time.calendar   time.duration
trade.price   trade.order   trade.stock   trade.currency
know.search   know.read   know.news
art.music   art.film   art.visual   art.book
food.recipe   food.restaurant   food.nutrition
place.city   place.country   place.home   place.route
weather.rain   weather.temp   weather.forecast
move.drive   move.fly   move.walk   move.ride
speak.command   speak.greeting   speak.farewell
```

---

## Vocabulary Coverage

### English

| Source           | Entries | Covers                                      |
| ---------------- | ------- | ------------------------------------------- |
| Stems            | 1,491   | Direct word → field lookup                  |
| Compounds        | 49      | Bigram phrases → field (e.g. "coffee shop") |
| Function words   | 93      | STR/REL tokens (not, will, if, who, …)      |
| Morphology rules | 25      | Prefix/suffix stripping → ROOT + role    |

**English pipeline:**

1. Normalize (lowercase, NFKC, expand contractions: `can't` → `can not`)
2. Bigram compound scan
3. Function-word check → STR / REL token
4. Direct stem lookup → ROOT
5. `words.json` surface-form lookup → ROOT
6. Morphological stripping → ROOT + role
7. LIT fallback

**Morphological prefix rules:**

| Prefix  | Role emitted | Example                              |
| ------- | ------------ | ------------------------------------ |
| `un-`   | `negate`     | unreadable → [NEG] + read + possible |
| `dis-`  | `negate`     | disconnect → [NEG] + connect         |
| `non-`  | `negate`     | nonfiction → [NEG] + fiction         |
| `re-`   | `repeat`     | rewrite → [REPEAT] + write           |
| `pre-`  | `before`     | prepay → [BEFORE] + pay              |
| `mis-`  | `wrong`      | misunderstand → [WRONG] + know       |
| `over-` | `excess`     | overload → [EXCESS] + load           |
| `co-`   | `mutual`     | cooperate → [MUTUAL] + work          |
| `out-`  | `exceed`     | outperform → [EXCEED] + work         |

**Morphological suffix rules:**

| Suffix                        | Role emitted | Meaning           |
| ----------------------------- | ------------ | ----------------- |
| `-tion/-sion/-ment/-ion/-ing` | `instance`   | act or result of  |
| `-ness/-ance/-ence/-ity`      | `state`      | quality or state  |
| `-able/-ible`                 | `possible`   | capable of        |
| `-ery/-ory/-ary`              | `place`      | place of          |
| `-ful`                        | `has`        | full of, having   |
| `-less`                       | `negate`     | without           |
| `-er/-or/-ist/-ian`           | `agent`      | one who does      |
| `-ee`                         | `patient`    | one who receives  |
| `-ly`                         | `manner`     | in the manner of  |
| `-al`                         | `quality`    | of or relating to |
| `-ed`                         | `past`       | completed action  |
| `-s`                          | `plural`     | plural inflection |

### Arabic

| Source         | Entries | Covers                                          |
| -------------- | ------- | ----------------------------------------------- |
| Stems          | 2,201   | Trilateral root form → field                    |
| Words          | 1,515   | Direct word → field (no root extraction needed) |
| Compounds      | 170     | Bigram phrases → field (e.g. "ذكاء اصطناعي")    |
| Structural     | 85      | STR tokens (لا، يجب، إذا، كيف، …)               |
| Relations      | 78      | REL tokens (في، إلى، من، بسبب، …)               |
| Function words | —       | Skip list (pronouns, copulas)                   |

**Arabic pipeline:**

1. Normalize (strip diacritics, unify hamza/alef, ة→ه, ى→ي)
2. Bigram compound scan
3. `؟` detection → STR:question
4. Structural map → STR token
5. Relation map → REL token
6. Function-word skip
7. **`سـ` future prefix** — strip `س`, check remainder field, emit STR:future + ROOT (guarded: no false positives on unrelated words like `سيارة`)
8. Root/direct lookup
9. Clitic segmentation (و/ف conjunction, ب/ل/ك prep, ال article, object suffixes) → retry lookup
10. Augmented-verb stripping (Form X/V/I) → retry
11. Morphological role detection (Arabic وزن patterns: agent, patient, process, place)
12. LIT fallback

---

## Structural Markers (STR tokens)

| structure        | English triggers        | Arabic triggers        |
| ---------------- | ----------------------- | ---------------------- |
| `negation`       | not, never, no, without | لا، لم، لن، ما، ليس    |
| `modal`          | can, should, must, may  | يمكن، يجب، لازم        |
| `past`           | was, were, had, did     | كان، كانت، كنت         |
| `future`         | will, shall, going      | سوف، ستكون + سـ prefix |
| `conditional`    | if, unless              | إذا، لو                |
| `cause`          | because, since          | لأن، بسبب              |
| `question`       | `?`                     | `؟`                    |
| `what_question`  | what                    | ماذا، ايش              |
| `who_question`   | who                     | من                     |
| `where_question` | where                   | أين، وين               |
| `when_question`  | when                    | متى                    |
| `why_question`   | why                     | لماذا                  |
| `how_question`   | how                     | كيف                    |
| `which_question` | which                   | أي                     |
| `imperative`     | please, do …            | —                      |
| `greeting`       | hello, hi, hey, thanks  | —                      |
| `farewell`       | bye, goodbye            | —                      |

---

## Morphological Roles

When a word is identified as morphologically derived from a known stem, the ROOT token carries a `role`:

| role          | English examples         | Arabic pattern (وزن) |
| ------------- | ------------------------ | -------------------- |
| `agent`       | writer, teacher, builder | فاعل كاتب            |
| `patient`     | employee, written        | مفعول مكتوب          |
| `instance`    | writing (noun)           | مصدر كتابة           |
| `state`       | kindness, strength       | —                    |
| `place`       | library, factory         | مفعلة مكتبة          |
| `possible`    | readable, buildable      | —                    |
| `negate`      | unwrite, disconnect      | —                    |
| `repeat`      | rewrite, rebuild         | —                    |
| `process`     | cooperation              | مفاعلة تدريب         |
| `intensifier` | workaholic               | فعّال                |

---

## Relation Categories (REL tokens)

`in` `to` `from` `before` `after` `during` `causes` `condition` `contrast` `and` `or` `of` `for` `with` `like` `about` `than`

Arabic covers: في، على، من، إلى، بين، مع، عند، حول، ضد، خلال، بعد، قبل، بسبب، لذلك …

---

## API Reference

```typescript
// ── Tokenizers ──────────────────────────────────────────────────────────────

// Auto-detect language and tokenize
tokenize(text: string): CSTOutput

// Language-specific
tokenizeEn(text: string): CSTOutput
tokenizeAr(text: string): CSTOutput

// Language detection only
detectLang(text: string): "en" | "ar" | "mixed"

// ── Output type ─────────────────────────────────────────────────────────────

interface CSTOutput {
  tokens: CSTToken[];
  coverage: {
    total: number;
    concept: number;
    rel: number;
    str: number;
    lit: number;
    litRatio: number;  // 0.0 = full coverage, 1.0 = all unknown
  };
}

// ── Detokenizer ─────────────────────────────────────────────────────────────

// Reconstruct text from surfaces (approximate, space-joined)
detokenize(tokens: CSTToken[]): string

// Exact reconstruction using char offsets — requires original string
reconstruct(original: string, tokens: CSTToken[]): string

// Compact debug string: "STR:modal ROOT:write REL:for ROOT:time.alarm"
digest(tokens: CSTToken[]): string

// Human-readable annotation per token
gloss(tokens: CSTToken[]): string
// → "[set|ROOT:fix:manage/fix] [alarm|ROOT:time.alarm:set an alarm]"

// Inject semantic context before an LLM prompt
toLLMContext(tokens: CSTToken[]): string
// → "Intent: modal | Topics: write, time.alarm | Details: set=fix/adjust"

// ── Spec helpers ────────────────────────────────────────────────────────────

FIELDS_L1: readonly string[]   // all 42 level-1 field names
FIELDS_L2: readonly string[]   // all level-2 field names
ROLES: readonly string[]       // all role names
STR_MARKERS: readonly string[] // all structural marker names
RELATION_CATS: readonly string[]

isValidField(s: string): s is Field
parentField(field: Field): FieldL1

// ── Vocab access ─────────────────────────────────────────────────────────────

getArCompounds(): Record<string, string>  // Arabic compound bigrams → field
```

---

## Integration with @msm-core/nemo

CST is the tokenizer backend for [@msm-core/nemo](https://www.npmjs.com/package/@msm-core/nemo) (HDC semantic memory). The `CSTToken` type from CST maps to nemo's internal `NemoToken` format via a thin adapter in nemo's `src/tokenizer.ts`. If you use `@msm-core/nemo`, CST is already included — you do not need to import it separately.

```typescript
import { tokenize } from "@msm-core/nemo"; // backed by @msm-core/cst
```

---

## Adding Vocabulary

### English — single words

Edit `vocab/en/stems.json`:

```json
"photosynthesis": { "field": "science", "gloss": "photosynthesis, plant energy" }
```

### English — phrases

Edit `vocab/en/compounds.json`:

```json
"machine learning": { "field": "tech.ai", "gloss": "machine learning" }
```

### English — function words (STR/REL)

Edit `vocab/en/function-words.json`:

```json
"unless": { "type": "STR", "structure": "conditional", "gloss": "unless, except if" }
```

### Arabic — words with trilateral root

Edit `vocab/ar/stems.json` — add the normalized stem (no diacritics, ة→ه, ى→ي):

```json
"علم": "know",
"يعلم": "know",
"معلم": "know"
```

### Arabic — proper nouns, loanwords, no clear root

Edit `vocab/ar/words.json`:

```json
"برمجه": "tech.code"
```

### Arabic — multi-word phrases

Edit `vocab/ar/compounds.json`:

```json
"ذكاء اصطناعي": "tech.ai"
```

### Adding a new semantic field

1. Add name to `src/spec.ts` → `FIELDS_L1` or `FIELDS_L2`
2. Add vocab entries in the relevant JSON files
3. Bump minor version — adding fields is a non-breaking change

---

## Design Principles

- **Zero runtime dependencies.** No imports from npm at runtime. All vocab is plain JSON bundled with the package.
- **Reversible.** `surface` is never dropped. `detokenize()` and `reconstruct()` recover the original text.
- **Compact.** Each token serializes to a single string (`compact`). A full sentence fits in one line for logging or LLM injection.
- **Offset-aware.** Every token carries `[start, end]` char offsets into the original input — useful for highlighting, annotation, and exact reconstruction.
- **Language-independent taxonomy.** Field names, role names, and structural markers are the same across English and Arabic. A model trained on one language generalizes to the other.
- **Stable atom space.** Level-1 field names are frozen for backwards compatibility with HDC vector stores. Adding level-2 fields or new vocab is always a non-breaking change.

---

## Repository

[github.com/msm-core/cst](https://github.com/msm-core/cst) — MIT License

**npm:** [@msm-core/cst](https://www.npmjs.com/package/@msm-core/cst) · **Companion:** [@msm-core/nemo](https://www.npmjs.com/package/@msm-core/nemo)
