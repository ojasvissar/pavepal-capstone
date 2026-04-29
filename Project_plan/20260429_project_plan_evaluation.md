# Evaluation Plan — Phase 1 / Phase 2 / Phase 3

**Scope:** how to measure whether the RAG pipeline actually works. Practical and 8-week-feasible — total eval cost lands under $30 across the entire capstone.

**Companion docs:** [20260428_project_plan.md](20260428_project_plan.md) (Phase 1 build), [20260428_project_plan_phase_2.md](20260428_project_plan_phase_2.md) (Phase 2 build).

---

## Overview

Evaluation splits into **two layers**, mirroring how DSCI lecture 07 frames it:

> *"Evaluation is typically done at two levels: retrieval quality (are we retrieving the right documents?) and generation quality (is the final answer accurate, faithful, and relevant?)."*

The lecture **only covers retrieval-side metrics**. We extend with generation-side metrics that are standard in production RAG but not in the course material. Below is the full map at a glance.

### Retrieval Quality (Layer 1) — directly from Lecture 07

| Metric | What it captures (one line) |
|---|---|
| **Precision@K** | Of the K chunks retrieved, what fraction were relevant? — *cleanliness* |
| **Recall@K** | Of all relevant chunks, what fraction made top-K? — *completeness* |
| **MRR** (Mean Reciprocal Rank) | How early did the first relevant chunk appear? — *ranking quality* |
| **Hit Rate@K** | Did at least one relevant chunk make top-K? — *floor / sanity check* |

### Generation Quality (Layer 2) — beyond the lecture

| Metric | What it captures (one line) |
|---|---|
| **Hallucination Testing** | Did the answer fabricate facts, get numbers wrong, or recommend something the rule book wouldn't? Scored via LLM-as-judge with manual spot-check. |
| **Consistency Testing** | Same question, paraphrased — does the system still give the same recommendation? |

### Supporting metrics (also generation-side)

| Metric | What it captures (one line) | Phase |
|---|---|---|
| **Refusal calibration** | When info isn't in the corpus, does the system say "I don't have that information"? | 1 + 2 |
| **Citation correctness** | When the answer cites `[3]`, does chunk 3 actually contain the cited claim? | 1 + 2 |
| **Tool-use accuracy** | Did the agent pick the right tool(s) with the right arguments? | 2 only |

### Who runs what

```
┌─────────────────────────────────────────────────────────────┐
│  Pure Python (deterministic, free, fast)                    │
│    • Precision@K, Recall@K, MRR, Hit Rate@K                 │
│    • Refusal calibration (regex on refusal phrases)         │
│    • Tool-use accuracy (compare tool-call lists)            │
│    • Citation tag parsing (regex)                           │
│    • Canonical-claim substring match (consistency #2)       │
│    • Chunk Jaccard overlap (consistency #4)                 │
├─────────────────────────────────────────────────────────────┤
│  LLM-as-judge (one model, ~$0.01 per call)                  │
│    • Hallucination scoring (correctness + groundedness)     │
│    • Citation claim verification                            │
│    • Paraphrase semantic equivalence (consistency #3)       │
└─────────────────────────────────────────────────────────────┘
```

One judge model handles all LLM-driven checks (recommended: Claude Opus 4.7 or GPT-4o — different from the Sonnet 4.6 generator, to avoid self-evaluation bias).

---

## The Gold Set — foundation for everything

### Purpose

The **gold set** is a fixed, hand-curated benchmark of ~30 questions where the correct answer is known in advance. Run the system against it after every meaningful change; record metrics; compare across runs.

| Without a gold set | With a gold set |
|---|---|
| "Demo looks good" | "Recall@5 went from 0.62 to 0.84 between v1 and v2" |
| Subjective sponsor reviews | Quantitative weekly tracking |
| Can't tell if today's tweak fixed yesterday's bug | Regression-test every change |
| Capstone defense relies on demo vibes | Defense cites concrete metrics |

The gold set is **immutable** once locked — never edit a question after recording metrics against it, or you can't compare runs.

### Schema (CSV columns)

