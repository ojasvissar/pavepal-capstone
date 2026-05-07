# Phase 1 RAG — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a hybrid RAG pipeline (BM25 + dense + RRF, source-aware) over GDOT PDF + flattened JSONs with Gemini 2.5 Pro generation, exposed via a CLI and a public Python API for the eval harness.

**Architecture:** Greenfield Python package `src/pavepal/` with focused modules — data contracts, indexing, retrieval, generation, pipeline glue. All tunables live in `config.py`. Cross-module boundaries are typed dataclasses; internals use prose. See [20260507_phase_1_spec.md](20260507_phase_1_spec.md) for the spec this plan implements.

**Tech Stack:** Python 3.11, conda (`capstone_env`), LangChain + LangChain ecosystem, Chroma, `rank-bm25`, `BAAI/bge-base-en-v1.5` via `sentence-transformers`, `pypdf`, `pdfplumber`, `tiktoken`, `langchain-google-genai` (Gemini 2.5 Pro), pytest.

---

## Team split (4 placeholder owners)

The project splits into a **Foundation** phase (anyone can do it, must finish before others start) plus four parallel tracks. Replace `[A]`, `[B]`, `[C]`, `[D]` with actual names when assigning.

| Owner | Track | Modules they own |
|---|---|---|
| **[Shared]** | Foundation | env.yaml, repo scaffold, `data/`, `config.py`, `text.py`, test fixtures |
| **[A]** | Indexing data prep | `pdf_parse.py`, `chunker.py`, `json_flatten.py`, the `Indexer` orchestrator |
| **[B]** | Dense retrieval | `embed.py`, `retrieval/dense.py` |
| **[C]** | Sparse + fusion | `retrieval/sparse.py`, `retrieval/fuse.py`, the `Retriever` class |
| **[D]** | Generation + glue | `generation/`, `pipeline.py`, `logging.py`, `cli.py`, demo notebook |

**Dependency graph:**

```
Foundation (T0.*)
    │
    ├──► [A] Indexing prep (T1A.*)  ────┐
    ├──► [B] Embedder + Chroma  ────────┤
    ├──► [C] BM25 + Fusion  ────────────┤
    └──► [D] Generator + Pipeline glue ─┤
                                        ▼
                              Integration (T2.*)
                                        │
                                        ▼
                            T-task verifications (T3.*)
```

**Cross-track sync points:**
- **A ↔ B:** A's `Indexer` calls B's `Embedder`. Lock the `Embedder` interface in T1B.1 before A starts T2.1.
- **A ↔ C:** A's `Indexer` writes BM25 pickles in the format C's `BM25Retriever` reads. Lock the pickle layout in T1C.1 before A starts T2.1.
- **D ↔ C:** D's `Pipeline` imports `Retriever` from `pavepal.retrieval`. T1D.4 cannot run until T1C.3 has landed (Retriever class exists in `retrieval/__init__.py`).
- **D ↔ A:** D's CLI imports `Indexer`. T1D.5 cannot run until T2.1 has landed (`indexing/index.py` exists). If [D] reaches T1D.5 before [A] reaches T2.1, [D] should write a one-line stub `class Indexer: pass` in `indexing/index.py`, commit it, and continue — [A] replaces it during T2.1.

---

## Conventions used in every task

- **TDD:** failing test → run-fail → minimal impl → run-pass → commit. Code blocks are required, never "TBD".
- **Tests:** pytest. Slow tests (real network, real model load) marked `@pytest.mark.slow` and skipped by default.
- **Commits:** conventional-commit style (`feat:`, `test:`, `chore:`, `fix:`). Each task ends with one commit.
- **Type hints:** required on every public function. Use Python 3.11 syntax (`list[str]`, `X | None`).
- **Paths:** always `pathlib.Path`, never string concatenation.
- **No emojis** in code or docs.

---

# Phase 0 — Foundation

**Owner:** [Shared] (one person; everything in this phase blocks the four tracks)
**Estimate:** ~3 hours sequential.

---

### Task T0.1: Project scaffold + git init + conda env

**Files:**
- Modify: `env.yaml`
- Create: `.gitignore`
- Create: `pyproject.toml`
- Create: `src/pavepal/__init__.py`
- Create: `tests/__init__.py`

- [ ] **Step 1: Initialize git repo (only if not already a repo)**

```bash
cd /Users/williamchong/Documents/UBC_MDS/PavePal
git init
git add -A
git commit -m "chore: snapshot current state before Phase 1 implementation"
```

If already a git repo, skip the init and just commit current state to a checkpoint.

- [ ] **Step 2: Replace `env.yaml` with the Phase-1 environment**

Overwrite `env.yaml` with this content (keeps existing scaffold packages, adds the RAG stack):

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
  - pytest
  - pytest-mock
  - pip:
      # RAG framework
      - langchain>=0.3
      - langchain-community>=0.3
      - langchain-huggingface>=0.1
      - langchain-chroma>=0.1
      - langchain-google-genai>=2.0
      # Vector + sparse stores
      - chromadb>=0.5
      - rank-bm25>=0.2
      # Embeddings
      - sentence-transformers>=3.0
      # PDF
      - pypdf>=5.0
      - pdfplumber>=0.11
      # Tokenization
      - tiktoken>=0.7
      # Misc
      - python-dotenv>=1.0
      - faiss-cpu  # kept from prior scaffold; harmless
```

- [ ] **Step 3: Recreate the conda env**

```bash
conda env remove -n capstone_env -y
conda env create -f env.yaml
conda activate capstone_env
```

Expected: install completes without errors. If `chromadb` or `langchain-google-genai` fail on macOS, retry with `pip install --no-cache-dir`.

- [ ] **Step 4: Verify all imports work**

```bash
conda activate capstone_env
python -c "
import langchain
import langchain_community
import langchain_huggingface
import langchain_chroma
import langchain_google_genai
import chromadb
import rank_bm25
import sentence_transformers
import pypdf
import pdfplumber
import tiktoken
import dotenv
print('All imports OK')
"
```

Expected output: `All imports OK`

- [ ] **Step 5: Write `.gitignore`**

```gitignore
# Python
__pycache__/
*.py[cod]
*.egg-info/
.pytest_cache/
.ipynb_checkpoints/

# Project artifacts
index/
logs/
.env

# Partner data — never commit
data_20260426/

# Frontend
private_testing_repo/pavepal-capstone/node_modules/
```

- [ ] **Step 6: Write minimal `pyproject.toml`**

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

- [ ] **Step 7: Install package in editable mode**

```bash
pip install -e .
```

Expected: `Successfully installed pavepal-0.1.0`.

- [ ] **Step 8: Create empty package init files**

Write `src/pavepal/__init__.py`:

```python
"""PavePal Phase 1 RAG package."""
```

Write `tests/__init__.py` as an empty file.

- [ ] **Step 9: Commit**

```bash
git add env.yaml .gitignore pyproject.toml src/pavepal/__init__.py tests/__init__.py
git commit -m "chore: scaffold Phase 1 package, env.yaml, gitignore"
```

---

### Task T0.2: Config dataclass

**Files:**
- Create: `src/pavepal/config.py`
- Create: `tests/test_config.py`

- [ ] **Step 1: Write the failing test**

`tests/test_config.py`:

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


def test_config_is_frozen():
    cfg = Config()
    import dataclasses
    assert dataclasses.is_dataclass(cfg)
    try:
        cfg.chunk_size = 999
    except dataclasses.FrozenInstanceError:
        return
    raise AssertionError("Config should be frozen")
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_config.py -v
```

Expected: `ModuleNotFoundError: No module named 'pavepal.config'`.

- [ ] **Step 3: Write the Config dataclass**

`src/pavepal/config.py`:

```python
"""Single source of truth for all Phase 1 tunables."""
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

    # Paths — note partner data files have spaces and parens in names
    index_dir: Path = Path("./index")
    log_dir: Path = Path("./logs")
    gdot_pdf: Path = Path(
        "./data_20260426/UBC Capstone Project/GDOT PAVEMENT PRESERVATION GUIDE (1) (1).pdf"
    )
    road_segments_json: Path = Path(
        "./data_20260426/UBC Capstone Project/roadSegments (2).json"
    )
    locations_json: Path = Path(
        "./data_20260426/UBC Capstone Project/locations (2).json"
    )
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_config.py -v
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/pavepal/config.py tests/test_config.py
git commit -m "feat(config): add frozen Config dataclass with all Phase 1 tunables"
```

---

### Task T0.3: Chunk dataclass

**Files:**
- Create: `src/pavepal/data/__init__.py`
- Create: `src/pavepal/data/chunk.py`
- Create: `tests/data/__init__.py`
- Create: `tests/data/test_chunk.py`

- [ ] **Step 1: Write the failing tests**

`tests/data/test_chunk.py`:

```python
import pytest
from pavepal.data.chunk import Chunk


def test_chunk_minimal_construction():
    c = Chunk(
        chunk_id="GDOT:p21:0",
        text="Fog seal application on raveling pavements...",
        source="GDOT",
        metadata={"doc_id": "GDOT_2021", "page": 21, "source": "GDOT"},
    )
    assert c.chunk_id == "GDOT:p21:0"
    assert c.source == "GDOT"


def test_chunk_is_frozen():
    c = Chunk(chunk_id="x", text="y", source="GDOT", metadata={})
    with pytest.raises(Exception):
        c.text = "mutated"


def test_chunk_source_must_be_valid():
    """Type-checker enforces this; runtime check is a sanity net."""
    valid = {"GDOT", "roadSegments", "locations"}
    c = Chunk(chunk_id="x", text="y", source="GDOT", metadata={})
    assert c.source in valid
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
mkdir -p tests/data
touch tests/data/__init__.py
pytest tests/data/test_chunk.py -v
```

Expected: `ModuleNotFoundError: No module named 'pavepal.data'`.

- [ ] **Step 3: Implement Chunk**

Create `src/pavepal/data/__init__.py` (empty file).

`src/pavepal/data/chunk.py`:

```python
"""The Chunk dataclass — the unit that flows through the whole pipeline."""
from dataclasses import dataclass
from typing import Literal

Source = Literal["GDOT", "roadSegments", "locations"]


@dataclass(frozen=True)
class Chunk:
    """Immutable unit of retrievable content.

    chunk_id patterns (deterministic, human-readable):
        GDOT:p{page}:{i}            — i is 0-based chunk index on the page
        roadSegments:{centerline_id}
        locations:{name}
    """
    chunk_id: str
    text: str
    source: Source
    metadata: dict
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/data/test_chunk.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/pavepal/data/ tests/data/
git commit -m "feat(data): add Chunk dataclass with deterministic chunk_id contract"
```

---

### Task T0.4: Citation + AnswerWithCitations

**Files:**
- Create: `src/pavepal/data/answer.py`
- Create: `tests/data/test_answer.py`

- [ ] **Step 1: Write the failing tests**

`tests/data/test_answer.py`:

```python
from pavepal.data.chunk import Chunk
from pavepal.data.answer import Citation, AnswerWithCitations


def _sample_chunks():
    return [
        Chunk(chunk_id="GDOT:p21:0", text="fog seal text", source="GDOT", metadata={"page": 21}),
        Chunk(chunk_id="roadSegments:222121", text="road text", source="roadSegments", metadata={"pci": 82}),
    ]


def test_answer_construction():
    chunks = _sample_chunks()
    ans = AnswerWithCitations(
        question="What treatment for PCI 82?",
        answer_text="Apply fog seal [1] given PCI 82 [2].",
        citations=[
            Citation(chunk_id="GDOT:p21:0", rank=1),
            Citation(chunk_id="roadSegments:222121", rank=2),
        ],
        refused=False,
        retrieved_chunks=chunks,
    )
    assert ans.refused is False
    assert len(ans.citations) == 2


def test_answer_to_dict_is_json_serializable():
    import json
    ans = AnswerWithCitations(
        question="q",
        answer_text="a",
        citations=[Citation(chunk_id="GDOT:p1:0", rank=1)],
        refused=False,
        retrieved_chunks=_sample_chunks(),
    )
    d = ans.to_dict()
    s = json.dumps(d)  # must not raise
    parsed = json.loads(s)
    assert parsed["question"] == "q"
    assert parsed["citations"][0]["chunk_id"] == "GDOT:p1:0"
    assert parsed["retrieved_chunks"][0]["chunk_id"] == "GDOT:p21:0"


def test_citation_is_frozen():
    import pytest
    c = Citation(chunk_id="x", rank=1)
    with pytest.raises(Exception):
        c.rank = 2
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/data/test_answer.py -v
```

Expected: `ModuleNotFoundError: No module named 'pavepal.data.answer'`.

- [ ] **Step 3: Implement Citation + AnswerWithCitations**

`src/pavepal/data/answer.py`:

```python
"""Answer + Citation contracts. JSON-serializable for logging + Phase-1.5 web upgrade."""
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
        """JSON-serializable dict. Used by JSONL logger and the Phase-1.5 FastAPI wrapper."""
        return {
            "question": self.question,
            "answer_text": self.answer_text,
            "citations": [asdict(c) for c in self.citations],
            "refused": self.refused,
            "retrieved_chunks": [asdict(c) for c in self.retrieved_chunks],
        }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/data/test_answer.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/pavepal/data/answer.py tests/data/test_answer.py
git commit -m "feat(data): add Citation + AnswerWithCitations with JSON-serializable to_dict"
```

---

### Task T0.5: Shared `text.tokenize`

**Files:**
- Create: `src/pavepal/text.py`
- Create: `tests/test_text.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_text.py`:

```python
from pavepal.text import tokenize


def test_tokenize_lowercases():
    assert tokenize("PCI 82 GOOD") == ["pci", "82", "good"]


def test_tokenize_preserves_digits():
    """BM25 must match 'PCI 65' against 'pci 65' — digits are content."""
    tokens = tokenize("Apply at PCI 65–70")
    assert "65" in tokens
    assert "70" in tokens


def test_tokenize_drops_punctuation():
    assert tokenize("crack-sealing, fog-seal!") == ["crack", "sealing", "fog", "seal"]


def test_tokenize_handles_empty():
    assert tokenize("") == []
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_text.py -v
```

Expected: `ModuleNotFoundError: No module named 'pavepal.text'`.

- [ ] **Step 3: Implement tokenize**

`src/pavepal/text.py`:

```python
"""Shared text utilities. tokenize() is used by BOTH index-time (BM25 build)
and query-time (BM25 retrieval) — symmetry is an invariant (research log §6.5)."""
import re

_TOKEN_RE = re.compile(r"\w+")


def tokenize(text: str) -> list[str]:
    """Lowercase + word-character tokenization. Preserves digits, drops punctuation."""
    return _TOKEN_RE.findall(text.lower())
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_text.py -v
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/pavepal/text.py tests/test_text.py
git commit -m "feat(text): add shared tokenize() for symmetric BM25 index/query"
```

---

### Task T0.6: Test fixtures

**Files:**
- Create: `tests/fixtures/__init__.py`
- Create: `tests/fixtures/sample_road_segments.json`
- Create: `tests/fixtures/sample_locations.json`
- Create: `tests/fixtures/build_sample_pdf.py`
- Create: `tests/fixtures/sample_gdot.pdf` (generated)

These fixtures keep tests fast and let CI run without partner data.

- [ ] **Step 1: Create the JSON fixtures**

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

- [ ] **Step 2: Create a script that generates a small sample PDF**

`tests/fixtures/build_sample_pdf.py`:

```python
"""Generate a small 3-page PDF used in tests.

Page 1: typical text page.
Page 2: page with a table-like structure (to exercise pdfplumber fallback later).
Page 3: short page.

Run once: python tests/fixtures/build_sample_pdf.py
"""
from pathlib import Path
from pypdf import PdfWriter
from pypdf.generic import RectangleObject
import io


def _make_text_pdf_via_reportlab(out_path: Path) -> None:
    """Use reportlab to render a deterministic 3-page PDF.
    reportlab is a dependency only for fixture generation, install on demand."""
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
    c.setFont("Helvetica", 11)
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

    # Page 3 — very short
    c.setFont("Helvetica", 11)
    c.drawString(72, 720, "Conclusions: see Chapter 7.")
    c.showPage()

    c.save()


if __name__ == "__main__":
    out = Path(__file__).parent / "sample_gdot.pdf"
    _make_text_pdf_via_reportlab(out)
    print(f"Wrote {out}")
```

- [ ] **Step 3: Generate the PDF**

```bash
pip install reportlab
python tests/fixtures/build_sample_pdf.py
ls -la tests/fixtures/sample_gdot.pdf
```

Expected: file exists, ~3-5 KB.

- [ ] **Step 4: Add `tests/fixtures/__init__.py`**

Empty file.

- [ ] **Step 5: Smoke-test the PDF is parseable**

```bash
python -c "
from pypdf import PdfReader
r = PdfReader('tests/fixtures/sample_gdot.pdf')
assert len(r.pages) == 3, f'expected 3 pages, got {len(r.pages)}'
print('Page 1 first 60 chars:', r.pages[0].extract_text()[:60])
print('OK')
"
```

Expected output mentions "Fog Seal" on Page 1.

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/
git commit -m "test: add sample PDF + JSON fixtures for fast tests"
```

---

# Phase 1A — Indexing data prep

**Owner:** [A]
**Estimate:** ~3 hours.
**Depends on:** T0.* complete.

---

### Task T1A.1: PDF parser — pypdf path

**Files:**
- Create: `src/pavepal/indexing/__init__.py`
- Create: `src/pavepal/indexing/pdf_parse.py`
- Create: `tests/indexing/__init__.py`
- Create: `tests/indexing/test_pdf_parse.py`

- [ ] **Step 1: Write the failing tests**

`tests/indexing/test_pdf_parse.py`:

```python
from pathlib import Path
from pavepal.indexing.pdf_parse import Page, parse_gdot

FIXTURE = Path("tests/fixtures/sample_gdot.pdf")


def test_parse_gdot_returns_pages():
    pages = parse_gdot(FIXTURE)
    assert len(pages) == 3
    assert all(isinstance(p, Page) for p in pages)


def test_pages_have_1_indexed_page_numbers():
    pages = parse_gdot(FIXTURE)
    assert pages[0].page_no == 1
    assert pages[1].page_no == 2
    assert pages[2].page_no == 3


def test_pages_carry_text():
    pages = parse_gdot(FIXTURE)
    assert "Fog Seal" in pages[0].text
    assert pages[2].text.strip() != ""
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
mkdir -p tests/indexing
touch tests/indexing/__init__.py
pytest tests/indexing/test_pdf_parse.py -v
```

Expected: ModuleNotFoundError for `pavepal.indexing`.

- [ ] **Step 3: Implement Page + parse_gdot**

`src/pavepal/indexing/__init__.py`: empty file.

`src/pavepal/indexing/pdf_parse.py`:

```python
"""GDOT PDF parser. pypdf default; pdfplumber fallback added in T1A.2."""
from dataclasses import dataclass
from pathlib import Path
from pypdf import PdfReader


@dataclass(frozen=True)
class Page:
    page_no: int   # 1-based
    text: str


def parse_gdot(pdf_path: Path) -> list[Page]:
    """Parse a PDF into per-page text using pypdf."""
    reader = PdfReader(str(pdf_path))
    return [
        Page(page_no=i + 1, text=p.extract_text() or "")
        for i, p in enumerate(reader.pages)
    ]
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/indexing/test_pdf_parse.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/pavepal/indexing/ tests/indexing/
git commit -m "feat(indexing): add pypdf-based GDOT parser returning 1-indexed Pages"
```

---

### Task T1A.2: pdfplumber fallback for table-heavy pages

**Files:**
- Modify: `src/pavepal/indexing/pdf_parse.py`
- Modify: `tests/indexing/test_pdf_parse.py`

Heuristic: if pypdf returns < 100 chars on a page while neighbours have > 500 chars, retry that page with pdfplumber.

- [ ] **Step 1: Add a failing test**

Append to `tests/indexing/test_pdf_parse.py`:

```python
from pavepal.indexing.pdf_parse import _needs_fallback


def test_needs_fallback_short_in_long_neighborhood():
    chars = [800, 30, 700]   # page 2 is suspiciously short
    assert _needs_fallback(chars, page_idx=1) is True


def test_needs_fallback_uniform_short_pages():
    chars = [50, 60, 70]   # all short — no fallback (probably the whole doc is sparse)
    assert _needs_fallback(chars, page_idx=1) is False


def test_needs_fallback_long_page():
    chars = [800, 600, 700]
    assert _needs_fallback(chars, page_idx=1) is False
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/indexing/test_pdf_parse.py -v
```

Expected: `ImportError: cannot import name '_needs_fallback'`.

- [ ] **Step 3: Add fallback logic**

Replace `parse_gdot` in `src/pavepal/indexing/pdf_parse.py`:

```python
"""GDOT PDF parser. pypdf default; pdfplumber fallback for short pages
in long-page neighborhoods (T1 in working log validates the threshold)."""
from dataclasses import dataclass
from pathlib import Path
from pypdf import PdfReader

SHORT_THRESHOLD = 100
LONG_NEIGHBOR_THRESHOLD = 500


@dataclass(frozen=True)
class Page:
    page_no: int
    text: str


def _needs_fallback(char_counts: list[int], page_idx: int) -> bool:
    """True iff this page is suspiciously short and its neighbours are long."""
    if char_counts[page_idx] >= SHORT_THRESHOLD:
        return False
    neighbours = []
    if page_idx > 0:
        neighbours.append(char_counts[page_idx - 1])
    if page_idx < len(char_counts) - 1:
        neighbours.append(char_counts[page_idx + 1])
    if not neighbours:
        return False
    return all(n >= LONG_NEIGHBOR_THRESHOLD for n in neighbours)


def _extract_with_pdfplumber(pdf_path: Path, page_idx: int) -> str:
    import pdfplumber  # imported lazily — only used on fallback path
    with pdfplumber.open(str(pdf_path)) as pdf:
        return pdf.pages[page_idx].extract_text() or ""


