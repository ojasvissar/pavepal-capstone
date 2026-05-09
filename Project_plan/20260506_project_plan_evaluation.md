# Phase 1 Evaluation Plan

**Date:** 2026-05-06
**Scope:** How to measure whether the Phase 1 RAG pipeline actually works.
**Supersedes:** [archive/20260429_project_plan_evaluation.md](archive/20260429_project_plan_evaluation.md) — the old plan's gold-set categories referenced Excel/IMS files (Rehabs, Rates, Bid Tabulation, Neighborhood Averages) that aren't in the Phase 1 corpus.
**Companion docs:** [20260506_phase_1_research_log.md](../20260506_phase_1_research_log.md) (architecture decisions), [20260506_working_log.md](../20260506_working_log.md) (next-step probes).

> **Phase 2 note.** Phase 2 is a stretch goal. If it gets built, it will get its own dated eval plan — this one is laser-focused on Phase 1.

---

## 1. Overview

Evaluation splits into **two layers**, mirroring how DSCI lecture 07 frames it:

> *"Evaluation is typically done at two levels: retrieval quality (are we retrieving the right documents?) and generation quality (is the final answer accurate, faithful, and relevant?)."*

The lecture covers retrieval-side metrics. We extend with generation-side metrics that are standard in production RAG.

### Retrieval Quality (Layer 1) — from Lecture 07

| Metric | What it captures (one line) |
|---|---|
| **Precision@K** | Of the K chunks retrieved, what fraction were relevant? — *cleanliness* |
| **Recall@K** | Of all relevant chunks, what fraction made top-K? — *completeness* |
| **MRR** (Mean Reciprocal Rank) | How early did the first relevant chunk appear? — *ranking quality* |
| **Hit Rate@K** | Did at least one relevant chunk make top-K? — *floor / sanity check* |
| **Recall@5 by source** ⭐ | Same as Recall@5, but reported separately for GDOT, roadSegments, and locations. **New addition** — see §3.2 for why. |

### Generation Quality (Layer 2) — beyond the lecture

| Metric | What it captures (one line) |
|---|---|
| **Hallucination Testing** | Did the answer fabricate facts, get numbers wrong, or recommend something the rule book wouldn't? Scored via LLM-as-judge with manual spot-check. |
| **Consistency Testing** | Same question, paraphrased — does the system still give the same recommendation? |

### Supporting metrics

| Metric | What it captures (one line) |
|---|---|
| **Refusal calibration** | When info isn't in the corpus, does the system say "I don't have that information" instead of confabulating? |
| **Citation correctness** | When the answer cites `[3]`, does chunk 3 actually contain the cited claim? |

### Who runs what

```
┌─────────────────────────────────────────────────────────────┐
│  Pure Python (deterministic, free, fast)                    │
│    • Precision@K, Recall@K, MRR, Hit Rate@K                 │
│    • Recall@5 by source                                     │
│    • Refusal calibration (regex on refusal phrases)         │
│    • Citation tag parsing (regex)                           │
│    • Canonical-claim substring match (consistency #2)       │
│    • Chunk Jaccard overlap (consistency #4)                 │
├─────────────────────────────────────────────────────────────┤
│  LLM-as-judge (Gemini 2.5 Pro by default)                   │
│    • Hallucination scoring (correctness + groundedness)     │
│    • Citation claim verification                            │
│    • Paraphrase semantic equivalence (consistency #3)       │
└─────────────────────────────────────────────────────────────┘
```

> **Note on judge model.** Ideally the judge is a different model from the generator (avoids self-evaluation bias). Phase 1's generator is Gemini 2.5 Pro, so the most-defensible judge is Claude Opus 4.7 or GPT-4o. **For v1, default to the same Gemini model** (no extra API keys, free under AI Studio tier); upgrade if eval results show the judge agreeing with obviously bad answers. See §6.2.

---

## 2. The Gold Set — foundation for everything

### 2.1 What it is

The gold set is a **fixed list of hand-written test questions** where the correct answer is known in advance. We feed those questions into the RAG pipeline, see what comes back, and compare to the known-correct answer. That's how every metric in §3–§5 gets computed.

```
10 gold questions  →  RAG pipeline  →  system answers  →  compare to known-correct  →  metrics
   (hand-written)                                                                       (recall, hallucination, etc.)
```

| Without a gold set | With a gold set |
|---|---|
| "Demo looks good" | "Recall@5 went from 0.62 to 0.78 between v1 and v2" |
| Subjective sponsor reviews | Numbers we can defend in the capstone report |
| Can't tell if today's tweak fixed yesterday's bug | Regression-test every change |