| Column | Purpose | Example |
|---|---|---|
| `qid` | Question ID — unique key for cross-run comparison | `Q05` |
| `category` | Group questions by type for diagnostic breakdowns | `rehab_lookup` / `cost_lookup` / `multi_hop` / `refusal` |
| `question` | The primary user query | "What does GDOT recommend for asphalt at PCI 65?" |
| `paraphrase_1` | Same question, reworded — for consistency testing | "For asphalt at PCI 65, what's the rule-book treatment?" |
| `paraphrase_2` | Another rewording | "PCI 65 asphalt — what should I do per GDOT guidance?" |
| `gold_chunks` | Chunk IDs that contain the answer — used by retrieval metrics | `["GDOT_p042", "byGISID_Rehabs_row_18"]` |
| `canonical_claims` | Key facts the answer should mention — used by answer metrics | `["chip seal", "11.75", "PCI 60-80"]` |
| `reference_answer` | The full gold answer — used by LLM-as-judge | "GDOT and the IMS rule book recommend chip seal..." |
| `expected_tools` | Which tool(s) Phase 2 should call — for tool-use eval | `["get_rehab_for_pci"]` |

### `gold_chunks` vs `canonical_claims` — disambiguation

These live at **different layers** of the evaluation:

| | `gold_chunks` | `canonical_claims` |
|---|---|---|
| What it lists | Chunk IDs / source pointers | Key facts / phrases |
| Used by | Retrieval metrics (Layer 1) | Answer metrics (Layer 2) |
| What it answers | "Did the system find the right *places*?" | "Did the system put the right *facts* in its answer?" |

They sit at two distinct stages of the pipeline:

```
Question
   │
   ▼
┌─────────────────┐
│   Retrieval     │ ◄──── evaluated with `gold_chunks`
│   (top-K)       │       (Recall@K, Precision@K, MRR, Hit Rate)
└─────────────────┘
   │
   ▼
┌─────────────────┐
│   Generation    │ ◄──── evaluated with `canonical_claims`
│   (LLM answer)  │       (claim coverage, hallucination, consistency)
└─────────────────┘
   │
   ▼
Answer
```

### 30-question composition

| Category | # questions | Source of ground truth |
|---|---:|---|
| PCI band → activity lookup | 8 | `Rehabs` sheet (deterministic) |
| Cost-per-unit lookup | 5 | `Rates` sheet + 2024 Bid Tabulation |
| GDOT chapter / section recall | 6 | GDOT TOC + section text |
| Cross-source synthesis (2015 vs 2022) | 5 | `Neighborhood PCI Averages` historic columns |
| Refusal calibration (out-of-corpus) | 3 | Should answer "I don't have that information" |
| Consistency under paraphrase | 3 | Same Q, 3 wordings, expect same recommendation |

### The missing-relevant-chunks problem

You will inevitably miss labelling some relevant chunks when authoring the gold set. This biases retrieval metrics in opposite directions:

| If you under-label `gold_chunks` | Effect |
|---|---|
| Recall@K | Looks artificially **high** (denominator too small) |
| Precision@K | Looks artificially **low** (truly-relevant chunks scored as false positives) |
| MRR | Looks artificially **low** (first true-positive may be misclassified) |

**Mitigation — iterative refinement (1-hour pass after v1 runs):**

After Phase 1 v1, before recording official numbers, review chunks the system retrieved that *weren't* in the gold list. If any are genuinely relevant, add them. Then **lock the gold set** and use it unchanged for all subsequent runs.

```python
# eval/refine_gold.py — run once after the v1 system run
for q in gold_set:
    retrieved = top5(q)
    unjudged = [c for c in retrieved if c not in q.gold_chunks]
    for c in unjudged:
        # Manually inspect the chunk text and decide
        if user_confirms_relevant(c):
            q.gold_chunks.append(c)
```

**Belt-and-braces — trust answer-side metrics for the final verdict.** Claim coverage and LLM-judge correctness do **not** depend on `gold_chunks` completeness. So:

| Tier | Metric | Trustworthiness |
|---|---|---|
| **Headline** | Claim coverage + LLM-judge correctness | ✅ Robust to gold-chunk gaps |
| **Headline** | Refusal accuracy + consistency | ✅ Robust |
| **Diagnostic** | Recall@K / MRR / Precision@K | ⚠️ Conditional on labelling — cite the limitation |

Capstone-report sentence: *"Gold-chunk labelling is exhaustive within obvious sources, with one refinement pass after v1; reported Recall@K may be slightly biased by remaining missed labels, which we cross-validate with claim coverage (which does not depend on gold-chunk labelling)."*

---

## Retrieval Quality — Layer 1 (from Lecture 07)

