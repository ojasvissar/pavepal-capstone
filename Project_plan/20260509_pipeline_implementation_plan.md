# Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a hybrid RAG pipeline (BM25 + dense + RRF, source-aware) over GDOT PDF + flattened JSONs with Gemini 2.5 Pro generation, exposed via a CLI and a public Python API for the eval harness.

**Spec:** [20260509_pipeline_spec.md](20260509_pipeline_spec.md) — read this first if you haven't.

**Tech Stack:** Python 3.11, conda (`capstone_env`), LangChain + LangChain ecosystem, Chroma, `rank-bm25`, `BAAI/bge-base-en-v1.5` via `sentence-transformers`, `pypdf`, `pdfplumber`, `pillow` (for Vision-LLM page rendering), `tiktoken`, `langchain-google-genai` (Gemini 2.5 Pro — both generator and Vision parser), pytest.

---

## At a glance — what this plan builds, and who does what

This plan turns the spec into ~30 bite-sized TDD tasks across 5 phases. **Phase 0** is shared foundation (env, data contracts, eval scaffolding). **Phase 1** is the parser bake-off — Claudia runs that first, since its result locks the indexing strategy. **Phase 2** is four parallel implementation tracks. **Phase 3–5** are integration, validation probes, and sign-off.

### Pipeline + ownership

```
┌────────────────────────────────────────────────────────────────────────┐
│                       PRE-WORK — Phase 1                               │
│   ┌──────────────────────────────────────────────────────┐             │
│   │  §5.2 Parser experiment   (Claudia)                  │             │
│   │  pypdf vs pdfplumber vs Gemini Vision × 9 pages      │             │
│   │  → notebooks/parser_experiment_results.json          │             │
│   └──────────────────────────────────────────────────────┘             │
│                              │ unlocks                                 │
│                              ▼                                         │
│                       INDEXING — Phase 2                               │
│   GDOT PDF ─►parse(per §5.2)─►chunk──┐                                 │
│   roadSegs ─►flatten ────────────────┼─► all chunks ─►Embed(BGE) ─►Chroma│
│   locs    ─►flatten ─────────────────┘             └─►tokenize ──► 3 BM25 pkls│
│   [Diana — pdf, chunker, json_flat, indexer]      [Claudia — Embedder]  │
│                                                                         │
│                       QUERY-TIME — Phase 2                              │
│   Q ─► dense (per src) + sparse (per src) = 6 lists ─► RRF ─► top-5 chunks  │
│        [Claudia — dense]    [Ojasv — sparse + RRF fusion + Retriever class]  │
│                                                                         │
│                       GENERATION — Phase 2                              │
│   chunks + Q ─► prompt template ─► Gemini ─► AnswerWithCitations ─► JSONL log│
│              [William — prompt, generator, pipeline, logger, CLI]            │
│                                                                         │
│                       EVAL OUTPUT — Phase 0                             │
│   eval/metric_glossary.json  +  eval/runs/runs_log.csv  +  per-Q table  │
│   [Claudia — glossary]       [Diana — runs_log helper]                  │
└────────────────────────────────────────────────────────────────────────┘
```

### Owner summary

| Owner | Track + key modules | Task count |
|---|---|---:|
| **Diana** | Indexing data prep (`pdf_parse`, `chunker`, `json_flatten`, Indexer orchestrator) + data contracts (`Chunk`, `AnswerWithCitations`, `tokenize`) + demo notebook + runs_log helper + README | ~12 |
| **Claudia** | Parser experiment (Phase 1) + Dense retrieval (`Embedder`, dense retrievers) + env.yaml/scaffold/Config + test fixtures + eval glossary + e2e build smoke + BGE T-task + final test-suite check | ~13 |
| **Ojasv** | Sparse + fusion (`BM25Retriever`, RRF, `Retriever` class) + e2e query smoke + Policy B T-task | ~5 |
| **William** | Generation + glue (`prompt`, `Generator`, `JSONLLogger`, `Pipeline`, CLI) | 5 |

Light load on William and Ojasv is intentional — both tracks are tightly scoped, well-isolated work. Heavier load on Diana and Claudia covers the cross-cutting glue.

### Execution order

1. **Phase 0 (Foundation)** — Claudia + Diana split; sequential. Blocks everyone.
2. **Phase 1 (Parser experiment)** — Claudia only. Blocks Diana's `pdf_parse.py` (T2A.2).
3. **Phase 2 (Component tracks)** — 4 parallel tracks. Diana, Claudia, Ojasv, William work in parallel after their respective Phase 0/1 dependencies clear.
4. **Phase 3 (Integration)** — sync point: Indexer orchestrator (Diana) needs everyone's Phase 2 work complete.
5. **Phase 4 (T-task probes)** — runs after Phase 3 indices are built.
6. **Phase 5 (Sign-off)** — README + test-suite green.

---

## Cross-track sync points

- **Phase 1 ↔ Phase 2A:** Diana's `pdf_parse.py` reads `parser_experiment_results.json`. Claudia must merge that file before Diana starts T2A.2.
- **Diana ↔ Claudia (indexer):** Diana's Indexer (T3.1) calls Claudia's Embedder. Claudia must finish T2B.1 (`Embedder` interface) before Diana starts T3.1.
- **Diana ↔ Ojasv (indexer):** Diana's Indexer writes BM25 pickles in the format Ojasv's `BM25Retriever` reads. Ojasv must finish T2C.1 (pickle layout) before Diana starts T3.1.
- **William ↔ Ojasv:** William's `Pipeline` imports `Retriever` from `pavepal.retrieval`. T2D.4 cannot run until T2C.3 has landed (Retriever class exists in `retrieval/__init__.py`).
- **William ↔ Diana:** William's CLI imports `Indexer`. T2D.5 cannot run until T3.1 has landed (`indexing/index.py` exists). If William reaches T2D.5 first, write a one-line stub `class Indexer: pass` in `indexing/index.py`, commit, and continue — Diana replaces it during T3.1.

---

## Conventions used in every task

- **TDD:** failing test → run-fail → minimal impl → run-pass → commit. Code blocks required, never "TBD".
- **Tests:** pytest. Slow tests (real network, real model load) marked `@pytest.mark.slow` and skipped by default. Integration tests marked `@pytest.mark.integration`.
- **Commits:** conventional-commit style (`feat:`, `test:`, `chore:`, `fix:`). Each task ends with one commit.
- **Type hints:** required on every public function. Use Python 3.11 syntax (`list[str]`, `X | None`).
- **Paths:** always `pathlib.Path`, never string concatenation.
- **No emojis** in code or docs.

---

## Agent execution guide (read once before starting any task)

This plan is designed for **agent-driven execution with no human in the loop**. Each task is a complete unit — preconditions, code, tests, and verification all spelled out.

### How a teammate hands a phase to their agent

1. Pick the phase you own (Phase 1 = Claudia; Phase 2A = Diana; etc. — see "Owner summary" above).
2. Hand your agent: this plan + the spec + the four upstream docs (research log, eval plan, gold set, GDOT summary).
3. Tell the agent: *"Execute Phase X tasks in order. Stop and ask only if a precondition check fails."*
4. The agent works through your phase task-by-task. When all tasks pass their verification step, your phase is done.

### Precondition pattern (every task)

Each task starts with a **Preconditions** block. The agent runs the listed shell commands; **all must return non-empty / exit 0** before the task can start. If any precondition fails, the agent waits or asks — it does not start the task.

Example:

```bash
# Preconditions for T2A.1:
test -f src/pavepal/data/chunk.py        # T0.3 must have committed
test -f src/pavepal/config.py            # T0.2 must have committed
test -f tests/fixtures/sample_gdot.pdf   # T0.6 must have committed
```

### Verification pattern (every task)

Each task ends with a **Verify** step that runs the relevant pytest selection. If it passes, the task is done. No human eyeballing.

### File-based sync between teammates

When Track X depends on Track Y's output, the dependency is always a **committed file**, never "ask Y if they're done". The agent polls for the file's existence (`test -f path/to/file && echo READY`).

### Auto-decision over judgment

Where the original draft said "eyeball" or "pick the winner", this plan now contains a deterministic algorithm. The agent runs it and gets the same answer every time.

---

# Phase 0 — Foundation

Sequential within phase. Blocks all subsequent phases. Estimated ~4 hours.

---

### Task T0.1: Project scaffold + git init + conda env

**Owner:** Claudia
**Files:** Modify `env.yaml`; create `.gitignore`, `pyproject.toml`, `src/pavepal/__init__.py`, `tests/__init__.py`.

- [ ] **Step 1: Init git (skip if already a repo)**

```bash
cd /Users/williamchong/Documents/UBC_MDS/PavePal
git init
git add -A && git commit -m "chore: pre-Phase-1 snapshot"
```

- [ ] **Step 2: Replace `env.yaml`** (note `pillow` added for §5.2 Vision-LLM page rendering)

```yaml
name: capstone_env
channels:
  - conda-forge
dependencies:
  - python=3.11
  - pip
  - jupyter
  - jupyterlab
  - numpy
  - pandas
  - scikit-learn=1.5.*
  - openpyxl
  - pillow            # NEW — render PDF pages to images for Vision LLM
  - pytest
  - pytest-mock
  - pip:
      - langchain>=0.3
      - langchain-community>=0.3
      - langchain-huggingface>=0.1
      - langchain-chroma>=0.1
      - langchain-google-genai>=2.0
      - chromadb>=0.5
      - rank-bm25>=0.2
      - sentence-transformers>=3.0
      - pypdf>=5.0
      - pdfplumber>=0.11
      - tiktoken>=0.7
      - python-dotenv>=1.0
      - faiss-cpu
```

- [ ] **Step 3: Recreate the env**

```bash
conda env remove -n capstone_env -y
conda env create -f env.yaml
conda activate capstone_env
```

- [ ] **Step 4: Verify imports**

```bash
python -c "
import langchain, langchain_community, langchain_huggingface, langchain_chroma, langchain_google_genai
import chromadb, rank_bm25, sentence_transformers, pypdf, pdfplumber, tiktoken, dotenv
from PIL import Image
print('All imports OK')
"
```

- [ ] **Step 5: Write `.gitignore`**

```gitignore
__pycache__/
*.py[cod]
*.egg-info/
.pytest_cache/
.ipynb_checkpoints/
index/
logs/
.env
Repo_private_testing/pavepal-capstone/node_modules/
notebooks/parser_experiment.executed.ipynb
notebooks/phase1_demo.executed.ipynb
```

- [ ] **Step 6: Write `pyproject.toml`**

```toml
[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[project]
name = "pavepal"
version = "0.1.0"
requires-python = ">=3.11"

[tool.setuptools.packages.find]
where = ["src"]

[tool.pytest.ini_options]
testpaths = ["tests"]
markers = [
    "slow: tests that hit real network or load real models",
    "integration: end-to-end tests requiring built indices",
]
addopts = "-m 'not slow and not integration'"
```

- [ ] **Step 7: Editable install**

```bash
pip install -e .
```

- [ ] **Step 8: Empty package init files**

`src/pavepal/__init__.py`:
```python
"""PavePal pipeline package."""
```

`tests/__init__.py`: empty.

- [ ] **Step 9: Commit**

```bash
git add env.yaml .gitignore pyproject.toml src/pavepal/__init__.py tests/__init__.py
git commit -m "chore: scaffold pipeline package, env.yaml, gitignore"
```

---

### Task T0.2: Config dataclass

**Owner:** Claudia
**Files:** Create `src/pavepal/config.py`, `tests/test_config.py`.

- [ ] **Step 1: Failing test** — `tests/test_config.py`:

```python
from pathlib import Path
from pavepal.config import Config


def test_config_defaults():
    cfg = Config()
    assert cfg.chunk_size == 500
    assert cfg.chunk_overlap == 50
    assert cfg.embedding_model == "BAAI/bge-base-en-v1.5"
    assert cfg.bge_query_prefix.startswith("Represent this sentence")
    assert cfg.k_per_retriever == 5
    assert cfg.k_rrf == 60
    assert cfg.top_n == 5
    assert cfg.llm_model == "gemini-2.5-pro"
    assert "I don't have" in cfg.refusal_phrase
    assert "not in the" in cfg.refusal_phrase
    assert cfg.sources == ("GDOT", "roadSegments", "locations")
    assert isinstance(cfg.index_dir, Path)
    assert isinstance(cfg.parser_results_json, Path)


def test_config_is_frozen():
    import dataclasses
    cfg = Config()
    try:
        cfg.chunk_size = 999
    except dataclasses.FrozenInstanceError:
        return
    raise AssertionError("Config should be frozen")
```

- [ ] **Step 2: Run — expect ModuleNotFoundError**

```bash
pytest tests/test_config.py -v
```

- [ ] **Step 3: Implement**

`src/pavepal/config.py`:

```python
"""Single source of truth for all pipeline tunables."""
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Config:
    chunk_size: int = 500
    chunk_overlap: int = 50

    embedding_model: str = "BAAI/bge-base-en-v1.5"
    bge_query_prefix: str = "Represent this sentence for searching relevant passages: "

    k_per_retriever: int = 5
    k_rrf: int = 60
    top_n: int = 5

    llm_model: str = "gemini-2.5-pro"
    refusal_phrase: str = (
        "I don't have that information in the GDOT guide or the road data."
    )

    sources: tuple[str, ...] = ("GDOT", "roadSegments", "locations")

    # Paths — partner data lives in ./data/ in the pipeline_implementation repo
    index_dir: Path = Path("./index")
    log_dir: Path = Path("./logs")
    parser_results_json: Path = Path("./notebooks/parser_experiment_results.json")
    gdot_pdf: Path = Path("./data/GDOT_PAVEMENT_PRESERVATION_GUIDE.pdf")
    road_segments_json: Path = Path("./data/roadSegments.json")
    locations_json: Path = Path("./data/locations.json")
```

- [ ] **Step 4: Run — expect 2 passed**
- [ ] **Step 5: Commit**

```bash
git add src/pavepal/config.py tests/test_config.py
git commit -m "feat(config): frozen Config dataclass with all pipeline tunables"
```

---

### Task T0.3: Chunk dataclass

**Owner:** Diana
**Files:** Create `src/pavepal/data/__init__.py`, `src/pavepal/data/chunk.py`, `tests/data/__init__.py`, `tests/data/test_chunk.py`.

- [ ] **Step 1: Failing tests** — `tests/data/test_chunk.py`:

```python
import pytest
from pavepal.data.chunk import Chunk


def test_chunk_construction():
    c = Chunk(
        chunk_id="GDOT:p21:0",
        text="Fog seal application...",
        source="GDOT",
        metadata={"doc_id": "GDOT_2021", "page": 21, "source": "GDOT", "parser_used": "pypdf"},
    )
    assert c.chunk_id == "GDOT:p21:0"
    assert c.source == "GDOT"
    assert c.metadata["parser_used"] == "pypdf"


def test_chunk_is_frozen():
    c = Chunk(chunk_id="x", text="y", source="GDOT", metadata={})
    with pytest.raises(Exception):
        c.text = "mutated"
```

- [ ] **Step 2: Run — expect ModuleNotFoundError**

```bash
mkdir -p tests/data && touch tests/data/__init__.py
pytest tests/data/test_chunk.py -v
```

- [ ] **Step 3: Implement** — create `src/pavepal/data/__init__.py` (empty); `src/pavepal/data/chunk.py`:

```python
"""Chunk dataclass — the unit that flows through the whole pipeline."""
from dataclasses import dataclass
from typing import Literal

Source = Literal["GDOT", "roadSegments", "locations"]


@dataclass(frozen=True)
class Chunk:
    """Immutable retrievable unit.

    chunk_id patterns (deterministic, human-readable per spec §4.2):
        GDOT:p{page}:{i}
        roadSegments:{centerline_id}
        locations:{name}
    """
    chunk_id: str
    text: str
    source: Source
    metadata: dict
```

- [ ] **Step 4: Run — expect 2 passed**
- [ ] **Step 5: Commit**

