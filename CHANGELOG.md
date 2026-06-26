# Changelog — @msm-core/cst

All notable changes are documented here.
Follows [Semantic Versioning](https://semver.org/).

---

## [0.4.0] — 2026-06-26

### Added

- **Contextual Arabic entity tagger (NER).** A LIT-only post-pass that reclassifies an unknown token
  following an entity **trigger** (title / kinship / place / org marker — الرئيس, مدينة, نهر, بن, شركة …)
  as a named entity (`person` / `place` / `name`). Safe by construction (touches only LIT tokens → never
  overrides a real mapping or collides with morphology), high-precision (trigger-gated), offset-aware
  (handles multi-token words + multi-word names), and it **generalises** — no per-name vocabulary needed.
- **~520 curated Arabic vocabulary entries** across all fields: routing-domain terms, high-frequency
  general vocabulary (places→`place`, foreign names→`person`, ordinals/numbers→`measure`, content
  nouns→fields), geography + unambiguous proper names, core content vocabulary, and **common triliteral
  verb roots** (so imperfect inflections resolve: يبلغ→`measure`, يخدم→`social`, تنقل→`move`, يظهر→`exist`).
- Repeatable batch scripts under `scripts/add-ar-*.mjs` (mine → map → measure).

### Impact

- **Arabic LIT ratio: 24.7% → 19.99%** (Wikipedia) — crosses the <20% target for the first time.
- English LIT unchanged (13.5%). Precision held throughout (L1 fields only; foreign/unambiguous names only —
  Arabic agent/passive forms like كاتب/محمود collide with morphology and were excluded; homographs skipped).
- Tests: 123 → **127** (added entity-tagger tests); all pass.

### Notes

- Remaining Arabic gap toward English parity = deeper morphology (weak/Form-X imperfect verbs تصل→وصل,
  تستخدم) + the open-class proper-noun/abbreviation tail. The entity tagger + scripted vocab batches are
  the path to continue.

---

## [0.3.2] — 2026-06-09

### Added

- **Weak-root Arabic morphology** in root reduction: hollow (medial ا↔و/ي — عاد↔عود,
  قال→قول), defective (final weak — دعا→دعو), geminate (مد→مدد), and imperfect
  verb-prefix stripping (تريد/يريد→ريد→رود). Still precision-safe — a candidate is
  accepted only if it resolves to a known root.
- Larger curated common-root vocab (قول, بيع, جري, فهم, رود, نوم, قوم, لعب, …).

### Impact

- Arabic LIT ratio: ~28%→**24%** (Wikipedia), ~26%→**21%** (everyday Tatoeba),
  **16%** on short voice-command text (MASSIVE ar-SA). Coverage gate tightened
  (AR fixture 29%→26%, threshold 0.34→0.30). EN unchanged (12.5%). 123 tests pass.

---

## [0.3.1] — 2026-06-09

### Added

- **Arabic root reduction.** When direct/segmentation/augment lookups miss, the
  tokenizer now reduces a derived noun/verb form to its triliteral root (place
  nouns مفعل, masdar فعالة, sound/broken plurals, nisba -ية, Form IV, long-vowel
  infixes) and retries the field lookup. It accepts a reduction **only** if it
  resolves to a known root, so it can never invent a field — precision-safe.
  Drops Arabic LIT ratio from ~35% to ~28% on the eval corpus with no precision
  regression (مقتل→قتل/place, الزراعة→زرع, العلاقات→علق, أعلنت→علن).
- Curated common modern roots (عرف, علم, درس, عود, ثور, حدث, نشأ, خط, …).
- CI-portable coverage regression gate (`tests/coverage.test.ts` + committed
  fixtures) — no longer depends on the gitignored eval corpora.

### Fixed

- **Arabic compound map** was rebuilt on every `tokenizeAr()` call; now cached at
  module level like the other lookups (removes a per-call hot-path cost).
- **English silent-e stem** ("writing"→"writ"): the reported stem now reflects
  the form that actually matched (was always the bare stem).
- README documented a `CONCEPT` token type; the tokenizer emits separate `ROOT`
  and `ROLE` tokens. README + gloss examples corrected to real output, and the
  stale "Arabic added in Phase 5" note removed (Arabic is implemented).

### Packaging

- `publishConfig.access: "public"`, `repository`, and README/CHANGELOG added to
  the published tarball.