All four metrics share one setup: **the system retrieves K chunks** (typically K=5). For each gold question, you've labelled which chunks are *relevant* (`gold_chunks`). The metrics compare the retrieved K against the labelled relevant.

### Worked example — Q05

> **Question:** "What does GDOT recommend for asphalt at PCI 65?"
> **`gold_chunks`:** `["GDOT_p042", "byGISID_Rehabs_row_18"]`
>
> **System retrieved (top-5):**
> | Position | Chunk | Relevant? |
> |---|---|---|
> | 1 | `GDOT_p107` (about fog seal) | ❌ |
> | 2 | `byGISID_Rates_row_3` (patching prices) | ❌ |
> | 3 | `GDOT_p042` (chip seal section) | ✅ |
> | 4 | `IMS2015_Comps_row_5` (life-cycle estimate) | ❌ |
> | 5 | `byGISID_Rehabs_row_18` (rule-book PCI 60–80) | ✅ |

### The four metrics computed on Q05

| Metric | Formula | Q05 result |
|---|---|---:|
| **Recall@5** | `# relevant in top-5 / # all relevant` | 2 / 2 = **1.00** |
| **Precision@5** | `# relevant in top-5 / 5` | 2 / 5 = **0.40** |
| **MRR (this query)** | `1 / rank_of_first_relevant` | 1 / 3 = **0.33** |
| **Hit Rate@5** | `1 if any relevant in top-5 else 0` | **1** |

You compute each metric **per question**, then **average across the gold set** to get the headline numbers.

### Why each one matters

| Metric | Captures | Why it matters for RAG |
|---|---|---|
| **Recall@K** | Completeness | If the right chunk isn't in top-K, the LLM can't see it — so a wrong answer is guaranteed. Most important. |
| **Precision@K** | Cleanliness | Lower precision → more noise in the prompt → cost + distraction. Less critical at K=5; more critical at large K. |
| **MRR** | Ranking quality | P@K and R@K don't care about position; MRR does. The LLM weighs top chunks more heavily, so rank-1 matters more than rank-5. |
| **Hit Rate@K** | Floor | Coarsest signal — sanity-checks "did retrieval do *anything* useful?" |

### Pure-Python implementation

```python
def retrieval_metrics(retrieved_top5: list[str], gold_chunks: list[str]) -> dict:
    gold = set(gold_chunks)
    relevant_in_top5 = [c for c in retrieved_top5 if c in gold]
    
    # Find rank of first relevant chunk
    first_rank = next((i + 1 for i, c in enumerate(retrieved_top5) if c in gold), None)
    
    return {
        "recall@5":    len(relevant_in_top5) / max(1, len(gold)),
        "precision@5": len(relevant_in_top5) / 5,
        "mrr":         (1 / first_rank) if first_rank else 0.0,
        "hit_rate@5":  1 if relevant_in_top5 else 0,
    }
```

### Targets for the capstone

| Metric | Phase 1 target | Phase 2 target |
|---|---:|---:|
| Recall@5 | ≥ 0.65 | ≥ 0.85 |
| Precision@5 | ≥ 0.40 | ≥ 0.50 |
| MRR | ≥ 0.55 | ≥ 0.70 |
| Hit Rate@5 | ≥ 0.85 | ≥ 0.95 |

---

## Generation Quality — Hallucination Testing

### Purpose

Catch the moment the system invents a fact, mis-cites a number, or recommends something the rule book wouldn't. This is half of PavePal's stated chatbot specs (*"will AI make things up?"*).

### Define what counts as a hallucination

| Type | Definition | Example failure |
|---|---|---|
| **Fabricated fact** | Claim not supported by any retrieved chunk | "GDOT recommends slurry seal for railway crossings" (not in corpus) |
| **Numeric error** | Number cited wrongly given the source | Says "$14.25/yd² for residential thin overlay" when source says $11.75 |
| **Wrong attribution** | Claim is in the corpus but cited to the wrong source | Cites GDOT page 42 for a number actually from the IMS Rehabs sheet |
| **Unsupported recommendation** | Recommends an activity the rule book wouldn't | Recommends chip seal for PCI 35 (rule says chip seal applies at PCI 60–80) |

### Scoring rubric (two scores per question, both 0 / 0.5 / 1)

```
correctness  = 1.0 if answer matches reference on the substantive claim
               0.5 if partially correct (right activity, wrong cost — or vice versa)
               0.0 if any of the 4 hallucination types above is present

groundedness = 1.0 if every claim in the answer is verifiable from cited chunks
               0.5 if mostly grounded, 1–2 minor unsupported add-ons
               0.0 if any major claim has no chunk-level support
```