```bash
git add src/pavepal/data/ tests/data/
git commit -m "feat(data): Chunk dataclass with deterministic chunk_id contract"
```

---

### Task T0.4: Citation + AnswerWithCitations

**Owner:** Diana
**Files:** Create `src/pavepal/data/answer.py`, `tests/data/test_answer.py`.

- [ ] **Step 1: Failing tests** — `tests/data/test_answer.py`:

```python
import json
import pytest
from pavepal.data.chunk import Chunk
from pavepal.data.answer import Citation, AnswerWithCitations


def _chunks():
    return [
        Chunk(chunk_id="GDOT:p21:0", text="fog seal text", source="GDOT", metadata={"page": 21}),
        Chunk(chunk_id="roadSegments:222121", text="road text", source="roadSegments", metadata={"pci": 82}),
    ]


def test_answer_construction():
    ans = AnswerWithCitations(
        question="q",
        answer_text="Apply [1] given [2].",
        citations=[Citation(chunk_id="GDOT:p21:0", rank=1),
                   Citation(chunk_id="roadSegments:222121", rank=2)],
        refused=False,
        retrieved_chunks=_chunks(),
    )
    assert ans.refused is False
    assert len(ans.citations) == 2


def test_to_dict_is_json_serializable():
    ans = AnswerWithCitations(
        question="q", answer_text="a",
        citations=[Citation(chunk_id="GDOT:p1:0", rank=1)],
        refused=False, retrieved_chunks=_chunks(),
    )
    d = ans.to_dict()
    json.dumps(d)
    parsed = json.loads(json.dumps(d))
    assert parsed["citations"][0]["chunk_id"] == "GDOT:p1:0"
    assert parsed["retrieved_chunks"][0]["chunk_id"] == "GDOT:p21:0"


def test_citation_is_frozen():
    c = Citation(chunk_id="x", rank=1)
    with pytest.raises(Exception):
        c.rank = 2
```

- [ ] **Step 2: Run — expect ModuleNotFoundError**
- [ ] **Step 3: Implement** — `src/pavepal/data/answer.py`:

```python
"""Citation + AnswerWithCitations contracts (spec §4.4).
JSON-serializable for logging + future web upgrade."""
from dataclasses import dataclass, asdict
from .chunk import Chunk


@dataclass(frozen=True)
class Citation:
    chunk_id: str
    rank: int


@dataclass
class AnswerWithCitations:
    question: str
    answer_text: str
    citations: list[Citation]
    refused: bool
    retrieved_chunks: list[Chunk]

    def to_dict(self) -> dict:
        return {
            "question": self.question,
            "answer_text": self.answer_text,
            "citations": [asdict(c) for c in self.citations],
            "refused": self.refused,
            "retrieved_chunks": [asdict(c) for c in self.retrieved_chunks],
        }
```

- [ ] **Step 4: Run — expect 3 passed**
- [ ] **Step 5: Commit**

```bash
git add src/pavepal/data/answer.py tests/data/test_answer.py
git commit -m "feat(data): Citation + AnswerWithCitations with JSON-serializable to_dict"
```

---

### Task T0.5: Shared `text.tokenize`

**Owner:** Diana
**Files:** Create `src/pavepal/text.py`, `tests/test_text.py`.

- [ ] **Step 1: Failing tests** — `tests/test_text.py`:

```python
from pavepal.text import tokenize


def test_lowercases():
    assert tokenize("PCI 82 GOOD") == ["pci", "82", "good"]


def test_preserves_digits():
    t = tokenize("Apply at PCI 65–70")
    assert "65" in t and "70" in t


def test_drops_punctuation():
    assert tokenize("crack-sealing, fog-seal!") == ["crack", "sealing", "fog", "seal"]


def test_empty():
    assert tokenize("") == []
```

- [ ] **Step 2: Run — expect ModuleNotFoundError**
- [ ] **Step 3: Implement** — `src/pavepal/text.py`:

```python
"""Shared text utilities. tokenize() is used by BOTH index-time (BM25 build)
and query-time (BM25 retrieval) — symmetry is an invariant (spec §6.3 / research log §6.5)."""
import re

_TOKEN_RE = re.compile(r"\w+")


def tokenize(text: str) -> list[str]:
    """Lowercase + word-character tokenization. Preserves digits, drops punctuation."""
    return _TOKEN_RE.findall(text.lower())
```

- [ ] **Step 4: Run — expect 4 passed**
- [ ] **Step 5: Commit**

```bash
git add src/pavepal/text.py tests/test_text.py
git commit -m "feat(text): shared tokenize() for symmetric BM25 index/query"
```

---

### Task T0.6: Test fixtures

**Owner:** Claudia
**Files:** Create `tests/fixtures/__init__.py`, `tests/fixtures/sample_road_segments.json`, `tests/fixtures/sample_locations.json`, `tests/fixtures/build_sample_pdf.py`, generate `tests/fixtures/sample_gdot.pdf`.

- [ ] **Step 1: JSON fixtures**

`tests/fixtures/sample_road_segments.json`:

```json
[
  {
    "name": "PEACHTREE INDUSTRIAL BLVD ACCESS RD",
    "ROADCLASS": "Major Arterial",
    "speed_limit": 55,
    "length": 94.92,
    "defects": {"transverse cracks": 5, "longitudinal cracks": 12},
    "pci": 82,
    "pci_category": "Very Good",
    "centerline_id": "222121",
    "geometry": {"type": "LineString", "coordinates": [[-84.241, 33.943], [-84.240, 33.944]]}
  },
  {
    "name": "RIVER TRAIL DR",
    "ROADCLASS": "Local",
    "speed_limit": 25,
    "length": 412.0,
    "defects": {},
    "pci": null,
    "pci_category": null,
    "centerline_id": "330044",
    "geometry": {"type": "LineString", "coordinates": [[-84.230, 33.950], [-84.231, 33.951]]}
  }
]
```

`tests/fixtures/sample_locations.json`:

```json
[
  {
    "name": "GX010224_time_4_00250",
    "image_path": "session_1/05142025/GX010224_time_4_00250.jpg",
    "defects": {"transverse cracks": 1, "manhole covers": 1},
    "road_name": "ENGINEERING DR",
    "geometry": {"type": "Point", "coordinates": [-84.225, 33.961]},
    "road_id": "68d703",
    "region_id": "usa_georgia_peachtree-corners"
  },
  {
    "name": "GX010225_time_4_00251",
    "image_path": "session_1/05142025/GX010225_time_4_00251.jpg",
    "defects": {"longitudinal cracks": 3},
    "road_name": "ENGINEERING DR",
    "geometry": {"type": "Point", "coordinates": [-84.226, 33.962]},
    "road_id": "68d703",
    "region_id": "usa_georgia_peachtree-corners"
  }
]
```

- [ ] **Step 2: PDF generator** — `tests/fixtures/build_sample_pdf.py`:

```python
"""Generate a 3-page sample PDF for tests. Run once: python tests/fixtures/build_sample_pdf.py"""
from pathlib import Path


def build(out_path: Path) -> None:
    try:
        from reportlab.pdfgen import canvas
        from reportlab.lib.pagesizes import letter
    except ImportError:
        raise SystemExit("Run: pip install reportlab; then re-run this script.")

    c = canvas.Canvas(str(out_path), pagesize=letter)

    # Page 1 — paragraph text
    c.setFont("Helvetica", 11)
    text = c.beginText(72, 720)
    for line in [
        "Part 3: Fog Seal Field Test Study",
        "The third part of this report presents the field test study of fog seal.",
        "Thirteen test sites on I-475 with different raveling conditions were selected.",
        "A pavement's surface friction decreases right after fog seal application.",
        "The skid number (SN) decreases about 45% immediately after the fog seal application.",
    ]:
        text.textLine(line)
    c.drawText(text)
    c.showPage()

    # Page 2 — pseudo-table
    c.drawString(72, 720, "Treatment Selection Guidelines (excerpt)")
    rows = [
        ("Distress", "Severity", "ADT", "Fog Seal", "Crack Seal"),
        ("Raveling", "1", "<10000", "Recommended", "Optional"),
        ("Cracks", "2", ">10000", "Not Rec.", "Recommended"),
    ]
    y = 690
    for row in rows:
        c.drawString(72, y, "  ".join(f"{cell:<14}" for cell in row))
        y -= 16
    c.showPage()

    # Page 3 — short
    c.drawString(72, 720, "Conclusions: see Chapter 7.")
    c.showPage()
    c.save()


if __name__ == "__main__":
    out = Path(__file__).parent / "sample_gdot.pdf"
    build(out)
    print(f"Wrote {out}")
```

- [ ] **Step 3: Generate**

```bash
pip install reportlab
python tests/fixtures/build_sample_pdf.py
```

- [ ] **Step 4: Empty `__init__.py`**

```bash
touch tests/fixtures/__init__.py
```

- [ ] **Step 5: Smoke-test the PDF**

```bash
python -c "from pypdf import PdfReader; r=PdfReader('tests/fixtures/sample_gdot.pdf'); assert len(r.pages)==3; print('OK')"
```

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/
git commit -m "test: sample PDF + JSON fixtures for fast tests"
```

---

### Task T0.7: `eval/metric_glossary.json` — single source of truth for metric definitions

**Owner:** Claudia
**Files:** Create `eval/metric_glossary.json`, `eval/__init__.py`, `eval/metrics/__init__.py`, `eval/metrics/glossary.py`, `tests/test_glossary.py`.

Per spec §9.2.2. The glossary is read by every eval-output notebook so metric definitions live in one place.

- [ ] **Step 1: Write the glossary JSON** — `eval/metric_glossary.json`:

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
    "definition": "LLM-judged correctness x groundedness. Higher = answer cites only retrieved content.",
    "higher_is_better": true,
    "target": 0.85,
    "scale": "0 to 1"
  },
  "consistency_score": {
    "definition": "Across paraphrased versions, did the system give the same answer? Combines substring match + LLM equivalence.",
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

- [ ] **Step 2: Failing tests** — `tests/test_glossary.py`:

```python
import json
from pathlib import Path
from eval.metrics.glossary import load_glossary, format_metric_line


GLOSSARY_PATH = Path("eval/metric_glossary.json")


def test_glossary_loads_and_has_required_keys():
    g = load_glossary(GLOSSARY_PATH)
    required = {
        "recall_at_5", "precision_at_5", "mrr", "hit_rate_at_5",
        "recall_at_5_gdot", "recall_at_5_road_segments", "recall_at_5_locations",
        "hallucination_score", "consistency_score", "refusal_calibration",
        "citation_correctness",
    }
    assert required.issubset(g.keys())


def test_each_entry_has_required_fields():
    g = load_glossary(GLOSSARY_PATH)
    for name, meta in g.items():
        assert "definition" in meta, name
        assert "higher_is_better" in meta, name
        assert "target" in meta, name
        assert "scale" in meta, name


def test_format_metric_line_includes_definition_and_target():
    line = format_metric_line("recall_at_5", 0.78, GLOSSARY_PATH)
    assert "0.78" in line
    assert "Of all relevant chunks" in line
    assert "0.7" in line  # target rendered
```

- [ ] **Step 3: Run — expect ModuleNotFoundError**

```bash
mkdir -p eval/metrics && touch eval/__init__.py eval/metrics/__init__.py
pytest tests/test_glossary.py -v
```

- [ ] **Step 4: Implement** — `eval/metrics/glossary.py`:

```python
"""Metric glossary loader + line formatter (spec §9.2.1)."""
import json
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=4)
def load_glossary(path: Path) -> dict:
    return json.loads(Path(path).read_text())


def format_metric_line(name: str, value: float, glossary_path: Path) -> str:
    g = load_glossary(glossary_path)
    meta = g[name]
    direction = "higher is better" if meta["higher_is_better"] else "lower is better"
    target = meta["target"]
    return (
        f"{name:<22}: {value:.2f}  "
        f"↳ {meta['definition']}  "
        f"target: {target}  | {direction}"
    )
```

- [ ] **Step 5: Run — expect 3 passed**
- [ ] **Step 6: Commit**

```bash
git add eval/ tests/test_glossary.py
git commit -m "feat(eval): metric_glossary.json + formatter for self-documenting output"
```

---

### Task T0.8: `eval/runs/runs_log.csv` schema + helper

**Owner:** Diana
**Files:** Create `eval/runs/`, `eval/metrics/runs_log.py`, `tests/test_runs_log.py`.

Per spec §9.2.3. Append-only CSV; one row per eval run. Helper appends + regenerates a side-by-side comparison markdown.

- [ ] **Step 1: Failing tests** — `tests/test_runs_log.py`:

```python
import csv
from pathlib import Path
from eval.metrics.runs_log import append_run, RunRecord, render_comparison_md


def test_append_creates_file_with_headers(tmp_path):
    f = tmp_path / "runs_log.csv"
    rec = RunRecord(
        run_label="v1_default", git_sha="abc123",
        recall_at_5=0.78, precision_at_5=0.42, mrr=0.62, hit_rate_at_5=0.90,
        recall_at_5_gdot=0.85, recall_at_5_road_segments=0.72, recall_at_5_locations=0.65,
        hallucination_score=0.91, consistency_score=0.84,
        refusal_calibration=1.0, citation_correctness=0.83,
        notes="baseline",
    )
    append_run(f, rec)
    rows = list(csv.DictReader(f.open()))
    assert len(rows) == 1
    assert rows[0]["run_label"] == "v1_default"
    assert rows[0]["recall_at_5"] == "0.78"


def test_append_keeps_all_rows(tmp_path):
    f = tmp_path / "runs_log.csv"
    for label in ("v1", "v2", "v3"):
        rec = RunRecord(run_label=label, git_sha="x", recall_at_5=0.1, precision_at_5=0.1,
                        mrr=0.1, hit_rate_at_5=0.1, recall_at_5_gdot=0.1,
                        recall_at_5_road_segments=0.1, recall_at_5_locations=0.1,
                        hallucination_score=0.1, consistency_score=0.1,
                        refusal_calibration=0.1, citation_correctness=0.1, notes="")
        append_run(f, rec)
    rows = list(csv.DictReader(f.open()))
    assert [r["run_label"] for r in rows] == ["v1", "v2", "v3"]


def test_render_comparison_md_returns_table(tmp_path):
    f = tmp_path / "runs_log.csv"
    for label, r in [("v1", 0.7), ("v2", 0.8)]:
        rec = RunRecord(run_label=label, git_sha="x", recall_at_5=r, precision_at_5=0.1,
                        mrr=0.1, hit_rate_at_5=0.1, recall_at_5_gdot=0.1,
                        recall_at_5_road_segments=0.1, recall_at_5_locations=0.1,
                        hallucination_score=0.1, consistency_score=0.1,
                        refusal_calibration=0.1, citation_correctness=0.1, notes="")
        append_run(f, rec)
    md = render_comparison_md(f, last_n=2)
    assert "v1" in md and "v2" in md
    assert "recall_at_5" in md
```

- [ ] **Step 2: Run — expect ModuleNotFoundError**

```bash
mkdir -p eval/runs
pytest tests/test_runs_log.py -v
```

- [ ] **Step 3: Implement** — `eval/metrics/runs_log.py`:

```python
"""Cross-run comparison artifact (spec §9.2.3)."""
import csv
from dataclasses import dataclass, asdict, fields
from datetime import datetime, timezone
from pathlib import Path


@dataclass
class RunRecord:
    run_label: str
    git_sha: str
    recall_at_5: float
    precision_at_5: float
    mrr: float
    hit_rate_at_5: float
    recall_at_5_gdot: float
    recall_at_5_road_segments: float
    recall_at_5_locations: float
    hallucination_score: float
    consistency_score: float
    refusal_calibration: float
    citation_correctness: float
    notes: str
    run_ts: str = ""

    def __post_init__(self):
        if not self.run_ts:
            object.__setattr__(self, "run_ts", datetime.now(timezone.utc).isoformat())


