# Implementation Timeline — 8-Week Capstone Plan

**Scope:** end-to-end execution plan that sequences [Phase 1 (Naive RAG)](20260428_project_plan_phase_1.md), [Phase 2 (Agentic RAG with 7 Tools)](20260428_project_plan_phase_2.md), and the [Evaluation Plan](20260429_project_plan_evaluation.md) into a single 8-week schedule.

**Companion docs:**
- [20260428_project_plan_phase_1.md](20260428_project_plan_phase_1.md) — Phase 1 build steps
- [20260428_project_plan_phase_2.md](20260428_project_plan_phase_2.md) — Phase 2 build steps + tool catalogue
- [20260429_project_plan_evaluation.md](20260429_project_plan_evaluation.md) — gold set + metrics

---

## 1. High-level overview

### Iteration philosophy

```
   Build Phase 1 ──► Demo to stakeholders ──► Author gold set ──► Lock Phase 2 tool spec
                              │                                              │
                              ▼                                              ▼
                       Stakeholder feedback                          Tools frozen, signatures known
                              │                                              │
                              └──────────────► Phase 2 build ◄───────────────┘
                                                     │
                                                     ▼
                                          First Phase 2 eval baseline
                                                     │
                                                     ▼
                                ┌─────── Iteration loop (2-3 cycles) ───────┐
                                │  metric weak? → tune prompt/tool/data     │
                                │  rerun eval harness → measure delta       │
                                └────────────────────┬──────────────────────┘
                                                     ▼
                                       Locked final eval + report
```

**Why this order:** Phase 1 is the cheapest way to *learn what the corpus answers well and badly*, which is exactly the input you need to (a) write a meaningful gold set with stakeholders, and (b) decide which 7 tools to actually build in Phase 2. Building Phase 2 tools before Phase 1 has been demoed risks designing tools for problems that don't show up in practice.

### 8-week schedule at a glance

| Week | Focus | Key deliverable | Decision gate |
|---|---|---|---|
| **1** | Phase 1 — ingestion + indexing | Working FAISS index over PDFs + Excel | Sanity-check 5 known queries |
| **2** | Phase 1 — query pipeline + demo | End-to-end naive RAG (`ask()` returns answer + citations) | **Gate A:** Phase 1 demo to stakeholders |
| **3** | Gold set authoring + Phase 1 v2 + Phase 2 spec | 30-Q locked gold set; Phase 2 tool list frozen | **Gate B:** Tool spec locked |
| **4** | Phase 2 — tool implementations | All 7 tools individually unit-tested | All tools return expected shape |
| **5** | Phase 2 — agent assembly + baseline eval | `run_agent.py` runs end-to-end; first full eval CSV | **Gate C:** Phase 2 baseline numbers |
| **6** | Iteration #1 (driven by eval) | Targeted fixes on weakest metric category | Re-run eval, measure delta |
| **7** | Iteration #2 + Phase 3 trigger check | Final tuning; decide if Phase 3 is needed | **Gate D:** Phase 3 go/no-go |
| **8** | Locked final eval + capstone report | Phase 1 vs Phase 2 comparison CSV + written report | Final demo |

### Stakeholder touchpoints (5 total)

| When | Purpose | Output |
|---|---|---|
| End of Week 1 | Kickoff alignment — confirm corpus + use cases | Approved scope |
| **End of Week 2** | Phase 1 demo + gold-set authoring kickoff | Draft 30 questions |
| **End of Week 3** | Phase 2 tool spec lock-in | Frozen tool list + signatures |
| End of Week 5 | Phase 2 baseline review | Iteration priorities |
| End of Week 8 | Final demo + report walkthrough | Capstone sign-off |

### Cost & effort summary

| Activity | Time | Money |
|---|---|---|
| Build Phase 1 + Phase 2 | ~5 weeks of dev work | $0 (compute is local) |
| Eval reruns (one per iteration) | Automated, ~$4.50 each × ~6 runs | ~$27 |
| Gold-set authoring + refinement | ~7 hours human | $0 |
| **Total** | — | **< $30** |

---

## 2. Detailed weekly plan

### Week 1 — Phase 1 ingestion and indexing

**Goal:** turn the raw corpus into a queryable FAISS index. By Friday you should be able to fire 5 known questions at the index and see relevant chunks come back.