Two scores because they fail in different ways — an answer can be correct but ungrounded (right by accident from training data) or grounded but incorrect (cites the wrong row from the right document).

### Who scores it

**Primary: LLM-as-judge** for routine eval reruns — automated, ~$0.01/question, ~10 sec/question.

**Backup: human spot-check** of 10 of 30 questions per phase — validates the LLM-judge isn't drifting; ~30 minutes per phase.

### LLM-judge prompt

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

### Targets

| Metric | Phase 1 target | Phase 2 target |
|---|---:|---:|
| Mean correctness (LLM-judge) | ≥ 0.65 | ≥ 0.80 |
| Mean groundedness (LLM-judge) | ≥ 0.70 | ≥ 0.85 |
| Hallucination-type frequency | < 25% of answers | < 10% of answers |

---

## Generation Quality — Consistency Testing

### Purpose

Catch the moment the same underlying question gets different answers because of surface-level wording differences. This is the other half of PavePal's stated specs (*"will AI consistently recommend the same thing?"*).

### Two flavours of consistency

| Flavor | Setup | What it really tests |
|---|---|---|
| **(A) Same topic, different wording** | 3 paraphrases of the same question | Robustness of retrieval + reasoning to surface form |
| **(B) Identical query, multiple times** | Same question repeated N times | Stochasticity of the LLM |

**Flavor B is mostly a smoke test.** With `temperature=0` the LLM is deterministic by construction — same input bytes → same output. So flavor B becomes `assert run1 == run2` rather than a graded metric. Run it once per phase to catch any unexpected stochasticity.

**Flavor A is the real metric.** It exercises the whole pipeline against rewordings the user would naturally produce.

### How to measure flavor A — combine 3 methods

We drop method #1 (exact-match) entirely — LLMs reword every time, so it'd always score 0. Use a weighted mix of the other three:

| # | Method | Concretely | Catches failure in... |
|---|---|---|---|
| **#2** | Canonical-claim match | Did all 3 paraphrases mention every fact in `canonical_claims`? | Generation step |
| **#3** | LLM-judge equivalence | Ask judge: "do these 3 answers convey the same recommendation?" | Generation step (semantic equivalence) |
| **#4** | Cited-chunk Jaccard | Compute Jaccard of retrieved-chunk sets across 3 paraphrases | Retrieval step |

### Combined formula

```python
consistency_score = (
    0.4 * canonical_match_rate    # method #2
  + 0.3 * llm_judge_equivalence   # method #3 (0 or 1)
  + 0.3 * chunk_jaccard           # method #4
)

# where:
canonical_match_rate = |claims_in_ALL_3_answers| / |canonical_claims|
chunk_jaccard        = |c1 ∩ c2 ∩ c3| / |c1 ∪ c2 ∪ c3|
```

**Diagnostic value:** if #2 fails but #4 passes → generation is the problem. If #4 fails → retrieval is the problem. So you get a *direction* not just a number.

### Pure-Python implementation (methods #2 and #4)

```python
def consistency_score(answers: list[str], retrievals: list[set[str]],
                      canonical_claims: list[str], llm_equivalence: int) -> dict:
    # Method #2 — fraction of canonical claims present in ALL answers
    claims_present_in_all = [
        c for c in canonical_claims
        if all(c.lower() in a.lower() for a in answers)
    ]
    canonical_match = len(claims_present_in_all) / max(1, len(canonical_claims))
    
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

### Targets

| Metric | Phase 1 target | Phase 2 target |
|---|---:|---:|
| `consistency_score` (combined) | ≥ 0.75 | ≥ 0.90 |
| Flavor B (smoke test) | 100% | 100% |

---

## Supporting Metrics

### Refusal calibration

**Purpose:** when the user asks something not in the corpus, does the system politely say "I don't have that information" instead of confabulating?

**How:** add 5 questions to the gold set with `category = "refusal"` whose answers are deliberately not in any source document. Examples:

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

refusal_accuracy = sum(is_refusal(ask(q)) for q in refusal_questions) / len(refusal_questions)
```

**Target:** ≥ 0.90 by Phase 2.

### Citation correctness

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
    # Parse [N] tags per sentence
    sentences_with_cites = parse_sentences_with_citations(answer)
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

**Target:** ≥ 0.90 by Phase 2.