The gold set is **immutable** once locked — never edit a question after recording metrics against it, or runs become incomparable.

### 2.2 Why composition matters

The 10 questions can't all look the same. If they all ask *"what does GDOT recommend at PCI X?"*, we only ever stress one slice of the system — and never find out whether *"what's the PCI of Engineering Dr?"* or *"which roads have cracks?"* work. Different question types stress different parts of the pipeline.

So we deliberately split the 10 across categories, where each category targets a different part of the system:

| Category | What part of the pipeline it stresses |
|---|---|
| GDOT treatment lookup | Does GDOT-only retrieval work? Does the LLM read the rule book correctly? |
| Road-data lookup | Does the JSON-flattened retrieval (roadSegments / locations) work? |
| Cross-source synthesis | Does the system retrieve from **multiple** sources at once and combine them? (The hardest test.) |
| Refusal | Does the system know when to say "I don't know" instead of making things up? |

If we skip any category, we have a blind spot. If we over-weight one, the headline metric is dominated by that slice.

### 2.3 Composition — Plan A (cross-source-heavy)

The PavePal killer use case is *"this street scores 80 with these defects, what's the cheapest next step per GDOT?"* — a question that needs **both** road-data AND rule-book retrieval, then LLM synthesis. Cross-source IS the use case that justifies our entire hybrid + source-aware-retrieval architecture.

So we weight cross-source heaviest. That makes our headline metric an honest test of the architecture's core promise:

| Category | # | % | What it tests |
|---|---:|---:|---|
| **Cross-source synthesis** ⭐ | **5** | 50% | The headline use case. Multi-source retrieval + LLM synthesis. |
| GDOT-only treatment lookup | 2 | 20% | GDOT retrieval in isolation. |
| Road-data lookup (roadSegments OR locations) | 2 | 20% | JSON retrieval in isolation. |
| Refusal | 1 | 10% | System knows when to refuse. |
| **Total** | **10** | 100% | |

Paraphrases (for consistency testing) attach to 1–2 of the cross-source questions as extra columns on the same row — they don't eat into the 10-question count.

### 2.4 Constraints & limitations — the 10-question bottleneck

**The honest framing:** the gold set is 10 questions because that's what partner availability allows. Standard RAG-eval practice would call for 30+. This caps statistical resolution and shapes how the metrics should be read:

| Concern | Effect at 30 Qs (industry default) | Effect at 10 Qs (our reality) |
|---|---|---|
| Statistical resolution | A 0.10 swing in recall is meaningful | A single question moving from miss → hit shifts recall by 0.10. **Most "improvements" between runs will be noise.** |
| Per-category trust | 8 cross-source questions = a defensible category mean | 5 cross-source questions = barely enough to spot a trend |
| Refusal calibration | 3 refusals = 33% test mass | 1 refusal = anecdote, not a metric |
| Iterative refinement | 30 questions reduce missed-label bias substantially | 10 questions narrow the chance of representative coverage |

**How we work around it:**

1. **Trend direction over absolute thresholds.** If recall@5 went from 0.5 to 0.7 across two runs, that's signal — but treating "we hit 0.85" as a bright line is over-claiming.
2. **Per-question deep-dive.** With 10 questions, manually reading the chunks each retrieved on each run is feasible. That qualitative pass IS half the eval.
3. **Belt-and-braces — answer-side metrics don't depend on `gold_chunks` completeness.** Hallucination correctness and claim coverage operate purely on the answer text vs. `canonical_claims` and `reference_answer`. So if `gold_chunks` are imperfect, those metrics still give a trustworthy signal. (See §2.7.)

The capstone report needs to **state this constraint upfront** so reviewers calibrate their expectations.

### 2.5 Schema (CSV columns)

| Column | Purpose | Example |
|---|---|---|
| `qid` | Question ID — unique key for cross-run comparison | `Q05` |
| `category` | One of `cross_source` / `gdot_only` / `road_data` / `refusal` | `cross_source` |
| `question` | The primary user query | "Engineering Dr is at PCI 65 with transverse cracks. What does GDOT recommend?" |
| `paraphrase_1` | Same question, reworded — for consistency testing (optional) | "What's the GDOT-recommended treatment for Engineering Dr (PCI 65, transverse cracks)?" |
| `paraphrase_2` | Another rewording (optional) | "Engineering Dr has PCI 65 and transverse cracks — per the rule book, what's the fix?" |
| `gold_chunks` | Chunk IDs that contain the answer (used by retrieval metrics) | `["GDOT_p042", "roadSeg_142"]` |
| `expected_sources` | Which sources should be retrieved from (used by per-source recall) | `["GDOT", "roadSegments"]` |
| `canonical_claims` | Key facts the answer should mention (used by answer metrics) | `["chip seal", "PCI 60-80"]` |
| `reference_answer` | The full gold answer (used by LLM-as-judge) | "GDOT recommends chip seal for asphalt at PCI 60–80, applicable here for Engineering Dr..." |