_HEADERS = ["run_ts"] + [f.name for f in fields(RunRecord) if f.name != "run_ts"]


def append_run(csv_path: Path, rec: RunRecord) -> None:
    csv_path = Path(csv_path)
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    is_new = not csv_path.exists()
    with csv_path.open("a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=_HEADERS)
        if is_new:
            writer.writeheader()
        writer.writerow(asdict(rec))


def render_comparison_md(csv_path: Path, last_n: int = 5) -> str:
    rows = list(csv.DictReader(Path(csv_path).open()))
    rows = rows[-last_n:]
    if not rows:
        return "_(no runs yet)_"
    cols = ["run_label", "recall_at_5", "precision_at_5", "mrr", "hallucination_score",
            "consistency_score", "citation_correctness"]
    out = ["| " + " | ".join(cols) + " |", "|" + "|".join(["---"] * len(cols)) + "|"]
    for r in rows:
        out.append("| " + " | ".join(str(r[c]) for c in cols) + " |")
    return "\n".join(out)
```

- [ ] **Step 4: Run — expect 3 passed**
- [ ] **Step 5: Commit**

```bash
git add eval/metrics/runs_log.py tests/test_runs_log.py
git commit -m "feat(eval): runs_log.csv schema + append/comparison helpers"
```

---

# Phase 1 — Parser experiment (spec §5.2)

**Owner:** Claudia
**Estimate:** ~3 hours including ~$0.20 of Vision LLM cost.
**Depends on:** T0.* complete; `GOOGLE_API_KEY` set in `.env`.
**Unlocks:** Diana's T2A.2 (`pdf_parse.py` multi-strategy routing).

---

### Task T1.1: Parser experiment notebook scaffold + 3 tool wrappers

**Files:**
- Create: `notebooks/parser_experiment.ipynb` (start with cells; final structure in T1.2)
- Create: `notebooks/parser_tools.py` — small module with the 3 tool wrappers (so the notebook stays clean)
- Create: `tests/notebooks/test_parser_tools.py`

- [ ] **Step 1: Failing tests** — `tests/notebooks/test_parser_tools.py`:

```python
from pathlib import Path
import pytest
from notebooks.parser_tools import extract_pypdf, extract_pdfplumber, render_page_to_image

FIXTURE = Path("tests/fixtures/sample_gdot.pdf")


def test_extract_pypdf_returns_text():
    text = extract_pypdf(FIXTURE, page_idx=0)
    assert "Fog Seal" in text


def test_extract_pdfplumber_returns_text():
    text = extract_pdfplumber(FIXTURE, page_idx=0)
    assert "Fog Seal" in text


def test_render_page_to_image_returns_pil_image():
    img = render_page_to_image(FIXTURE, page_idx=0)
    assert img.size[0] > 0


@pytest.mark.slow
def test_extract_vision_llm_returns_string():
    """Hits real Gemini. Skipped by default."""
    import os
    if not os.environ.get("GOOGLE_API_KEY"):
        pytest.skip("GOOGLE_API_KEY not set")
    from notebooks.parser_tools import extract_vision_llm
    text = extract_vision_llm(FIXTURE, page_idx=0)
    assert isinstance(text, str) and len(text) > 0
```

- [ ] **Step 2: Run — expect ModuleNotFoundError**

```bash
mkdir -p notebooks tests/notebooks && touch tests/notebooks/__init__.py
pytest tests/notebooks/test_parser_tools.py -v
```

- [ ] **Step 3: Implement** — `notebooks/parser_tools.py`:

```python
"""Three PDF-extraction tools wrapped behind a uniform interface for the §5.2 experiment."""
import io
from pathlib import Path
from PIL import Image


def extract_pypdf(pdf_path: Path, page_idx: int) -> str:
    from pypdf import PdfReader
    return PdfReader(str(pdf_path)).pages[page_idx].extract_text() or ""


def extract_pdfplumber(pdf_path: Path, page_idx: int) -> str:
    import pdfplumber
    with pdfplumber.open(str(pdf_path)) as pdf:
        return pdf.pages[page_idx].extract_text() or ""


def render_page_to_image(pdf_path: Path, page_idx: int, dpi: int = 150) -> Image.Image:
    """Render a PDF page to a PIL Image for the Vision LLM."""
    import pdfplumber
    with pdfplumber.open(str(pdf_path)) as pdf:
        page = pdf.pages[page_idx]
        return page.to_image(resolution=dpi).original


def extract_vision_llm(pdf_path: Path, page_idx: int, dpi: int = 150) -> str:
    """Send the rendered page to Gemini 2.5 Pro and ask for a verbatim transcription."""
    from langchain_google_genai import ChatGoogleGenerativeAI
    img = render_page_to_image(pdf_path, page_idx, dpi=dpi)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    img_bytes = buf.getvalue()

    llm = ChatGoogleGenerativeAI(model="gemini-2.5-pro", temperature=0)
    prompt = (
        "You are extracting text from a single page of a pavement-engineering PDF. "
        "Transcribe every word, table, caption, and figure description faithfully. "
        "For tables, preserve row/column structure with a Markdown table. "
        "For figures and photos, describe what is visible in 2-4 sentences. "
        "Do not summarize — transcribe."
    )
    response = llm.invoke([
        {"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": f"data:image/png;base64,{__import__('base64').b64encode(img_bytes).decode()}"},
        ]}
    ])
    return response.content if hasattr(response, "content") else str(response)
```

- [ ] **Step 4: Run — expect 3 passed (1 skipped)**
- [ ] **Step 5: Commit**

```bash
git add notebooks/parser_tools.py tests/notebooks/
git commit -m "feat(notebooks): wrappers for pypdf/pdfplumber/Gemini-Vision page extraction"
```

---

### Task T1.2: Run experiment on 9 pages — fully automated

**Preconditions** (agent must verify before starting):

```bash
test -f notebooks/parser_tools.py             # T1.1 committed
test -f tests/notebooks/test_parser_tools.py  # T1.1 committed
test -n "$GOOGLE_API_KEY"                     # API key available
test -f data/GDOT_PAVEMENT_PRESERVATION_GUIDE.pdf
```

**Files:**
- Create: `notebooks/parser_experiment.ipynb`
- Create: `notebooks/parser_scoring.py` (rubric + winner-picker; importable from notebook)
- Create: `tests/notebooks/test_parser_scoring.py`

**Approach:** the notebook auto-resolves page indices, auto-scores tool outputs, auto-writes the results JSON and findings markdown. No human inspection is required.

- [ ] **Step 1: Failing tests for the scoring module** — `tests/notebooks/test_parser_scoring.py`:

```python
from notebooks.parser_scoring import (
    resolve_printed_to_absolute, score_text_output, score_table_output,
    score_image_output, pick_winner_per_type,
)
from pathlib import Path


def test_resolve_returns_dict_for_known_pages():
    """Smoke: function returns a dict mapping printed→absolute for the 9 target pages."""
    pdf = Path("tests/fixtures/sample_gdot.pdf")  # 3-page fixture; printed numbers absent
    mapping = resolve_printed_to_absolute(pdf, printed_pages=[1, 2, 3])
    # Fixture has no printed numbers; resolver falls back to identity mapping
    assert isinstance(mapping, dict)
    assert set(mapping.keys()) == {1, 2, 3}


def test_score_text_rewards_length_and_known_anchors():
    short = score_text_output("Fog Seal", anchors=["fog seal"])
    longer = score_text_output("Fog seal field test results show 45% reduction in skid number.", anchors=["fog seal", "skid"])
    assert longer > short


def test_score_table_rewards_pipe_or_grid_shape():
    # Markdown-table output (pipes) scores higher than run-on text
    table_out = "| col1 | col2 |\n|---|---|\n| a | b |\n| c | d |"
    runon = "col1 col2 a b c d"
    assert score_table_output(table_out) > score_table_output(runon)


def test_score_image_rewards_descriptive_words():
    described = "The image shows three pavement test sections with visible raveling and aggregate loss in the foreground."
    short = "image"
    assert score_image_output(described) > score_image_output(short)


def test_pick_winner_per_type_returns_one_string_per_type():
    # Synthetic data: pypdf wins text, pdfplumber wins table, vision wins photo+graph
    rows = [
        {"page": 26, "type": "text", "pypdf": 50, "pdfplumber": 40, "vision_llm": 30},
        {"page": 52, "type": "text", "pypdf": 60, "pdfplumber": 45, "vision_llm": 35},
        {"page": 390, "type": "table", "pypdf": 5, "pdfplumber": 80, "vision_llm": 70},
        {"page": 342, "type": "photo", "pypdf": 0, "pdfplumber": 0, "vision_llm": 90},
    ]
    winners = pick_winner_per_type(rows)
    assert winners["text"] == "pypdf"
    assert winners["table"] == "pdfplumber"
    assert winners["photo"] == "vision_llm"
```

- [ ] **Step 2: Run — expect ModuleNotFoundError**

```bash
pytest tests/notebooks/test_parser_scoring.py -v
```

- [ ] **Step 3: Implement scoring module** — `notebooks/parser_scoring.py`:

```python
"""Auto-scoring rubric for the §5.2 parser experiment.

Three scores per (page, tool):
  - text score:   length × anchor-coverage (good for prose pages)
  - table score:  detects markdown table / aligned columns
  - image score:  detects descriptive language for figures / photos

For each page TYPE, pick the tool with the highest TYPE-appropriate score (see pick_winner_per_type)."""
from __future__ import annotations
import re
from pathlib import Path


# ---------- printed → absolute page index resolver ----------

def resolve_printed_to_absolute(pdf_path: Path, printed_pages: list[int]) -> dict[int, int]:
    """Find each `printed` page number's absolute PDF index by scanning page text.

    Strategy: many engineering PDFs print the page number in a header/footer line
    on its own. We look for an isolated integer matching the printed number, in the
    first or last 80 chars of the page text. If we can't find it, we fall back to:
        absolute = printed - 1  (identity, useful for fixtures)

    Returns a dict {printed: absolute}.
    """
    from pypdf import PdfReader
    reader = PdfReader(str(pdf_path))
    n_pages = len(reader.pages)

    # Build (absolute_idx, candidate_printed_int_or_None) once
    found: dict[int, int] = {}
    candidates: dict[int, int] = {}  # printed -> absolute
    for abs_idx in range(n_pages):
        text = reader.pages[abs_idx].extract_text() or ""
        # Look for an isolated integer in the first or last 80 chars
        head, tail = text[:80], text[-80:]
        for blob in (head, tail):
            for m in re.finditer(r"(?<!\d)(\d{1,4})(?!\d)", blob):
                try:
                    n = int(m.group(1))
                except ValueError:
                    continue
                if 1 <= n <= 600 and n not in candidates:
                    candidates[n] = abs_idx

    for printed in printed_pages:
        if printed in candidates:
            found[printed] = candidates[printed]
        else:
            # Fallback: identity (works on fixture PDFs without printed numbers)
            found[printed] = max(0, min(printed - 1, n_pages - 1))
    return found


# ---------- per-tool scoring ----------

_DESCRIPTIVE_WORDS = {
    "image", "photo", "figure", "shows", "visible", "depicts", "diagram",
    "graph", "plot", "axis", "curve", "table", "row", "column", "header",
    "section", "pavement", "raveling", "crack", "test", "measurement",
}


def score_text_output(text: str, anchors: list[str] | None = None) -> float:
    """Higher = better for prose. Combines length (capped) + anchor-coverage."""
    if not text:
        return 0.0
    length = min(len(text), 4000) / 4000.0  # 0..1
    if anchors:
        hits = sum(1 for a in anchors if a.lower() in text.lower()) / len(anchors)
    else:
        hits = 0.5
    return 100.0 * (0.6 * length + 0.4 * hits)


def score_table_output(text: str) -> float:
    """Higher = better for table reconstruction. Rewards pipe-style or aligned-column output."""
    if not text:
        return 0.0
    pipe_rows = sum(1 for line in text.splitlines() if line.count("|") >= 2)
    aligned_rows = sum(1 for line in text.splitlines() if re.search(r"\s{2,}\S", line))
    return 100.0 * min(1.0, (pipe_rows * 5 + aligned_rows) / 30.0)


def score_image_output(text: str) -> float:
    """Higher = better for figure/photo description. Rewards descriptive vocabulary."""
    if not text:
        return 0.0
    words = re.findall(r"\w+", text.lower())
    if not words:
        return 0.0
    descriptive_hits = sum(1 for w in words if w in _DESCRIPTIVE_WORDS)
    coverage = descriptive_hits / max(len(words), 1)
    length_factor = min(len(text), 1500) / 1500.0
    return 100.0 * (0.5 * coverage * 10 + 0.5 * length_factor)


# ---------- winner picker ----------

_SCORERS = {
    "text": "pypdf_text_score",
    "table": "table_score",
    "photo": "image_score",
    "graph": "image_score",
    "mixed": "mixed_score",  # average of text + table + image
}


def pick_winner_per_type(rows: list[dict]) -> dict[str, str]:
    """For each page TYPE, pick the tool with the highest aggregate score across that type's pages.

    `rows` is a list of dicts with keys: page, type, pypdf, pdfplumber, vision_llm.
    Each tool key holds the type-appropriate score (text|table|image).
    """
    by_type: dict[str, dict[str, float]] = {}
    for row in rows:
        t = row["type"]
        bucket = by_type.setdefault(t, {"pypdf": 0.0, "pdfplumber": 0.0, "vision_llm": 0.0})
        for tool in ("pypdf", "pdfplumber", "vision_llm"):
            bucket[tool] += float(row[tool])

    winners: dict[str, str] = {}
    for t, scores in by_type.items():
        winners[t] = max(scores.items(), key=lambda kv: kv[1])[0]
    return winners
```

- [ ] **Step 4: Run scoring tests — expect 5 passed**

```bash
pytest tests/notebooks/test_parser_scoring.py -v
```

- [ ] **Step 5: Build the notebook** — `notebooks/parser_experiment.ipynb` with these cells (paste each as a separate code cell):

**Cell 1 (markdown):**

```markdown
# §5.2 Parser Experiment — Auto-Run

This notebook executes end-to-end without manual inspection. On completion it writes:
- `notebooks/parser_experiment_results.json` — winners per page type
- `Project_plan/20260509_parser_experiment_findings.md` — human-readable writeup
```

**Cell 2 (env check):**

```python
import os
from dotenv import load_dotenv
load_dotenv()
assert os.environ.get("GOOGLE_API_KEY"), "GOOGLE_API_KEY required"
```

**Cell 3 (page mapping):**

```python
from pathlib import Path
from pavepal.config import Config
from notebooks.parser_scoring import resolve_printed_to_absolute

cfg = Config()
TARGET_PAGES = [
    (26, "text"), (52, "text"),
    (286, "graph"), (342, "photo"),
    (352, "graph"), (353, "graph"),
    (363, "photo"), (386, "mixed"),
    (390, "table"),
]
printed = [p for p, _ in TARGET_PAGES]
PRINTED_TO_ABS = resolve_printed_to_absolute(cfg.gdot_pdf, printed)
print("Resolved page mapping:")
for p in printed:
    print(f"  printed {p} → absolute index {PRINTED_TO_ABS[p]}")
```

**Cell 4 (extract + display side-by-side, capture scores):**

```python
from html import escape
from IPython.display import HTML, display
from notebooks.parser_tools import extract_pypdf, extract_pdfplumber, extract_vision_llm
from notebooks.parser_scoring import score_text_output, score_table_output, score_image_output

ANCHORS = {
    26: ["chip seal", "asphalt"], 52: ["thin overlay", "milling"],
    286: ["crack", "effectiveness"], 342: ["fog seal", "field"],
    352: ["friction", "iri"], 353: ["friction", "skid"],
    363: ["raveling", "aggregate"], 386: ["ppit", "tutorial"],
    390: ["distress", "severity", "treatment"],
}