### Tool-use accuracy (Phase 2 only)

**Purpose:** the agent in Phase 2 may call multiple tools per turn. Did it pick the right ones, with the right arguments?

**How:** label `expected_tools` per gold question. After running, compare with `actual_tools` from `intermediate_steps`.

```python
def tool_use_metrics(actual_steps, expected_tools, expected_args=None):
    actual_tools = [s[0].tool for s in actual_steps]
    expected = set(expected_tools)
    
    selection_recall = len(expected & set(actual_tools)) / max(1, len(expected))
    chain_overhead   = len(actual_tools) - len(expected_tools)  # 0 = perfect
    
    arg_correct = 0
    if expected_args:
        for step, exp in zip(actual_steps, expected_args):
            if step[0].tool_input.get(exp["key"]) == exp["value"]:
                arg_correct += 1
    arg_accuracy = arg_correct / max(1, len(expected_args)) if expected_args else None
    
    return {
        "selection_recall": selection_recall,
        "chain_overhead": chain_overhead,
        "arg_accuracy": arg_accuracy,
    }
```

**Targets:** `selection_recall ≥ 0.85`, `chain_overhead ≤ 1`, `arg_accuracy ≥ 0.90`.

---

## The Eval Harness

### Project layout

```
pavepal-capstone/
├── eval/
│   ├── gold_set.csv              ← 30 labelled questions
│   ├── refine_gold.py            ← review/refine after v1 run
│   ├── run_eval.py               ← main harness (all metrics)
│   ├── test_behavior.py          ← pytest for refusal + consistency
│   ├── plot_runs.py              ← read all CSVs, plot trends
│   └── runs/
│       ├── phase1_run_20260505_1430.csv
│       ├── phase1_run_20260512_0900.csv
│       ├── phase2_run_20260519_1100.csv
│       └── ...                   ← every CSV kept; never overwrite
```

### Step-by-step procedure (after each meaningful change)

| Step | What | Cost / time |
|---|---|---|
| 1. Author gold set (one-time, week 2) | 30 questions × 9 columns each | ~6 hours of careful reading |
| 2. Run system over gold set | 30 main + 60 paraphrases = 90 LLM calls | ~$3.60 per pass at Sonnet 4.6 |
| 3. Score retrieval (Layer 1) | Pure Python — Recall@5, Precision@5, MRR, Hit@5 | Instant |
| 4. Score generation (Hallucination) | LLM-judge × 30 questions | ~$0.30 per pass |
| 5. Score consistency | Methods #2 + #4 (Python) + #3 (LLM-judge) | ~$0.30 per pass |
| 6. Score supporting metrics | Refusal (Python), Citation (mixed), Tool-use (Python) | ~$0.20 per pass |
| 7. Roll up to summary CSV | Pandas aggregate by category | Instant |

**Per-run cost: ~$4.50.** Refinement pass after v1 (step 0): ~1 hour of human review.

### Eval harness sketch

```python
# eval/run_eval.py
import json
from pathlib import Path
import pandas as pd
from langchain_anthropic import ChatAnthropic

from agent.run_agent import ask                # Phase 2 entry point
                                                # (or chat.chain.ask for Phase 1)

GOLD = pd.read_csv("eval/gold_set.csv")
JUDGE = ChatAnthropic(model="claude-opus-4-7", temperature=0, max_tokens=512)

def evaluate_one(row):
    expected_chunks  = eval(row["gold_chunks"])
    canonical_claims = eval(row["canonical_claims"])
    expected_tools   = set(eval(row["expected_tools"]))

    # Run system on main question + 2 paraphrases
    forms = [row["question"], row["paraphrase_1"], row["paraphrase_2"]]
    runs = [ask(q) for q in forms]
    main_run = runs[0]

    # === Layer 1 — retrieval ===
    retrieved_main = extract_chunk_ids(main_run["intermediate_steps"])
    retrieval = retrieval_metrics(retrieved_main, expected_chunks)

    # === Layer 2 — hallucination ===
    judge_verdict = llm_judge(HALLUCINATION_JUDGE_PROMPT.format(
        question=row["question"],
        retrieved_context=format_chunks(retrieved_main),
        reference_answer=row["reference_answer"],
        system_answer=main_run["output"],
    ))

    # === Consistency ===
    answers = [r["output"] for r in runs]
    retrievals = [set(extract_chunk_ids(r["intermediate_steps"])) for r in runs]
    consistency = consistency_score(
        answers, retrievals, canonical_claims,
        llm_equivalence=llm_judge_equivalence(answers),
    )

    # === Supporting ===
    is_ref = is_refusal(main_run["output"])
    citation = citation_score(main_run["output"], main_run["retrieved_docs"])
    tool_use = tool_use_metrics(main_run["intermediate_steps"], expected_tools)

    return {
        "qid": row["qid"], "category": row["category"],
        **retrieval,
        "correctness":   judge_verdict["correctness"],
        "groundedness":  judge_verdict["groundedness"],
        "hallucinations": judge_verdict["hallucinations"],
        **consistency,
        "is_refusal":    is_ref,
        "citation_correctness": citation,
        **tool_use,
    }

if __name__ == "__main__":
    results = [evaluate_one(r) for _, r in GOLD.iterrows()]
    out = Path("eval/runs") / f"phase2_run_{pd.Timestamp.now():%Y%m%d_%H%M}.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(results).to_csv(out, index=False)
    print(pd.DataFrame(results).groupby("category").mean(numeric_only=True).round(2))
```