`paraphrase_1` and `paraphrase_2` only need to be populated for the 1–2 questions used for consistency testing. The rest are required for every row.

### 2.6 `gold_chunks` vs `canonical_claims`

These live at **different layers** of the evaluation:

| | `gold_chunks` | `canonical_claims` |
|---|---|---|
| What it lists | Chunk IDs / source pointers | Key facts / phrases |
| Used by | Retrieval metrics (Layer 1) | Answer metrics (Layer 2) |
| What it answers | "Did the system find the right *places*?" | "Did the system put the right *facts* in the answer?" |

```
Question
   │
   ▼
┌─────────────────┐
│   Retrieval     │ ◄──── evaluated with `gold_chunks`
│   (top-5)       │       (Recall@5, Precision@5, MRR, Hit@5)
└─────────────────┘
   │
   ▼
┌─────────────────┐
│   Generation    │ ◄──── evaluated with `canonical_claims`
│   (Gemini 2.5)  │       (claim coverage, hallucination, consistency)
└─────────────────┘
   │
   ▼
Answer
```

### 2.7 Iterative refinement (1-hour pass after v1)

We will inevitably miss labelling some relevant chunks when authoring the gold set. This biases retrieval metrics:

| If `gold_chunks` is incomplete | Effect |
|---|---|
| Recall@K | Looks artificially **high** (denominator too small) |
| Precision@K | Looks artificially **low** (truly-relevant chunks scored as false positives) |
| MRR | Looks artificially **low** (first true-positive may be misclassified) |

**Mitigation — review after the first eval run.** After Phase 1 v1, before recording official numbers, manually inspect any chunks the system retrieved that *aren't* in `gold_chunks`. If genuinely relevant, add them. **Then lock the gold set.**

```python
# eval/refine_gold.py — run once after the v1 system run
for q in gold_set:
    retrieved = top5(q)
    unjudged = [c for c in retrieved if c not in q.gold_chunks]
    for c in unjudged:
        if user_confirms_relevant(c):
            q.gold_chunks.append(c)
# Then: lock the gold set. Don't edit it again.
```

**Belt-and-braces — answer-side metrics don't depend on `gold_chunks` completeness.**

| Tier | Metric | Trustworthiness |
|---|---|---|
| **Headline** | Claim coverage + LLM-judge correctness | ✅ Robust to gold-chunk gaps |
| **Headline** | Refusal accuracy + consistency | ✅ Robust |
| **Diagnostic** | Recall@K / MRR / Precision@K | ⚠️ Conditional on labelling — cite the limitation |

Suggested capstone-report sentence:
> *"Gold-chunk labelling is exhaustive within obvious sources, with one refinement pass after v1; reported Recall@K may be slightly biased by remaining missed labels, which we cross-validate with claim coverage (which does not depend on gold-chunk labelling). Gold-set size of 10 questions reflects partner availability and limits per-category statistical resolution; we report trends and per-question detail rather than absolute thresholds."*

---

## 3. Retrieval Quality — Layer 1

### 3.1 The four metrics

All four share one setup: the system retrieves K chunks (we use K=5 — see [research log §7.3](../20260506_phase_1_research_log.md)). For each gold question, we've labelled which chunks are relevant (`gold_chunks`). The metrics compare retrieved against labelled.

#### Worked example — Q05 (cross-source)

> **Question:** "Engineering Dr is at PCI 65 with transverse cracks. What does GDOT recommend?"
> **`gold_chunks`:** `["GDOT_p042", "roadSeg_142"]`
> **`expected_sources`:** `["GDOT", "roadSegments"]`
>
> **System retrieved (top-5 after policy B + RRF):**
>
> | Position | Chunk | Source | Relevant? |
> |---|---|---|---|
> | 1 | `GDOT_p107` (about fog seal) | GDOT | ❌ |
> | 2 | `loc_00250` (Engineering Dr inspection point) | locations | ❌ (not gold-labelled) |
> | 3 | `GDOT_p042` (chip seal section) | GDOT | ✅ |
> | 4 | `loc_00251` | locations | ❌ |
> | 5 | `roadSeg_142` (Engineering Dr record) | roadSegments | ✅ |