rows = []
for printed_no, ptype in TARGET_PAGES:
    abs_idx = PRINTED_TO_ABS[printed_no]
    out_pypdf = extract_pypdf(cfg.gdot_pdf, abs_idx)
    out_pdfplumber = extract_pdfplumber(cfg.gdot_pdf, abs_idx)
    out_vision = extract_vision_llm(cfg.gdot_pdf, abs_idx)

    cols = [("pypdf", out_pypdf), ("pdfplumber", out_pdfplumber), ("Gemini Vision", out_vision)]
    html = (
        f"<h3>Page {printed_no} ({ptype})</h3>"
        "<div style='display:flex; gap:1rem;'>"
        + "".join(
            f"<div style='flex:1; border:1px solid #ccc; padding:0.5rem; max-height:600px; overflow:auto;'>"
            f"<b>{name}</b> — {len(text)} chars<br><pre style='white-space:pre-wrap; font-size:11px;'>"
            f"{escape(text[:4000])}</pre></div>"
            for name, text in cols
        )
        + "</div>"
    )
    display(HTML(html))

    # Score each tool with the rubric appropriate to the page type
    if ptype == "text":
        s = lambda t: score_text_output(t, ANCHORS.get(printed_no, []))
    elif ptype == "table":
        s = score_table_output
    elif ptype in ("photo", "graph"):
        s = score_image_output
    else:  # mixed
        s = lambda t: (score_text_output(t, ANCHORS.get(printed_no, [])) + score_table_output(t) + score_image_output(t)) / 3

    rows.append({
        "page": printed_no, "type": ptype,
        "pypdf": s(out_pypdf), "pdfplumber": s(out_pdfplumber), "vision_llm": s(out_vision),
        "pypdf_chars": len(out_pypdf), "pdfplumber_chars": len(out_pdfplumber), "vision_chars": len(out_vision),
    })

import pandas as pd
df = pd.DataFrame(rows)
print("Scores per page (higher = better):")
display(df)
```

**Cell 5 (auto-pick winners + write JSON + findings):**

```python
import json
from datetime import date
from notebooks.parser_scoring import pick_winner_per_type

winners = pick_winner_per_type(rows)
n_vision_calls = len(TARGET_PAGES)
cost_estimate_usd = round(n_vision_calls * 0.02, 2)

results = {
    "experiment_date": str(date.today()),
    "tested_pages": [p for p, _ in TARGET_PAGES],
    "winners_by_type": winners,
    "vision_llm_cost_usd": cost_estimate_usd,
    "thresholds": {
        "pypdf_min_chars_for_prose": 100,
        "pdfplumber_table_min_cells": 6,
    },
    "raw_scores": rows,
}
Path("notebooks/parser_experiment_results.json").write_text(json.dumps(results, indent=2))
print("Wrote notebooks/parser_experiment_results.json")
print(f"Winners: {winners}")
print(f"Estimated Vision LLM spend: ${cost_estimate_usd:.2f}")

# Write findings markdown
md_lines = [
    "# Parser Experiment Findings (§5.2)",
    "",
    f"**Date:** {date.today()}  **Owner:** Claudia",
    f"**Notebook:** `notebooks/parser_experiment.ipynb`",
    f"**Decision JSON:** `notebooks/parser_experiment_results.json`",
    "",
    "## Per-page scores",
    "| Page | Type | pypdf | pdfplumber | Vision | Winner |",
    "|---:|---|---:|---:|---:|---|",
]
for r in rows:
    scores = {"pypdf": r["pypdf"], "pdfplumber": r["pdfplumber"], "vision_llm": r["vision_llm"]}
    page_winner = max(scores.items(), key=lambda kv: kv[1])[0]
    md_lines.append(f"| {r['page']} | {r['type']} | {r['pypdf']:.1f} | {r['pdfplumber']:.1f} | {r['vision_llm']:.1f} | {page_winner} |")

md_lines += [
    "",
    "## Per-type winners",
]
for t, w in winners.items():
    md_lines.append(f"- **{t}**: {w}")

md_lines += [
    "",
    "## Cost",
    f"Total Vision-LLM spend: ~${cost_estimate_usd:.2f} ({n_vision_calls} calls).",
    "",
]

Path("Project_plan/20260509_parser_experiment_findings.md").write_text("\n".join(md_lines))
print("Wrote Project_plan/20260509_parser_experiment_findings.md")
```

- [ ] **Step 6: Execute the notebook end-to-end (no human inspection)**

```bash
jupyter nbconvert --to notebook --execute notebooks/parser_experiment.ipynb \
    --output notebooks/parser_experiment.executed.ipynb
```

The execution itself writes both artifacts. If the notebook fails (Vision LLM rate-limit, API timeout, etc.), the agent retries the cell and re-executes.

- [ ] **Step 7: Verify artifacts exist with required structure**

```bash
test -f notebooks/parser_experiment_results.json
python -c "
import json
data = json.loads(open('notebooks/parser_experiment_results.json').read())
assert 'winners_by_type' in data, data
assert set(data['winners_by_type'].keys()) >= {'text', 'table', 'photo', 'graph'}, data['winners_by_type']
assert 'raw_scores' in data and len(data['raw_scores']) == 9
print('parser_experiment_results.json OK:', data['winners_by_type'])
"
test -f Project_plan/20260509_parser_experiment_findings.md
grep -q '## Per-type winners' Project_plan/20260509_parser_experiment_findings.md
echo VERIFIED
```

- [ ] **Step 8: Commit (without the executed copy)**

```bash
rm -f notebooks/parser_experiment.executed.ipynb
git add notebooks/parser_experiment.ipynb notebooks/parser_scoring.py \
        notebooks/parser_experiment_results.json \
        Project_plan/20260509_parser_experiment_findings.md \
        tests/notebooks/test_parser_scoring.py
git commit -m "feat(notebooks): auto-scored parser experiment + auto-written findings"
```

---

### Task T1.3: Verify the auto-written artifacts unblock Phase 2A

**Preconditions:**

```bash
test -f notebooks/parser_experiment_results.json   # T1.2 wrote this
test -f Project_plan/20260509_parser_experiment_findings.md   # T1.2 wrote this
```

T1.2's notebook auto-writes both `parser_experiment_results.json` and the findings markdown. This task is the verification gate: run a Python check that confirms the artifacts have the structure Diana's `pdf_parse.py` (T2A.2) expects.

- [ ] **Step 1: Verification script**

```bash
python <<'PY'
import json
from pathlib import Path

data = json.loads(Path("notebooks/parser_experiment_results.json").read_text())

# Required keys
required = {"experiment_date", "tested_pages", "winners_by_type",
            "vision_llm_cost_usd", "thresholds", "raw_scores"}
missing = required - set(data.keys())
assert not missing, f"missing keys: {missing}"

# Winners cover all 4 page types
required_types = {"text", "table", "photo", "graph"}
got_types = set(data["winners_by_type"].keys())
assert required_types <= got_types, f"missing winners for: {required_types - got_types}"

# Each winner is a known tool string
valid_tools = {"pypdf", "pdfplumber", "vision_llm", "pypdf+pdfplumber",
                "pdfplumber+vision_llm", "pypdf+vision_llm", "all"}
for t, w in data["winners_by_type"].items():
    assert w in valid_tools, f"unknown tool '{w}' for type '{t}'"

# Cost sanity check (under spec §11.4 budget)
assert data["vision_llm_cost_usd"] < 0.50, f"cost too high: {data['vision_llm_cost_usd']}"

# 9 pages tested
assert len(data["tested_pages"]) == 9, data["tested_pages"]

# Findings doc has required sections
md = Path("Project_plan/20260509_parser_experiment_findings.md").read_text()
assert "## Per-page scores" in md
assert "## Per-type winners" in md
assert "## Cost" in md

print("VERIFIED: parser experiment artifacts ready for T2A.2.")
print(f"Winners: {data['winners_by_type']}")
PY
```

- [ ] **Step 2: Commit any uncommitted artifacts**

```bash
git add -u notebooks/parser_experiment_results.json Project_plan/20260509_parser_experiment_findings.md
git diff --cached --quiet || git commit -m "docs: parser experiment artifacts (auto-written by T1.2 notebook)"
```

(If T1.2 already committed them, this is a no-op.)

---

# Phase 2 — Component implementation (4 parallel tracks)

After Phase 0 + Phase 1 complete, the four tracks proceed in parallel.

---

## Phase 2A — Indexing data prep (Diana)

**Owner:** Diana
**Estimate:** ~3 hours.
**Depends on:** T0.* + T1.3 (parser_experiment_results.json) complete.

### Task T2A.1: PDF parser — pypdf path

**Files:** Create `src/pavepal/indexing/__init__.py`, `src/pavepal/indexing/pdf_parse.py`, `tests/indexing/__init__.py`, `tests/indexing/test_pdf_parse.py`.

- [ ] **Step 1: Failing tests** — `tests/indexing/test_pdf_parse.py`:

```python
from pathlib import Path
from pavepal.indexing.pdf_parse import Page, parse_gdot_pypdf

FIXTURE = Path("tests/fixtures/sample_gdot.pdf")


def test_returns_pages():
    pages = parse_gdot_pypdf(FIXTURE)
    assert len(pages) == 3


def test_page_numbers_are_1_indexed():
    pages = parse_gdot_pypdf(FIXTURE)
    assert [p.page_no for p in pages] == [1, 2, 3]


def test_pages_carry_text():
    pages = parse_gdot_pypdf(FIXTURE)
    assert "Fog Seal" in pages[0].text


def test_parser_used_recorded():
    pages = parse_gdot_pypdf(FIXTURE)
    assert pages[0].parser_used == "pypdf"
```

- [ ] **Step 2: Run — expect ModuleNotFoundError**

```bash
mkdir -p tests/indexing && touch tests/indexing/__init__.py
pytest tests/indexing/test_pdf_parse.py -v
```

- [ ] **Step 3: Implement**

`src/pavepal/indexing/__init__.py`: empty.

`src/pavepal/indexing/pdf_parse.py`:

```python
"""GDOT PDF parser. Per-page strategy controlled by parser_experiment_results.json (T2A.2)."""
from dataclasses import dataclass
from pathlib import Path
from pypdf import PdfReader


@dataclass(frozen=True)
class Page:
    page_no: int            # 1-based
    text: str
    parser_used: str        # "pypdf" / "pdfplumber" / "vision_llm"


def parse_gdot_pypdf(pdf_path: Path) -> list[Page]:
    """Pure-pypdf parse. Used by T2A.1; called by the multi-strategy router in T2A.2 for prose pages."""
    reader = PdfReader(str(pdf_path))
    return [
        Page(page_no=i + 1, text=p.extract_text() or "", parser_used="pypdf")
        for i, p in enumerate(reader.pages)
    ]
```

- [ ] **Step 4: Run — expect 4 passed**
- [ ] **Step 5: Commit**

```bash
git add src/pavepal/indexing/ tests/indexing/
git commit -m "feat(indexing): pypdf-based GDOT parser returning 1-indexed Pages"
```

---

### Task T2A.2: Multi-strategy parser routing (uses parser_experiment_results.json)

**Files:** Modify `src/pavepal/indexing/pdf_parse.py`; modify `tests/indexing/test_pdf_parse.py`.

Per spec §5.2.4, route per-page based on what the experiment locked in. Cascade: pypdf → pdfplumber → Vision LLM.

- [ ] **Step 1: Failing tests** — append:

```python
from pavepal.indexing.pdf_parse import parse_gdot, _classify_page


def test_classify_short_with_long_neighbours_routes_to_vision():
    chars = [800, 30, 700]
    assert _classify_page(chars, page_idx=1) == "image_heavy"


def test_classify_long_text_routes_to_pypdf():
    chars = [800, 600, 700]
    assert _classify_page(chars, page_idx=1) == "prose"


def test_parse_gdot_returns_pages_with_parser_used():
    pages = parse_gdot(FIXTURE)
    assert len(pages) == 3
    assert all(p.parser_used in {"pypdf", "pdfplumber", "vision_llm"} for p in pages)
```

- [ ] **Step 2: Run — expect ImportError**
- [ ] **Step 3: Implement** — replace `pdf_parse.py` with router:

```python
"""GDOT PDF parser with multi-strategy routing (spec §5.2.4)."""
import json
import os
from dataclasses import dataclass
from pathlib import Path
from pypdf import PdfReader


SHORT_THRESHOLD = 100
LONG_NEIGHBOR_THRESHOLD = 500


@dataclass(frozen=True)
class Page:
    page_no: int
    text: str
    parser_used: str


def _classify_page(char_counts: list[int], page_idx: int) -> str:
    """Return one of: 'prose', 'image_heavy'.

    'image_heavy' = suspiciously short on a page surrounded by long neighbours.
    Note: 'table' detection isn't done here — pdfplumber's extract_tables does it implicitly.
    """
    if char_counts[page_idx] >= SHORT_THRESHOLD:
        return "prose"
    neighbours = []
    if page_idx > 0:
        neighbours.append(char_counts[page_idx - 1])
    if page_idx < len(char_counts) - 1:
        neighbours.append(char_counts[page_idx + 1])
    if not neighbours:
        return "prose"
    return "image_heavy" if all(n >= LONG_NEIGHBOR_THRESHOLD for n in neighbours) else "prose"


def _extract_pdfplumber(pdf_path: Path, page_idx: int) -> str:
    import pdfplumber
    with pdfplumber.open(str(pdf_path)) as pdf:
        return pdf.pages[page_idx].extract_text() or ""


def _extract_vision_llm(pdf_path: Path, page_idx: int) -> str:
    """Calls Gemini 2.5 Pro via notebooks.parser_tools.extract_vision_llm.
    Skipped (returns empty + logs) if GOOGLE_API_KEY is unset — for offline test runs."""
    if not os.environ.get("GOOGLE_API_KEY"):
        return ""
    from notebooks.parser_tools import extract_vision_llm
    return extract_vision_llm(pdf_path, page_idx)


def parse_gdot(pdf_path: Path) -> list[Page]:
    """Multi-strategy parse:
      - prose pages          → pypdf
      - pages with pdfplumber-detectable tables → pdfplumber
      - image-heavy pages    → Gemini Vision LLM
    """
    reader = PdfReader(str(pdf_path))
    raw_pypdf = [p.extract_text() or "" for p in reader.pages]
    char_counts = [len(t) for t in raw_pypdf]

    pages: list[Page] = []
    for i, text in enumerate(raw_pypdf):
        classification = _classify_page(char_counts, i)
        if classification == "image_heavy":
            vision_text = _extract_vision_llm(pdf_path, i)
            text = vision_text if vision_text else text
            parser = "vision_llm" if vision_text else "pypdf"
        elif _has_table(pdf_path, i):
            text = _extract_pdfplumber(pdf_path, i)
            parser = "pdfplumber"
        else:
            parser = "pypdf"
        pages.append(Page(page_no=i + 1, text=text, parser_used=parser))
    return pages


def _has_table(pdf_path: Path, page_idx: int, min_cells: int = 6) -> bool:
    import pdfplumber
    with pdfplumber.open(str(pdf_path)) as pdf:
        tables = pdf.pages[page_idx].extract_tables()
        return any(sum(len(row) for row in t) >= min_cells for t in tables)


def parse_gdot_pypdf(pdf_path: Path) -> list[Page]:
    """Backwards-compatible pure-pypdf parse used by T2A.1 tests."""
    reader = PdfReader(str(pdf_path))
    return [
        Page(page_no=i + 1, text=p.extract_text() or "", parser_used="pypdf")
        for i, p in enumerate(reader.pages)
    ]
```

- [ ] **Step 4: Run — expect all tests passed**
- [ ] **Step 5: Commit**

```bash
git add src/pavepal/indexing/pdf_parse.py tests/indexing/test_pdf_parse.py
git commit -m "feat(indexing): multi-strategy parser routing (pypdf/pdfplumber/vision)"
```

---

### Task T2A.3: Chunker

**Files:** Create `src/pavepal/indexing/chunker.py`, `tests/indexing/test_chunker.py`.

- [ ] **Step 1: Failing tests** — `tests/indexing/test_chunker.py`:

```python
from pavepal.indexing.pdf_parse import Page
from pavepal.indexing.chunker import chunk_pages
from pavepal.config import Config


