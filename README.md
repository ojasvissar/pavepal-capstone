# PavePal Pipeline — Agent-Driven Implementation

A hybrid RAG pipeline (BM25 + dense + RRF, source-aware) for the PavePal capstone (UBC MDS, 2026). Grounds Gemini 2.5 Pro answers in the GDOT Pavement Preservation Guide + PavePal's road-condition JSONs.

This branch (`pipeline_implementation`) contains the **specs, plans, and source data** that a 4-person team uses to ship the pipeline with the help of AI coding agents. The Vite/React frontend lives on other branches and is out of scope here.

---

## Repo layout

```
.
├── Project_plan/
│   ├── 20260509_pipeline_spec.md                 ← architecture + data contracts
│   ├── 20260509_pipeline_implementation_plan.md  ← agent-implementable task list
│   ├── 20260506_phase_1_research_log.md          ← decisions + rationale
│   ├── 20260506_project_plan_evaluation.md       ← eval methodology
│   ├── 20260506_gold_set.md                      ← test set design
│   └── 20260506_working_log.md                   ← T-task probes
├── GDOT_summary.md                               ← what's in the source PDF
├── data/                                         ← partner data (PDF + JSONs)
├── env.yaml                                      ← conda env spec
├── .env.example                                  ← copy to .env, add GOOGLE_API_KEY
├── .gitignore
└── README.md                                     ← this file
```

The pipeline source code (`src/pavepal/...`, `tests/`, `eval/`, `notebooks/`) does NOT exist yet — agents create it from scratch by following the implementation plan.

---

## One-time setup (5 minutes)

1. **Get a Gemini API key** at <https://aistudio.google.com/>. The free dev tier covers most of the build.

2. **Create the conda env**:

   ```bash
   conda env create -f env.yaml
   conda activate capstone_env
   ```

3. **Set your API key**:

   ```bash
   cp .env.example .env
   # Edit .env and set GOOGLE_API_KEY=your_key_here
   ```

4. **Confirm the partner data is in place**:

   ```bash
   ls -la data/
   # Expect: GDOT_PAVEMENT_PRESERVATION_GUIDE.pdf, roadSegments.json, locations.json
   ```

   If the JSONs are missing, copy them from your local copy of the partner data — agents need all three files to build the index.

---

## How to use this with an AI coding agent

Each teammate (Diana, Claudia, Ojasv, William) owns a phase or track. Pick yours from the table below.

### Step 1 — Open your AI coding agent

Claude Code, Cursor, Aider, or whatever you use. The plan is structured so any reasonably capable agent can execute it.

### Step 2 — Tell it what to read

Hand the agent these files (drag them into context, or `@` them depending on the tool):

- `Project_plan/20260509_pipeline_implementation_plan.md` — the plan
- `Project_plan/20260509_pipeline_spec.md` — the spec
- The 4 upstream docs in `Project_plan/` (research log, eval plan, gold set, working log)
- `GDOT_summary.md`

### Step 3 — Give it this instruction

```
Execute Phase X tasks in the implementation plan, in order. For each task:
  1. Run the precondition checks. If any fail, stop and tell me.
  2. Follow the TDD steps as written.
  3. Run the verification step.
  4. Commit per the plan's instructions.
Stop and ask only when a precondition or verification fails for a reason
the plan didn't anticipate.
```

Replace `X` with your phase number.

---

## What the agent does per task

The plan codifies the same loop for every task:

| Step | What happens |
|---|---|
| **Preconditions** | Agent runs `test -f ...` checks. If a sister-track output isn't ready, agent waits or asks |
| **Failing test** | TDD — write the test that proves the feature is missing |
| **Run (fail)** | Confirm the test actually fails |
| **Implement** | Minimal code to pass |
| **Run (pass)** | Confirm the test passes |
| **Verify** | Deterministic shell check (`grep -q ...`, `python -c "..."`) — no human eyeballing |
| **Commit** | Conventional-commit message (`feat:`, `test:`, `chore:`, `fix:`) |