#### The four metrics on Q05

| Metric | Formula | Q05 result |
|---|---|---:|
| **Recall@5** | `# relevant in top-5 / # all relevant` | 2 / 2 = **1.00** |
| **Precision@5** | `# relevant in top-5 / 5` | 2 / 5 = **0.40** |
| **MRR (this query)** | `1 / rank_of_first_relevant` | 1 / 3 = **0.33** |
| **Hit Rate@5** | `1 if any relevant in top-5 else 0` | **1** |

Each metric is computed **per question**, then **averaged across the 10 gold questions** to get headline numbers.

#### Why each one matters

| Metric | Captures | Why it matters for RAG |
|---|---|---|
| **Recall@K** | Completeness | If the right chunk isn't in top-K, the LLM can't see it — a wrong answer is guaranteed. **Most important.** |
| **Precision@K** | Cleanliness | Lower precision → noise in the prompt → cost + LLM distraction. Less critical at K=5; more critical at large K. |
| **MRR** | Ranking quality | P@K and R@K don't care about position; MRR does. The LLM weighs top chunks more heavily, so rank-1 matters more than rank-5. |
| **Hit Rate@K** | Floor | Coarsest signal — sanity-checks "did retrieval do *anything* useful?" |

### 3.2 Recall@5 by source — NEW

The Phase 1 corpus is heavily imbalanced: **89% locations, 8% roadSegments, 2% GDOT** (~23K vectors total). Without source-aware retrieval, GDOT answers get drowned out by sheer numerosity.

We picked **policy B** (per-source retrieval, RRF over the union — see [research log §5.5](../20260506_phase_1_research_log.md)) specifically to prevent this. We need a metric that proves it actually works.

**Per-source recall@5** answers: *for each source where the gold answer was supposed to come from, what fraction of those gold chunks made top-5?*

#### Worked example — Q05 again

| Source | gold_chunks from this source | Retrieved in top-5? | Per-source recall |
|---|---|---|---:|
| GDOT | `["GDOT_p042"]` | `GDOT_p042` ✓ | 1/1 = 1.00 |
| roadSegments | `["roadSeg_142"]` | `roadSeg_142` ✓ | 1/1 = 1.00 |
| locations | `[]` (not expected) | n/a | n/a (excluded from average) |

Aggregate across the 10-question gold set, only counting questions where the source was expected:

```python
def per_source_recall(retrieved_top5, gold_chunks_by_source):
    out = {}
    for source, gold in gold_chunks_by_source.items():
        if not gold:                                # source not expected → exclude
            continue
        retrieved_from_source = [c for c in retrieved_top5 if c in gold]
        out[source] = len(retrieved_from_source) / len(gold)
    return out
```

#### Why this is the most important addition vs the old plan

The old plan never broke recall down by source. It would happily report "recall@5 = 0.85" while GDOT-specific recall was 0.20 — the system retrieving lots from `locations` and almost nothing from GDOT, but the headline number masking it. **Per-source recall makes that hidden failure mode visible.**

If GDOT recall@5 < 0.5 while overall recall@5 ≥ 0.7, that's the loud signal that policy B isn't working — escalate to policy C (rule-based routing) per [research log §5.5](../20260506_phase_1_research_log.md).

### 3.3 Pure-Python implementation

```python
def retrieval_metrics(retrieved_top5: list[str], gold_chunks: list[str]) -> dict:
    gold = set(gold_chunks)
    relevant_in_top5 = [c for c in retrieved_top5 if c in gold]
    first_rank = next((i + 1 for i, c in enumerate(retrieved_top5) if c in gold), None)

    return {
        "recall@5":    len(relevant_in_top5) / max(1, len(gold)),
        "precision@5": len(relevant_in_top5) / 5,
        "mrr":         (1 / first_rank) if first_rank else 0.0,
        "hit_rate@5":  1 if relevant_in_top5 else 0,
    }
```

### 3.4 Targets

Treat targets as **direction markers, not bright lines** — at 10 questions, a single bad question drops a metric by 0.10. Use these to gauge whether v2 improves over v1, not as defense thresholds.