def test_chunk_id_pattern():
    pages = [Page(page_no=21, text="A" * 2500, parser_used="pypdf")]
    chunks = chunk_pages(pages, Config())
    assert chunks[0].chunk_id == "GDOT:p21:0"
    assert chunks[1].chunk_id == "GDOT:p21:1"


def test_metadata_includes_parser_used():
    pages = [Page(page_no=5, text="short page", parser_used="pdfplumber")]
    chunks = chunk_pages(pages, Config())
    assert chunks[0].metadata["parser_used"] == "pdfplumber"
    assert chunks[0].metadata["page"] == 5
    assert chunks[0].metadata["doc_id"] == "GDOT_2021"
    assert chunks[0].metadata["source"] == "GDOT"


def test_chunk_index_resets_per_page():
    pages = [Page(page_no=1, text="A" * 2500, parser_used="pypdf"),
             Page(page_no=2, text="short", parser_used="pypdf")]
    chunks = chunk_pages(pages, Config())
    page2 = [c for c in chunks if c.metadata["page"] == 2]
    assert page2[0].chunk_id == "GDOT:p2:0"
```

- [ ] **Step 2: Run — expect ModuleNotFoundError**
- [ ] **Step 3: Implement** — `src/pavepal/indexing/chunker.py`:

```python
"""GDOT page → Chunk list. 500-token chunks with 50-token overlap."""
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pavepal.config import Config
from pavepal.data.chunk import Chunk
from .pdf_parse import Page


def chunk_pages(pages: list[Page], cfg: Config) -> list[Chunk]:
    splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
        encoding_name="cl100k_base",
        chunk_size=cfg.chunk_size,
        chunk_overlap=cfg.chunk_overlap,
    )
    out: list[Chunk] = []
    for page in pages:
        if not page.text.strip():
            continue
        for i, piece in enumerate(splitter.split_text(page.text)):
            out.append(Chunk(
                chunk_id=f"GDOT:p{page.page_no}:{i}",
                text=piece,
                source="GDOT",
                metadata={
                    "doc_id": "GDOT_2021",
                    "page": page.page_no,
                    "source": "GDOT",
                    "parser_used": page.parser_used,
                },
            ))
    return out
```

- [ ] **Step 4: Run — expect 3 passed**
- [ ] **Step 5: Commit**

```bash
git add src/pavepal/indexing/chunker.py tests/indexing/test_chunker.py
git commit -m "feat(indexing): chunk GDOT pages with parser_used metadata"
```

---

### Task T2A.4: roadSegments flattener

**Files:** Create `src/pavepal/indexing/json_flatten.py`, `tests/indexing/test_json_flatten.py`.

- [ ] **Step 1: Failing tests** — `tests/indexing/test_json_flatten.py`:

```python
from pathlib import Path
from pavepal.indexing.json_flatten import flatten_road_segments

FIXTURE = Path("tests/fixtures/sample_road_segments.json")


def test_count():
    chunks = flatten_road_segments(FIXTURE)
    assert len(chunks) == 2


def test_chunk_id_uses_centerline_id():
    chunks = flatten_road_segments(FIXTURE)
    assert chunks[0].chunk_id == "roadSegments:222121"


def test_text_includes_road_name_and_pci():
    chunks = flatten_road_segments(FIXTURE)
    assert "PEACHTREE INDUSTRIAL BLVD ACCESS RD" in chunks[0].text
    assert "82" in chunks[0].text


def test_null_pci_omits_clause_keeps_metadata():
    chunks = flatten_road_segments(FIXTURE)
    river = next(c for c in chunks if "RIVER TRAIL" in c.text)
    assert river.metadata["pci"] is None
    assert "PCI" not in river.text


def test_source_in_metadata():
    chunks = flatten_road_segments(FIXTURE)
    assert chunks[0].metadata["source"] == "roadSegments"
```

- [ ] **Step 2: Run — expect ModuleNotFoundError**
- [ ] **Step 3: Implement** — `src/pavepal/indexing/json_flatten.py`:

```python
"""JSON record → Chunk. Style A natural-language template (research log §4.3)."""
import json
from pathlib import Path
from pavepal.data.chunk import Chunk


def _flatten_defects(defects: dict | None) -> str:
    if not defects:
        return ""
    return ", ".join(f"{n} {kind}" for kind, n in defects.items())


def _build_road_segment_text(rec: dict) -> str:
    name = rec.get("name") or "Unnamed road"
    parts = [f"Road segment {name}"]
    if rec.get("ROADCLASS"):
        parts.append(f"classified {rec['ROADCLASS']}")
    if rec.get("speed_limit"):
        parts.append(f"speed limit {rec['speed_limit']}")
    pci = rec.get("pci")
    if pci is not None:
        cat = rec.get("pci_category")
        parts.append(f"PCI {pci}" + (f" ({cat})" if cat else ""))
    defects_str = _flatten_defects(rec.get("defects"))
    if defects_str:
        parts.append(f"with {defects_str}")
    return ". ".join(parts) + "."


def flatten_road_segments(json_path: Path) -> list[Chunk]:
    records = json.loads(Path(json_path).read_text())
    chunks: list[Chunk] = []
    for rec in records:
        cid = rec.get("centerline_id")
        if not cid:
            continue
        chunks.append(Chunk(
            chunk_id=f"roadSegments:{cid}",
            text=_build_road_segment_text(rec),
            source="roadSegments",
            metadata={
                "source": "roadSegments",
                "record_id": cid,
                "road_name": rec.get("name"),
                "road_class": rec.get("ROADCLASS"),
                "pci": rec.get("pci"),
                "pci_category": rec.get("pci_category"),
                "defects": rec.get("defects") or {},
            },
        ))
    return chunks
```

- [ ] **Step 4: Run — expect 5 passed**
- [ ] **Step 5: Commit**

```bash
git add src/pavepal/indexing/json_flatten.py tests/indexing/test_json_flatten.py
git commit -m "feat(indexing): flatten roadSegments records"
```

---

### Task T2A.5: locations flattener

**Files:** Modify `src/pavepal/indexing/json_flatten.py`; modify `tests/indexing/test_json_flatten.py`.

- [ ] **Step 1: Append failing tests**:

```python
from pavepal.indexing.json_flatten import flatten_locations
LOC_FIXTURE = Path("tests/fixtures/sample_locations.json")


def test_locations_count():
    assert len(flatten_locations(LOC_FIXTURE)) == 2


def test_locations_chunk_id():
    chunks = flatten_locations(LOC_FIXTURE)
    assert chunks[0].chunk_id == "locations:GX010224_time_4_00250"


def test_locations_text_includes_road_and_defect():
    chunks = flatten_locations(LOC_FIXTURE)
    assert "ENGINEERING DR" in chunks[0].text
    assert "transverse" in chunks[0].text.lower()


def test_locations_no_pci():
    chunks = flatten_locations(LOC_FIXTURE)
    assert chunks[0].metadata["source"] == "locations"
    assert "pci" not in chunks[0].metadata
```

- [ ] **Step 2: Run — expect ImportError**
- [ ] **Step 3: Implement** — append to `json_flatten.py`:

```python
def _build_location_text(rec: dict) -> str:
    name = rec.get("name") or "unnamed location"
    parts = [f"Inspection point {name}"]
    if rec.get("road_name"):
        parts.append(f"on {rec['road_name']}")
    defects_str = _flatten_defects(rec.get("defects"))
    if defects_str:
        parts.append(f"with {defects_str}")
    return ". ".join(parts) + "."


def flatten_locations(json_path: Path) -> list[Chunk]:
    records = json.loads(Path(json_path).read_text())
    chunks: list[Chunk] = []
    for rec in records:
        name = rec.get("name")
        if not name:
            continue
        chunks.append(Chunk(
            chunk_id=f"locations:{name}",
            text=_build_location_text(rec),
            source="locations",
            metadata={
                "source": "locations",
                "record_id": name,
                "road_name": rec.get("road_name"),
                "defects": rec.get("defects") or {},
                "image_path": rec.get("image_path"),
            },
        ))
    return chunks
```

- [ ] **Step 4: Run — expect 9 passed**
- [ ] **Step 5: Commit**

```bash
git add src/pavepal/indexing/json_flatten.py tests/indexing/test_json_flatten.py
git commit -m "feat(indexing): flatten locations records"
```

---

## Phase 2B — Dense embedding + Chroma (Claudia)

**Owner:** Claudia
**Estimate:** ~2 hours.
**Depends on:** T0.* complete.

### Task T2B.1: Embedder wrapper

**Files:** Create `src/pavepal/indexing/embed.py`, `tests/indexing/test_embed.py`.

- [ ] **Step 1: Failing tests**:

```python
from unittest.mock import patch, MagicMock
import pytest
from pavepal.config import Config
from pavepal.indexing.embed import Embedder


def test_uses_query_prefix():
    cfg = Config()
    with patch("pavepal.indexing.embed.HuggingFaceEmbeddings") as Mock:
        Mock.return_value = MagicMock()
        Embedder(cfg)
        kwargs = Mock.call_args.kwargs
        assert kwargs["model_name"] == cfg.embedding_model
        assert kwargs["query_instruction"] == cfg.bge_query_prefix


def test_exposes_embed_methods():
    cfg = Config()
    with patch("pavepal.indexing.embed.HuggingFaceEmbeddings") as Mock:
        inner = MagicMock()
        inner.embed_documents.return_value = [[0.1, 0.2]]
        inner.embed_query.return_value = [0.3, 0.4]
        Mock.return_value = inner
        e = Embedder(cfg)
        assert e.embed_documents(["doc"]) == [[0.1, 0.2]]
        assert e.embed_query("q") == [0.3, 0.4]


@pytest.mark.slow
def test_real_model_returns_768_dim():
    cfg = Config()
    e = Embedder(cfg)
    assert len(e.embed_query("PCI 65 treatment")) == 768
```

- [ ] **Step 2: Run — expect ModuleNotFoundError**
- [ ] **Step 3: Implement** — `src/pavepal/indexing/embed.py`:

```python
"""BGE embedder wrapper. Locks the BGE query prefix in one place."""
from langchain_huggingface import HuggingFaceEmbeddings
from pavepal.config import Config


class Embedder:
    def __init__(self, cfg: Config):
        self._inner = HuggingFaceEmbeddings(
            model_name=cfg.embedding_model,
            query_instruction=cfg.bge_query_prefix,
        )

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._inner.embed_documents(texts)

    def embed_query(self, text: str) -> list[float]:
        return self._inner.embed_query(text)

    @property
    def langchain_embeddings(self) -> HuggingFaceEmbeddings:
        return self._inner
```

- [ ] **Step 4: Run — expect 2 passed (1 slow skipped)**
- [ ] **Step 5: Commit**

```bash
git add src/pavepal/indexing/embed.py tests/indexing/test_embed.py
git commit -m "feat(indexing): Embedder wraps BGE with mandatory query prefix"
```

---

### Task T2B.2: Dense per-source retrievers

**Files:** Create `src/pavepal/retrieval/__init__.py`, `src/pavepal/retrieval/dense.py`, `tests/retrieval/__init__.py`, `tests/retrieval/test_dense.py`.

- [ ] **Step 1: Failing tests**:

```python
from pathlib import Path
from langchain_chroma import Chroma
from langchain_core.embeddings import FakeEmbeddings
from langchain_core.documents import Document
from pavepal.config import Config
from pavepal.retrieval.dense import build_dense_retrievers


def test_three_retrievers_returned(tmp_path):
    chroma = Chroma(collection_name="t1", embedding_function=FakeEmbeddings(size=8),
                    persist_directory=str(tmp_path))
    chroma.add_documents([
        Document(page_content="g", metadata={"source": "GDOT"}),
        Document(page_content="r", metadata={"source": "roadSegments"}),
        Document(page_content="l", metadata={"source": "locations"}),
    ])
    rs = build_dense_retrievers(chroma, Config())
    assert set(rs.keys()) == {"GDOT", "roadSegments", "locations"}


def test_each_filters_by_source(tmp_path):
    chroma = Chroma(collection_name="t2", embedding_function=FakeEmbeddings(size=8),
                    persist_directory=str(tmp_path))
    chroma.add_documents([
        Document(page_content="g1", metadata={"source": "GDOT"}),
        Document(page_content="g2", metadata={"source": "GDOT"}),
        Document(page_content="r1", metadata={"source": "roadSegments"}),
    ])
    rs = build_dense_retrievers(chroma, Config())
    docs = rs["GDOT"].invoke("anything")
    assert all(d.metadata["source"] == "GDOT" for d in docs)
    assert len(docs) == 2
```

- [ ] **Step 2: Run — expect ModuleNotFoundError**

```bash
mkdir -p tests/retrieval && touch tests/retrieval/__init__.py
pytest tests/retrieval/test_dense.py -v
```

- [ ] **Step 3: Implement**

`src/pavepal/retrieval/__init__.py`: empty for now (T2C.3 fills it in).

`src/pavepal/retrieval/dense.py`:

```python
"""Three per-source Chroma retrievers (policy B fan-out)."""
from langchain_chroma import Chroma
from langchain_core.retrievers import BaseRetriever
from pavepal.config import Config


def build_dense_retrievers(chroma: Chroma, cfg: Config) -> dict[str, BaseRetriever]:
    return {
        source: chroma.as_retriever(
            search_kwargs={"k": cfg.k_per_retriever, "filter": {"source": source}}
        )
        for source in cfg.sources
    }
```

- [ ] **Step 4: Run — expect 2 passed**
- [ ] **Step 5: Commit**

```bash
git add src/pavepal/retrieval/__init__.py src/pavepal/retrieval/dense.py tests/retrieval/
git commit -m "feat(retrieval): build_dense_retrievers — 3 per-source Chroma retrievers"
```

---

## Phase 2C — Sparse + fusion (Ojasv)

**Owner:** Ojasv
**Estimate:** ~2.5 hours.
**Depends on:** T0.* complete.

### Task T2C.1: BM25Retriever class

**Files:** Create `src/pavepal/retrieval/sparse.py`, `tests/retrieval/test_sparse.py`.

- [ ] **Step 1: Failing tests**:

```python
import pickle
from pathlib import Path
from rank_bm25 import BM25Okapi
from pavepal.data.chunk import Chunk
from pavepal.text import tokenize
from pavepal.retrieval.sparse import BM25Retriever


def _make_pickle(tmp_path: Path) -> Path:
    chunks = [
        Chunk("GDOT:p1:0", "fog seal application on raveling pavements", "GDOT", {}),
        Chunk("GDOT:p2:0", "crack sealing with hot rubberized asphalt", "GDOT", {}),
        Chunk("GDOT:p3:0", "thin overlay over milled surface", "GDOT", {}),
    ]
    bm25 = BM25Okapi([tokenize(c.text) for c in chunks])
    out = tmp_path / "bm25.pkl"
    out.write_bytes(pickle.dumps({"chunks": chunks, "bm25": bm25}))
    return out


def test_loads_and_returns_chunks(tmp_path):
    pkl = _make_pickle(tmp_path)
    r = BM25Retriever.from_pickle(pkl, k=2)
    hits = r.retrieve("fog seal raveling")
    assert len(hits) == 2
    assert hits[0].chunk_id == "GDOT:p1:0"


def test_uses_shared_tokenize(tmp_path):
    pkl = _make_pickle(tmp_path)
    r = BM25Retriever.from_pickle(pkl, k=1)
    assert r.retrieve("FOG Seal")[0].chunk_id == "GDOT:p1:0"
```

- [ ] **Step 2: Run — expect ModuleNotFoundError**
- [ ] **Step 3: Implement** — `src/pavepal/retrieval/sparse.py`:

```python
"""Per-source BM25 retriever. Pickle layout: {"chunks": list[Chunk], "bm25": BM25Okapi}."""
import pickle
from pathlib import Path
from rank_bm25 import BM25Okapi
from pavepal.data.chunk import Chunk
from pavepal.text import tokenize