def parse_gdot(pdf_path: Path) -> list[Page]:
    """Parse a PDF into per-page text. Falls back to pdfplumber for short pages."""
    reader = PdfReader(str(pdf_path))
    raw_texts = [p.extract_text() or "" for p in reader.pages]
    char_counts = [len(t) for t in raw_texts]

    final_texts: list[str] = []
    for i, text in enumerate(raw_texts):
        if _needs_fallback(char_counts, i):
            text = _extract_with_pdfplumber(pdf_path, i)
        final_texts.append(text)

    return [Page(page_no=i + 1, text=t) for i, t in enumerate(final_texts)]
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/indexing/test_pdf_parse.py -v
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/pavepal/indexing/pdf_parse.py tests/indexing/test_pdf_parse.py
git commit -m "feat(indexing): pdfplumber fallback for short pages in long-page neighborhoods"
```

---

### Task T1A.3: Chunker

**Files:**
- Create: `src/pavepal/indexing/chunker.py`
- Create: `tests/indexing/test_chunker.py`

- [ ] **Step 1: Write the failing tests**

`tests/indexing/test_chunker.py`:

```python
from pavepal.indexing.pdf_parse import Page
from pavepal.indexing.chunker import chunk_pages
from pavepal.config import Config


def test_chunk_id_pattern():
    pages = [Page(page_no=21, text="A" * 2500)]   # forces multiple chunks
    chunks = chunk_pages(pages, Config())
    assert chunks[0].chunk_id == "GDOT:p21:0"
    assert chunks[1].chunk_id == "GDOT:p21:1"


def test_chunks_carry_source_and_metadata():
    pages = [Page(page_no=5, text="short page text")]
    chunks = chunk_pages(pages, Config())
    assert all(c.source == "GDOT" for c in chunks)
    assert chunks[0].metadata["page"] == 5
    assert chunks[0].metadata["doc_id"] == "GDOT_2021"
    assert chunks[0].metadata["source"] == "GDOT"


def test_chunks_per_page_independent_indexing():
    """chunk index resets at each page, even if previous page had many chunks."""
    pages = [Page(page_no=1, text="A" * 2500), Page(page_no=2, text="short")]
    chunks = chunk_pages(pages, Config())
    page1_chunks = [c for c in chunks if c.metadata["page"] == 1]
    page2_chunks = [c for c in chunks if c.metadata["page"] == 2]
    assert page1_chunks[0].chunk_id == "GDOT:p1:0"
    assert page2_chunks[0].chunk_id == "GDOT:p2:0"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/indexing/test_chunker.py -v
```

Expected: ModuleNotFoundError.

- [ ] **Step 3: Implement chunker**

`src/pavepal/indexing/chunker.py`:

```python
"""GDOT page → Chunk list. 500-token chunks with 50-token overlap (research log §3.3)."""
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pavepal.config import Config
from pavepal.data.chunk import Chunk
from .pdf_parse import Page


def _build_splitter(cfg: Config) -> RecursiveCharacterTextSplitter:
    """Token-based splitter using tiktoken cl100k_base."""
    return RecursiveCharacterTextSplitter.from_tiktoken_encoder(
        encoding_name="cl100k_base",
        chunk_size=cfg.chunk_size,
        chunk_overlap=cfg.chunk_overlap,
    )


def chunk_pages(pages: list[Page], cfg: Config) -> list[Chunk]:
    """Each page splits independently; chunk index restarts per page."""
    splitter = _build_splitter(cfg)
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
                },
            ))
    return out
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/indexing/test_chunker.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/pavepal/indexing/chunker.py tests/indexing/test_chunker.py
git commit -m "feat(indexing): chunk GDOT pages into 500-token Chunks with deterministic IDs"
```

---

### Task T1A.4: JSON flattener — roadSegments

**Files:**
- Create: `src/pavepal/indexing/json_flatten.py`
- Create: `tests/indexing/test_json_flatten.py`

Style A natural-language template per research log §4.3. Minimal in `text`, everything in metadata.

- [ ] **Step 1: Write the failing tests**

`tests/indexing/test_json_flatten.py`:

```python
from pathlib import Path
from pavepal.indexing.json_flatten import flatten_road_segments

FIXTURE = Path("tests/fixtures/sample_road_segments.json")


def test_flatten_road_segments_count():
    chunks = flatten_road_segments(FIXTURE)
    assert len(chunks) == 2


def test_chunk_id_uses_centerline_id():
    chunks = flatten_road_segments(FIXTURE)
    assert chunks[0].chunk_id == "roadSegments:222121"


def test_text_includes_road_name_and_pci():
    chunks = flatten_road_segments(FIXTURE)
    assert "PEACHTREE INDUSTRIAL BLVD ACCESS RD" in chunks[0].text
    assert "82" in chunks[0].text


def test_metadata_preserves_nulls():
    """Record with pci=null keeps null in metadata, omits clause from text."""
    chunks = flatten_road_segments(FIXTURE)
    river_trail = next(c for c in chunks if "RIVER TRAIL" in c.text)
    assert river_trail.metadata["pci"] is None
    assert "PCI" not in river_trail.text  # clause omitted


def test_metadata_carries_source():
    chunks = flatten_road_segments(FIXTURE)
    assert chunks[0].metadata["source"] == "roadSegments"
    assert chunks[0].source == "roadSegments"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/indexing/test_json_flatten.py -v
```

Expected: ModuleNotFoundError.

- [ ] **Step 3: Implement roadSegments flattener**

`src/pavepal/indexing/json_flatten.py`:

```python
"""JSON record → Chunk. Style A: natural-language sentence (research log §4.3)."""
import json
from pathlib import Path
from pavepal.data.chunk import Chunk


def _flatten_defects(defects: dict | None) -> str:
    if not defects:
        return ""
    parts = [f"{n} {kind}" for kind, n in defects.items()]
    return ", ".join(parts)


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
            continue   # cannot make a stable chunk_id without it
        text = _build_road_segment_text(rec)
        metadata = {
            "source": "roadSegments",
            "record_id": cid,
            "road_name": rec.get("name"),
            "road_class": rec.get("ROADCLASS"),
            "pci": rec.get("pci"),
            "pci_category": rec.get("pci_category"),
            "defects": rec.get("defects") or {},
        }
        chunks.append(Chunk(
            chunk_id=f"roadSegments:{cid}",
            text=text,
            source="roadSegments",
            metadata=metadata,
        ))
    return chunks
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/indexing/test_json_flatten.py -v
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/pavepal/indexing/json_flatten.py tests/indexing/test_json_flatten.py
git commit -m "feat(indexing): flatten roadSegments records into natural-language Chunks"
```

---

### Task T1A.5: JSON flattener — locations

**Files:**
- Modify: `src/pavepal/indexing/json_flatten.py`
- Modify: `tests/indexing/test_json_flatten.py`

- [ ] **Step 1: Add failing tests**

Append to `tests/indexing/test_json_flatten.py`:

```python
from pavepal.indexing.json_flatten import flatten_locations

LOC_FIXTURE = Path("tests/fixtures/sample_locations.json")


def test_flatten_locations_count():
    chunks = flatten_locations(LOC_FIXTURE)
    assert len(chunks) == 2


def test_locations_chunk_id_uses_name():
    chunks = flatten_locations(LOC_FIXTURE)
    assert chunks[0].chunk_id == "locations:GX010224_time_4_00250"


def test_locations_text_includes_road_and_defect():
    chunks = flatten_locations(LOC_FIXTURE)
    assert "ENGINEERING DR" in chunks[0].text
    assert "transverse" in chunks[0].text.lower()


def test_locations_metadata_no_pci_field():
    """locations records have no PCI — metadata should reflect that."""
    chunks = flatten_locations(LOC_FIXTURE)
    assert chunks[0].metadata["source"] == "locations"
    assert chunks[0].source == "locations"
    assert "pci" not in chunks[0].metadata or chunks[0].metadata.get("pci") is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/indexing/test_json_flatten.py -v
```

Expected: `ImportError: cannot import name 'flatten_locations'`.

- [ ] **Step 3: Add locations flattener**

Append to `src/pavepal/indexing/json_flatten.py`:

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
        text = _build_location_text(rec)
        metadata = {
            "source": "locations",
            "record_id": name,
            "road_name": rec.get("road_name"),
            "defects": rec.get("defects") or {},
            "image_path": rec.get("image_path"),
        }
        chunks.append(Chunk(
            chunk_id=f"locations:{name}",
            text=text,
            source="locations",
            metadata=metadata,
        ))
    return chunks
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/indexing/test_json_flatten.py -v
```

Expected: 9 passed (5 from T1A.4 + 4 new).

- [ ] **Step 5: Commit**

```bash
git add src/pavepal/indexing/json_flatten.py tests/indexing/test_json_flatten.py
git commit -m "feat(indexing): flatten locations records into natural-language Chunks"
```

---

# Phase 1B — Dense embedding + Chroma

**Owner:** [B]
**Estimate:** ~2 hours.
**Depends on:** T0.* complete. Independent of [A]/[C]/[D] tracks.

---

### Task T1B.1: Embedder wrapper

**Files:**
- Create: `src/pavepal/indexing/embed.py`
- Create: `tests/indexing/test_embed.py`

The `Embedder` is a thin wrapper around LangChain's `HuggingFaceEmbeddings` that locks the BGE query prefix in one place. T2 (working log) verifies the prefix actually flows through.

- [ ] **Step 1: Write the failing test (mocked, fast)**

`tests/indexing/test_embed.py`:

```python
from unittest.mock import patch, MagicMock
from pavepal.config import Config
from pavepal.indexing.embed import Embedder


def test_embedder_uses_query_prefix_from_config():
    cfg = Config()
    with patch("pavepal.indexing.embed.HuggingFaceEmbeddings") as Mock:
        Mock.return_value = MagicMock()
        e = Embedder(cfg)
        Mock.assert_called_once()
        call_kwargs = Mock.call_args.kwargs
        assert call_kwargs["model_name"] == cfg.embedding_model
        assert call_kwargs["query_instruction"] == cfg.bge_query_prefix


def test_embedder_exposes_embed_methods():
    cfg = Config()
    with patch("pavepal.indexing.embed.HuggingFaceEmbeddings") as Mock:
        underlying = MagicMock()
        underlying.embed_documents.return_value = [[0.1, 0.2]]
        underlying.embed_query.return_value = [0.3, 0.4]
        Mock.return_value = underlying
        e = Embedder(cfg)
        assert e.embed_documents(["doc"]) == [[0.1, 0.2]]
        assert e.embed_query("q") == [0.3, 0.4]
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/indexing/test_embed.py -v
```

Expected: ModuleNotFoundError.

- [ ] **Step 3: Implement Embedder**

`src/pavepal/indexing/embed.py`:

```python
"""BGE embedder wrapper. Locks the query prefix in one place (research log §5.2)."""
from langchain_huggingface import HuggingFaceEmbeddings
from pavepal.config import Config


class Embedder:
    """Wraps HuggingFaceEmbeddings so the BGE query prefix is always applied at query time."""

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
        """Expose the underlying object for integrations that need it (e.g. Chroma)."""
        return self._inner
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/indexing/test_embed.py -v
```