| Day | Task | Reference |
|---|---|---|
| Mon | Setup `capstone_env` conda env, install LangChain stack + `pypdf` + `openpyxl` + `langchain-anthropic`. Add `.env` with `ANTHROPIC_API_KEY`. | Phase 1 §Setup |
| Tue | PDF ingestion (`ingest/load_pdfs.py`) — load all 4 PDFs, attach `source` + `page` metadata. Confirm ~730 pages loaded. | Phase 1 §1 |
| Wed | Excel ingestion (`ingest/load_excels.py`) — narrative sheets (`Acronyms`, `Comps`, `Rehabs`) + tabular row-summary template for `App A Inventory`. Watch out for `header=7` quirk. | Phase 1 §2 |
| Thu | Chunking (`ingest/chunk.py`) with `RecursiveCharacterTextSplitter` (2000 chars, 250 overlap). Embedding setup with `BAAI/bge-base-en-v1.5`. Build FAISS index (`ingest/build_index.py`). | Phase 1 §3-5 |
| Fri | Sanity check (`ingest/sanity_check.py`) — 5 known queries; confirm relevant chunks rank in top-3. **First stakeholder kickoff meeting** — confirm corpus scope, use cases, who attends gold-set authoring. | Phase 1 §6 |

**Deliverable:** `indices/phase1_faiss/` on disk + sanity-check screenshot.

**Risks to watch:**
- GDOT PDF tables may extract scrambled — fall back to `Docling` or `Unstructured.io` for those specific chapters only.
- BGE-base download is ~440 MB; do this on Mon morning so it doesn't block Thu.

---

### Week 2 — Phase 1 query pipeline + first stakeholder demo

**Goal:** complete naive RAG end-to-end, then demo it to stakeholders Friday so we can use that conversation to seed the gold set.

| Day | Task | Reference |
|---|---|---|
| Mon | Retriever (`chat/retrieve.py`) — `vectorstore.as_retriever(k=5)`. Prompt (`chat/prompt.py`) — `ChatPromptTemplate` with citation rules. | Phase 1 §7-9 |
| Tue | Wire LangChain pipe-chain (`chat/chain.py`) with Claude Sonnet 4.6, `temperature=0`. Confirm `ask()` returns `(answer, retrieved_docs)`. | Phase 1 §10 |
| Wed | Citation post-processing (`chat/cite.py`) — parse `[N]` tags, attach Sources footer. Logging (`chat/log.py`) — JSONL per turn with retrieved chunks + token counts. | Phase 1 §11-12 |
| Thu | Run 10-15 informal queries; eyeball failures; jot down the categories of question that fail (these become Phase 2 tool requirements). | — |
| Fri | **Stakeholder demo (Gate A).** Walk through 5-10 live queries. Capture every "but what about X?" question — this is the seed list for the gold set. Schedule next week's gold-set authoring session. | — |

**Deliverable:** `chat/log.py` runnable end-to-end; demo script.

**Gate A criteria (must pass to start Week 3):**
- `ask("What does GDOT recommend for asphalt at PCI 65?")` returns a coherent answer with citations.
- Stakeholders see the demo and approve moving to gold-set authoring.

---

### Week 3 — Gold set authoring + Phase 1 v2 + Phase 2 tool spec freeze

**Goal:** lock the evaluation benchmark *and* the Phase 2 tool list before any Phase 2 code is written. Both have to happen this week so Week 4 starts cleanly.

| Day | Task | Reference |
|---|---|---|
| Mon | **Gold-set authoring session (~3 hrs with stakeholders, ~3 hrs solo).** Author the 30-question CSV with all 9 columns: `qid`, `category`, `question`, `paraphrase_1`, `paraphrase_2`, `gold_chunks`, `canonical_claims`, `reference_answer`, `expected_tools`. Mix per the eval plan: 8 PCI→activity, 5 cost lookups, 6 GDOT recall, 5 cross-source, 3 refusal, 3 consistency. | Eval §Gold Set |
| Tue | Run Phase 1 v1 over the gold set (`eval/run_eval.py` against `chat/chain.py`). Save first CSV as `phase1_run_v1_<date>.csv`. Examine which gold chunks the system retrieved that *weren't* labelled — refine the gold set (`eval/refine_gold.py`), then **lock it**. | Eval §Refinement |
| Wed | Phase 1 v2 — based on v1 weaknesses, do one chunk-size sweep (1000 / 2000 / 4000), and add BM25 fallback if exact-identifier queries are failing. Re-run eval to confirm v2 ≥ v1 on Recall@5 and MRR. | Phase 1 §What's worth iterating |
| Thu | Map each gold-set question to *which Phase 2 tool would have answered it best.* This produces the empirical justification for the 7-tool list. Cross-check against the catalog in Phase 2 §"Why these 7 tools." | Phase 2 §Why these 7 tools |
| Fri | **Stakeholder meeting #2 (Gate B).** Walk through Phase 1 v2 metrics, present the 7-tool spec with concrete examples ("for question Q07, this tool would have returned this row"). Get sign-off. **Freeze tool signatures** — they will not change once Week 4 starts. | — |

