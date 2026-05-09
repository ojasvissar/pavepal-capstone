# Phase 1 Pipeline Spec — Implementation Blueprint

**Date:** 2026-05-09
**Status:** Draft v2 — supersedes [archive/20260507_phase_1_spec.md](archive/20260507_phase_1_spec.md)
**Changes vs v1:** added §5.2 parser-selection experiment (3-way bake-off including Vision LLM); added §9.2 self-documenting eval output + run-comparison artifacts; added §11.4 cost summary; renamed *Phase 1 Spec* → *Phase 1 **Pipeline** Spec* in anticipation of a future `<date>_web_app_spec.md` covering the frontend layer.
**Companion docs:**
- [20260506_phase_1_research_log.md](../20260506_phase_1_research_log.md) — *why* each architecture pick was made
- [Project_plan/20260506_project_plan_evaluation.md](20260506_project_plan_evaluation.md) — eval methodology + harness sketch
- [Project_plan/20260506_gold_set.md](20260506_gold_set.md) — 10-question test set template
- [GDOT_summary.md](../GDOT_summary.md) — what's in the source PDF
- [20260506_working_log.md](../20260506_working_log.md) — open T-tasks (referenced in §12)

> **What this doc is:** the build artifact. Module/file layout, cross-module function signatures, data contracts, acceptance criteria. A dev should be able to start writing code from this without re-reading the upstream prose.
>
> **What this doc is NOT:** the *why*. For trade-offs, alternatives, and reasoning, see the research log. Edits to architecture flow research log → spec, never the other way.

---

## §1 Scope & non-goals

| In scope | Out of scope |
|---|---|
| Phase 1 RAG pipeline: indexing → retrieval → generation | Phase 2 multi-agent (its own spec when built) |
| CLI entry points (`pavepal.index`, `pavepal.query`) | Web frontend (separate `<date>_web_app_spec.md`, future) |
| Public Python API the eval harness imports | Excel / IMS files (not in corpus per CLAUDE.md) |
| Demo notebook + parser-experiment notebook | Image / figure citations (chunks point at text, not images) |
| Per-turn JSONL logging | Reranker (deferred — research log §9) |
| Self-documenting eval output (§9.2) | |

§11 specifies the JSON-serializable data contracts that make a future web frontend a one-afternoon add when the time comes.

---

## §2 System architecture

```
ONE-TIME INDEXING
  GDOT PDF ─► parse (§5.2 winner) ─► page chunks ──┐
  roadSegments JSON ─► flatten ───────────────────┼─► same Chunk list
  locations JSON ─► flatten ──────────────────────┘         │
                                                            ├─► dense embed (BGE) ─► Chroma (filtered by source)
                                                            └─► tokenize ─────────► 3 per-source BM25 pickles

PER USER QUESTION
  Question ─► dense embed (BGE + query prefix)
           ─► tokenize (same fn as index)
           ─► policy B fan-out: 3 sources × 2 channels = 6 ranked top-K=5 lists
           ─► RRF (k_rrf=60) over 30 candidates
           ─► top_n=5 chunks
           ─► prompt template + chunks ─► Gemini 2.5 Pro
           ─► AnswerWithCitations { answer_text with [N] tags, citations, refused, retrieved_chunks }
           ─► JSONL log line
```

**Three invariants** (break any one and retrieval silently degrades):

1. **Same embedding model** at index time and query time. (research log §2)
2. **Same chunk list** feeds dense and sparse — if BM25 sees a different chunk set than Chroma, RRF fuses incompatible rankings. (research log §2)
3. **Deterministic, human-readable `chunk_id`** for every chunk. The eval gold set hand-writes these IDs; if IDs aren't stable across builds, gold-set rows go stale.

---

## §3 Repository layout

```
PavePal/
├── src/pavepal/
│   ├── __init__.py
│   ├── data/                  # Cross-module data contracts (§4)
│   │   ├── __init__.py
│   │   ├── chunk.py           # Chunk dataclass
│   │   └── answer.py          # Citation, AnswerWithCitations
│   ├── text.py                # tokenize() — shared by indexing + retrieval
│   ├── indexing/              # Build-time (§5)
│   │   ├── __init__.py
│   │   ├── pdf_parse.py       # GDOT PDF → list[Page] (strategy from §5.2 experiment)
│   │   ├── chunker.py         # pages → list[Chunk]
│   │   ├── json_flatten.py    # JSON files → list[Chunk]
│   │   ├── embed.py           # BGE wrapper with query prefix
│   │   └── index.py           # Orchestrator: build Chroma + 3 BM25 pickles
│   ├── retrieval/             # Query-time (§6)
│   │   ├── __init__.py
│   │   ├── dense.py           # 3 Chroma retrievers (per-source filter)
│   │   ├── sparse.py          # 3 BM25 retrievers (per-source pickle)
│   │   └── fuse.py            # EnsembleRetriever / RRF over 6 lists
│   ├── generation/            # LLM-time (§7)
│   │   ├── __init__.py
│   │   ├── prompt.py          # build_prompt() — template
│   │   └── generator.py       # Gemini call + [N] tag parsing
│   ├── pipeline.py            # public Pipeline.answer() — eval surface
│   ├── config.py              # ALL tunables in one place (§8)
│   ├── logging.py             # JSONL per-turn logger
│   └── cli.py                 # python -m pavepal.{index,query}
│
├── eval/                      # Internals = eval plan §6 (not duplicated here)
│   ├── gold_set.csv
│   ├── metric_glossary.json   # NEW — single source of truth for metric definitions (§9.2)
│   ├── runs/
│   │   └── runs_log.csv       # NEW — append-only cross-run comparison (§9.2)
│   ├── run_eval.py
│   └── metrics/
│
├── notebooks/
│   ├── phase1_demo.ipynb
│   └── parser_experiment.ipynb        # NEW — §5.2 experiment artifact
│   └── parser_experiment_results.json # NEW — machine-readable §5.2 outcomes
│
├── index/                     # Built artifacts (gitignored)
│   ├── chroma/
│   ├── bm25_gdot.pkl
│   ├── bm25_roads.pkl
│   └── bm25_locs.pkl
│
├── data/                      # Partner data — PDF + JSONs
├── Project_plan/, Deliverables/, etc.
├── env.yaml
├── .env                       # GOOGLE_API_KEY — gitignored
└── .gitignore
```