| Metric | v1 target | v2 target |
|---|---:|---:|
| Recall@5 (overall) | ≥ 0.65 | ≥ 0.80 |
| Precision@5 | ≥ 0.40 | ≥ 0.50 |
| MRR | ≥ 0.55 | ≥ 0.70 |
| Hit Rate@5 | ≥ 0.85 | ≥ 0.95 |
| **Recall@5 — GDOT** ⭐ | ≥ 0.50 | ≥ 0.75 |
| **Recall@5 — roadSegments** ⭐ | ≥ 0.60 | ≥ 0.80 |
| **Recall@5 — locations** ⭐ | ≥ 0.60 | ≥ 0.80 |

The **per-source targets matter most** — they're what proves source-aware retrieval is working.

---

## 4. Generation Quality

### 4.1 Hallucination Testing

#### What counts as a hallucination

| Type | Definition | Example failure |
|---|---|---|
| **Fabricated fact** | Claim not supported by any retrieved chunk | "GDOT recommends slurry seal for railway crossings" (not in corpus) |
| **Numeric error** | Number cited wrongly given the source | Says "PCI 70" when source says "PCI 65" |
| **Wrong attribution** | Claim is in the corpus but cited to the wrong source | Cites GDOT page 42 for a fact actually from roadSegments |
| **Unsupported recommendation** | Recommends an activity the rule book wouldn't | Recommends chip seal for PCI 35 (rule says chip seal applies at PCI 60–80) |

#### Scoring rubric (two scores per question, both 0 / 0.5 / 1)

```
correctness  = 1.0 if answer matches reference on the substantive claim
               0.5 if partially correct (right activity, wrong threshold or vice versa)
               0.0 if any of the 4 hallucination types above is present

groundedness = 1.0 if every claim in the answer is verifiable from cited chunks
               0.5 if mostly grounded, 1–2 minor unsupported add-ons
               0.0 if any major claim has no chunk-level support
```

Two scores because they fail in different ways — an answer can be correct but ungrounded (right by accident from training data) or grounded but incorrect (cites the wrong row from the right document).

#### Who scores it

**Primary:** LLM-as-judge for routine eval reruns — automated, ~$0.001 per question with Gemini 2.5 Pro, ~5 sec per question.

**Backup:** human spot-check of all 10 questions per phase. At 10 questions this is feasible to do every run, ~15 minutes.

#### LLM-judge prompt

```python
HALLUCINATION_JUDGE_PROMPT = """
You are an expert reviewer checking an AI's answer for hallucinations.

QUESTION: {question}

RETRIEVED CONTEXT (the only allowed evidence):
{retrieved_context}

REFERENCE ANSWER (the gold answer):
{reference_answer}

SYSTEM ANSWER (under review):
{system_answer}

For the system answer, check each claim against the retrieved context.

Score:
- correctness:  1.0 / 0.5 / 0.0 (matches reference on substantive claim?)
- groundedness: 1.0 / 0.5 / 0.0 (every claim verifiable from context?)

Then identify any hallucinations of these types:
- fabricated_fact
- numeric_error
- wrong_attribution
- unsupported_recommendation

Return strict JSON:
{{
  "correctness": 0|0.5|1,
  "groundedness": 0|0.5|1,
  "hallucinations": ["fabricated_fact", ...],
  "justification": "one sentence"
}}
"""
```

#### Targets

| Metric | v1 target | v2 target |
|---|---:|---:|
| Mean correctness (LLM-judge) | ≥ 0.65 | ≥ 0.80 |
| Mean groundedness (LLM-judge) | ≥ 0.70 | ≥ 0.85 |
| Hallucination-type frequency | < 25% of answers | < 10% of answers |

### 4.2 Consistency Testing

#### Two flavours of consistency

| Flavor | Setup | What it really tests |
|---|---|---|
| **(A) Same topic, different wording** | 3 paraphrases of the same question | Robustness of retrieval + reasoning to surface form |
| **(B) Identical query, multiple times** | Same question repeated N times | Stochasticity of the LLM |

**Flavor B is a smoke test.** With `temperature=0` the LLM is deterministic — same input → same output. Run once per phase to confirm.

**Flavor A is the real metric.** It exercises the whole pipeline against rewordings the user would naturally produce.

We bolt paraphrases onto 1–2 cross-source questions in the gold set (`paraphrase_1`, `paraphrase_2` columns). Don't add more — at 10 questions, every additional run multiplies eval cost.

#### How to measure flavor A — combine 3 methods