**Deliverable:** `eval/gold_set.csv` (locked), `eval/runs/phase1_run_v2_<date>.csv`, frozen tool spec doc.

**Gate B criteria:**
- Gold set locked (no edits permitted after this point — see eval plan §"immutable").
- All 7 tool signatures (function name + arg types + return shape) are documented.
- Phase 1 v2 hits Phase 1 targets: Recall@5 ≥ 0.65, Hit Rate@5 ≥ 0.85, mean correctness ≥ 0.65.

**If Phase 1 v2 misses targets:** that's a signal the *retrieval layer itself* is broken (chunking or embedding), not just that tools are missing. Spend Mon-Tue of Week 4 fixing retrieval before starting Phase 2 — Phase 2's `vector_search` + `bm25_search` inherit Phase 1's index.

---

### Week 4 — Phase 2 tool implementations

**Goal:** build all 7 tools, unit-tested individually, before wiring them into an agent. Tools are easier to debug in isolation.

| Day | Task | Reference |
|---|---|---|
| Mon | `tools/data_loaders.py` — startup-time DataFrame loading for inventory (2015 + 2022), Rehabs sheet, manually-structured 2024 bid tab, PavePal `roadSegments.json`. Build BM25 index (`ingest/build_bm25.py`) → `indices/phase2_bm25.pkl`. | Phase 2 §Setup |
| Tue | Tools 1 + 2 — `vector_search` (carry-over from Phase 1) and `bm25_search`. Both share `_format_docs` for identical citation formatting. | Phase 2 §Tools 1-2 |
| Wed | Tools 3 + 4 + 5 — `lookup_segment`, `find_segments_by_pci`, `get_rehab_for_pci`. The Rehabs lookup is the single most important deterministic tool — write 5 unit tests covering each road class × pavetype × PCI band combination. | Phase 2 §Tools 3-5 |
| Thu | Tools 6 + 7 — `get_unit_cost` (against the hand-structured bid tab DataFrame) and `lookup_pavepal` (dict lookup on `_id`). Extend the bid tab DataFrame with all line items, not just the 5-row sample in Phase 2 §Setup. | Phase 2 §Tools 6-7 |
| Fri | Buffer day — fix any tool that's misbehaving. Confirm each tool returns valid JSON when given (a) a valid input, (b) an invalid input (should return `{"error": ...}`). | — |

**Deliverable:** `tools/` directory with 7 tools, each with at least 3 unit tests (happy path + missing key + bad arg).

**Risks to watch:**
- The 2024 bid tabulation is messy in PDF form — budget Thursday morning for hand-transcription. Once entered, this DataFrame is reused for every cost question.
- The 2022 ESA workbook has different headers (`header=3` vs `header=7`) — unit-test both vintages of `lookup_segment`.

---

### Week 5 — Phase 2 agent assembly + first full eval baseline

**Goal:** wire the 7 tools into a single Claude agent and produce the first comparable Phase 2 eval CSV.

| Day | Task | Reference |
|---|---|---|
| Mon | `agent/system_prompt.py` — write the agent's master prompt with explicit tool-selection guidance (deterministic-first, never paraphrase rehab activities). | Phase 2 §Agent system prompt |
| Tue | `agent/run_agent.py` — `create_tool_calling_agent` + `AgentExecutor` with `max_iterations=10`, `return_intermediate_steps=True`. Smoke-test with the canonical multi-step query: "For GISID 1660, what's the PCI, what does the rule book recommend, and what would it cost in 2024?" — should produce a 3-tool chain. | Phase 2 §Wiring |
| Wed | Extend `chat/log.py` — add `tool_calls` field capturing each `intermediate_step` with tool name, input, output preview. This is what tool-use accuracy metrics consume. | Phase 2 §Step 4 |
| Thu | First full Phase 2 eval run. Save as `phase2_run_baseline_<date>.csv`. Generate the side-by-side Phase 1 v2 vs Phase 2 baseline comparison table. | Eval §Eval harness |
| Fri | **Stakeholder meeting #3 (Gate C).** Present the comparison; jointly identify the weakest 1-2 metric categories — these are Week 6's iteration priorities. | — |