class BM25Retriever:
    def __init__(self, chunks: list[Chunk], bm25: BM25Okapi, k: int):
        self._chunks = chunks
        self._bm25 = bm25
        self._k = k

    @classmethod
    def from_pickle(cls, path: Path, k: int) -> "BM25Retriever":
        data = pickle.loads(Path(path).read_bytes())
        return cls(chunks=data["chunks"], bm25=data["bm25"], k=k)

    def retrieve(self, query: str) -> list[Chunk]:
        if not self._chunks:
            return []
        scores = self._bm25.get_scores(tokenize(query))
        top = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[: self._k]
        return [self._chunks[i] for i in top]
```

- [ ] **Step 4: Run — expect 2 passed**
- [ ] **Step 5: Commit**

```bash
git add src/pavepal/retrieval/sparse.py tests/retrieval/test_sparse.py
git commit -m "feat(retrieval): BM25Retriever loads per-source pickle"
```

---

### Task T2C.2: LangChain adapter for BM25

**Files:** Modify `src/pavepal/retrieval/sparse.py`; modify `tests/retrieval/test_sparse.py`.

- [ ] **Step 1: Append failing test**:

```python
from langchain_core.documents import Document
from pavepal.retrieval.sparse import bm25_to_langchain


def test_adapter_returns_documents(tmp_path):
    pkl = _make_pickle(tmp_path)
    lc = bm25_to_langchain(BM25Retriever.from_pickle(pkl, k=2))
    docs = lc.invoke("fog seal")
    assert all(isinstance(d, Document) for d in docs)
    assert docs[0].metadata["chunk_id"] == "GDOT:p1:0"
```

- [ ] **Step 2: Run — expect ImportError**
- [ ] **Step 3: Append to `sparse.py`**:

```python
from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever
from langchain_core.callbacks.manager import CallbackManagerForRetrieverRun


class _BM25LangChainAdapter(BaseRetriever):
    bm25: BM25Retriever

    class Config:
        arbitrary_types_allowed = True

    def _get_relevant_documents(self, query: str, *, run_manager: CallbackManagerForRetrieverRun) -> list[Document]:
        return [
            Document(
                page_content=c.text,
                metadata={**c.metadata, "chunk_id": c.chunk_id, "source": c.source},
            )
            for c in self.bm25.retrieve(query)
        ]


def bm25_to_langchain(bm25: BM25Retriever) -> BaseRetriever:
    return _BM25LangChainAdapter(bm25=bm25)
```

- [ ] **Step 4: Run — expect 3 passed**
- [ ] **Step 5: Commit**

```bash
git add src/pavepal/retrieval/sparse.py tests/retrieval/test_sparse.py
git commit -m "feat(retrieval): LangChain adapter for BM25Retriever"
```

---

### Task T2C.3: Fusion + Retriever public class

**Files:** Create `src/pavepal/retrieval/fuse.py`; modify `src/pavepal/retrieval/__init__.py`; create `tests/retrieval/test_fuse.py`.

- [ ] **Step 1: Failing test** — `tests/retrieval/test_fuse.py`:

```python
import pickle
from pathlib import Path
from rank_bm25 import BM25Okapi
from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_core.embeddings import FakeEmbeddings
from pavepal.config import Config
from pavepal.data.chunk import Chunk
from pavepal.text import tokenize
from pavepal.retrieval import Retriever


def _setup(tmp_path: Path):
    chroma = Chroma(collection_name="pavepal_test",
                    embedding_function=FakeEmbeddings(size=8),
                    persist_directory=str(tmp_path / "chroma"))
    samples = {
        "GDOT": [Chunk("GDOT:p1:0", "fog seal raveling treatment", "GDOT",
                       {"source": "GDOT", "page": 1})],
        "roadSegments": [Chunk("roadSegments:222121", "Engineering Dr PCI 82",
                                "roadSegments", {"source": "roadSegments", "record_id": "222121"})],
        "locations": [Chunk("locations:GX01", "inspection point on Engineering Dr",
                            "locations", {"source": "locations", "record_id": "GX01"})],
    }
    docs = []
    for src, chunks in samples.items():
        for c in chunks:
            docs.append(Document(page_content=c.text,
                                 metadata={**c.metadata, "chunk_id": c.chunk_id}))
        bm = BM25Okapi([tokenize(c.text) for c in chunks])
        short = {"GDOT": "gdot", "roadSegments": "roads", "locations": "locs"}[src]
        (tmp_path / f"bm25_{short}.pkl").write_bytes(pickle.dumps({"chunks": chunks, "bm25": bm}))
    chroma.add_documents(docs)
    return tmp_path / "chroma", tmp_path


def test_retriever_returns_chunks_from_multiple_sources(tmp_path):
    chroma_dir, index_dir = _setup(tmp_path)
    r = Retriever.load_from_test(Config(), chroma_dir=chroma_dir, bm25_dir=index_dir,
                                  embedding=FakeEmbeddings(size=8))
    hits = r.retrieve("Engineering Dr fog seal")
    assert len({h.source for h in hits}) >= 2
    assert all(isinstance(h, Chunk) for h in hits)
```

- [ ] **Step 2: Run — expect ModuleNotFoundError**
- [ ] **Step 3: Implement**

`src/pavepal/retrieval/fuse.py`:

```python
"""RRF fusion of 6 retrievers (3 sources × 2 channels)."""
from langchain.retrievers import EnsembleRetriever
from langchain_core.retrievers import BaseRetriever


def build_ensemble(retrievers: list[BaseRetriever]) -> EnsembleRetriever:
    n = len(retrievers)
    return EnsembleRetriever(retrievers=retrievers, weights=[1.0 / n] * n)
```

`src/pavepal/retrieval/__init__.py`:

```python
"""Retrieval public surface (spec §6.1)."""
from __future__ import annotations
import pickle
from pathlib import Path
from langchain_chroma import Chroma
from langchain_core.embeddings import Embeddings
from pavepal.config import Config
from pavepal.data.chunk import Chunk
from pavepal.indexing.embed import Embedder
from .dense import build_dense_retrievers
from .sparse import BM25Retriever, bm25_to_langchain
from .fuse import build_ensemble

_BM25_FILE_BY_SOURCE = {
    "GDOT": "bm25_gdot.pkl",
    "roadSegments": "bm25_roads.pkl",
    "locations": "bm25_locs.pkl",
}


class Retriever:
    def __init__(self, ensemble, chunks_by_id: dict[str, Chunk]):
        self._ensemble = ensemble
        self._chunks_by_id = chunks_by_id

    @classmethod
    def load(cls, cfg: Config) -> "Retriever":
        return cls._build(cfg, cfg.index_dir, cfg.index_dir, Embedder(cfg).langchain_embeddings)

    @classmethod
    def load_from_test(cls, cfg: Config, chroma_dir: Path, bm25_dir: Path, embedding: Embeddings) -> "Retriever":
        return cls._build(cfg, chroma_dir, bm25_dir, embedding)

    @classmethod
    def _build(cls, cfg: Config, chroma_dir: Path, bm25_dir: Path, embedding: Embeddings) -> "Retriever":
        chroma = Chroma(collection_name="pavepal", embedding_function=embedding,
                         persist_directory=str(chroma_dir))
        dense = build_dense_retrievers(chroma, cfg)
        sparse_lc, chunks_by_id = {}, {}
        for source, fname in _BM25_FILE_BY_SOURCE.items():
            pkl = bm25_dir / fname
            sparse_lc[source] = bm25_to_langchain(BM25Retriever.from_pickle(pkl, k=cfg.k_per_retriever))
            for c in pickle.loads(pkl.read_bytes())["chunks"]:
                chunks_by_id[c.chunk_id] = c
        ensemble = build_ensemble([
            dense["GDOT"], dense["roadSegments"], dense["locations"],
            sparse_lc["GDOT"], sparse_lc["roadSegments"], sparse_lc["locations"],
        ])
        return cls(ensemble, chunks_by_id)

    def retrieve(self, query: str) -> list[Chunk]:
        out, seen = [], set()
        for d in self._ensemble.invoke(query):
            cid = d.metadata.get("chunk_id")
            if cid and cid in self._chunks_by_id and cid not in seen:
                out.append(self._chunks_by_id[cid])
                seen.add(cid)
        return out[:5]
```

> **Note for Indexer (T3.1):** when persisting Documents to Chroma, set `metadata["chunk_id"] = chunk.chunk_id`.

- [ ] **Step 4: Run — expect 1 passed**
- [ ] **Step 5: Commit**

```bash
git add src/pavepal/retrieval/ tests/retrieval/test_fuse.py
git commit -m "feat(retrieval): fuse 6 retrievers into Retriever.retrieve"
```

---

## Phase 2D — Generation + glue (William)

**Owner:** William
**Estimate:** ~3 hours.
**Depends on:** T0.* complete. Can be developed against mocks; integrates in Phase 3.

### Task T2D.1: Prompt builder

**Files:** Create `src/pavepal/generation/__init__.py`, `src/pavepal/generation/prompt.py`, `tests/generation/__init__.py`, `tests/generation/test_prompt.py`.

- [ ] **Step 1: Failing tests**:

```python
from pavepal.config import Config
from pavepal.data.chunk import Chunk
from pavepal.generation.prompt import build_prompt


def _chunks():
    return [
        Chunk("GDOT:p21:0", "fog seal info", "GDOT", {"page": 21}),
        Chunk("roadSegments:222121", "PCI 82 details", "roadSegments", {"pci": 82}),
    ]


def test_includes_question():
    assert "What treatment for PCI 82?" in build_prompt("What treatment for PCI 82?", _chunks(), Config())


def test_numbers_chunks_one_indexed():
    p = build_prompt("q", _chunks(), Config())
    assert "[1]" in p and "[2]" in p


def test_includes_source_prefix():
    p = build_prompt("q", _chunks(), Config())
    assert "(source: GDOT)" in p
    assert "(source: roadSegments)" in p


def test_includes_refusal_phrase_verbatim():
    cfg = Config()
    assert cfg.refusal_phrase in build_prompt("q", _chunks(), cfg)
```

- [ ] **Step 2: Run — expect ModuleNotFoundError**

```bash
mkdir -p tests/generation && touch tests/generation/__init__.py
```

- [ ] **Step 3: Implement**

`src/pavepal/generation/__init__.py`: empty.

`src/pavepal/generation/prompt.py`:

```python
"""Prompt template (spec §7.2). Slot structure locked; exact wording iterates."""
from pavepal.config import Config
from pavepal.data.chunk import Chunk


_TEMPLATE = """\
[SYSTEM]
You are PavePal, a pavement-preservation assistant grounded in the GDOT
Pavement Preservation Guide and PavePal's road-condition data.

Use ONLY the chunks provided below. Cite each factual claim with [N], where
N is the 1-based position of the chunk in the list.

If the chunks do not contain the information needed to answer, respond with
EXACTLY this sentence and nothing else:
"{refusal_phrase}"

[CHUNKS]
{chunks_block}

[USER QUESTION]
{question}
"""


def build_prompt(question: str, chunks: list[Chunk], cfg: Config) -> str:
    block = "\n".join(f"[{i + 1}] (source: {c.source}) {c.text}" for i, c in enumerate(chunks))
    return _TEMPLATE.format(refusal_phrase=cfg.refusal_phrase, chunks_block=block, question=question)
```

- [ ] **Step 4: Run — expect 4 passed**
- [ ] **Step 5: Commit**

```bash
git add src/pavepal/generation/ tests/generation/
git commit -m "feat(generation): build_prompt with locked slot structure"
```

---

### Task T2D.2: Generator (Gemini + citation parsing)

**Files:** Create `src/pavepal/generation/generator.py`, `tests/generation/test_generator.py`.

- [ ] **Step 1: Failing tests**:

```python
from unittest.mock import patch, MagicMock
from pavepal.config import Config
from pavepal.data.chunk import Chunk
from pavepal.generation.generator import Generator


def _chunks():
    return [
        Chunk("GDOT:p21:0", "fog seal", "GDOT", {"page": 21}),
        Chunk("roadSegments:222121", "PCI 82", "roadSegments", {"pci": 82}),
    ]


def test_parses_citations():
    cfg = Config()
    with patch("pavepal.generation.generator.ChatGoogleGenerativeAI") as Mock:
        llm = MagicMock()
        llm.invoke.return_value = MagicMock(content="Apply fog seal [1] given PCI 82 [2].")
        Mock.return_value = llm
        ans = Generator(cfg).generate("q?", _chunks())
    assert ans.refused is False
    assert [c.rank for c in ans.citations] == [1, 2]
    assert ans.citations[0].chunk_id == "GDOT:p21:0"


def test_detects_refusal():
    cfg = Config()
    with patch("pavepal.generation.generator.ChatGoogleGenerativeAI") as Mock:
        llm = MagicMock()
        llm.invoke.return_value = MagicMock(content=cfg.refusal_phrase)
        Mock.return_value = llm
        ans = Generator(cfg).generate("q?", _chunks())
    assert ans.refused is True
    assert ans.citations == []


def test_dedupes_citations():
    cfg = Config()
    with patch("pavepal.generation.generator.ChatGoogleGenerativeAI") as Mock:
        llm = MagicMock()
        llm.invoke.return_value = MagicMock(content="See [1]. Also [1].")
        Mock.return_value = llm
        ans = Generator(cfg).generate("q?", _chunks())
    assert len(ans.citations) == 1


def test_drops_out_of_range_citations():
    cfg = Config()
    with patch("pavepal.generation.generator.ChatGoogleGenerativeAI") as Mock:
        llm = MagicMock()
        llm.invoke.return_value = MagicMock(content="See [1] and [9].")
        Mock.return_value = llm
        ans = Generator(cfg).generate("q?", _chunks())
    assert [c.rank for c in ans.citations] == [1]
```

- [ ] **Step 2: Run — expect ModuleNotFoundError**
- [ ] **Step 3: Implement** — `src/pavepal/generation/generator.py`:

```python
"""Generator: build prompt, call Gemini 2.5 Pro, parse [N] citations, set refused flag."""
import re
from langchain_google_genai import ChatGoogleGenerativeAI
from pavepal.config import Config
from pavepal.data.chunk import Chunk
from pavepal.data.answer import AnswerWithCitations, Citation
from .prompt import build_prompt


_CITATION_RE = re.compile(r"\[(\d+)\]")


class Generator:
    def __init__(self, cfg: Config):
        self._cfg = cfg
        self._llm = ChatGoogleGenerativeAI(model=cfg.llm_model)

    def generate(self, question: str, chunks: list[Chunk]) -> AnswerWithCitations:
        prompt = build_prompt(question, chunks, self._cfg)
        response = self._llm.invoke(prompt)
        text = response.content if hasattr(response, "content") else str(response)
        refused = text.strip() == self._cfg.refusal_phrase
        citations = [] if refused else self._parse_citations(text, chunks)
        return AnswerWithCitations(question=question, answer_text=text,
                                   citations=citations, refused=refused, retrieved_chunks=chunks)

    @staticmethod
    def _parse_citations(text: str, chunks: list[Chunk]) -> list[Citation]:
        seen, out = set(), []
        for m in _CITATION_RE.finditer(text):
            n = int(m.group(1))
            if n in seen or n < 1 or n > len(chunks):
                continue
            seen.add(n)
            out.append(Citation(chunk_id=chunks[n - 1].chunk_id, rank=n))
        return out
```

- [ ] **Step 4: Run — expect 4 passed**
- [ ] **Step 5: Commit**

```bash
git add src/pavepal/generation/generator.py tests/generation/test_generator.py
git commit -m "feat(generation): Generator wraps Gemini call + parses [N] citations"
```

---

### Task T2D.3: JSONL logger

**Files:** Create `src/pavepal/logging.py`, `tests/test_logging.py`.

- [ ] **Step 1: Failing tests**:

```python
import json
from pathlib import Path
from pavepal.data.chunk import Chunk
from pavepal.data.answer import AnswerWithCitations, Citation
from pavepal.logging import JSONLLogger