Expected: 2 passed.

- [ ] **Step 5: Add a slow real-model smoke test**

Append to `tests/indexing/test_embed.py`:

```python
import pytest


@pytest.mark.slow
def test_embedder_real_model_returns_768_dim():
    cfg = Config()
    e = Embedder(cfg)
    vec = e.embed_query("What is the cheapest treatment for PCI 65?")
    assert len(vec) == 768
```

- [ ] **Step 6: Verify slow test is opt-in**

```bash
pytest tests/indexing/test_embed.py -v             # 2 passed, 1 deselected
pytest tests/indexing/test_embed.py -v -m slow     # 1 passed (downloads model on first run)
```

- [ ] **Step 7: Commit**

```bash
git add src/pavepal/indexing/embed.py tests/indexing/test_embed.py
git commit -m "feat(indexing): Embedder wraps BGE with mandatory query prefix"
```

---

### Task T1B.2: Dense per-source retrievers (Chroma side)

**Files:**
- Create: `src/pavepal/retrieval/__init__.py`
- Create: `src/pavepal/retrieval/dense.py`
- Create: `tests/retrieval/__init__.py`
- Create: `tests/retrieval/test_dense.py`

This task wires the construction of the 3 per-source Chroma retrievers; it does NOT build a real index (that's T2.1). Tests use a small in-memory Chroma to verify wiring.

- [ ] **Step 1: Write the failing tests**

`tests/retrieval/test_dense.py`:

```python
from pathlib import Path
from langchain_chroma import Chroma
from langchain_core.documents import Document
from pavepal.config import Config
from pavepal.retrieval.dense import build_dense_retrievers


def test_build_dense_retrievers_returns_three(tmp_path: Path):
    cfg = Config()
    # Build a minimal in-memory-style Chroma with a fake embedding (lambda).
    # We don't load the real BGE model — we only test that filters are wired correctly.
    from langchain_core.embeddings import FakeEmbeddings
    fake_emb = FakeEmbeddings(size=8)
    chroma = Chroma(
        collection_name="pavepal_test",
        embedding_function=fake_emb,
        persist_directory=str(tmp_path),
    )
    chroma.add_documents([
        Document(page_content="GDOT page", metadata={"source": "GDOT", "page": 1}),
        Document(page_content="road seg", metadata={"source": "roadSegments", "record_id": "1"}),
        Document(page_content="loc point", metadata={"source": "locations", "record_id": "x"}),
    ])

    retrievers = build_dense_retrievers(chroma, cfg)
    assert set(retrievers.keys()) == {"GDOT", "roadSegments", "locations"}


def test_each_retriever_filters_by_source(tmp_path: Path):
    cfg = Config()
    from langchain_core.embeddings import FakeEmbeddings
    fake_emb = FakeEmbeddings(size=8)
    chroma = Chroma(
        collection_name="pavepal_test2",
        embedding_function=fake_emb,
        persist_directory=str(tmp_path),
    )
    chroma.add_documents([
        Document(page_content="g1", metadata={"source": "GDOT", "page": 1}),
        Document(page_content="g2", metadata={"source": "GDOT", "page": 2}),
        Document(page_content="r1", metadata={"source": "roadSegments", "record_id": "x"}),
    ])

    retrievers = build_dense_retrievers(chroma, cfg)
    gdot_hits = retrievers["GDOT"].invoke("anything")
    assert all(d.metadata["source"] == "GDOT" for d in gdot_hits)
    assert len(gdot_hits) == 2
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
mkdir -p tests/retrieval
touch tests/retrieval/__init__.py
pytest tests/retrieval/test_dense.py -v
```

Expected: ModuleNotFoundError.

- [ ] **Step 3: Implement build_dense_retrievers**

`src/pavepal/retrieval/__init__.py`: empty file.

`src/pavepal/retrieval/dense.py`:

```python
"""Three per-source Chroma retrievers (policy B fan-out — research log §5.5)."""
from langchain_chroma import Chroma
from langchain_core.retrievers import BaseRetriever
from pavepal.config import Config


def build_dense_retrievers(chroma: Chroma, cfg: Config) -> dict[str, BaseRetriever]:
    """Returns one Chroma retriever per source, each pre-filtered by metadata."""
    out: dict[str, BaseRetriever] = {}
    for source in cfg.sources:
        out[source] = chroma.as_retriever(
            search_kwargs={
                "k": cfg.k_per_retriever,
                "filter": {"source": source},
            }
        )
    return out
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/retrieval/test_dense.py -v
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/pavepal/retrieval/__init__.py src/pavepal/retrieval/dense.py tests/retrieval/__init__.py tests/retrieval/test_dense.py
git commit -m "feat(retrieval): build_dense_retrievers — 3 per-source Chroma retrievers"
```

---

# Phase 1C — Sparse retrieval + fusion

**Owner:** [C]
**Estimate:** ~2.5 hours.
**Depends on:** T0.* complete. Independent of [A]/[B]/[D].

---

### Task T1C.1: BM25Retriever class + pickle layout

**Files:**
- Create: `src/pavepal/retrieval/sparse.py`
- Create: `tests/retrieval/test_sparse.py`

The pickle layout is `{"chunks": list[Chunk], "bm25": BM25Okapi}`. Storing chunks inline so the retriever can return `Chunk` objects without re-querying Chroma.

- [ ] **Step 1: Write the failing tests**

`tests/retrieval/test_sparse.py`:

```python
import pickle
from pathlib import Path
from rank_bm25 import BM25Okapi
from pavepal.data.chunk import Chunk
from pavepal.text import tokenize
from pavepal.retrieval.sparse import BM25Retriever


def _make_pickle(tmp_path: Path) -> Path:
    chunks = [
        Chunk(chunk_id="GDOT:p1:0", text="fog seal application on raveling pavements",
              source="GDOT", metadata={"source": "GDOT", "page": 1}),
        Chunk(chunk_id="GDOT:p2:0", text="crack sealing with hot rubberized asphalt",
              source="GDOT", metadata={"source": "GDOT", "page": 2}),
        Chunk(chunk_id="GDOT:p3:0", text="thin overlay over milled surface",
              source="GDOT", metadata={"source": "GDOT", "page": 3}),
    ]
    tokens = [tokenize(c.text) for c in chunks]
    bm25 = BM25Okapi(tokens)
    out = tmp_path / "bm25_test.pkl"
    out.write_bytes(pickle.dumps({"chunks": chunks, "bm25": bm25}))
    return out


def test_bm25_retriever_loads_and_returns_chunks(tmp_path: Path):
    pkl = _make_pickle(tmp_path)
    r = BM25Retriever.from_pickle(pkl, k=2)
    hits = r.retrieve("fog seal raveling")
    assert len(hits) == 2
    assert all(isinstance(h, Chunk) for h in hits)
    assert hits[0].chunk_id == "GDOT:p1:0"


def test_bm25_retriever_uses_shared_tokenize(tmp_path: Path):
    """A query in mixed case must hit the lowercased index."""
    pkl = _make_pickle(tmp_path)
    r = BM25Retriever.from_pickle(pkl, k=1)
    hits = r.retrieve("FOG Seal")
    assert hits[0].chunk_id == "GDOT:p1:0"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/retrieval/test_sparse.py -v
```

Expected: ModuleNotFoundError.

- [ ] **Step 3: Implement BM25Retriever**

`src/pavepal/retrieval/sparse.py`:

```python
"""Per-source BM25 retriever (research log §5.5, §6).
Pickle layout: {"chunks": list[Chunk], "bm25": BM25Okapi}."""
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
        tokens = tokenize(query)
        scores = self._bm25.get_scores(tokens)
        # argsort descending, take top-k
        ranked_indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[: self._k]
        return [self._chunks[i] for i in ranked_indices]
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/retrieval/test_sparse.py -v
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/pavepal/retrieval/sparse.py tests/retrieval/test_sparse.py
git commit -m "feat(retrieval): BM25Retriever loads per-source pickle, returns Chunks"
```

---

### Task T1C.2: LangChain-compatible adapter for BM25Retriever

**Files:**
- Modify: `src/pavepal/retrieval/sparse.py`
- Modify: `tests/retrieval/test_sparse.py`

EnsembleRetriever (used in T1C.3) requires LangChain's `BaseRetriever` interface. We add an adapter that returns `Document` objects.

- [ ] **Step 1: Add a failing test**

Append to `tests/retrieval/test_sparse.py`:

```python
from langchain_core.documents import Document
from pavepal.retrieval.sparse import bm25_to_langchain


def test_langchain_adapter_returns_documents(tmp_path: Path):
    pkl = _make_pickle(tmp_path)
    r = BM25Retriever.from_pickle(pkl, k=2)
    lc = bm25_to_langchain(r)
    docs = lc.invoke("fog seal")
    assert all(isinstance(d, Document) for d in docs)
    # chunk_id round-trips through metadata
    assert docs[0].metadata["chunk_id"] == "GDOT:p1:0"
    assert docs[0].metadata["source"] == "GDOT"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/retrieval/test_sparse.py -v
```

Expected: `ImportError: cannot import name 'bm25_to_langchain'`.

- [ ] **Step 3: Implement adapter**

Append to `src/pavepal/retrieval/sparse.py`:

```python
from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever
from langchain_core.callbacks.manager import CallbackManagerForRetrieverRun


class _BM25LangChainAdapter(BaseRetriever):
    """Wraps BM25Retriever to satisfy LangChain's BaseRetriever interface."""
    bm25: BM25Retriever

    class Config:
        arbitrary_types_allowed = True

    def _get_relevant_documents(self, query: str, *, run_manager: CallbackManagerForRetrieverRun) -> list[Document]:
        chunks = self.bm25.retrieve(query)
        return [
            Document(
                page_content=c.text,
                metadata={**c.metadata, "chunk_id": c.chunk_id, "source": c.source},
            )
            for c in chunks
        ]


def bm25_to_langchain(bm25: BM25Retriever) -> BaseRetriever:
    return _BM25LangChainAdapter(bm25=bm25)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/retrieval/test_sparse.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/pavepal/retrieval/sparse.py tests/retrieval/test_sparse.py
git commit -m "feat(retrieval): LangChain adapter for BM25Retriever (preserves chunk_id)"
```

---

### Task T1C.3: Fusion + Retriever public class

**Files:**
- Create: `src/pavepal/retrieval/fuse.py`
- Modify: `src/pavepal/retrieval/__init__.py`
- Create: `tests/retrieval/test_fuse.py`

Wires the 6 sub-retrievers (3 dense × 3 sparse) into one EnsembleRetriever and exposes a `Retriever.retrieve(query) -> list[Chunk]` API. Internally uses LangChain Documents; converts back to Chunks at the boundary.

- [ ] **Step 1: Write the failing test**

`tests/retrieval/test_fuse.py`:

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


def _setup_indices(tmp_path: Path) -> tuple[Path, Path]:
    """Build a tiny Chroma + 3 BM25 pickles for testing the full fusion path."""
    chroma_dir = tmp_path / "chroma"
    fake_emb = FakeEmbeddings(size=8)
    chroma = Chroma(
        collection_name="pavepal_test",
        embedding_function=fake_emb,
        persist_directory=str(chroma_dir),
    )

    sample_chunks = {
        "GDOT": [Chunk(chunk_id="GDOT:p1:0", text="fog seal raveling treatment",
                       source="GDOT", metadata={"source": "GDOT", "page": 1})],
        "roadSegments": [Chunk(chunk_id="roadSegments:222121",
                                text="Engineering Dr PCI 82",
                                source="roadSegments",
                                metadata={"source": "roadSegments", "record_id": "222121"})],
        "locations": [Chunk(chunk_id="locations:GX01",
                            text="inspection point on Engineering Dr",
                            source="locations",
                            metadata={"source": "locations", "record_id": "GX01"})],
    }

    all_docs = []
    for src, chunks in sample_chunks.items():
        for c in chunks:
            all_docs.append(Document(page_content=c.text, metadata={**c.metadata, "chunk_id": c.chunk_id}))

        # BM25 pickle per source
        tokens = [tokenize(c.text) for c in chunks]
        bm25 = BM25Okapi(tokens)
        short = {"GDOT": "gdot", "roadSegments": "roads", "locations": "locs"}[src]
        (tmp_path / f"bm25_{short}.pkl").write_bytes(pickle.dumps({"chunks": chunks, "bm25": bm25}))

    chroma.add_documents(all_docs)
    return chroma_dir, tmp_path


def test_retriever_returns_chunks_from_multiple_sources(tmp_path: Path):
    chroma_dir, index_dir = _setup_indices(tmp_path)
    cfg = Config()
    r = Retriever.load_from_test(cfg, chroma_dir=chroma_dir, bm25_dir=index_dir,
                                  embedding=FakeEmbeddings(size=8))
    hits = r.retrieve("Engineering Dr fog seal")
    sources = {h.source for h in hits}
    # Even with FakeEmbeddings, BM25 will hit the keyword matches across sources.
    assert len(sources) >= 2
    assert all(isinstance(h, Chunk) for h in hits)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/retrieval/test_fuse.py -v
```

Expected: ModuleNotFoundError for `pavepal.retrieval.Retriever`.

- [ ] **Step 3: Implement fusion**

`src/pavepal/retrieval/fuse.py`:

```python
"""RRF fusion of 6 retrievers (3 sources × 2 channels) per policy B."""
from langchain.retrievers import EnsembleRetriever
from langchain_core.retrievers import BaseRetriever


def build_ensemble(retrievers: list[BaseRetriever]) -> EnsembleRetriever:
    """Equal-weight ensemble. EnsembleRetriever uses RRF internally (research log §7.4)."""
    n = len(retrievers)
    return EnsembleRetriever(retrievers=retrievers, weights=[1.0 / n] * n)
```

`src/pavepal/retrieval/__init__.py`:

```python
"""Retrieval public surface."""
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
    """Public retrieval API. Loads Chroma + 3 BM25 pickles from disk and fuses 6 retrievers."""

    def __init__(self, ensemble, chunks_by_id: dict[str, Chunk]):
        self._ensemble = ensemble
        self._chunks_by_id = chunks_by_id

    @classmethod
    def load(cls, cfg: Config) -> "Retriever":
        embedder = Embedder(cfg)
        return cls._build(cfg, cfg.index_dir, cfg.index_dir, embedder.langchain_embeddings)

    @classmethod
    def load_from_test(cls, cfg: Config, chroma_dir: Path, bm25_dir: Path, embedding: Embeddings) -> "Retriever":
        """Test-only: lets a caller inject FakeEmbeddings for fast tests."""
        return cls._build(cfg, chroma_dir, bm25_dir, embedding)

    @classmethod
    def _build(cls, cfg: Config, chroma_dir: Path, bm25_dir: Path, embedding: Embeddings) -> "Retriever":
        chroma = Chroma(
            collection_name="pavepal",
            embedding_function=embedding,
            persist_directory=str(chroma_dir),
        )
        dense = build_dense_retrievers(chroma, cfg)

        sparse_lc: dict[str, object] = {}
        chunks_by_id: dict[str, Chunk] = {}
        for source, fname in _BM25_FILE_BY_SOURCE.items():
            pkl_path = bm25_dir / fname
            bm = BM25Retriever.from_pickle(pkl_path, k=cfg.k_per_retriever)
            sparse_lc[source] = bm25_to_langchain(bm)
            for c in pickle.loads(pkl_path.read_bytes())["chunks"]:
                chunks_by_id[c.chunk_id] = c

        ensemble = build_ensemble([
            dense["GDOT"], dense["roadSegments"], dense["locations"],
            sparse_lc["GDOT"], sparse_lc["roadSegments"], sparse_lc["locations"],
        ])
        return cls(ensemble, chunks_by_id)

    def retrieve(self, query: str) -> list[Chunk]:
        docs = self._ensemble.invoke(query)
        out: list[Chunk] = []
        seen: set[str] = set()
        for d in docs:
            cid = d.metadata.get("chunk_id")
            if cid and cid in self._chunks_by_id and cid not in seen:
                out.append(self._chunks_by_id[cid])
                seen.add(cid)
        return out[: 5]   # top_n
```

> **Note for Indexer (T2.1):** when persisting documents to Chroma, the indexer MUST set `metadata["chunk_id"] = chunk.chunk_id` on every Document so the round-trip above works.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/retrieval/test_fuse.py -v
```

Expected: 1 passed (plus all earlier retrieval tests still passing).

- [ ] **Step 5: Commit**

```bash
git add src/pavepal/retrieval/ tests/retrieval/test_fuse.py
git commit -m "feat(retrieval): fuse 6 retrievers (3 sources × 2 channels) into Retriever.retrieve"
```

---

# Phase 1D — Generation + Pipeline glue

**Owner:** [D]
**Estimate:** ~3 hours.
**Depends on:** T0.* complete. Mock-tested independently of [A]/[B]/[C]; integration in T2.*.

---

### Task T1D.1: Prompt builder

**Files:**
- Create: `src/pavepal/generation/__init__.py`
- Create: `src/pavepal/generation/prompt.py`
- Create: `tests/generation/__init__.py`
- Create: `tests/generation/test_prompt.py`

- [ ] **Step 1: Write the failing tests**

`tests/generation/test_prompt.py`:

```python
from pavepal.config import Config
from pavepal.data.chunk import Chunk
from pavepal.generation.prompt import build_prompt


def _chunks():
    return [
        Chunk(chunk_id="GDOT:p21:0", text="fog seal info", source="GDOT", metadata={"page": 21}),
        Chunk(chunk_id="roadSegments:222121", text="PCI 82 details", source="roadSegments", metadata={"pci": 82}),
    ]


def test_prompt_includes_question():
    p = build_prompt("What treatment for PCI 82?", _chunks(), Config())
    assert "What treatment for PCI 82?" in p


def test_prompt_numbers_chunks_one_indexed():
    p = build_prompt("q", _chunks(), Config())
    assert "[1]" in p
    assert "[2]" in p


def test_prompt_includes_source_prefixes():
    p = build_prompt("q", _chunks(), Config())
    assert "(source: GDOT)" in p
    assert "(source: roadSegments)" in p


def test_prompt_includes_refusal_phrase_verbatim():
    cfg = Config()
    p = build_prompt("q", _chunks(), cfg)
    assert cfg.refusal_phrase in p
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
mkdir -p tests/generation
touch tests/generation/__init__.py
pytest tests/generation/test_prompt.py -v
```

Expected: ModuleNotFoundError.

- [ ] **Step 3: Implement prompt builder**

`src/pavepal/generation/__init__.py`: empty file.

`src/pavepal/generation/prompt.py`:

```python
"""Prompt template (spec §7.2). Slot structure is locked; exact wording iterates."""
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
    chunk_lines = [
        f"[{i + 1}] (source: {c.source}) {c.text}" for i, c in enumerate(chunks)
    ]
    return _TEMPLATE.format(
        refusal_phrase=cfg.refusal_phrase,
        chunks_block="\n".join(chunk_lines),
        question=question,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/generation/test_prompt.py -v
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/pavepal/generation/ tests/generation/test_prompt.py tests/generation/__init__.py
git commit -m "feat(generation): build_prompt with locked slot structure (spec §7.2)"
```

---

### Task T1D.2: Generator (Gemini call + citation parsing)

**Files:**
- Create: `src/pavepal/generation/generator.py`
- Create: `tests/generation/test_generator.py`

Tests mock Gemini. A slow real-call smoke test goes behind `@pytest.mark.slow`.

- [ ] **Step 1: Write the failing tests**

`tests/generation/test_generator.py`:

```python
from unittest.mock import patch, MagicMock
import pytest
from pavepal.config import Config
from pavepal.data.chunk import Chunk
from pavepal.generation.generator import Generator


def _chunks():
    return [
        Chunk(chunk_id="GDOT:p21:0", text="fog seal", source="GDOT", metadata={"page": 21}),
        Chunk(chunk_id="roadSegments:222121", text="PCI 82", source="roadSegments", metadata={"pci": 82}),
    ]


def test_generator_parses_citations():
    cfg = Config()
    with patch("pavepal.generation.generator.ChatGoogleGenerativeAI") as Mock:
        llm = MagicMock()
        llm.invoke.return_value = MagicMock(content="Apply fog seal [1] given PCI 82 [2].")
        Mock.return_value = llm
        gen = Generator(cfg)
        ans = gen.generate("question?", _chunks())

    assert ans.refused is False
    assert ans.answer_text == "Apply fog seal [1] given PCI 82 [2]."
    assert [c.rank for c in ans.citations] == [1, 2]
    assert ans.citations[0].chunk_id == "GDOT:p21:0"
    assert ans.citations[1].chunk_id == "roadSegments:222121"


def test_generator_detects_refusal():
    cfg = Config()
    with patch("pavepal.generation.generator.ChatGoogleGenerativeAI") as Mock:
        llm = MagicMock()
        llm.invoke.return_value = MagicMock(content=cfg.refusal_phrase)
        Mock.return_value = llm
        gen = Generator(cfg)
        ans = gen.generate("question?", _chunks())

    assert ans.refused is True
    assert ans.citations == []


def test_generator_dedupes_repeated_citations():
    cfg = Config()
    with patch("pavepal.generation.generator.ChatGoogleGenerativeAI") as Mock:
        llm = MagicMock()
        llm.invoke.return_value = MagicMock(content="See [1]. Also see [1] again.")
        Mock.return_value = llm
        gen = Generator(cfg)
        ans = gen.generate("question?", _chunks())

    assert len(ans.citations) == 1
    assert ans.citations[0].rank == 1


def test_generator_ignores_out_of_range_citations():
    """If LLM hallucinates [9] but only 2 chunks were passed, drop it."""
    cfg = Config()
    with patch("pavepal.generation.generator.ChatGoogleGenerativeAI") as Mock:
        llm = MagicMock()
        llm.invoke.return_value = MagicMock(content="See [1] and [9].")
        Mock.return_value = llm
        gen = Generator(cfg)
        ans = gen.generate("question?", _chunks())

    assert [c.rank for c in ans.citations] == [1]
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/generation/test_generator.py -v
```

Expected: ModuleNotFoundError.

- [ ] **Step 3: Implement Generator**

`src/pavepal/generation/generator.py`:

```python
"""Generator: builds prompt, calls Gemini 2.5 Pro, parses [N] citations,
sets refused flag (spec §7)."""
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
        citations = self._parse_citations(text, chunks) if not refused else []

        return AnswerWithCitations(
            question=question,
            answer_text=text,
            citations=citations,
            refused=refused,
            retrieved_chunks=chunks,
        )

    @staticmethod
    def _parse_citations(text: str, chunks: list[Chunk]) -> list[Citation]:
        seen: set[int] = set()
        out: list[Citation] = []
        for m in _CITATION_RE.finditer(text):
            n = int(m.group(1))
            if n in seen or n < 1 or n > len(chunks):
                continue
            seen.add(n)
            out.append(Citation(chunk_id=chunks[n - 1].chunk_id, rank=n))
        return out
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/generation/test_generator.py -v
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/pavepal/generation/generator.py tests/generation/test_generator.py
git commit -m "feat(generation): Generator wraps Gemini call + parses [N] citations"
```

---

### Task T1D.3: JSONL logger

**Files:**
- Create: `src/pavepal/logging.py`
- Create: `tests/test_logging.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_logging.py`:

```python
import json
from pathlib import Path
from pavepal.data.chunk import Chunk
from pavepal.data.answer import AnswerWithCitations, Citation
from pavepal.logging import JSONLLogger


def _ans():
    return AnswerWithCitations(
        question="q",
        answer_text="a [1]",
        citations=[Citation(chunk_id="GDOT:p1:0", rank=1)],
        refused=False,
        retrieved_chunks=[
            Chunk(chunk_id="GDOT:p1:0", text="t", source="GDOT", metadata={"page": 1}),
        ],
    )


def test_logger_writes_one_line_per_call(tmp_path: Path):
    log_file = tmp_path / "run.jsonl"
    logger = JSONLLogger(log_file)
    logger.log(_ans(), latency_ms={"retrieve": 100, "generate": 2000})
    logger.log(_ans(), latency_ms={"retrieve": 90, "generate": 1900}, qid="Q01")

    lines = log_file.read_text().strip().split("\n")
    assert len(lines) == 2

    line1 = json.loads(lines[0])
    assert line1["qid"] is None
    assert line1["question"] == "q"
    assert line1["retrieved_chunk_ids"] == ["GDOT:p1:0"]
    assert line1["latency_ms"] == {"retrieve": 100, "generate": 2000}

    line2 = json.loads(lines[1])
    assert line2["qid"] == "Q01"


def test_logger_includes_timestamp(tmp_path: Path):
    log_file = tmp_path / "run.jsonl"
    JSONLLogger(log_file).log(_ans(), latency_ms={"retrieve": 1, "generate": 1})
    line = json.loads(log_file.read_text().strip())
    assert "ts" in line
    assert "T" in line["ts"]   # ISO 8601
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_logging.py -v
```

Expected: ModuleNotFoundError.

- [ ] **Step 3: Implement JSONLLogger**

`src/pavepal/logging.py`:

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

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_logging.py -v
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/pavepal/logging.py tests/test_logging.py
git commit -m "feat(logging): per-turn JSONL logger with timestamp + latency"
```

---

### Task T1D.4: Pipeline class — eval surface

**Files:**
- Create: `src/pavepal/pipeline.py`
- Create: `tests/test_pipeline.py`

The Pipeline glues Retriever + Generator + Logger. This task uses mocks; T2.3 tests it end-to-end.

- [ ] **Step 1: Write the failing test**

`tests/test_pipeline.py`:

```python
from unittest.mock import MagicMock
from pathlib import Path
from pavepal.config import Config
from pavepal.data.chunk import Chunk
from pavepal.data.answer import AnswerWithCitations, Citation
from pavepal.pipeline import Pipeline


def test_pipeline_answer_calls_retrieve_then_generate_then_log(tmp_path: Path):
    cfg = Config()
    chunks = [Chunk(chunk_id="GDOT:p1:0", text="t", source="GDOT", metadata={"page": 1})]

    retriever = MagicMock()
    retriever.retrieve.return_value = chunks

    expected_ans = AnswerWithCitations(
        question="q", answer_text="a [1]",
        citations=[Citation(chunk_id="GDOT:p1:0", rank=1)],
        refused=False, retrieved_chunks=chunks,
    )
    generator = MagicMock()
    generator.generate.return_value = expected_ans

    logger = MagicMock()

    pipeline = Pipeline(retriever=retriever, generator=generator, logger=logger)
    ans = pipeline.answer("q", qid="Q01")

    retriever.retrieve.assert_called_once_with("q")
    generator.generate.assert_called_once_with("q", chunks)
    logger.log.assert_called_once()
    assert ans is expected_ans

    # logger received latency dict + qid
    log_kwargs = logger.log.call_args.kwargs
    assert "latency_ms" in log_kwargs
    assert log_kwargs["qid"] == "Q01"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_pipeline.py -v
```

Expected: ModuleNotFoundError.

- [ ] **Step 3: Implement Pipeline**

`src/pavepal/pipeline.py`:

```python
"""Public Pipeline.answer() — the surface eval imports (spec §9)."""
import time
from datetime import datetime, timezone
from pathlib import Path
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
        retriever = Retriever.load(cfg)
        generator = Generator(cfg)
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        logger = JSONLLogger(cfg.log_dir / f"run_{ts}.jsonl")
        return cls(retriever=retriever, generator=generator, logger=logger)

    def answer(self, question: str, qid: str | None = None) -> AnswerWithCitations:
        t0 = time.perf_counter()
        chunks = self._retriever.retrieve(question)
        t1 = time.perf_counter()
        ans = self._generator.generate(question, chunks)
        t2 = time.perf_counter()
        latency_ms = {
            "retrieve": int((t1 - t0) * 1000),
            "generate": int((t2 - t1) * 1000),
        }
        self._logger.log(ans, latency_ms=latency_ms, qid=qid)
        return ans
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_pipeline.py -v
```

Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add src/pavepal/pipeline.py tests/test_pipeline.py
git commit -m "feat(pipeline): Pipeline.answer() composes Retriever + Generator + Logger"
```

---

### Task T1D.5: CLI — `python -m pavepal.{index,query}`

**Files:**
- Create: `src/pavepal/cli.py`
- Create: `src/pavepal/__main__.py`
- Create: `tests/test_cli.py`

Two subcommands: `index build` and `query "<question>"`.

- [ ] **Step 1: Write the failing tests**

`tests/test_cli.py`:

```python
from unittest.mock import patch, MagicMock
from pavepal.cli import main


def test_cli_query_calls_pipeline(capsys):
    with patch("pavepal.cli.Pipeline") as PipelineCls:
        pipeline = MagicMock()
        ans = MagicMock()
        ans.answer_text = "Apply fog seal [1]."
        pipeline.answer.return_value = ans
        PipelineCls.load.return_value = pipeline

        main(["query", "What treatment for PCI 65?"])

    pipeline.answer.assert_called_once_with("What treatment for PCI 65?")
    out = capsys.readouterr().out
    assert "Apply fog seal [1]." in out


def test_cli_index_build_calls_indexer(capsys):
    with patch("pavepal.cli.Indexer") as IndexerCls:
        indexer = MagicMock()
        IndexerCls.return_value = indexer

        main(["index", "build"])

    indexer.build.assert_called_once()


def test_cli_no_args_prints_help(capsys):
    rc = main([])
    assert rc != 0
    out = capsys.readouterr().out + capsys.readouterr().err
    assert "usage" in out.lower()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_cli.py -v
```

Expected: ModuleNotFoundError.

- [ ] **Step 3: Implement CLI**

`src/pavepal/cli.py`:

```python
"""Phase 1 CLI. Two subcommands: `index build` and `query "..."`."""
import argparse
import sys
from pavepal.config import Config
from pavepal.indexing.index import Indexer
from pavepal.pipeline import Pipeline


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pavepal")
    subs = parser.add_subparsers(dest="cmd", required=False)

    idx = subs.add_parser("index", help="Build indices")
    idx.add_argument("action", choices=["build"])

    q = subs.add_parser("query", help="Ask a question")
    q.add_argument("question", type=str)

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
        pipeline = Pipeline.load(cfg)
        ans = pipeline.answer(args.question)
        print(ans.answer_text)
        return 0

    parser.print_help(sys.stderr)
    return 2
```

`src/pavepal/__main__.py`:

```python
"""Lets `python -m pavepal ...` route through cli.main."""
import sys
from .cli import main

raise SystemExit(main(sys.argv[1:]))
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_cli.py -v
```

Expected: 3 passed. (`Indexer` doesn't exist yet but the test mocks it — mocks short-circuit the import in `cli.py`. If the import fails at collection time, T2.1 must land before T1D.5; in that case, swap order.)

- [ ] **Step 5: Commit**

```bash
git add src/pavepal/cli.py src/pavepal/__main__.py tests/test_cli.py
git commit -m "feat(cli): pavepal index build and pavepal query subcommands"
```

---

# Phase 2 — Integration

**Owner:** [A] for indexer; [Shared] for smoke tests; [D] for notebook.
**Estimate:** ~3 hours.
**Depends on:** all of Phase 1A/1B/1C/1D complete.

---

### Task T2.1: Indexer orchestrator (the big-bang glue)

**Files:**
- Create: `src/pavepal/indexing/index.py`
- Create: `tests/indexing/test_index.py`

Builds Chroma collection + 3 BM25 pickles from raw partner files. Idempotent.

- [ ] **Step 1: Write the failing test**

`tests/indexing/test_index.py`:

```python
import pickle
from pathlib import Path
import pytest
from langchain_core.embeddings import FakeEmbeddings
from pavepal.config import Config
from pavepal.indexing.index import Indexer


@pytest.mark.integration
def test_indexer_builds_chroma_and_three_bm25_pickles(tmp_path: Path, monkeypatch):
    """Uses fixtures + FakeEmbeddings to build a real index in <5 s."""
    monkeypatch.setattr("pavepal.indexing.index._make_embedder",
                        lambda cfg: FakeEmbeddings(size=8))

    cfg = Config()
    out = tmp_path / "index"
    Indexer(cfg).build(
        gdot_pdf=Path("tests/fixtures/sample_gdot.pdf"),
        road_segments_json=Path("tests/fixtures/sample_road_segments.json"),
        locations_json=Path("tests/fixtures/sample_locations.json"),
        out_dir=out,
    )

    assert (out / "chroma").exists()
    for fname in ["bm25_gdot.pkl", "bm25_roads.pkl", "bm25_locs.pkl"]:
        path = out / fname
        assert path.exists()
        data = pickle.loads(path.read_bytes())
        assert "chunks" in data and "bm25" in data
        assert len(data["chunks"]) > 0


@pytest.mark.integration
def test_indexer_idempotent_chunk_ids(tmp_path: Path, monkeypatch):
    monkeypatch.setattr("pavepal.indexing.index._make_embedder",
                        lambda cfg: FakeEmbeddings(size=8))

    cfg = Config()
    out_a = tmp_path / "a"
    out_b = tmp_path / "b"
    for out in (out_a, out_b):
        Indexer(cfg).build(
            gdot_pdf=Path("tests/fixtures/sample_gdot.pdf"),
            road_segments_json=Path("tests/fixtures/sample_road_segments.json"),
            locations_json=Path("tests/fixtures/sample_locations.json"),
            out_dir=out,
        )

    ids_a = sorted(c.chunk_id for c in pickle.loads((out_a / "bm25_gdot.pkl").read_bytes())["chunks"])
    ids_b = sorted(c.chunk_id for c in pickle.loads((out_b / "bm25_gdot.pkl").read_bytes())["chunks"])
    assert ids_a == ids_b
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/indexing/test_index.py -v -m integration
```

Expected: ModuleNotFoundError.

- [ ] **Step 3: Implement Indexer**

`src/pavepal/indexing/index.py`:

```python
"""Indexer: builds Chroma + 3 BM25 pickles from partner files (spec §5.3)."""
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
    """Override hook used by tests to inject FakeEmbeddings."""
    return Embedder(cfg).langchain_embeddings


class Indexer:
    def __init__(self, cfg: Config):
        self._cfg = cfg

    def build(
        self,
        gdot_pdf: Path,
        road_segments_json: Path,
        locations_json: Path,
        out_dir: Path,
    ) -> None:
        out_dir = Path(out_dir)
        # Clean previous build to keep idempotency
        if out_dir.exists():
            shutil.rmtree(out_dir)
        out_dir.mkdir(parents=True)

        # Step 1–4: build all chunks
        gdot_chunks = chunk_pages(parse_gdot(gdot_pdf), self._cfg)
        road_chunks = flatten_road_segments(road_segments_json)
        loc_chunks = flatten_locations(locations_json)
        all_chunks = gdot_chunks + road_chunks + loc_chunks

        # Step 5–6: dense — Chroma
        embedding = _make_embedder(self._cfg)
        chroma = Chroma(
            collection_name="pavepal",
            embedding_function=embedding,
            persist_directory=str(out_dir / "chroma"),
        )
        docs = [
            Document(
                page_content=c.text,
                metadata={**c.metadata, "chunk_id": c.chunk_id, "source": c.source},
            )
            for c in all_chunks
        ]
        if docs:
            chroma.add_documents(docs)

        # Step 7: per-source BM25 pickles
        chunks_by_source: dict[str, list[Chunk]] = {s: [] for s in self._cfg.sources}
        for c in all_chunks:
            chunks_by_source[c.source].append(c)
        for source, chunks in chunks_by_source.items():
            tokens = [tokenize(c.text) for c in chunks]
            bm25 = BM25Okapi(tokens) if tokens else BM25Okapi([[""]])
            (out_dir / _BM25_FILE_BY_SOURCE[source]).write_bytes(
                pickle.dumps({"chunks": chunks, "bm25": bm25})
            )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/indexing/test_index.py -v -m integration
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/pavepal/indexing/index.py tests/indexing/test_index.py
git commit -m "feat(indexing): Indexer.build orchestrates parse→chunk→flatten→embed→persist"
```

---

### Task T2.2: End-to-end build smoke test against real partner data

**Files:**
- Create: `tests/test_e2e_build.py`

This test is `@pytest.mark.slow` — it loads the real BGE model and indexes the real GDOT PDF + JSONs. Run on demand, not on every test.

- [ ] **Step 1: Write the smoke test**

`tests/test_e2e_build.py`:

```python
import pickle
from pathlib import Path
import pytest
from pavepal.config import Config
from pavepal.indexing.index import Indexer


@pytest.mark.slow
@pytest.mark.integration
def test_real_build_produces_expected_vector_counts(tmp_path: Path):
    """Builds against partner data. ~10 min wall time. Confirms ~23K total."""
    cfg = Config()
    out = tmp_path / "index"
    Indexer(cfg).build(
        gdot_pdf=cfg.gdot_pdf,
        road_segments_json=cfg.road_segments_json,
        locations_json=cfg.locations_json,
        out_dir=out,
    )

    counts = {}
    for source, fname in [("GDOT", "bm25_gdot.pkl"),
                          ("roadSegments", "bm25_roads.pkl"),
                          ("locations", "bm25_locs.pkl")]:
        data = pickle.loads((out / fname).read_bytes())
        counts[source] = len(data["chunks"])

    # ±20% tolerance — chunk count varies with chunker behavior on real PDF
    assert 400 <= counts["GDOT"] <= 700, counts
    assert 1500 <= counts["roadSegments"] <= 2400, counts
    assert 17000 <= counts["locations"] <= 23000, counts

    total = sum(counts.values())
    assert 19000 <= total <= 26000, (counts, total)
```

- [ ] **Step 2: Verify slow test is opt-in**

```bash
pytest tests/test_e2e_build.py -v               # 0 selected (skipped)
pytest tests/test_e2e_build.py -v -m slow       # 1 passed (after ~10 min)
```

- [ ] **Step 3: Commit**

```bash
git add tests/test_e2e_build.py
git commit -m "test: e2e build smoke test against real partner data (slow)"
```

---

### Task T2.3: End-to-end query smoke test

**Files:**
- Create: `tests/test_e2e_query.py`

- [ ] **Step 1: Write the smoke test**

`tests/test_e2e_query.py`:

```python
import os
from pathlib import Path
import pytest
from pavepal.config import Config
from pavepal.pipeline import Pipeline


@pytest.mark.slow
@pytest.mark.integration
def test_q01_cross_source_returns_gdot_and_roads():
    """Gold-set Q01: 'This street has PCI 80 with cracks — what does GDOT say?'
    Must return at least 1 GDOT chunk AND 1 roadSegments chunk."""
    if not os.environ.get("GOOGLE_API_KEY"):
        pytest.skip("GOOGLE_API_KEY not set")

    cfg = Config()
    pipeline = Pipeline.load(cfg)
    ans = pipeline.answer(
        "This street is PCI 80 with longitudinal cracks — what's the cheapest treatment per GDOT?",
        qid="Q01_smoke",
    )

    sources = {c.source for c in ans.retrieved_chunks}
    assert "GDOT" in sources
    assert "roadSegments" in sources or "locations" in sources


@pytest.mark.slow
@pytest.mark.integration
def test_refusal_question_triggers_refusal():
    if not os.environ.get("GOOGLE_API_KEY"):
        pytest.skip("GOOGLE_API_KEY not set")

    cfg = Config()
    pipeline = Pipeline.load(cfg)
    ans = pipeline.answer(
        "What does GDOT say about railway crossings?",   # out-of-corpus
        qid="Q_refusal",
    )
    assert ans.refused is True


@pytest.mark.slow
@pytest.mark.integration
def test_no_orphan_citations():
    if not os.environ.get("GOOGLE_API_KEY"):
        pytest.skip("GOOGLE_API_KEY not set")

    cfg = Config()
    pipeline = Pipeline.load(cfg)
    ans = pipeline.answer("What treatment for PCI 65?", qid="Q_orphan")
    retrieved_ids = {c.chunk_id for c in ans.retrieved_chunks}
    for cit in ans.citations:
        assert cit.chunk_id in retrieved_ids
```

- [ ] **Step 2: Run smoke tests (only if real index already built)**

```bash
# Build first if not already:
# python -m pavepal index build

pytest tests/test_e2e_query.py -v -m slow
```

Expected: 3 passed (or skipped if `GOOGLE_API_KEY` unset).

- [ ] **Step 3: Commit**

```bash
git add tests/test_e2e_query.py
git commit -m "test: e2e query smoke tests (Q01 cross-source, refusal, no orphan citations)"
```

---

### Task T2.4: Demo notebook

**Files:**
- Create: `notebooks/phase1_demo.ipynb`

The notebook walks: build indices (or load existing), ask 3 sample questions, show citations, show JSONL log.

- [ ] **Step 1: Create the notebook**

```bash
mkdir -p notebooks
cd notebooks
jupyter nbconvert --to notebook --new phase1_demo.ipynb 2>/dev/null || true
```

If the above fails (jupyter version), create the notebook manually with these cells (paste each as a separate code cell):

**Cell 1 (markdown):**

```markdown
# PavePal Phase 1 — Demo Notebook

Walks through the full RAG pipeline: build indices, ask questions, inspect citations.
```

**Cell 2 (code):**

```python
import os
from dotenv import load_dotenv
load_dotenv()

assert os.environ.get("GOOGLE_API_KEY"), "Set GOOGLE_API_KEY in .env"
print("env OK")
```

**Cell 3 (markdown):**

```markdown
## 1. Build indices (first run only — ~10 min)
Skip this cell if `index/` already exists.
```

**Cell 4 (code):**

```python
from pavepal.config import Config
from pavepal.indexing.index import Indexer

cfg = Config()
if not (cfg.index_dir / "chroma").exists():
    Indexer(cfg).build(
        gdot_pdf=cfg.gdot_pdf,
        road_segments_json=cfg.road_segments_json,
        locations_json=cfg.locations_json,
        out_dir=cfg.index_dir,
    )
    print("Indices built.")
else:
    print(f"Indices already exist at {cfg.index_dir}")
```

**Cell 5 (markdown):**

```markdown
## 2. Load pipeline
```

**Cell 6 (code):**

```python
from pavepal.pipeline import Pipeline
pipeline = Pipeline.load(cfg)
print("Pipeline loaded.")
```

**Cell 7 (markdown):**

```markdown
## 3. Three sample questions
```

**Cell 8 (code):**

```python
from IPython.display import display, Markdown

questions = [
    ("Q_demo_1", "What treatment does GDOT recommend for PCI 65?"),
    ("Q_demo_2", "Tell me about Engineering Dr."),
    ("Q_demo_3", "What does GDOT say about railway crossings?"),
]

for qid, q in questions:
    ans = pipeline.answer(q, qid=qid)
    display(Markdown(f"### {qid} — {q}"))
    display(Markdown(f"**Refused:** `{ans.refused}`"))
    display(Markdown(f"**Answer:** {ans.answer_text}"))
    display(Markdown("**Citations:**"))
    for cit in ans.citations:
        chunk = next(c for c in ans.retrieved_chunks if c.chunk_id == cit.chunk_id)
        display(Markdown(f"- `[{cit.rank}]` ({chunk.source}) {chunk.text[:200]}..."))
```

**Cell 9 (markdown):**

```markdown
## 4. Inspect the JSONL log
```

**Cell 10 (code):**

```python
import json
from pathlib import Path

logs = sorted((cfg.log_dir).glob("run_*.jsonl"))
latest = logs[-1] if logs else None
print(f"Latest log: {latest}")
if latest:
    for line in latest.read_text().splitlines()[-3:]:
        rec = json.loads(line)
        print(f"  {rec['qid']}: refused={rec['refused']}  retrieve={rec['latency_ms']['retrieve']}ms")
```

- [ ] **Step 2: Run the notebook end-to-end**

```bash
cd notebooks
jupyter nbconvert --to notebook --execute phase1_demo.ipynb --output phase1_demo.executed.ipynb
```

Expected: completes without errors. Inspect `phase1_demo.executed.ipynb` for cited answers.

- [ ] **Step 3: Commit (without the executed copy)**

```bash
rm -f notebooks/phase1_demo.executed.ipynb
git add notebooks/phase1_demo.ipynb
git commit -m "feat(notebook): Phase 1 demo — build, query, inspect citations + logs"
```

---

# Phase 3 — T-task verifications

These are the working-log probes. Each produces a short markdown report committed alongside the working log. None block earlier tasks; they validate the locked picks against real data.

---

### Task T3.1: T1 — pypdf vs pdfplumber on real GDOT pages

**Owner:** [A]
**Files:**
- Create: `Project_plan/20260507_t1_pdf_parser_findings.md`

- [ ] **Step 1: Pick 5 GDOT pages**

Per working log T1: 5 pages including ≥1 table-heavy. Suggested: pages 9 (ch.1 intro), 21 (fog seal text), 95 (mid-Ch.2), **390 (Table 66 — table-heavy)**, 388 (PPIT tutorial intro).

- [ ] **Step 2: Run a comparison script**

Create + run a one-off script:

```python
# scratch_t1_compare.py — run, capture output, then delete
from pypdf import PdfReader
import pdfplumber
from pavepal.config import Config

cfg = Config()
PAGES = [9, 21, 95, 388, 390]

reader = PdfReader(str(cfg.gdot_pdf))
print("\n=== pypdf ===")
for p in PAGES:
    text = reader.pages[p - 1].extract_text() or ""
    print(f"page {p}: {len(text)} chars\n  preview: {text[:160]!r}\n")

print("\n=== pdfplumber ===")
with pdfplumber.open(str(cfg.gdot_pdf)) as pdf:
    for p in PAGES:
        text = pdf.pages[p - 1].extract_text() or ""
        print(f"page {p}: {len(text)} chars\n  preview: {text[:160]!r}\n")
```

```bash
python scratch_t1_compare.py | tee /tmp/t1_output.txt
```

- [ ] **Step 3: Write up findings**

`Project_plan/20260507_t1_pdf_parser_findings.md`:

```markdown
# T1 Findings — pypdf vs pdfplumber on GDOT

**Date:** 2026-05-07
**Owner:** [A]

## Pages tested
| Page | What it is | pypdf chars | pdfplumber chars | Winner |
|---|---|---:|---:|---|
| 9 | Ch.1 intro | <fill> | <fill> | <fill> |
| 21 | Fog seal prose | <fill> | <fill> | <fill> |
| 95 | Mid-Ch.2 prose | <fill> | <fill> | <fill> |
| 388 | PPIT tutorial intro | <fill> | <fill> | <fill> |
| 390 | Table 66 (rotated, dense table) | <fill> | <fill> | <fill> |

## Conclusion
- Default pypdf with pdfplumber fallback (current spec) is **<confirmed | needs adjustment>**
- Fallback threshold (<100 chars in long-page neighborhood) is **<confirmed | adjusted to X>**

Replace `<fill>` with actual numbers and `<...>` with prose findings.
```

- [ ] **Step 4: Delete the scratch script and commit**

```bash
rm scratch_t1_compare.py
git add Project_plan/20260507_t1_pdf_parser_findings.md
git commit -m "docs(t1): pypdf vs pdfplumber findings on 5 GDOT pages"
```

---

### Task T3.2: T2 — verify BGE query prefix flows through

**Owner:** [B]
**Files:**
- Create: `Project_plan/20260507_t2_bge_prefix_findings.md`

- [ ] **Step 1: Patch in a logging hook**

Run a one-off check (no permanent code change needed):

```python
# scratch_t2_prefix.py
from unittest.mock import patch
from pavepal.config import Config
from pavepal.indexing.embed import Embedder

real_call_args = []

class Tap:
    def __init__(self, inner):
        self._inner = inner
    def embed_query(self, text):
        real_call_args.append(text)
        return self._inner.embed_query(text)
    def embed_documents(self, texts):
        return self._inner.embed_documents(texts)

cfg = Config()
e = Embedder(cfg)
e._inner = Tap(e._inner)
e.embed_query("What's the cheapest treatment for PCI 65?")
print(f"Captured query string passed downstream: {real_call_args[0]!r}")
```

```bash
python scratch_t2_prefix.py
```

Expected: the captured string starts with `"Represent this sentence for searching relevant passages: "`. If it does NOT, T2 has uncovered a real bug — escalate to research-log §3.5 / §5.2.

- [ ] **Step 2: Run with-vs-without comparison on 5 questions**

(Use real BGE model — slow but necessary.) Compare top-5 retrieval for each question with and without the prefix.

- [ ] **Step 3: Write up findings**

`Project_plan/20260507_t2_bge_prefix_findings.md`:

```markdown
# T2 Findings — BGE Query Prefix Verification

**Date:** 2026-05-07
**Owner:** [B]

## Prefix capture
Confirmed that `Embedder.embed_query("X")` passes the string
`"Represent this sentence for searching relevant passages: X"` to the underlying model: **<YES | NO>**.

## With-vs-without retrieval comparison
| # | Question | Prefix vs no-prefix top-5 differ? |
|---|---|---|
| 1 | What's the cheapest treatment for PCI 65? | <Y/N> |
| 2 | Engineering Dr defects | <Y/N> |
| 3 | Fog seal limitations | <Y/N> |
| 4 | Crack sealing performance | <Y/N> |
| 5 | When to apply microsurfacing | <Y/N> |

## Conclusion
Prefix is **<applied correctly | broken — needs fix>**. The retrieval differences are **<significant | negligible>**.
```

- [ ] **Step 4: Commit**

```bash
rm scratch_t2_prefix.py
git add Project_plan/20260507_t2_bge_prefix_findings.md
git commit -m "docs(t2): BGE query prefix verification findings"
```

---

### Task T3.3: T3 — policy B source coverage

**Owner:** [C]
**Files:**
- Create: `Project_plan/20260507_t3_policy_b_findings.md`

- [ ] **Step 1: Run the 3 biased queries**

(Real index must be built — see T2.2.)

```python
# scratch_t3_policy.py
from pavepal.config import Config
from pavepal.retrieval import Retriever

cfg = Config()
r = Retriever.load(cfg)

for label, q in [
    ("GDOT-leaning", "What's the cheapest treatment for PCI 65?"),
    ("Road-name-leaning", "Tell me about Engineering Dr"),
    ("Defect-leaning", "Which roads have transverse cracks?"),
]:
    chunks = r.retrieve(q)
    sources = [c.source for c in chunks]
    print(f"{label}: {q}")
    print(f"  top-5 sources: {sources}")
    for c in chunks:
        print(f"    {c.chunk_id}  {c.text[:80]!r}")
    print()
```

```bash
python scratch_t3_policy.py | tee /tmp/t3_output.txt
```

- [ ] **Step 2: Write up findings**

`Project_plan/20260507_t3_policy_b_findings.md`:

```markdown
# T3 Findings — Policy B Source Coverage

**Date:** 2026-05-07
**Owner:** [C]

## Per-query top-5 sources
| Query type | Question | top-5 sources | ≥1 chunk from expected source? |
|---|---|---|---|
| GDOT-leaning | What's the cheapest treatment for PCI 65? | <fill> | <Y/N — expected: GDOT> |
| Road-name | Tell me about Engineering Dr | <fill> | <Y/N — expected: roadSegments or locations> |
| Defect | Which roads have transverse cracks? | <fill> | <Y/N — expected: roadSegments or locations> |

## Conclusion
Policy B **<works as designed | needs adjustment>**. If any expected source is missing from top-5,
flag for `k_per_retriever` increase or per-source weighting tweak.
```

- [ ] **Step 3: Commit**

```bash
rm scratch_t3_policy.py
git add Project_plan/20260507_t3_policy_b_findings.md
git commit -m "docs(t3): policy B source coverage on 3 biased queries"
```

---

# Phase 4 — Final integration sign-off

### Task T4.1: README quick-start

**Owner:** [Shared]
**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read existing README**

```bash
cat README.md
```

- [ ] **Step 2: Append a Phase-1 quick-start section**

Append (don't overwrite — preserve any existing content):

```markdown

## Phase 1 — Quick Start

```bash
# 1. Create env
conda env create -f env.yaml
conda activate capstone_env
pip install -e .

# 2. Set Gemini API key
echo "GOOGLE_API_KEY=your_key_here" > .env

# 3. Build indices (~10 min — partner data must be in data_20260426/)
python -m pavepal index build

# 4. Ask a question
python -m pavepal query "What's the cheapest treatment for PCI 65?"

# 5. Or run the demo notebook
jupyter lab notebooks/phase1_demo.ipynb
```

For architecture details see [Project_plan/20260507_phase_1_spec.md](Project_plan/20260507_phase_1_spec.md).
For evaluation, see [Project_plan/20260506_project_plan_evaluation.md](Project_plan/20260506_project_plan_evaluation.md).
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: Phase 1 quick-start in README"
```

---

### Task T4.2: Run the full test suite

**Owner:** [Shared]

- [ ] **Step 1: Fast tests (default selection)**

```bash
pytest -v
```

Expected: every non-`slow`, non-`integration` test passes. ~30 tests in <30 s.

- [ ] **Step 2: Integration tests (with FakeEmbeddings)**

```bash
pytest -v -m integration
```

Expected: T2.1 tests pass.

- [ ] **Step 3: Slow tests (real models, real partner data — only after `index build` succeeded)**

```bash
pytest -v -m slow
```

Expected: T2.2 + T2.3 + T1B.1 slow tests pass.

- [ ] **Step 4: If any test fails — fix forward, do not skip**

For each failure: read traceback, fix the underlying code, add a regression test, commit.

---

# Self-review checklist

Before declaring Phase 1 done, [Shared] runs:

- [ ] Spec coverage — every section of [20260507_phase_1_spec.md](20260507_phase_1_spec.md) maps to at least one task in this plan
- [ ] All `pytest` tests pass under all three markers
- [ ] `python -m pavepal index build` completes without errors against real data
- [ ] `python -m pavepal query "..."` returns an answer with citations
- [ ] The 3 T-task reports (T3.1, T3.2, T3.3) are committed and findings reviewed
- [ ] No `TODO` / `FIXME` comments left in `src/pavepal/`
- [ ] `.gitignore` excludes `index/`, `logs/`, `.env`, partner data
- [ ] No partner data committed (`git log --all --full-history -- "data_20260426/*"` is empty)

---

# Phase-1.5 — web app upgrade (next plan, not this one)

Once Phase 1 hits the eval-plan §7 targets, the next plan adds:
- `src/pavepal/api/main.py` — FastAPI wrapper exposing `POST /query`
- `src/pavepal/api/cors.py` — CORS for the Vite dev origin
- `private_testing_repo/pavepal-capstone/src/lib/api.js` — fetch wrapper
- React component to render `[N]` chips with chunk-text tooltips

Spec for this is [20260507_phase_1_spec.md §11.3](20260507_phase_1_spec.md). A new implementation plan covers it when greenlit.