### When to run what

| Trigger | Run |
|---|---|
| After every substantive change (chunk size, embedding swap, new tool, prompt edit) | Full eval harness — saves CSV to `eval/runs/` |
| Before each sponsor checkpoint | Full harness + behavior pytest |
| After Phase 1 → Phase 2 cutover | Full eval on both — compare CSVs |
| Daily during dev | Behavior pytest only (fast) |

---

## What "Good" Looks Like — Summary Targets

| Layer | Metric | Phase 1 target | Phase 2 target |
|---|---|---:|---:|
| **Retrieval (Lecture 07)** | Recall@5 | 0.65 | 0.85 |
| | Precision@5 | 0.40 | 0.50 |
| | MRR | 0.55 | 0.70 |
| | Hit Rate@5 | 0.85 | 0.95 |
| **Hallucination** | Mean correctness | 0.65 | 0.80 |
| | Mean groundedness | 0.70 | 0.85 |
| **Consistency** | Combined consistency score | 0.75 | 0.90 |
| **Supporting** | Refusal accuracy | 0.75 | 0.90 |
| | Citation correctness | 0.75 | 0.90 |
| | Tool selection recall | n/a | 0.85 |
| **Operational** | Mean cost / turn | $0.04 | $0.06 |
| | Mean tokens / turn | 5,000 | 10,000 |

The capstone *report* leans on these numbers improving from Phase 1 → Phase 2 — the eval harness is what makes that report defensible.

---

## Feasibility Summary

| Activity | Time | Money |
|---|---|---|
| Author 30-question gold set | 6 hours one-time | $0 |
| Refinement pass after v1 | 1 hour | $0 |
| Full eval run (after each change) | Automated | ~$4.50 |
| Manual spot-check (10 of 30 per phase) | 30 min/phase | $0 |
| **Total over the 8-week capstone** | ~12 hours human + automated | **< $30** |

Bottleneck is **gold-set quality**, not money — invest the time in authoring the 30 questions carefully. The harness itself is mostly mechanical once that's in place.

---

## What to Cite in the Capstone Report

| Layer | Citation |
|---|---|
| Retrieval (Recall@K, Precision@K, MRR) | Lecture 07 directly — verbatim formulas |
| Hybrid retrieval impact on consistency | Lecture 05 — sparse vs dense matching |
| Generation quality (correctness, groundedness) | RAGAS / standard production-RAG practice |
| Consistency / refusal calibration | Production-RAG practice; lecture 07 mentions but does not teach |
| Tool-use evaluation | Bidly architecture (intermediate_steps logging); novel for the capstone |

Suggested framing: *"We use lecture 07's retrieval metrics as Layer 1, and extend with established RAG-evaluation practice for the generation, consistency, and tool-use layers — building a layered evaluation framework appropriate for this domain."*

---

## References

- `Lecture_notes/07_llms-rag.ipynb` § "RAG evaluation" — Precision, Recall, MRR
- `Lecture_notes/05_info-retrieval-intro-to-transformers.ipynb` — sparse vs dense retrieval
- [RAGAS docs](https://docs.ragas.io/) — faithfulness / answer relevance benchmarks
- [20260428_project_plan.md](20260428_project_plan.md) — Phase 1 build steps
- [20260428_project_plan_phase_2.md](20260428_project_plan_phase_2.md) — Phase 2 build + tool catalogue