**Deliverable:** `agent/run_agent.py` working end-to-end + `eval/runs/phase2_run_baseline_<date>.csv`.

**Gate C criteria:**
- Phase 2 baseline does not regress *below* Phase 1 v2 on any retrieval metric.
- At least 3 of the 6 question categories show measurable improvement.
- If neither holds, the agent system prompt has a bug — fix Monday of Week 6 before iterating.

---

### Week 6 — Iteration #1 (eval-driven)

**Goal:** close the gap on the *single weakest* metric category from the Week 5 baseline. Don't try to fix everything at once.

The specific work this week is data-driven by Gate C, but the playbook is the same regardless of what's weak:

| If the weakest metric is... | The fix is usually... |
|---|---|
| **Tool selection recall** (agent picks wrong tool) | Tighten tool docstrings + system prompt examples |
| **Hallucination on numeric claims** | Force-route numeric questions through `get_rehab_for_pci` / `get_unit_cost` via prompt rule |
| **Refusal calibration** (over- or under-refuses) | Add explicit refusal examples to system prompt; tune the 3 refusal questions in the gold set as anchor cases |
| **Citation correctness** | Add stricter `_source` field to every tool's return; enforce `[N]` tag pattern in prompt |
| **Recall@5** (vector_search misses) | Re-chunk with smaller chunks; confirm BGE-base is actually in use; consider switching to `bge-large` |
| **Consistency score** | Inspect retrieval Jaccard across paraphrases — if low, fix retrieval; if high but answers diverge, fix prompt |

| Day | Task |
|---|---|
| Mon | Pick the single weakest category. Form one specific hypothesis ("agent isn't calling `get_rehab_for_pci` because the docstring doesn't say 'rule book'"). Make one targeted change. |
| Tue | Re-run eval. Save as `phase2_run_iter1a_<date>.csv`. Did the targeted metric improve? Did anything else regress? |
| Wed | Pick the next-weakest category; repeat the cycle. |
| Thu | Re-run; save as `phase2_run_iter1b_<date>.csv`. |
| Fri | If Phase 2 targets are now met across the board, jump straight to Week 8 prep. Otherwise, one more iteration in Week 7. |

**Deliverable:** at least 2 new eval CSVs in `eval/runs/` showing measurable deltas.

**Anti-pattern to avoid:** changing 3 things at once and re-running the eval — you can't attribute the delta. One change, one rerun.

---

### Week 7 — Iteration #2 + Phase 3 go/no-go decision

**Goal:** final tuning round, then **decide whether Phase 3 (Researcher → Verifier → Composer) is worth building.**

| Day | Task |
|---|---|
| Mon-Tue | Continue Week 6 iteration cadence on the next weakest category. |
| Wed | **Manual spot-check (10 of 30 questions).** Two team members independently score the LLM-judge's verdicts against their own reading. If LLM-judge agreement is < 80%, the judge prompt needs tuning before final eval. | Eval §Who scores it |
| Thu | **Gate D — Phase 3 go/no-go.** Phase 3 is justified *only if* the residual hallucination rate on numeric claims is stuck above ~10% and the team can absorb +400 LOC. Otherwise, skip Phase 3 and use Week 8 for a tighter report. | Phase 2 §Phase 3 preview |
| Fri | If Phase 3 is a go: scaffold `verifier/` and `composer/` directories; write the JSON evidence-bundle schema. (Implementation continues into Week 8 only on a stretch basis.) If no-go: start Week 8 prep early. | — |

**Gate D decision matrix:**

| Phase 2 result | Decision |
|---|---|
| Phase 2 hits all targets in eval plan §"What Good Looks Like" | **Skip Phase 3.** Spend Week 8 polishing report + demo. |
| Phase 2 misses *only* on numeric hallucination (correctness < 0.80 specifically on `cost_lookup` + `multi_hop` categories) | **Build Phase 3.** This is the exact gap the Verifier closes. |
| Phase 2 misses on retrieval (Recall@5, MRR) | **Skip Phase 3 — fix retrieval instead.** Phase 3 doesn't help if the right chunk never made top-K. |
| Phase 2 misses on tool-use accuracy | **Skip Phase 3.** Iterate on system prompt / tool docs in Week 8 instead. |

---

### Week 8 — Final locked eval + capstone report

**Goal:** produce the locked numbers that go into the capstone report, then write it.