| # | Method | Concretely | Catches failure in... |
|---|---|---|---|
| **#2** | Canonical-claim match | Did all 3 paraphrases mention every fact in `canonical_claims`? | Generation step |
| **#3** | LLM-judge equivalence | Ask judge: "do these 3 answers convey the same recommendation?" | Generation step (semantic) |
| **#4** | Cited-chunk Jaccard | Compute Jaccard of retrieved-chunk sets across 3 paraphrases | Retrieval step |

(Method #1 — exact-match — is dropped. LLMs reword every time; it'd always score 0.)

#### Combined formula

```python
consistency_score = (
    0.4 * canonical_match_rate    # method #2
  + 0.3 * llm_judge_equivalence   # method #3 (0 or 1)
  + 0.3 * chunk_jaccard           # method #4
)
```

**Diagnostic value:** if #2 fails but #4 passes → generation is the problem. If #4 fails → retrieval is the problem. We get a *direction*, not just a number.

#### Pure-Python implementation (methods #2 and #4)

```python
def consistency_score(answers: list[str], retrievals: list[set[str]],
                      canonical_claims: list[str], llm_equivalence: int) -> dict:
    # Method #2 — fraction of canonical claims present in ALL answers
    claims_in_all = [c for c in canonical_claims
                     if all(c.lower() in a.lower() for a in answers)]
    canonical_match = len(claims_in_all) / max(1, len(canonical_claims))

    # Method #4 — Jaccard of retrieved chunks
    intersection = set.intersection(*retrievals)
    union = set.union(*retrievals)
    jaccard = len(intersection) / max(1, len(union))

    return {
        "canonical_match_rate": canonical_match,
        "chunk_jaccard": jaccard,
        "llm_equivalence": llm_equivalence,
        "consistency_score": 0.4 * canonical_match + 0.3 * llm_equivalence + 0.3 * jaccard,
    }
```

#### Targets

| Metric | v1 target | v2 target |
|---|---:|---:|
| `consistency_score` (combined) | ≥ 0.70 | ≥ 0.85 |
| Flavor B (smoke test) | 100% | 100% |

---

## 5. Supporting Metrics

### 5.1 Refusal calibration

**Purpose:** when the user asks something not in the corpus, does the system politely say "I don't have that information" instead of confabulating?

**How:** the 1 refusal question in the gold set has an answer deliberately not in any source. Examples:

- "What does PavePal recommend for railway crossings?" (out-of-domain)
- "How should I treat a gravel road with washboarding?" (no gravel-road treatments in corpus)
- "What's the capital of France?" (off-domain entirely)

**Computation (pure Python):**

```python
REFUSAL_PHRASES = [
    "i don't have that information",
    "i don't have information",
    "not in the provided context",
    "no information about",
    "cannot find",
]

def is_refusal(answer: str) -> bool:
    return any(p in answer.lower() for p in REFUSAL_PHRASES)
```

**Caveat:** with only 1 refusal question, this is anecdotal. The metric is binary per run (refused or not). Track it but don't claim it as a defense pillar.

**Target:** the system refuses (binary 1) on the v2 run.

### 5.2 Citation correctness

**Purpose:** when the answer claims "according to [3]," does chunk 3 actually contain the cited claim?

**How:** two-step check.

1. **Pure-Python parsing** — extract `[N]` tags from the answer.
2. **LLM-judge verification** — for each cited sentence, ask the judge whether the cited chunk actually supports it.

```python
CITATION_VERIFY_PROMPT = """
A system claimed: "{sentence}"

It cited this source chunk: "{chunk_text}"

Does the chunk SUPPORT this claim?
Reply strict JSON: {{"supported": true|false, "reason": "one sentence"}}
"""

def citation_score(answer: str, retrieved_chunks: list) -> float:
    sentences_with_cites = parse_sentences_with_citations(answer)  # extract [N] tags
    correct, total = 0, 0
    for sentence, cited_indices in sentences_with_cites:
        for n in cited_indices:
            chunk = retrieved_chunks[n - 1]
            verdict = llm_judge(CITATION_VERIFY_PROMPT.format(
                sentence=sentence, chunk_text=chunk.page_content))
            total += 1
            correct += int(verdict["supported"])
    return correct / total if total else 0.0
```

**Target:** ≥ 0.80 by v2.

---

## 6. The Eval Harness

### 6.1 Project layout

```
pavepal-capstone/
├── eval/
│   ├── gold_set.csv              ← 10 labelled questions
│   ├── refine_gold.py            ← review/refine after v1 run
│   ├── run_eval.py               ← main harness (all metrics)
│   ├── plot_runs.py              ← read all CSVs, plot trends
│   └── runs/
│       ├── phase1_v1_20260605_1430.csv
│       ├── phase1_v1_20260612_0900.csv
│       └── ...                   ← every CSV kept; never overwrite
```

### 6.2 Procedure & cost (Gemini 2.5 Pro)

Phase 1 uses Gemini 2.5 Pro for the generator. Approximate Gemini AI Studio pricing:

- Input: $1.25 per 1M tokens
- Output: $5.00 per 1M tokens
- Free tier: generous allowance — most dev runs land at $0

Per-run cost calculation:

| Step | LLM calls | Tokens (avg) | Cost |
|---|---:|---:|---:|
| 1. Run system on 10 main + ~4 paraphrases | 14 | ~7K each | ~$0.20 |
| 2. Score retrieval (Layer 1) | 0 | — | $0 (pure Python) |
| 3. Score hallucination (LLM-judge × 10) | 10 | ~1K each | ~$0.05 |
| 4. Score consistency #3 (LLM-judge × ~2 paraphrase sets) | 2 | ~1K each | ~$0.01 |
| 5. Score citation correctness (LLM-judge × ~30 cited sentences) | 30 | ~500 each | ~$0.05 |
| 6. Roll up to summary CSV | 0 | — | $0 (Pandas) |
| **Per-run total** | **~56 LLM calls** | | **~$0.30** |

This is **~15× cheaper** than the old plan's $4.50 per run — partly Gemini's lower pricing, partly 10 questions instead of 30. **In practice, dev runs will be free under the AI Studio tier.**

> **Open question — judge model choice.** Defaulting the judge to the same Gemini 2.5 Pro as the generator is cheap (one API key) but introduces self-evaluation bias. If v1 results show the judge consistently passing obviously-wrong answers, switch the judge to Claude Opus 4.7 or GPT-4o. Cost impact: ~$0.20 per run extra.

### 6.3 When to run what

| Trigger | Run |
|---|---|
| After any substantive change (chunk size, embedding swap, prompt edit, retrieval policy tweak) | Full eval harness — saves CSV to `eval/runs/` |
| Before each sponsor checkpoint | Full harness + manual spot-check of all 10 |
| Daily during dev | Smoke-test on 2 cherry-picked questions — fast |

### 6.4 Eval harness sketch

```python
# eval/run_eval.py
import json
from pathlib import Path
import pandas as pd
from langchain_google_genai import ChatGoogleGenerativeAI

from chat.chain import ask              # Phase 1 single-chain entry point

GOLD = pd.read_csv("eval/gold_set.csv")
JUDGE = ChatGoogleGenerativeAI(model="gemini-2.5-pro", temperature=0, max_tokens=512)

def evaluate_one(row):
    expected_chunks  = json.loads(row["gold_chunks"])
    expected_sources = json.loads(row["expected_sources"])
    canonical_claims = json.loads(row["canonical_claims"])

    # Run main question; run paraphrases only if present (cross-source category)
    paraphrases = [row.get("paraphrase_1"), row.get("paraphrase_2")]
    forms = [row["question"]] + [p for p in paraphrases if pd.notna(p)]
    runs = [ask(q) for q in forms]
    main_run = runs[0]

    # === Layer 1 — retrieval ===
    retrieved = main_run["retrieved_chunk_ids"]
    retrieval = retrieval_metrics(retrieved, expected_chunks)

    # NEW — per-source breakdown
    gold_by_src = group_by_source(expected_chunks, expected_sources)
    per_src = per_source_recall(retrieved, gold_by_src)

    # === Layer 2 — hallucination ===
    judge_verdict = llm_judge(HALLUCINATION_JUDGE_PROMPT.format(
        question=row["question"],
        retrieved_context=format_chunks(retrieved),
        reference_answer=row["reference_answer"],
        system_answer=main_run["answer"],
    ))

    # === Consistency (only when paraphrases exist) ===
    consistency = {}
    if len(runs) >= 2:
        answers = [r["answer"] for r in runs]
        retrievals = [set(r["retrieved_chunk_ids"]) for r in runs]
        consistency = consistency_score(
            answers, retrievals, canonical_claims,
            llm_equivalence=llm_judge_equivalence(answers),
        )

    # === Supporting ===
    return {
        "qid": row["qid"], "category": row["category"],
        **retrieval,
        **{f"recall@5_{src}": v for src, v in per_src.items()},
        "correctness":  judge_verdict["correctness"],
        "groundedness": judge_verdict["groundedness"],
        "hallucinations": judge_verdict["hallucinations"],
        **consistency,
        "is_refusal":    is_refusal(main_run["answer"]),
        "citation_correctness": citation_score(main_run["answer"], main_run["retrieved_docs"]),
    }

if __name__ == "__main__":
    results = [evaluate_one(r) for _, r in GOLD.iterrows()]
    out = Path("eval/runs") / f"phase1_run_{pd.Timestamp.now():%Y%m%d_%H%M}.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(results).to_csv(out, index=False)
    print(pd.DataFrame(results).groupby("category").mean(numeric_only=True).round(2))
```

---

## 7. What "Good" Looks Like — Phase 1 summary targets

| Layer | Metric | v1 target | v2 target |
|---|---|---:|---:|
| **Retrieval (overall)** | Recall@5 | 0.65 | 0.80 |
| | Precision@5 | 0.40 | 0.50 |
| | MRR | 0.55 | 0.70 |
| | Hit Rate@5 | 0.85 | 0.95 |
| **Retrieval (per source)** ⭐ | Recall@5 — GDOT | 0.50 | 0.75 |
| | Recall@5 — roadSegments | 0.60 | 0.80 |
| | Recall@5 — locations | 0.60 | 0.80 |
| **Hallucination** | Mean correctness | 0.65 | 0.80 |
| | Mean groundedness | 0.70 | 0.85 |
| **Consistency** | Combined consistency score | 0.70 | 0.85 |
| **Supporting** | Refusal (binary) | 1 | 1 |
| | Citation correctness | 0.70 | 0.80 |
| **Operational** | Per-run cost | ~$0.30 | ~$0.30 |
| | Per-run wall time | < 5 min | < 5 min |

The capstone *report* leans on these numbers improving from v1 → v2 — the eval harness is what makes that report defensible despite the 10-question constraint.

---

## 8. Feasibility Summary

| Activity | Time | Money |
|---|---|---|
| Author 10-question gold set (with partner) | ~3 hours one-time | $0 |
| Refinement pass after v1 | ~30 min | $0 |
| Full eval run (after each change) | Automated, ~5 min wall time | ~$0.30 |
| Manual spot-check (all 10 per run) | ~15 min/run | $0 |
| **Total over the 8-week capstone** | ~6 hours human + automated runs | **< $5** |

Bottleneck is **gold-set quality and partner availability**, not money. The 10-question constraint is acknowledged upfront in §2.4 — work around it with trend-direction reading, per-question deep-dive, and answer-side metrics that don't depend on `gold_chunks` completeness.

---

## 9. What to Cite in the Capstone Report

| Layer | Citation |
|---|---|
| Retrieval (Recall@K, Precision@K, MRR, Hit Rate@K) | Lecture 07 directly — verbatim formulas |
| **Per-source recall breakdown** | Novel for this capstone (driven by the 89:8:2 source-imbalance constraint) |
| Hybrid retrieval impact on consistency | Lecture 05 — sparse vs dense matching |
| Generation quality (correctness, groundedness) | RAGAS / standard production-RAG practice |
| Consistency / refusal calibration | Production-RAG practice; lecture 07 mentions but does not teach |

Suggested framing:

> *"We use lecture 07's retrieval metrics as Layer 1, extend with established RAG-evaluation practice for the generation, consistency, and supporting layers, and add per-source recall as a novel layer to verify our source-aware retrieval policy. Gold-set size of 10 reflects partner availability — we report trend direction and per-question detail rather than treating absolute thresholds as defense lines."*

---

## 10. References

- [20260506_phase_1_research_log.md](../20260506_phase_1_research_log.md) — Phase 1 architecture decisions (corpus, retrieval policy B, BGE prefix, etc.)
- [20260506_working_log.md](../20260506_working_log.md) — Next-step probes (T1 parser, T2 BGE prefix, T3 policy B sanity)
- [20260506_condensed_phase_1_choices.md](20260506_condensed_phase_1_choices.md) — One-pager summary of Phase 1 picks
- `Lecture_notes/07_llms-rag.ipynb` § "RAG evaluation" — Precision, Recall, MRR
- `Lecture_notes/05_info-retrieval-intro-to-transformers.ipynb` — sparse vs dense retrieval
- [RAGAS docs](https://docs.ragas.io/) — faithfulness / answer relevance benchmarks
- [archive/20260429_project_plan_evaluation.md](archive/20260429_project_plan_evaluation.md) — superseded plan (kept for historical context)