def _ans():
    return AnswerWithCitations(
        question="q", answer_text="a [1]",
        citations=[Citation("GDOT:p1:0", 1)], refused=False,
        retrieved_chunks=[Chunk("GDOT:p1:0", "t", "GDOT", {})],
    )


def test_writes_one_line_per_call(tmp_path):
    f = tmp_path / "run.jsonl"
    log = JSONLLogger(f)
    log.log(_ans(), latency_ms={"retrieve": 100, "generate": 2000})
    log.log(_ans(), latency_ms={"retrieve": 90, "generate": 1900}, qid="Q01")
    lines = f.read_text().strip().split("\n")
    assert len(lines) == 2
    rec = json.loads(lines[1])
    assert rec["qid"] == "Q01"
    assert rec["retrieved_chunk_ids"] == ["GDOT:p1:0"]


def test_includes_iso_timestamp(tmp_path):
    f = tmp_path / "run.jsonl"
    JSONLLogger(f).log(_ans(), latency_ms={"retrieve": 1, "generate": 1})
    rec = json.loads(f.read_text().strip())
    assert "T" in rec["ts"]
```

- [ ] **Step 2: Run — expect ModuleNotFoundError**
- [ ] **Step 3: Implement** — `src/pavepal/logging.py`:

```python
"""Per-turn JSONL logger (spec §4.5)."""
import json
from datetime import datetime, timezone
from pathlib import Path
from pavepal.data.answer import AnswerWithCitations


class JSONLLogger:
    def __init__(self, path: Path):
        self._path = Path(path)
        self._path.parent.mkdir(parents=True, exist_ok=True)

    def log(self, ans: AnswerWithCitations, latency_ms: dict, qid: str | None = None) -> None:
        record = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "qid": qid,
            "question": ans.question,
            "retrieved_chunk_ids": [c.chunk_id for c in ans.retrieved_chunks],
            "answer_text": ans.answer_text,
            "citations": [{"chunk_id": c.chunk_id, "rank": c.rank} for c in ans.citations],
            "refused": ans.refused,
            "latency_ms": latency_ms,
        }
        with self._path.open("a") as f:
            f.write(json.dumps(record) + "\n")
```

- [ ] **Step 4: Run — expect 2 passed**
- [ ] **Step 5: Commit**

```bash
git add src/pavepal/logging.py tests/test_logging.py
git commit -m "feat(logging): per-turn JSONL logger"
```

---

### Task T2D.4: Pipeline class

**Files:** Create `src/pavepal/pipeline.py`, `tests/test_pipeline.py`.

- [ ] **Step 1: Failing test**:

```python
from unittest.mock import MagicMock
from pavepal.config import Config
from pavepal.data.chunk import Chunk
from pavepal.data.answer import AnswerWithCitations, Citation
from pavepal.pipeline import Pipeline


def test_calls_retrieve_then_generate_then_log():
    chunks = [Chunk("GDOT:p1:0", "t", "GDOT", {})]
    expected = AnswerWithCitations(question="q", answer_text="a [1]",
                                   citations=[Citation("GDOT:p1:0", 1)], refused=False,
                                   retrieved_chunks=chunks)
    retriever, generator, logger = MagicMock(), MagicMock(), MagicMock()
    retriever.retrieve.return_value = chunks
    generator.generate.return_value = expected

    p = Pipeline(retriever=retriever, generator=generator, logger=logger)
    ans = p.answer("q", qid="Q01")

    retriever.retrieve.assert_called_once_with("q")
    generator.generate.assert_called_once_with("q", chunks)
    assert ans is expected
    kwargs = logger.log.call_args.kwargs
    assert "latency_ms" in kwargs and kwargs["qid"] == "Q01"
```

- [ ] **Step 2: Run — expect ModuleNotFoundError**
- [ ] **Step 3: Implement** — `src/pavepal/pipeline.py`:

```python
"""Public Pipeline.answer() — the surface eval imports (spec §9)."""
import time
from datetime import datetime, timezone
from pavepal.config import Config
from pavepal.data.answer import AnswerWithCitations
from pavepal.generation.generator import Generator
from pavepal.logging import JSONLLogger
from pavepal.retrieval import Retriever


class Pipeline:
    def __init__(self, retriever: Retriever, generator: Generator, logger: JSONLLogger):
        self._retriever = retriever
        self._generator = generator
        self._logger = logger

    @classmethod
    def load(cls, cfg: Config) -> "Pipeline":
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        return cls(
            retriever=Retriever.load(cfg),
            generator=Generator(cfg),
            logger=JSONLLogger(cfg.log_dir / f"run_{ts}.jsonl"),
        )

    def answer(self, question: str, qid: str | None = None) -> AnswerWithCitations:
        t0 = time.perf_counter()
        chunks = self._retriever.retrieve(question)
        t1 = time.perf_counter()
        ans = self._generator.generate(question, chunks)
        t2 = time.perf_counter()
        latency_ms = {"retrieve": int((t1 - t0) * 1000), "generate": int((t2 - t1) * 1000)}
        self._logger.log(ans, latency_ms=latency_ms, qid=qid)
        return ans
```

- [ ] **Step 4: Run — expect 1 passed**
- [ ] **Step 5: Commit**

```bash
git add src/pavepal/pipeline.py tests/test_pipeline.py
git commit -m "feat(pipeline): Pipeline.answer composes Retriever + Generator + Logger"
```

---

### Task T2D.5: CLI

**Files:** Create `src/pavepal/cli.py`, `src/pavepal/__main__.py`, `tests/test_cli.py`.

- [ ] **Step 1: Failing tests**:

```python
from unittest.mock import patch, MagicMock
from pavepal.cli import main


def test_query_calls_pipeline(capsys):
    with patch("pavepal.cli.Pipeline") as Pcls:
        p = MagicMock()
        ans = MagicMock(); ans.answer_text = "Apply fog seal [1]."
        p.answer.return_value = ans
        Pcls.load.return_value = p
        main(["query", "What treatment?"])
    p.answer.assert_called_once_with("What treatment?")
    assert "Apply fog seal [1]." in capsys.readouterr().out


def test_index_build_calls_indexer():
    with patch("pavepal.cli.Indexer") as Icls:
        idx = MagicMock(); Icls.return_value = idx
        main(["index", "build"])
    idx.build.assert_called_once()


def test_no_args_prints_help(capsys):
    rc = main([])
    assert rc != 0
```

- [ ] **Step 2: Run — expect ModuleNotFoundError**

> **Sync note:** if Diana's T3.1 hasn't landed yet, write a one-line stub `class Indexer: pass` in `src/pavepal/indexing/index.py`, commit it, and continue. Diana replaces it during T3.1.

- [ ] **Step 3: Implement**

`src/pavepal/cli.py`:

```python
"""Pipeline CLI: `python -m pavepal index build` and `python -m pavepal query "..."`."""
import argparse
import sys
from pavepal.config import Config
from pavepal.indexing.index import Indexer
from pavepal.pipeline import Pipeline


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pavepal")
    subs = parser.add_subparsers(dest="cmd", required=False)

    idx = subs.add_parser("index"); idx.add_argument("action", choices=["build"])
    q = subs.add_parser("query"); q.add_argument("question", type=str)

    args = parser.parse_args(argv)
    if args.cmd is None:
        parser.print_help(sys.stderr)
        return 2

    cfg = Config()
    if args.cmd == "index" and args.action == "build":
        Indexer(cfg).build(
            gdot_pdf=cfg.gdot_pdf,
            road_segments_json=cfg.road_segments_json,
            locations_json=cfg.locations_json,
            out_dir=cfg.index_dir,
        )
        print(f"Indices written to {cfg.index_dir}")
        return 0

    if args.cmd == "query":
        ans = Pipeline.load(cfg).answer(args.question)
        print(ans.answer_text)
        return 0

    parser.print_help(sys.stderr)
    return 2
```

`src/pavepal/__main__.py`:

```python
import sys
from .cli import main
raise SystemExit(main(sys.argv[1:]))
```

- [ ] **Step 4: Run — expect 3 passed**
- [ ] **Step 5: Commit**

```bash
git add src/pavepal/cli.py src/pavepal/__main__.py tests/test_cli.py
git commit -m "feat(cli): pavepal index build + query subcommands"
```

---

# Phase 3 — Integration

**Owner:** Diana for T3.1 (orchestrator + notebook); Claudia and Ojasv for smoke tests.
**Estimate:** ~3 hours.
**Depends on:** all of Phase 2 complete.

---

### Task T3.1: Indexer orchestrator

**Owner:** Diana
**Files:** Create `src/pavepal/indexing/index.py`; create `tests/indexing/test_index.py`.

- [ ] **Step 1: Failing tests**:

```python
import pickle
from pathlib import Path
import pytest
from langchain_core.embeddings import FakeEmbeddings
from pavepal.config import Config
from pavepal.indexing.index import Indexer


@pytest.mark.integration
def test_builds_chroma_and_three_pickles(tmp_path, monkeypatch):
    monkeypatch.setattr("pavepal.indexing.index._make_embedder",
                        lambda cfg: FakeEmbeddings(size=8))
    out = tmp_path / "index"
    Indexer(Config()).build(
        gdot_pdf=Path("tests/fixtures/sample_gdot.pdf"),
        road_segments_json=Path("tests/fixtures/sample_road_segments.json"),
        locations_json=Path("tests/fixtures/sample_locations.json"),
        out_dir=out,
    )
    assert (out / "chroma").exists()
    for f in ["bm25_gdot.pkl", "bm25_roads.pkl", "bm25_locs.pkl"]:
        data = pickle.loads((out / f).read_bytes())
        assert "chunks" in data and "bm25" in data
        assert len(data["chunks"]) > 0


@pytest.mark.integration
def test_idempotent_chunk_ids(tmp_path, monkeypatch):
    monkeypatch.setattr("pavepal.indexing.index._make_embedder",
                        lambda cfg: FakeEmbeddings(size=8))
    cfg = Config()
    a, b = tmp_path / "a", tmp_path / "b"
    for out in (a, b):
        Indexer(cfg).build(
            gdot_pdf=Path("tests/fixtures/sample_gdot.pdf"),
            road_segments_json=Path("tests/fixtures/sample_road_segments.json"),
            locations_json=Path("tests/fixtures/sample_locations.json"),
            out_dir=out,
        )
    ids_a = sorted(c.chunk_id for c in pickle.loads((a / "bm25_gdot.pkl").read_bytes())["chunks"])
    ids_b = sorted(c.chunk_id for c in pickle.loads((b / "bm25_gdot.pkl").read_bytes())["chunks"])
    assert ids_a == ids_b
```

- [ ] **Step 2: Run — expect ModuleNotFoundError**
- [ ] **Step 3: Implement** — `src/pavepal/indexing/index.py`:

```python
"""Indexer: builds Chroma + 3 BM25 pickles from partner files (spec §5.4)."""
import pickle
import shutil
from pathlib import Path
from langchain_chroma import Chroma
from langchain_core.documents import Document
from rank_bm25 import BM25Okapi
from pavepal.config import Config
from pavepal.data.chunk import Chunk
from pavepal.text import tokenize
from .pdf_parse import parse_gdot
from .chunker import chunk_pages
from .json_flatten import flatten_road_segments, flatten_locations
from .embed import Embedder


_BM25_FILE_BY_SOURCE = {
    "GDOT": "bm25_gdot.pkl",
    "roadSegments": "bm25_roads.pkl",
    "locations": "bm25_locs.pkl",
}


def _make_embedder(cfg: Config):
    """Hook for tests to inject FakeEmbeddings."""
    return Embedder(cfg).langchain_embeddings


class Indexer:
    def __init__(self, cfg: Config):
        self._cfg = cfg

    def build(self, gdot_pdf: Path, road_segments_json: Path,
               locations_json: Path, out_dir: Path) -> None:
        out_dir = Path(out_dir)
        if out_dir.exists():
            shutil.rmtree(out_dir)
        out_dir.mkdir(parents=True)

        all_chunks = (
            chunk_pages(parse_gdot(gdot_pdf), self._cfg)
            + flatten_road_segments(road_segments_json)
            + flatten_locations(locations_json)
        )

        embedding = _make_embedder(self._cfg)
        chroma = Chroma(collection_name="pavepal", embedding_function=embedding,
                         persist_directory=str(out_dir / "chroma"))
        docs = [
            Document(page_content=c.text,
                      metadata={**c.metadata, "chunk_id": c.chunk_id, "source": c.source})
            for c in all_chunks
        ]
        if docs:
            chroma.add_documents(docs)

        chunks_by_source: dict[str, list[Chunk]] = {s: [] for s in self._cfg.sources}
        for c in all_chunks:
            chunks_by_source[c.source].append(c)
        for source, chunks in chunks_by_source.items():
            tokens = [tokenize(c.text) for c in chunks]
            bm25 = BM25Okapi(tokens) if tokens else BM25Okapi([[""]])
            (out_dir / _BM25_FILE_BY_SOURCE[source]).write_bytes(
                pickle.dumps({"chunks": chunks, "bm25": bm25}))
```

- [ ] **Step 4: Run — expect 2 passed (integration marker)**

```bash
pytest tests/indexing/test_index.py -v -m integration
```

- [ ] **Step 5: Commit**

```bash
git add src/pavepal/indexing/index.py tests/indexing/test_index.py
git commit -m "feat(indexing): Indexer.build orchestrates parse→chunk→flatten→embed→persist"
```

---

### Task T3.2: End-to-end build smoke test (real partner data)

**Owner:** Claudia
**Files:** Create `tests/test_e2e_build.py`.

- [ ] **Step 1: Smoke test**:

```python
import pickle
from pathlib import Path
import pytest
from pavepal.config import Config
from pavepal.indexing.index import Indexer


@pytest.mark.slow
@pytest.mark.integration
def test_real_build_vector_counts(tmp_path):
    cfg = Config()
    out = tmp_path / "index"
    Indexer(cfg).build(
        gdot_pdf=cfg.gdot_pdf,
        road_segments_json=cfg.road_segments_json,
        locations_json=cfg.locations_json,
        out_dir=out,
    )
    counts = {}
    for src, f in [("GDOT", "bm25_gdot.pkl"), ("roadSegments", "bm25_roads.pkl"),
                    ("locations", "bm25_locs.pkl")]:
        counts[src] = len(pickle.loads((out / f).read_bytes())["chunks"])
    assert 400 <= counts["GDOT"] <= 700, counts
    assert 1500 <= counts["roadSegments"] <= 2400, counts
    assert 17000 <= counts["locations"] <= 23000, counts
```

- [ ] **Step 2: Run (only when ready, ~10 min)**

```bash
pytest tests/test_e2e_build.py -v -m slow
```

- [ ] **Step 3: Commit**

```bash
git add tests/test_e2e_build.py
git commit -m "test: e2e build smoke test against real partner data"
```

---

### Task T3.3: End-to-end query smoke tests

**Owner:** Ojasv
**Files:** Create `tests/test_e2e_query.py`.

- [ ] **Step 1: Smoke tests**:

```python
import os
import pytest
from pavepal.config import Config
from pavepal.pipeline import Pipeline


def _load_or_skip():
    if not os.environ.get("GOOGLE_API_KEY"):
        pytest.skip("GOOGLE_API_KEY not set")
    return Pipeline.load(Config())


@pytest.mark.slow
@pytest.mark.integration
def test_q01_cross_source():
    p = _load_or_skip()
    ans = p.answer("This street is PCI 80 with longitudinal cracks — what's the cheapest treatment per GDOT?",
                    qid="Q01_smoke")
    sources = {c.source for c in ans.retrieved_chunks}
    assert "GDOT" in sources
    assert "roadSegments" in sources or "locations" in sources