No `<fill>` placeholders. Auto-scored experiments. Auto-written findings docs.

---

## Phase order and ownership

| # | Phase | Owner(s) | Output |
|---|---|---|---|
| 0 | Foundation | Claudia + Diana | env, scaffold, data contracts (`Chunk`, `AnswerWithCitations`), eval glossary |
| 1 | Parser experiment | Claudia | `parser_experiment_results.json` — locks PDF parsing strategy |
| 2A | Indexing data prep | Diana | `pdf_parse`, `chunker`, JSON flatteners |
| 2B | Dense retrieval | Claudia | BGE Embedder, per-source Chroma retrievers |
| 2C | Sparse + fusion | Ojasv | BM25 retrievers, RRF fusion, public `Retriever` class |
| 2D | Generation + glue | William | prompt template, `Generator`, `Pipeline`, CLI |
| 3 | Integration | Diana / Claudia / Ojasv | `Indexer` orchestrator, e2e smoke tests, demo notebook |
| 4 | T-task verifications | Claudia / Ojasv | BGE prefix + policy B validation reports (auto-written) |
| 5 | Sign-off | Diana / Claudia | README quick-start + full test suite green |

**Execution constraints:**

- Phase 0 is sequential within itself (split between Claudia and Diana per the task assignments).
- **Phase 1 must finish before Phase 2A starts** — `pdf_parse.py` reads `parser_experiment_results.json`.
- Phases 2B, 2C, 2D run in parallel with 2A.
- Phase 3 needs all of Phase 2 done.

---

## Cross-track handoffs

When two owners' work overlaps (e.g., Diana's `Indexer` calls Claudia's `Embedder`), the plan uses **file-based sync points** — not human coordination. The agent checks for the sister track's committed file before starting; if missing, it waits or asks.

See "Cross-track sync points" near the top of the implementation plan for the full list.

---

## When to ask a human

Most failures the agent should fix forward (read traceback, fix root cause, add a regression test, commit). Pause and ask only when:

- A precondition still fails after the sister track has clearly committed the expected file
- A verification step finds the auto-output is obviously wrong (rare — see T1.2 caveat in the plan: agent's parser-scoring rubric occasionally disagrees with eyeballed truth; manual override is to edit `notebooks/parser_experiment_results.json` and re-commit)
- Repeated 4xx responses from Gemini that are NOT rate limits

---

## Pull requests and issues

When you open a PR or issue, the templates in `.github/` prefill the structure. Keep entries short. The PR template's "Next steps" section is what teammates' agents check to know which sister tracks are now ready to start.

- PR template: `.github/pull_request_template.md`
- Issue template: `.github/ISSUE_TEMPLATE/issue.md`

---

## Cost expectation

Approximate Gemini API spend across the entire build:

| Scenario | Total |
|---|---:|
| **Most likely** — staying in free dev tier most days | **<$5** |
| **Worst case** — paying for everything | **~$25** |
| **Pessimistic** — also swap judge model to Claude Opus 4.7 / GPT-4o | **~$35** |

See spec §11.4 for the per-component breakdown.

Everything else (BGE embeddings, BM25, Chroma retrieval, indexing) is local and free.

---

## Done-when

The pipeline is shippable when:

- All `pytest` markers pass: default, `-m integration`, `-m slow`
- `python -m pavepal index build` succeeds against the real partner PDF + JSONs
- `python -m pavepal query "..."` returns an answer with `[N]` citations
- The 3 T-task findings docs are auto-written and committed:
  - `Project_plan/20260509_parser_experiment_findings.md`
  - `Project_plan/20260509_t2_bge_prefix_findings.md`
  - `Project_plan/20260509_t3_policy_b_findings.md`
- Eval-plan §7 metric targets are met

After that: a `<date>_web_app_spec.md` (FastAPI wrapper + Vite frontend wiring) becomes the next deliverable. Don't start it earlier.