---

## §4 Data contracts

These are the **cross-module boundaries** that get full type signatures (per the hybrid-signatures decision). Internals stay prose elsewhere in this doc.

### §4.1 `Chunk` — the unit that flows through the whole pipeline

```python
# src/pavepal/data/chunk.py
from dataclasses import dataclass, field
from typing import Literal

Source = Literal["GDOT", "roadSegments", "locations"]

@dataclass(frozen=True)
class Chunk:
    chunk_id: str          # Deterministic, human-readable. See §4.2.
    text: str              # The string that gets embedded AND tokenized.
    source: Source
    metadata: dict         # Per-source fields. See §4.3.
```

Chunks are immutable — they pass through embedding, indexing, retrieval, and end up in the answer object. No mutation in flight.

### §4.2 `chunk_id` patterns

| Source | Pattern | Example |
|---|---|---|
| GDOT | `GDOT:p{page}:{i}` | `GDOT:p21:0` (first chunk on page 21) |
| roadSegments | `roadSegments:{centerline_id}` | `roadSegments:222121` |
| locations | `locations:{name}` | `locations:GX010224_time_4_00250` |

**Why human-readable, not a hash:** the gold set author looks at a retrieval result and writes down its ID by hand. Hashes break that workflow.

**Stability rule:** `chunk_id` MUST be reproducible from the source data alone. No timestamps, no UUIDs, no build-order indices for JSON sources. (For GDOT the `:{i}` index is per-page, so it's stable as long as the chunker is deterministic.)

### §4.3 Per-source metadata fields

All metadata is also persisted in Chroma so it can drive filtering (research log §5.4 + §5.5).

| Field | GDOT | roadSegments | locations |
|---|---|---|---|
| `source` | `"GDOT"` | `"roadSegments"` | `"locations"` |
| `doc_id` | `"GDOT_2021"` | — | — |
| `page` | int | — | — |
| `record_id` | — | centerline_id | name |
| `pci` | — | int or null | — (no pci) |
| `pci_category` | — | str or null | — |
| `road_name` | — | name | road_name |
| `road_class` | — | ROADCLASS | — |
| `defects` | — | dict | dict |
| `geometry` | — | dict (LineString) | dict (Point) |
| `parser_used` | str (`"pypdf"` / `"pdfplumber"` / `"vision_llm"`) — set by §5.2 routing | — | — |

The dense-retrieval filter uses `source` only. The richer metadata is there for future features and Phase-2 agent tools. `parser_used` is a debugging aid — when retrieval surfaces a weird chunk, you can see which parser produced it.

### §4.4 `Citation` and `AnswerWithCitations`

```python
# src/pavepal/data/answer.py
from dataclasses import dataclass
from .chunk import Chunk

@dataclass(frozen=True)
class Citation:
    chunk_id: str         # Maps to one of retrieved_chunks[i].chunk_id
    rank: int             # 1-based; matches the [N] tag in answer_text

@dataclass
class AnswerWithCitations:
    question: str
    answer_text: str               # Inline [1], [2] tags
    citations: list[Citation]
    refused: bool                  # True if answer_text == REFUSAL_PHRASE
    retrieved_chunks: list[Chunk]  # Top-N=5 from RRF, in rank order

    def to_dict(self) -> dict: ...  # JSON-serializable for §11 web upgrade + JSONL logging
```

**Why `retrieved_chunks` carries full `Chunk` objects, not just IDs:**
- Eval (eval plan §3, §4) needs the chunk *text* to score grounding without re-fetching from the index.
- A future web frontend will want to render the source text in a citations panel.

### §4.5 Locked formats

| Item | Value | Why |
|---|---|---|
| Citation tag format | `[N]` numeric, 1-based | Matches `Citation.rank`; eval plan §5.2 parses with `r"\[(\d+)\]"` |
| Refusal phrase | `"I don't have that information in the GDOT guide or the road data."` | Contains both gold-set canonical-claims substrings (`"i don't have"`, `"not in the"`) — eval plan §5.1 |
| Logging schema (JSONL line) | `{ts, qid, question, retrieved_chunk_ids, answer_text, citations, refused, latency_ms: {retrieve, generate}}` | One file per run: `logs/run_{ts}.jsonl`. `qid` is null for ad-hoc queries, set for gold-set runs. |
| Gold-set CSV columns | `qid, category, question, paraphrase_1, paraphrase_2, gold_chunks, expected_sources, canonical_claims, reference_answer` | Mirrors gold set §2 |
| Gold-set list-column delimiter | `;` (semicolon) | Avoids collision with commas in the prose fields |

---

## §5 Indexing pipeline (build-time)

### §5.1 Public surface

Single orchestrator with one public method:

```python
# src/pavepal/indexing/index.py
class Indexer:
    def __init__(self, config: Config): ...

    def build(
        self,
        gdot_pdf: Path,
        road_segments_json: Path,
        locations_json: Path,
        out_dir: Path,
    ) -> None:
        """Idempotent. Writes Chroma collection + 3 BM25 pickles to out_dir."""
```

CLI: `python -m pavepal.index build` reads paths from `config.py`. Re-running rebuilds from scratch (no incremental yet — defer to v2).

### §5.2 Parser selection experiment (must complete before §5.3 `pdf_parse.py` is built)

The research-log default was `pypdf` + `pdfplumber` fallback. But GDOT contains image-heavy pages (photos, graphs) where neither extracts useful content (research log §3.1 "Shared blind spot — images"). The Vision LLM option was reserved for later escalation. **This section moves that escalation to the front** — run a deliberate 3-way bake-off before locking the parser.

#### §5.2.1 Tools tested

| Tool | Type | Cost per page | Notes |
|---|---|---|---|
| `pypdf` (via `PyPDFLoader`) | Text-stream extraction | Free | Default for prose pages |
| `pdfplumber` | Layout-aware extraction (tables) | Free | Slower; spatial awareness for tables |
| **Gemini 2.5 Pro Vision** | Multimodal LLM on rendered page image | ~$0.005–0.02 (research log §3.1 line 161) | Highest quality on photos/graphs/complex tables. Reuses the same `GOOGLE_API_KEY` already required by the generator (§11.1). No new credentials. |

#### §5.2.2 Test pages (PDF-printed page numbers, mapped to type)

> **PDF-printed page numbers** (the number *printed in the document footer*) — not absolute PDF reader page indices. Implementation note: the GDOT front-matter uses Roman numerals, so the printed-page-to-PDF-index offset varies; map each printed page to its absolute index when rendering for the Vision LLM.

| Page | Type | What it contains |
|---:|---|---|
| 26 | text | Ch.2 asphalt-method prose (around chip-seal section) |
| 52 | text | Ch.2 asphalt-method prose (around micro-milling / thin overlay) |
| 286 | graph | Ch.5 crack-seal effectiveness — expect plots / data figures |
| 342 | photo | Ch.6 fog seal field-test — expect site photographs |
| 352 | graph | Ch.6 friction / IRI plots |
| 353 | graph | Ch.6 plots (continuation) |
| 363 | photo | Ch.6 raveling-condition photos |
| 386 | text + screenshot | Appendix A PPIT tutorial intro |
| 390 | **table** | **Table 66 — operational treatment-selection decision matrix** |

Coverage: 2 text · 3 graph · 2 photo · 1 mixed · 1 table.

#### §5.2.3 Output artifact — `notebooks/parser_experiment.ipynb`

One notebook section per page. Each section displays the 3 tools' outputs **side by side** so the reader can visually compare without scrolling between cells:

```
┌──────────────────────┬──────────────────────┬──────────────────────┐
│ pypdf                │ pdfplumber           │ Gemini Vision        │
├──────────────────────┼──────────────────────┼──────────────────────┤
│ <extracted text>     │ <extracted text>     │ <extracted text>     │
│ chars: N             │ chars: N             │ chars: N             │
│ tables found: ...    │ tables found: ...    │ tables found: ...    │
│ structural notes:    │ structural notes:    │ structural notes:    │
│   ...                │   ...                │   ...                │
└──────────────────────┴──────────────────────┴──────────────────────┘
```

Implementation: render the side-by-side via IPython `HTML` with a 3-column flexbox, or via `pandas.DataFrame.style` with cells word-wrapped. Either works — pick what renders best in JupyterLab.

A summary cell at the end produces a markdown table:

| Page | Page type | Best tool | Reasoning |
|---|---|---|---|
| 26 | text | pypdf | Equally good; pick fastest |
| 390 | table | pdfplumber or Vision | Won on cell preservation |
| 342 | photo | Vision | Only tool that returned anything meaningful |
| ... | ... | ... | ... |

#### §5.2.4 Decision rule → `pdf_parse.py` routing strategy

The **per-page-type winner** locks the strategy in §5.3's `pdf_parse.py`:

| Page type | Likely winner | `pdf_parse.py` does |
|---|---|---|
| Text / prose | pypdf | Use pypdf — fastest, fine for prose |
| Table | pdfplumber | Layout-aware extraction needed |
| Photo / graph | Gemini Vision | Render page → call Vision LLM → extract description |
| Mixed | pdfplumber + Vision | Pdfplumber for text; concatenate Vision description for figures |

Page-type detection at indexing time uses a heuristic cascade (no page-type classifier — that's overkill):

```
for page in pdf:
    text_pypdf      = pypdf.extract(page)
    if len(text_pypdf) >= 100 and not_table_heavy(text_pypdf):
        use pypdf, parser_used="pypdf"
    elif pdfplumber.extract_tables(page) succeeds:
        use pdfplumber, parser_used="pdfplumber"
    else:
        use Gemini Vision, parser_used="vision_llm"
```

The exact thresholds get tuned in the experiment notebook (see §5.2.3).

#### §5.2.5 `notebooks/parser_experiment_results.json` — machine-readable outcomes

Written by the notebook on completion. `pdf_parse.py` reads it once at module load to set its routing.

```json
{
  "experiment_date": "2026-05-09",
  "tested_pages": [26, 52, 286, 342, 352, 353, 363, 386, 390],
  "winners_by_type": {
    "text": "pypdf",
    "table": "pdfplumber",
    "photo": "vision_llm",
    "graph": "vision_llm",
    "mixed": "pdfplumber+vision_llm"
  },
  "vision_llm_cost_usd": 0.18,
  "thresholds": {
    "pypdf_min_chars_for_prose": 100,
    "pdfplumber_table_min_cells": 6
  }
}
```

#### §5.2.6 Findings document

Companion human-readable writeup: `Project_plan/20260509_parser_experiment_findings.md`. One paragraph per page-type with screenshots and the winner's rationale. Becomes part of the capstone deliverable (defends the parser choice).

#### §5.2.7 Acceptance for the §5.2 experiment

| Criterion | Target |
|---|---|
| Notebook runs end-to-end | All 9 pages × 3 tools = 27 extractions complete |
| Side-by-side display | Each page shows all 3 outputs in 3 columns, visually comparable |
| Decision JSON written | `notebooks/parser_experiment_results.json` with all 4 page-types resolved |
| Vision LLM cost | < $0.50 (target: ~$0.18 per cost summary §11.4) |
| Findings doc committed | `Project_plan/20260509_parser_experiment_findings.md` |

### §5.3 Module responsibilities (prose, internals)

| Module | Function | Inputs → outputs | Notes |
|---|---|---|---|
| `pdf_parse.py` | `parse_gdot(pdf_path) -> list[Page]` | PDF path → list of pages with `(page_no, text, parser_used)` | Routing strategy locked by **§5.2 experiment outcomes** (`notebooks/parser_experiment_results.json`). Per-page cascade: pypdf → pdfplumber → Gemini Vision. Each page records which parser produced it (in `Page.parser_used` and Chunk metadata). |
| `chunker.py` | `chunk_pages(pages, size, overlap) -> list[Chunk]` | Pages → 500-token chunks, 50-token overlap, default separators | `RecursiveCharacterTextSplitter` from LangChain (research log §3.3). Tokenizer: tiktoken `cl100k_base`. `chunk_id = f"GDOT:p{page_no}:{i}"`. Source = `"GDOT"`, metadata carries `doc_id`, `page`, `parser_used`. |
| `json_flatten.py` | `flatten_road_segments(json_path) -> list[Chunk]`, `flatten_locations(json_path) -> list[Chunk]` | JSON files → one Chunk per record | Style A natural-language template (research log §4.3). Minimal in `text`, everything in `metadata` (research log §4.2). Drop empty clauses for nulls; preserve nulls in metadata. |
| `embed.py` | `Embedder.embed_documents(texts) -> list[list[float]]`, `Embedder.embed_query(text) -> list[float]` | Wraps `langchain_huggingface.HuggingFaceEmbeddings(model_name="BAAI/bge-base-en-v1.5", query_instruction=BGE_QUERY_PREFIX)` | T2 verifies the prefix is actually applied at query time. |
| `index.py` | `Indexer.build(...)` | All chunks → Chroma + 3 BM25 pickles | See §5.4 below. |

### §5.4 Build orchestration (`Indexer.build`)

```
1. chunks_gdot   = chunker.chunk_pages(pdf_parse.parse_gdot(gdot_pdf))
2. chunks_roads  = json_flatten.flatten_road_segments(road_segments_json)
3. chunks_locs   = json_flatten.flatten_locations(locations_json)
4. all_chunks    = chunks_gdot + chunks_roads + chunks_locs
5. Embed all_chunks (single batch — research log §5.2 confirms BGE handles this).
6. Persist to Chroma collection "pavepal" with metadata=chunk.metadata, source=chunk.source.
7. For each source ∈ {GDOT, roadSegments, locations}:
   - tokenize each chunk in that source via text.tokenize()
   - build BM25Okapi(tokens)
   - pickle to out_dir / f"bm25_{source_short}.pkl" with the chunk list inline
     (so the BM25 retriever can return Chunk objects, not just indices)
```

The pickle layout is `{"chunks": list[Chunk], "bm25": BM25Okapi}`. Storing chunks inline in the pickle avoids depending on the Chroma collection at retrieval time for sparse hits.

### §5.5 Acceptance for indexing

| Criterion | Target |
|---|---|
| Total vectors in Chroma | ~23,000 (520 GDOT + 1,960 roads + 20,829 locations, ±10%) |
| Per-source BM25 pickles | 3 files exist, each loadable, each `len(bm25.chunks) == len(chroma where source=...)` |
| Build time | < 15 min on developer laptop (extra 5 min budget for Vision LLM calls on image-heavy pages — typically 20–40 such pages in GDOT) |
| Idempotent | Two consecutive `build` runs produce identical chunk_ids |
| `parser_used` populated | Every GDOT chunk has `metadata["parser_used"] ∈ {"pypdf", "pdfplumber", "vision_llm"}` |

---

## §6 Retrieval pipeline (query-time)

### §6.1 Public surface

```python
# src/pavepal/retrieval/__init__.py
class Retriever:
    def __init__(self, config: Config, index_dir: Path): ...

    @classmethod
    def load(cls, config: Config, index_dir: Path) -> "Retriever":
        """Loads Chroma + 3 BM25 pickles from disk."""

    def retrieve(self, query: str) -> list[Chunk]:
        """Returns top-N=5 chunks after policy-B + RRF.
        Internally fans out to 6 sub-retrievers (3 sources × 2 channels)."""
```

### §6.2 Source-aware policy B (the core retrieval logic)

Per research log §5.5. Six sub-retrievers fed into one `EnsembleRetriever`:

```python
gdot_dense  = chroma.as_retriever(search_kwargs={"k": K_PER, "filter": {"source": "GDOT"}})
roads_dense = chroma.as_retriever(search_kwargs={"k": K_PER, "filter": {"source": "roadSegments"}})
locs_dense  = chroma.as_retriever(search_kwargs={"k": K_PER, "filter": {"source": "locations"}})
gdot_bm25   = BM25Retriever.from_pickle("bm25_gdot.pkl",  k=K_PER)
roads_bm25  = BM25Retriever.from_pickle("bm25_roads.pkl", k=K_PER)
locs_bm25   = BM25Retriever.from_pickle("bm25_locs.pkl",  k=K_PER)

ensemble = EnsembleRetriever(
    retrievers=[gdot_dense, roads_dense, locs_dense, gdot_bm25, roads_bm25, locs_bm25],
    weights=[1/6] * 6,        # RRF is scale-free; equal weights are fine
)
# K_PER = 5 → 30 RRF candidates → top_n = 5 returned
```

T3 in the working log validates that policy B actually surfaces ≥1 chunk from the expected source on the three biased queries.

### §6.3 Module responsibilities

| Module | What it does |
|---|---|
| `dense.py` | Constructs the 3 Chroma retrievers; loads from `index_dir / "chroma"`. |
| `sparse.py` | `BM25Retriever` class. Loads pickle (`{"chunks": [...], "bm25": BM25Okapi}`). `retrieve(query) -> list[Chunk]` tokenizes via `text.tokenize`, scores against the BM25, returns top-K Chunks. |
| `fuse.py` | Wires the 6 sub-retrievers into `EnsembleRetriever` with `k_rrf=60` (LangChain's `EnsembleRetriever` uses RRF internally — research log §7.4). |
| `text.py` | `tokenize(text: str) -> list[str]` — `re.findall(r"\w+", text.lower())`. **Same function for index-time and query-time** (research log §6.5 — symmetry invariant). |

### §6.4 Acceptance for retrieval

| Criterion | Target |
|---|---|
| `Retriever.load` cold-start | < 5 s |
| `retrieve(query)` latency | < 600 ms (research log §5.5 estimate) |
| Source coverage on T3 queries | Each of 3 biased queries returns ≥ 1 chunk from its expected source in the top-5 |
| Tokenizer symmetry | `tokenize` is imported from `text.py` by both `indexing/index.py` (BM25 build) and `retrieval/sparse.py` (query) — single source of truth |

---

## §7 Generation pipeline

### §7.1 Public surface

```python
# src/pavepal/generation/generator.py
class Generator:
    def __init__(self, config: Config): ...

    def generate(self, question: str, chunks: list[Chunk]) -> AnswerWithCitations:
        """Builds prompt, calls Gemini 2.5 Pro, parses [N] citations,
        sets refused=True iff answer_text == REFUSAL_PHRASE (exact match)."""
```

### §7.2 Prompt template — *structure locked, exact wording deferred*

The **slot structure** is locked here (because it's a contract with the eval and citation parser); the **exact wording** is the first iteration job during implementation, then frozen once gold-set eval validates it.

```
[SYSTEM]
You are PavePal, a pavement-preservation assistant grounded in the GDOT
Pavement Preservation Guide and PavePal's road-condition data.

Use ONLY the chunks provided below. Cite each factual claim with [N], where
N is the 1-based position of the chunk in the list.

If the chunks do not contain the information needed to answer, respond with
EXACTLY this sentence and nothing else:
"I don't have that information in the GDOT guide or the road data."

[CHUNKS]
[1] (source: {source_1}) {text_1}
[2] (source: {source_2}) {text_2}
...
[5] (source: {source_5}) {text_5}

[USER QUESTION]
{question}
```

Locked elements:
- Numbered chunk list with `(source: ...)` prefix — eval plan §5.2's citation-correctness check assumes [N] maps to the Nth item in this list.
- Exact refusal phrase — string-match by `refusal_calibration` metric (eval plan §5.1).
- "Use ONLY the chunks" instruction — keeps the LLM grounded.

Iteration-friendly elements (deferred):
- Tone / persona wording.
- Whether to surface chunk metadata (PCI, road_name) inline or just text.
- How aggressively to instruct the LLM about uncertainty hedging.

### §7.3 Module responsibilities

| Module | What it does |
|---|---|
| `prompt.py` | `build_prompt(question, chunks) -> str` — fills the template. Pure function, no I/O. |
| `generator.py` | Calls Gemini 2.5 Pro via `langchain_google_genai.ChatGoogleGenerativeAI(model="gemini-2.5-pro")`. Parses `[N]` tags with `re.findall(r"\[(\d+)\]", answer_text)` → `Citation(chunk_id=chunks[N-1].chunk_id, rank=N)` (deduped, in order of appearance). Sets `refused = (answer_text.strip() == REFUSAL_PHRASE)`. |

### §7.4 Acceptance for generation

| Criterion | Target |
|---|---|
| Latency for one answer | < 5 s end-to-end (retrieval + generation) |
| Citation parsing | Every `[N]` in `answer_text` resolves to a chunk in `retrieved_chunks` (no orphan citations) |
| Refusal smoke test | The 1 refusal-category gold question yields `refused == True` |
| Citation correctness | ≥ 80% of cited chunks actually contain the cited claim (eval plan §5.2 LLM-judge) — soft target |

---

## §8 Configuration — single source of truth

All tunables live in `src/pavepal/config.py` as a frozen dataclass. Changing a parameter changes one line; nothing else hard-codes.

```python
# src/pavepal/config.py
from dataclasses import dataclass
from pathlib import Path

@dataclass(frozen=True)
class Config:
    # Chunking (research log §3.3)
    chunk_size: int = 500
    chunk_overlap: int = 50

    # Embedding (research log §5.2)
    embedding_model: str = "BAAI/bge-base-en-v1.5"
    bge_query_prefix: str = "Represent this sentence for searching relevant passages: "

    # Retrieval (research log §5.5, §7.2)
    k_per_retriever: int = 5
    k_rrf: int = 60
    top_n: int = 5

    # Generation
    llm_model: str = "gemini-2.5-pro"
    refusal_phrase: str = (
        "I don't have that information in the GDOT guide or the road data."
    )

    # Sources
    sources: tuple[str, ...] = ("GDOT", "roadSegments", "locations")

    # Paths — partner data lives in ./data/ in the pipeline_implementation repo
    index_dir: Path = Path("./index")
    log_dir: Path = Path("./logs")
    parser_results_json: Path = Path("./notebooks/parser_experiment_results.json")
    gdot_pdf: Path = Path("./data/GDOT_PAVEMENT_PRESERVATION_GUIDE.pdf")
    road_segments_json: Path = Path("./data/roadSegments.json")
    locations_json: Path = Path("./data/locations.json")
```

> **Strength legend** (per research log §9): the *Strong* picks above are unlikely to change without new evidence. The *Soft* ones (`chunk_size`, `k_per_retriever`, `top_n`) are the first candidates for v2 sweeps.

---

## §9 Pipeline — the public eval surface

### §9.1 The contract

The eval harness imports exactly this. Nothing else.

```python
# src/pavepal/pipeline.py
class Pipeline:
    def __init__(self, retriever: Retriever, generator: Generator, logger: Logger): ...

    @classmethod
    def load(cls, config: Config) -> "Pipeline":
        """Loads indices from disk, instantiates Gemini client, opens log file."""

    def answer(self, question: str, qid: str | None = None) -> AnswerWithCitations:
        """Full RAG turn: retrieve → generate → log → return.
        qid is set when running gold-set eval, None for ad-hoc queries."""
```

### §9.2 Self-documenting eval output + run-comparison artifacts

The eval harness (eval plan §6) is the consumer. Phase 1 also requires that its **output be readable without prior context** — anyone opening an eval notebook should be able to interpret the metrics on the spot. Three artifacts make that possible.

#### §9.2.1 Inline metric explanations in notebook output

Every metric prints with a 1-line definition pulled from `eval/metric_glossary.json`:

```
Recall@5            : 0.78  ↳ Of all relevant chunks, 78% landed in top-5.   target: > 0.70  | higher is better
Precision@5         : 0.42  ↳ Of top-5 retrieved chunks, 42% are relevant.   target: > 0.30  | higher is better
MRR                 : 0.62  ↳ Mean Reciprocal Rank — how early the FIRST     target: > 0.50  | higher is better
                              relevant chunk appears (1.0 = always rank 1).
Hit Rate@5          : 0.90  ↳ Fraction of questions where ≥1 relevant       target: > 0.80  | higher is better
                              chunk appeared in top-5.
Recall@5 — GDOT     : 0.85  ↳ Same as Recall@5 but only for chunks from     target: > 0.70  | higher is better
                              the GDOT source. Proves source-aware policy B works.
Recall@5 — roads    : 0.72  ↳ Recall@5 restricted to roadSegments.           target: > 0.70  | higher is better
Recall@5 — locations: 0.65  ↳ Recall@5 restricted to locations.              target: > 0.70  | higher is better
Hallucination score : 0.91  ↳ LLM-judged correctness × groundedness.         target: > 0.85  | higher is better
                              1.0 = answer cites only what was retrieved
                              and doesn't fabricate.
Consistency score   : 0.84  ↳ Across paraphrased versions, how often did     target: > 0.80  | higher is better
                              the system give the same answer?
Refusal calibration : 1.0   ↳ On the 1 out-of-corpus question, did the      target: 1.0     | binary (0/1)
                              system refuse? 1=yes, 0=no.
Citation correctness: 0.83  ↳ Of cited chunks, fraction that actually        target: > 0.80  | higher is better
                              contain the cited claim.
```

The notebook helper `eval.metrics.print_with_glossary(name, value)` reads `metric_glossary.json` and renders one line.

#### §9.2.2 `eval/metric_glossary.json` — single source of truth

```json
{
  "recall_at_5": {
    "definition": "Of all relevant chunks, what fraction made the top-5?",
    "higher_is_better": true,
    "target": 0.70,
    "scale": "0 to 1"
  },
  "precision_at_5": {
    "definition": "Of the top-5 retrieved chunks, what fraction are relevant?",
    "higher_is_better": true,
    "target": 0.30,
    "scale": "0 to 1"
  },
  "mrr": {
    "definition": "Mean Reciprocal Rank — how early the first relevant chunk appears (1.0 = always rank 1).",
    "higher_is_better": true,
    "target": 0.50,
    "scale": "0 to 1"
  },
  "hit_rate_at_5": {
    "definition": "Fraction of questions where >=1 relevant chunk appeared in top-5.",
    "higher_is_better": true,
    "target": 0.80,
    "scale": "0 to 1"
  },
  "recall_at_5_gdot": {
    "definition": "Recall@5 restricted to the GDOT source. Proves source-aware retrieval (policy B) works.",
    "higher_is_better": true,
    "target": 0.70,
    "scale": "0 to 1"
  },
  "recall_at_5_road_segments": {
    "definition": "Recall@5 restricted to the roadSegments source.",
    "higher_is_better": true,
    "target": 0.70,
    "scale": "0 to 1"
  },
  "recall_at_5_locations": {
    "definition": "Recall@5 restricted to the locations source.",
    "higher_is_better": true,
    "target": 0.70,
    "scale": "0 to 1"
  },
  "hallucination_score": {
    "definition": "LLM-judged correctness x groundedness. Higher = answer cites only retrieved content; doesn't fabricate.",
    "higher_is_better": true,
    "target": 0.85,
    "scale": "0 to 1"
  },
  "consistency_score": {
    "definition": "Across paraphrased versions of the same question, did the system give the same answer? Combines canonical-claim substring match + LLM equivalence judging.",
    "higher_is_better": true,
    "target": 0.80,
    "scale": "0 to 1"
  },
  "refusal_calibration": {
    "definition": "On the 1 out-of-corpus question, did the system refuse? 1=yes, 0=no.",
    "higher_is_better": true,
    "target": 1.0,
    "scale": "binary"
  },
  "citation_correctness": {
    "definition": "Fraction of cited chunks that actually contain the cited claim, per LLM-judge.",
    "higher_is_better": true,
    "target": 0.80,
    "scale": "0 to 1"
  }
}
```

Update a definition in one file → every notebook output reflects it. Decouples docs from code.

#### §9.2.3 `eval/runs/runs_log.csv` — cross-run comparison

Append-only. One row per eval run. Lets you compare v1 vs v2 vs v3 without grepping notebooks.

| Column | Meaning |
|---|---|
| `run_ts` | ISO timestamp |
| `run_label` | Human label, e.g. `v1_default`, `v2_chunk_size_750`, `v3_after_prompt_iter` |
| `git_sha` | Commit hash (lets you reproduce the run) |
| `recall_at_5`, `precision_at_5`, `mrr`, `hit_rate_at_5` | Aggregate retrieval metrics |
| `recall_at_5_gdot`, `recall_at_5_road_segments`, `recall_at_5_locations` | Per-source breakdown |
| `hallucination_score`, `consistency_score`, `refusal_calibration`, `citation_correctness` | Generation metrics |
| `notes` | Free-text — what changed since the previous run |

Generates a comparison artifact `eval/runs/runs_comparison.md` (regenerated on each run) — a markdown table of the last 5 runs side-by-side, with arrows indicating direction of change.

#### §9.2.4 Per-question deep-dive table

Because the gold set is small (10 questions per gold set §1), aggregates can hide a lot. Every eval-output notebook also produces a per-question table:

| qid | category | recall@5 | mrr | hallu. | consistency | refused? | notes |
|---|---|---|---|---|---|---|---|
| Q01 | cross_source | 1.0 | 1.0 | 0.95 | 0.88 | — | passes |
| Q02 | gdot_only | 0.6 | 0.5 | 0.80 | — | — | retrieval miss on chunk B |
| ... | ... | ... | ... | ... | ... | ... | ... |

This table is the **primary audit surface**. The aggregate row at the bottom is for run-vs-run comparison only.

#### §9.2.5 Mapping eval-harness inputs to `AnswerWithCitations`

(Internals = eval plan §6. This spec only defines the integration points.)

| Eval metric | Field on `AnswerWithCitations` | How it's computed |
|---|---|---|
| Recall@5, Precision@5, MRR, Hit Rate@5 | `retrieved_chunks[i].chunk_id` | Compared against `gold_chunks` in the gold-set CSV |
| Per-source Recall@5 | `retrieved_chunks[i].source` | Compared against `expected_sources` |
| Hallucination (LLM-judge) | `answer_text`, `retrieved_chunks` | LLM-judge prompt — eval plan §4.1 |
| Consistency | `answer_text` across paraphrases | Substring match on `canonical_claims` + LLM-judge |
| Refusal calibration | `refused` | Direct boolean check for refusal-category questions |
| Citation correctness | `citations`, `retrieved_chunks` | Each cited chunk's text fed to LLM-judge with the cited claim — eval plan §5.2 |

Eval calls `Pipeline.answer(question, qid=q.qid)` once per gold-set row (plus once per paraphrase). The `Pipeline` writes a JSONL log line per call; eval reads those logs to compute deterministic metrics, and re-runs LLM-judge metrics from the same log.

#### §9.2.6 Acceptance for §9.2

| Criterion | Target |
|---|---|
| `eval/metric_glossary.json` exists | All 11 metrics defined with `definition`, `higher_is_better`, `target`, `scale` |
| Eval notebook prints inline definitions | Every aggregate metric is followed by its 1-line gloss |
| `eval/runs/runs_log.csv` exists and gets a row per run | One row per run, all metrics columns populated |
| Per-question table emitted | One row per gold-set question, all metrics populated |

---

## §10 Acceptance criteria — Phase 1 done-when

### §10.1 Per-component (build-blocking)

| Component | Done when |
|---|---|
| Parser experiment | §5.2.7 criteria pass |
| Indexing | §5.5 criteria pass; T2 closed |
| Retrieval | §6.4 criteria pass; T3 closed |
| Generation | §7.4 criteria pass |
| Pipeline | All 10 gold questions return an `AnswerWithCitations` with `refused` set correctly for the refusal row |
| Eval output | §9.2.6 criteria pass |
| CLI | `python -m pavepal index build` and `python -m pavepal query "..."` both work end-to-end against fresh indices |

### §10.2 End-to-end smoke tests

1. **Build idempotency** — two clean builds produce identical chunk_ids (sample 10 IDs, byte-compare).
2. **Cross-source synthesis** — gold-set Q01 (the worked example in [Project_plan/20260506_gold_set.md](20260506_gold_set.md) §3) returns ≥ 1 chunk from `GDOT` AND ≥ 1 from `roadSegments`.
3. **Refusal** — the 1 refusal-category question returns `refused == True`.
4. **No orphan citations** — every `[N]` in `answer_text` maps to a chunk in `retrieved_chunks`.
5. **Eval glossary integrity** — every column in `runs_log.csv` has a matching entry in `metric_glossary.json`.

### §10.3 Phase 1 metric targets

Inherited from [eval plan §7](20260506_project_plan_evaluation.md). Read trend across runs, not absolute thresholds (the 10-question gold set caps statistical resolution — eval plan §2.4).

---

## §11 Environment, ops, costs, and the future web-app spec

### §11.1 Environment

- **Conda env:** `capstone_env` per `env.yaml`. Must include: `langchain`, `langchain-huggingface`, `langchain-chroma`, `langchain-google-genai`, `chromadb`, `rank-bm25`, `sentence-transformers`, `pypdf`, `pdfplumber`, `tiktoken`, `python-dotenv`, `pillow` (for rendering pages to images for Vision LLM), `pytest`.
- **Secrets:** `GOOGLE_API_KEY` in project-root `.env` (gitignored). One key serves both the generator (§7) and the §5.2 Vision LLM parser. **No new credentials needed.**
- **`.gitignore` additions:** `index/`, `logs/`, `.env`, `eval/runs/run_*.csv` (keep `runs_log.csv` tracked), Python cruft. (`data/` is intentionally NOT gitignored in the pipeline_implementation repo — agents need the partner files committed for reproducible builds.)

### §11.2 Ops — the four commands

```bash
# 1. Run the parser experiment (one-time; ~$0.20 in Vision LLM cost):
jupyter lab notebooks/parser_experiment.ipynb

# 2. Build indices (~10–15 min):
python -m pavepal index build

# 3. Ad-hoc query:
python -m pavepal query "What's the cheapest treatment for PCI 65?"

# 4. Demo notebook:
jupyter lab notebooks/phase1_demo.ipynb
```

Eval harness (eval plan §6) is the fifth entry point: `python eval/run_eval.py`.

### §11.3 Future — the web app gets its own spec

The web frontend is **not** part of this Pipeline spec. It will be covered in a separate `<date>_web_app_spec.md` once Phase-1 hits eval-plan §7 targets. Sketch of what that future spec covers:

```
┌──────────────────────────────────┐
│  Vite/React frontend             │   Repo_private_testing/pavepal-capstone/
│  (chat UI + citations panel)     │   already exists as a scaffold
└──────────────┬───────────────────┘
               │ POST /query  { "question": "..." }
               │   ◄── { ...AnswerWithCitations.to_dict() }
┌──────────────▼───────────────────┐
│  FastAPI wrapper                 │   NEW: src/pavepal/api/main.py  (~50–80 LOC)
└──────────────┬───────────────────┘
               │
┌──────────────▼───────────────────┐
│  Pipeline.answer()               │   THIS spec (§9)
└──────────────────────────────────┘
```

Why the upgrade is cheap when it lands:
- `AnswerWithCitations.to_dict()` is already JSON-serializable (§4.4 — built in from day one).
- `Pipeline` is a normal Python class; FastAPI just wraps it.
- The Vite scaffold is already React 19 + Vite.

**When to write the web app spec:** *only* after the Phase-1 RAG hits eval-plan §7 targets. Don't burn time on UI before answer quality is there.

### §11.4 Cost summary — API spend across pipeline development

All paid API calls go through `GOOGLE_API_KEY`. Everything else (BGE embedding, BM25, Chroma, retrieval) is local and free.

#### §11.4.1 Pricing reference

Gemini 2.5 Pro via AI Studio (as of 2026-05):

- **Input:** $1.25 / 1M tokens
- **Output:** $5.00 / 1M tokens
- **Vision input:** ~258 tokens per image tile + content; full page ≈ ~$0.005–0.02 each
- **Free dev tier:** generous — most days fit within it; many runs land at $0

#### §11.4.2 Per-component breakdown (worst case, all paid)

| Activity | Calls | Cost |
|---|---:|---:|
| **§5.2 Parser experiment** — 9 pages × Vision LLM (only Vision is paid; pypdf + pdfplumber are free) | 9 | ~$0.20 |
| **Indexing — Vision LLM on image-heavy GDOT pages** (estimate 20–40 pages out of 470) | ~30 | ~$0.60 |
| **Generator dev queries** — manual testing across 4 devs (~50 each) | ~200 | $3–5 |
| **Eval runs** — full harness, ~$0.30/run (eval plan §6.2), 20–30 runs over Phase 1 | 20–30 | $6–10 |
| **Smoke tests** — `tests/test_e2e_query.py` invoked ~50× across dev cycles | ~150 | ~$2 |
| **Partner demos / live testing** | ~80 | ~$2 |
| **Buffer** — unforeseen reruns, debugging | — | ~$5 |
| **Subtotal — paid tier worst case** | ~500 | **$18–25** |

#### §11.4.3 Realistic expectation

| Scenario | Total cost |
|---|---:|
| **Most likely** — staying inside the free dev tier most days, occasional paid burst | **<$5** |
| **Worst case** — paying for everything | **~$25** |
| **Pessimistic** — also swap judge model to Claude Opus 4.7 / GPT-4o (eval plan §6.2 open) | **~$35** |

#### §11.4.4 What's free regardless

- All embedding work (BGE-base runs locally on CPU)
- BM25 (CPU only)
- Chroma (local persistence)
- Retrieval pipeline (no LLM calls)

#### §11.4.5 When to start watching the meter

- More than 30 eval runs in a single day
- Long-context retries (each ≈ $0.014)
- Swapping the judge to Claude or GPT-4o
- Running indexing > 5 times in a day (Vision LLM gets called on image-heavy pages each rebuild — cache pages in v2 if this becomes painful)

**Bottom line: a $25 budget per developer is more than enough to cover the entire Phase 1 build, eval, and demos. In practice expect <$5.**

---

## §12 Open questions and deferred items

### §12.1 Working-log T-tasks (first-week verification probes)

| T# | What | Where it lives | Closes when |
|---|---|---|---|
| **T1** | 3-way parser bake-off — pypdf, pdfplumber, Gemini Vision on 9 GDOT pages | **Now §5.2 of this spec** (escalated from working-log probe to spec section) | §5.2.7 acceptance criteria pass |
| **T2** | BGE query-prefix actually applied at query time | Working log | Logged query string contains the prefix; with-vs-without retrieval results differ on 5 sample questions |
| **T3** | Policy B returns balanced sources on 3 biased queries | Working log | Each query's top-5 includes ≥ 1 chunk from the expected source |

### §12.2 Deferred design decisions (resolved during implementation, then frozen)

| Item | Where it lands |
|---|---|
| Exact prompt wording (tone, hedging instructions) | First iteration in `generation/prompt.py`; freeze once gold-set eval shows hallucination + consistency targets met |
| Page-type detection thresholds (pypdf min chars, pdfplumber min table cells) | Tuned during §5.2 experiment, written to `parser_experiment_results.json` |

### §12.3 Open partner questions affecting scope

Surfaced from [working log](../20260506_working_log.md). These don't block Phase 1 build, but they affect what the gold-set answers can claim:

| # | Question | Impact if answered "yes" |
|---|---|---|
| 6 | Severity level missing from JSON | If severity is genuinely absent, every cross-source answer must hedge ("if Severity Level 1, then...") — should be reflected in the prompt template's hedging instruction |
| 1 | Image citations a priority? | Out of scope per §1; if reversed, adds a new content type to the chunk schema (a Vision LLM page might already give us extracted *descriptions* of figures, but full image citations are bigger work) |

### §12.4 Phase 2 hooks (designed-for, not built)

The module boundaries here are deliberately Phase-2-friendly without paying for it now:
- `Retriever.retrieve(query)` is a pure function — easy to wrap as an agent tool.
- `Pipeline.answer` returns a typed object — easy to compose into a multi-agent loop.
- All metadata is preserved in `Chunk.metadata` and Chroma — Phase-2 agents can filter on `pci`, `road_name`, etc. without re-indexing.

No Phase-2 infrastructure (orchestrator, agent base classes, shared-DB-as-context) lives in this spec. YAGNI until Phase 2 is greenlit.

---

## §13 Next steps

After this spec is reviewed and approved, the order of execution is:

1. **§5.2 parser experiment** runs first — its outcome locks `pdf_parse.py`'s strategy and unblocks indexing.
2. **Implementation plan** ([20260507_phase_1_implementation_plan.md](20260507_phase_1_implementation_plan.md)) gets updated:
   - T-task T3.1 (currently a 2-way pypdf-vs-pdfplumber probe) is replaced by the §5.2 3-way experiment.
   - New tasks for `eval/metric_glossary.json` + `runs_log.csv` are added.
   - New cost-tracking note added per §11.4.
3. **Phase 1 RAG build** proceeds along the four-track split (Foundation → A/B/C/D in parallel → Integration).
4. **Eval gates** Phase 1 done — see §10.
5. **Future:** when eval targets are met, write the `<date>_web_app_spec.md` for the frontend. Do not start it earlier.