@pytest.mark.slow
@pytest.mark.integration
def test_refusal():
    p = _load_or_skip()
    ans = p.answer("What does GDOT say about railway crossings?", qid="Q_refusal")
    assert ans.refused is True


@pytest.mark.slow
@pytest.mark.integration
def test_no_orphan_citations():
    p = _load_or_skip()
    ans = p.answer("What treatment for PCI 65?", qid="Q_orphan")
    ids = {c.chunk_id for c in ans.retrieved_chunks}
    assert all(cit.chunk_id in ids for cit in ans.citations)
```

- [ ] **Step 2: Run (after `pavepal index build` succeeded)**

```bash
pytest tests/test_e2e_query.py -v -m slow
```

- [ ] **Step 3: Commit**

```bash
git add tests/test_e2e_query.py
git commit -m "test: e2e query smoke tests (cross-source, refusal, no orphans)"
```

---

### Task T3.4: Demo notebook

**Owner:** Diana
**Files:** Create `notebooks/phase1_demo.ipynb`.

- [ ] **Step 1: Build the notebook with these cells (paste each as a code cell):**

Cell 1 (markdown): `# PavePal Pipeline — Demo Notebook`

Cell 2:
```python
import os
from dotenv import load_dotenv
load_dotenv()
assert os.environ.get("GOOGLE_API_KEY"), "Set GOOGLE_API_KEY in .env"
print("env OK")
```

Cell 3:
```python
from pavepal.config import Config
from pavepal.indexing.index import Indexer
cfg = Config()
if not (cfg.index_dir / "chroma").exists():
    Indexer(cfg).build(gdot_pdf=cfg.gdot_pdf, road_segments_json=cfg.road_segments_json,
                        locations_json=cfg.locations_json, out_dir=cfg.index_dir)
    print("Indices built.")
else:
    print(f"Indices already exist at {cfg.index_dir}")
```

Cell 4:
```python
from pavepal.pipeline import Pipeline
pipeline = Pipeline.load(cfg)
print("Pipeline loaded.")
```

Cell 5:
```python
from IPython.display import display, Markdown
QUESTIONS = [
    ("Q_demo_1", "What treatment does GDOT recommend for PCI 65?"),
    ("Q_demo_2", "Tell me about Engineering Dr."),
    ("Q_demo_3", "What does GDOT say about railway crossings?"),
]
for qid, q in QUESTIONS:
    ans = pipeline.answer(q, qid=qid)
    display(Markdown(f"### {qid} — {q}"))
    display(Markdown(f"**Refused:** `{ans.refused}`"))
    display(Markdown(f"**Answer:** {ans.answer_text}"))
    display(Markdown("**Citations:**"))
    for cit in ans.citations:
        c = next(c for c in ans.retrieved_chunks if c.chunk_id == cit.chunk_id)
        display(Markdown(f"- `[{cit.rank}]` ({c.source}) {c.text[:200]}..."))
```

Cell 6:
```python
import json
from pathlib import Path
logs = sorted((cfg.log_dir).glob("run_*.jsonl"))
if logs:
    for line in logs[-1].read_text().splitlines()[-3:]:
        rec = json.loads(line)
        print(f"  {rec['qid']}: refused={rec['refused']}  retrieve={rec['latency_ms']['retrieve']}ms")
```

- [ ] **Step 2: Execute end-to-end**

```bash
jupyter nbconvert --to notebook --execute notebooks/phase1_demo.ipynb \
    --output notebooks/phase1_demo.executed.ipynb
```

- [ ] **Step 3: Commit**

```bash
rm -f notebooks/phase1_demo.executed.ipynb
git add notebooks/phase1_demo.ipynb
git commit -m "feat(notebook): pipeline demo — build, query, inspect citations + logs"
```

---

# Phase 4 — T-task verifications

The parser experiment was Phase 1 (Claudia). The remaining T-tasks validate locked picks against real data.

---

### Task T4.1: T2 — BGE prefix verification (auto-written findings)

**Owner:** Claudia
**Preconditions:**

```bash
test -f src/pavepal/indexing/embed.py    # T2B.1 committed
test -f index/chroma                     # T3.2 e2e build ran (real index)
test -n "$GOOGLE_API_KEY"
```

**Files:** Create `scripts/t2_bge_prefix_check.py` (one-off but checked-in for reproducibility); produces `Project_plan/20260509_t2_bge_prefix_findings.md`.

- [ ] **Step 1: Write the verification script** — `scripts/t2_bge_prefix_check.py`:

```python
"""T2 — verify BGE query prefix flows through. Auto-writes findings markdown.

Two checks:
  (1) Prefix capture: hook the Embedder's underlying call and confirm the prefix
      appears in the string that reaches the model.
  (2) Behavioural delta: on 5 questions, retrieve top-5 with prefix vs without —
      count how many questions have differing top-5 chunk_ids.
"""
from pathlib import Path
from datetime import date
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from pavepal.config import Config
from pavepal.indexing.embed import Embedder


# (1) Prefix capture
captured: list[str] = []


class _Tap:
    def __init__(self, inner): self._inner = inner
    def embed_query(self, text):
        captured.append(text)
        return self._inner.embed_query(text)
    def embed_documents(self, texts):
        return self._inner.embed_documents(texts)


cfg = Config()
e = Embedder(cfg)
object.__setattr__(e, "_inner", _Tap(e._inner))
e.embed_query("What's the cheapest treatment for PCI 65?")
prefix_applied = bool(captured) and captured[0].startswith(cfg.bge_query_prefix)


# (2) Behavioural delta
emb_with_prefix = HuggingFaceEmbeddings(
    model_name=cfg.embedding_model, query_instruction=cfg.bge_query_prefix
)
emb_no_prefix = HuggingFaceEmbeddings(
    model_name=cfg.embedding_model, query_instruction=""
)


def top_ids(emb, q: str) -> list[str]:
    chroma = Chroma(collection_name="pavepal", embedding_function=emb,
                     persist_directory=str(cfg.index_dir / "chroma"))
    docs = chroma.similarity_search(q, k=5)
    return [d.metadata.get("chunk_id", "") for d in docs]


QUESTIONS = [
    "What's the cheapest treatment for PCI 65?",
    "Engineering Dr defects",
    "Fog seal limitations",
    "Crack sealing performance",
    "When to apply microsurfacing",
]
delta_rows = []
for q in QUESTIONS:
    a = top_ids(emb_with_prefix, q)
    b = top_ids(emb_no_prefix, q)
    delta_rows.append({"q": q, "with": a, "without": b, "differ": a != b})

n_differ = sum(1 for r in delta_rows if r["differ"])

# Auto-write findings markdown
out = Path("Project_plan/20260509_t2_bge_prefix_findings.md")
lines = [
    "# T2 Findings — BGE Query Prefix Verification",
    "",
    f"**Date:** {date.today()}  **Owner:** Claudia",
    f"**Verdict:** {'PASS' if prefix_applied else 'FAIL — prefix NOT applied (silent failure)'}",
    "",
    "## (1) Prefix capture",
    f"- Prefix expected: `{cfg.bge_query_prefix!r}`",
    f"- String passed to underlying model: `{captured[0] if captured else '<no call>'}`",
    f"- Prefix applied at query time: **{'YES' if prefix_applied else 'NO'}**",
    "",
    "## (2) With-vs-without retrieval comparison",
    "| # | Question | top-5 differ? |",
    "|---|---|---|",
]
for i, r in enumerate(delta_rows, 1):
    lines.append(f"| {i} | {r['q']} | {'YES' if r['differ'] else 'no'} |")
lines += [
    "",
    "## Conclusion",
    f"Prefix is **{'applied correctly' if prefix_applied else 'BROKEN'}**.",
    f"Retrieval differs on **{n_differ} of {len(QUESTIONS)}** sample questions "
    f"({'significant' if n_differ >= 3 else 'negligible'}).",
    "",
]
out.write_text("\n".join(lines))
print(f"Wrote {out}")
print(f"prefix_applied={prefix_applied}  n_differ={n_differ}/{len(QUESTIONS)}")

# Hard-fail if the prefix isn't actually being applied
assert prefix_applied, "BGE query prefix not applied — escalate per research log §3.5"
```

- [ ] **Step 2: Run**

```bash
python scripts/t2_bge_prefix_check.py
```

Expected: prints `prefix_applied=True` and `Wrote Project_plan/...`. If `assert` fails, escalate — fix the Embedder before proceeding.

- [ ] **Step 3: Verify**

```bash
test -f Project_plan/20260509_t2_bge_prefix_findings.md
grep -q "Verdict: PASS" Project_plan/20260509_t2_bge_prefix_findings.md
echo VERIFIED
```

- [ ] **Step 4: Commit**

```bash
git add scripts/t2_bge_prefix_check.py Project_plan/20260509_t2_bge_prefix_findings.md
git commit -m "docs(t2): auto-written BGE query prefix verification"
```

---

### Task T4.2: T3 — Policy B source coverage (auto-written findings)

**Owner:** Ojasv
**Preconditions:**

```bash
test -f src/pavepal/retrieval/__init__.py    # T2C.3 committed
test -d index/chroma                          # T3.2 e2e build ran
test -f index/bm25_gdot.pkl
test -f index/bm25_roads.pkl
test -f index/bm25_locs.pkl
```

**Files:** Create `scripts/t3_policy_b_check.py`; produces `Project_plan/20260509_t3_policy_b_findings.md`.

- [ ] **Step 1: Write the verification script** — `scripts/t3_policy_b_check.py`:

```python
"""T3 — verify policy B surfaces ≥1 chunk from the expected source on biased queries.
Auto-writes findings markdown and asserts pass/fail."""
from pathlib import Path
from datetime import date
from pavepal.config import Config
from pavepal.retrieval import Retriever

QUERIES = [
    {"label": "GDOT-leaning", "q": "What's the cheapest treatment for PCI 65?",
     "expected": {"GDOT"}},
    {"label": "Road-name",    "q": "Tell me about Engineering Dr",
     "expected": {"roadSegments", "locations"}},
    {"label": "Defect",       "q": "Which roads have transverse cracks?",
     "expected": {"roadSegments", "locations"}},
]

r = Retriever.load(Config())
results = []
for spec in QUERIES:
    chunks = r.retrieve(spec["q"])
    sources = [c.source for c in chunks]
    has_expected = bool(set(sources) & spec["expected"])
    results.append({**spec, "sources": sources, "chunk_ids": [c.chunk_id for c in chunks],
                    "pass": has_expected})

n_pass = sum(1 for r_ in results if r_["pass"])
overall_pass = n_pass == len(results)

# Write findings markdown
out = Path("Project_plan/20260509_t3_policy_b_findings.md")
lines = [
    "# T3 Findings — Policy B Source Coverage",
    "",
    f"**Date:** {date.today()}  **Owner:** Ojasv",
    f"**Verdict:** {'PASS' if overall_pass else f'FAIL ({n_pass}/{len(results)} queries pass)'}",
    "",
    "## Per-query top-5 sources",
    "| Query type | Question | Top-5 sources | Expected | ≥1 from expected? |",
    "|---|---|---|---|---|",
]
for r_ in results:
    expected = " or ".join(sorted(r_["expected"]))
    sources_str = ", ".join(r_["sources"])
    verdict = "YES" if r_["pass"] else "NO"
    lines.append(f"| {r_['label']} | {r_['q']} | {sources_str} | {expected} | **{verdict}** |")

lines += [
    "",
    "## Per-query top-5 chunk_ids (audit trail)",
]
for r_ in results:
    lines.append(f"- **{r_['label']}** ({r_['q']}):")
    for cid in r_["chunk_ids"]:
        lines.append(f"  - `{cid}`")

lines += [
    "",
    "## Conclusion",
    f"Policy B {'works as designed' if overall_pass else 'needs adjustment'}.",
]
if not overall_pass:
    failing = [r_["label"] for r_ in results if not r_["pass"]]
    lines.append(f"Failing queries: {failing}. Suggested fix: increase `k_per_retriever` from 5 → 8, or rebalance ensemble weights.")
lines.append("")

out.write_text("\n".join(lines))
print(f"Wrote {out}")
print(f"Pass: {n_pass}/{len(results)}")
assert overall_pass, f"Policy B failed on: {[r_['label'] for r_ in results if not r_['pass']]}"
```

- [ ] **Step 2: Run**

```bash
python scripts/t3_policy_b_check.py
```

Expected: prints `Pass: 3/3` and writes the findings doc. If the assert fails, escalate to retrieval team — do not paper over.

- [ ] **Step 3: Verify**

```bash
test -f Project_plan/20260509_t3_policy_b_findings.md
grep -q "Verdict: PASS" Project_plan/20260509_t3_policy_b_findings.md
echo VERIFIED
```

- [ ] **Step 4: Commit**

```bash
git add scripts/t3_policy_b_check.py Project_plan/20260509_t3_policy_b_findings.md
git commit -m "docs(t3): auto-written policy B source coverage verification"
```

---

# Phase 5 — Final integration sign-off

---

### Task T5.1: README quick-start

**Owner:** Diana
**Files:** Modify `README.md`.

- [ ] **Step 1: Append**

```markdown

## Pipeline — Quick Start

```bash
# 1. Create env
conda env create -f env.yaml
conda activate capstone_env
pip install -e .

# 2. Set Gemini API key
echo "GOOGLE_API_KEY=your_key_here" > .env

# 3. Run parser experiment (one-time, ~$0.20):
jupyter lab notebooks/parser_experiment.ipynb

# 4. Build indices (~15 min — partner data must be in data/)
python -m pavepal index build

# 5. Ask a question
python -m pavepal query "What's the cheapest treatment for PCI 65?"

# 6. Or run the demo notebook
jupyter lab notebooks/phase1_demo.ipynb
```

For architecture, see [Project_plan/20260509_pipeline_spec.md](Project_plan/20260509_pipeline_spec.md).
For evaluation, see [Project_plan/20260506_project_plan_evaluation.md](Project_plan/20260506_project_plan_evaluation.md).
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: pipeline quick-start in README"
```

---

### Task T5.2: Run the full test suite

**Owner:** Claudia

- [ ] **Step 1: Fast tests (default)**

```bash
pytest -v
```

Expected: every non-`slow`, non-`integration` test passes.

- [ ] **Step 2: Integration tests**

```bash
pytest -v -m integration
```

- [ ] **Step 3: Slow tests (after `index build` succeeded)**

```bash
pytest -v -m slow
```

- [ ] **Step 4: Fix forward** — for any failure, read traceback, fix root cause, add a regression test, commit.

---

# Self-review checklist

Before declaring done, run through:

- [ ] Spec coverage — every section of [20260509_pipeline_spec.md](20260509_pipeline_spec.md) maps to at least one task here
- [ ] All `pytest` tests pass under all three markers
- [ ] `python -m pavepal index build` completes against real data
- [ ] `python -m pavepal query "..."` returns an answer with citations
- [ ] T-task reports (T4.1, T4.2) are committed and findings reviewed
- [ ] Parser experiment findings (Phase 1, T1.3) are committed with concrete winners JSON
- [ ] `eval/metric_glossary.json` and `eval/runs/runs_log.csv` schema in place
- [ ] No `TODO` / `FIXME` left in `src/pavepal/`
- [ ] `.gitignore` excludes `index/`, `logs/`, `.env`, partner data
- [ ] No unintended partner data committed beyond what's already in `data/` (`git log --all --full-history -- "data/*"` reviewed)

---

# Future — web app gets its own plan

Once the pipeline hits the eval-plan §7 targets, write `<date>_web_app_spec.md` and a follow-up `<date>_web_app_implementation_plan.md` covering:
- `src/pavepal/api/main.py` — FastAPI wrapper exposing `POST /query`
- `src/pavepal/api/cors.py` — CORS for the Vite dev origin
- `Repo_private_testing/pavepal-capstone/src/lib/api.js` — fetch wrapper
- React component to render `[N]` chips with chunk-text tooltips

Don't write either spec or plan until the pipeline RAG is hitting its eval targets.