| Day | Task |
|---|---|
| Mon | **Final locked eval run.** Run both Phase 1 v2 and Phase 2 final on the locked gold set. Save as `phase1_final_<date>.csv` and `phase2_final_<date>.csv`. After this, no code changes — only writing. |
| Tue | Generate plots (`eval/plot_runs.py`): per-category metric breakdowns, Phase 1 → Phase 2 deltas, cost-per-turn comparison. Manual spot-check the final 10 questions one more time. |
| Wed | Write the report's evaluation section using eval plan §"What to Cite in the Capstone Report." Frame the 4 retrieval metrics as direct from Lecture 07; the generation/consistency/tool-use metrics as principled extensions. |
| Thu | Write the architecture section using the Phase 1 → Phase 2 → (optional) Phase 3 progression. Include the 7-tool catalogue with one example query each. |
| Fri | **Final stakeholder demo.** Live-run 5 representative gold-set questions with both Phase 1 and Phase 2; show the metric tables; walk through the iteration history (CSVs in `eval/runs/`). Capstone sign-off. |

**Deliverable:** capstone report + final demo + complete `eval/runs/` history (every CSV from Week 3 onward kept, never overwritten).

---

## 3. Cross-cutting concerns

### Eval rerun cadence

The eval harness is the project's truth source. Run it:

| Trigger | Run what |
|---|---|
| Any change to chunking, embedding, system prompt, tool code, or bid-tab data | Full eval (`run_eval.py`) — write new CSV |
| Daily during Weeks 4-7 dev | Behavior pytest only (refusal + consistency) — fast, no LLM-judge cost |
| Pre-stakeholder meetings (end of Weeks 2, 3, 5, 7, 8) | Full eval + plots |

**Never overwrite a run CSV.** Every iteration's CSV is permanent — that's how the report shows progression.

### Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Phase 1 v2 fails to hit Recall@5 ≥ 0.65 by end of Week 3 | Medium | Spend first 2 days of Week 4 fixing retrieval before starting Phase 2. Don't skip — Phase 2's `vector_search` inherits the same index. |
| Stakeholders unavailable for Week 3 gold-set session | Medium | Author a draft solo using sanity-check failures + corpus reading; circulate async; lock by mid-Week 4 at the latest. Slipping the lock 1 week is fine; slipping 2 weeks compresses iteration to one round. |
| 2024 bid tabulation hand-transcription takes longer than 1 day | Medium | Start with the 10 most-asked-about line items only; defer the long tail to Week 6. The eval gold set should not depend on completeness of the bid tab beyond those 10 items. |
| LLM-judge disagrees with humans on > 20% of spot-checked answers | Low | Tune the judge prompt in Week 7 *before* the final locked eval; document the disagreement rate in the report. |
| Phase 2 ends Week 5 worse than Phase 1 v2 on any metric | Low-Medium | Treat as a Gate C blocker; do not proceed to Week 6 iteration until baseline is parity-or-better. The agent system prompt is almost always the cause. |
| Phase 3 trigger fires (Gate D) and team lacks bandwidth | Medium | Use the Phase 3 sketch in the report as future-work framing rather than implementing — capstone does not require Phase 3. |

### What the timeline does *not* include (deliberate scope cuts)

These were considered and deferred. Calling them out so they don't sneak back in:

- **Postgres / pgvector migration.** Phase 1 + 2 ship on FAISS in-memory + JSONL logs. Postgres is a Phase 3 artifact only.
- **Multi-session memory / chat history.** Single-turn QA only; the gold set has no multi-turn questions.
- **Frontend / chat UI.** The capstone artifact is a CLI + the report. No web app.
- **Hosted deployment.** All code runs on the dev laptop; no cloud setup.

Adding any of these mid-stream is a likely cause of timeline slippage.

---

## 4. Quick-reference checklist by week

```
□ Week 1  — Phase 1 ingestion + indexing
□ Week 2  — Phase 1 query pipeline + Gate A demo
□ Week 3  — Gold set lock + Phase 2 tool spec freeze (Gate B)
□ Week 4  — 7 tools individually unit-tested
□ Week 5  — Agent assembled + Phase 2 baseline eval (Gate C)
□ Week 6  — Iteration #1 (one weakest metric at a time)
□ Week 7  — Iteration #2 + Phase 3 go/no-go (Gate D)
□ Week 8  — Final locked eval + capstone report
```

The gates are non-negotiable; the day-by-day inside each week can flex if a task takes longer than expected. The order Phase 1 → Gold Set → Phase 2 → Iteration → Final is what makes the timeline defensible — every later step uses the previous step's output.
