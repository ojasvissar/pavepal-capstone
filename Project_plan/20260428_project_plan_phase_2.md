# Phase 2 — Single Agent with Tool Calling

**Scope:** Phase 2 only. Builds directly on the Phase 1 deliverable (naive RAG with FAISS + BGE-base + Claude). Phase 3 (Researcher → Verifier → Composer multi-agent) is sketched at the end as a stretch goal, not specified in detail here.

**Companion docs:** [20260428_project_plan.md](20260428_project_plan.md) for Phase 1 build steps, [bidly_reference/bidly_architecture.md](../bidly_reference/bidly_architecture.md) for the tool-use loop pattern this is modeled on.

---

## Executive summary

Phase 1 gave us a linear pipeline: every user question goes through the same 4 steps — embed query → fetch top-5 chunks → inject into prompt → call Claude. That works for open-ended conceptual questions ("how does a chip seal work?") but breaks down on **precise quantitative questions** ("what's the PCI of GISID 1660? what was the 2024 unit price for milling?") because pulling those exact numbers out of dense chunks via fuzzy similarity is unreliable.

Phase 2 keeps the same single-agent shape but **gives Claude a toolbox** of 7 deterministic functions it can call mid-conversation — alongside semantic retrieval. The agent decides per query whether to do a fuzzy chunk search, an exact keyword search, or a SQL-style lookup against the structured Excel/GeoJSON data — and can chain them ("first look up the segment by GISID, then look up the rehab for that PCI, then look up the unit cost"). Result: numeric answers come from authoritative tables instead of LLM interpolation, and citations stay tight to a specific row/page.

The architecture is still **one Claude conversation, one context window, one set of citations** — no orchestrator, no agent handoffs, no context rot. Only the retrieval layer changes.

---

## What changes from Phase 1 → Phase 2

### Phase 1: linear naive RAG

```
              ┌─────────────────────────────────────┐
              │  Phase 1 — every query, every time  │
              └─────────────────────────────────────┘

  User Q                                              Single API call.
     │                                                Single retrieval path.
     ▼                                                Single set of citations.
  embed(Q)
     │
     ▼
  FAISS top-5 chunks ──────────► [Chunk1, Chunk2, ..., Chunk5]
     │
     ▼
  Inject into prompt template
     │
     ▼
  Claude (one call) ──────────► Answer + citations
     │
     ▼
   Done.
```

### Phase 2: single agent with tool-calling

```
                  ┌─────────────────────────────────────────┐
                  │  Phase 2 — agent decides which tools    │
                  │  to call, possibly multiple times       │
                  └─────────────────────────────────────────┘

  User Q
     │
     ▼
  ┌──────────────────────────────────────────────────────────┐
  │                        Claude                             │
  │   Sees: system prompt + tool schemas + conversation       │
  │                                                           │
  │   Decides which tool(s) to call ────────────────┐         │
  └─────────────────────────────────────────────────┼─────────┘
                                                    │
            ┌───────────────────┬───────────────────┼───────────────────┬─────────────────────┐
            ▼                   ▼                   ▼                   ▼                     ▼
     vector_search       bm25_search        lookup_segment      get_rehab_for_pci      get_unit_cost
     (semantic)          (keyword)          (Excel SQL)         (Rehabs sheet)         (2024 Bid Tab)
            │                   │                   │                   │                     │
            └───────┬───────────┴───────────────────┴───────────────────┴─────────────────────┘
                    │ tool results returned to Claude (added to context)
                    ▼
  ┌──────────────────────────────────────────────────────────┐
  │           Claude — does it have enough now?              │
  │                                                           │
  │   ┌─ NO  → call another tool, loop back ──────────┐      │
  │   └─ YES → emit final answer + citations          │      │
  └─────────────────────────────────────────────────────┼─────┘
                                                        │
                                                        ▼
                                                Answer + citations
```

### Side-by-side

| Property | Phase 1 (naive RAG) | Phase 2 (agentic RAG) |
|---|---|---|
| Number of LLM calls per turn | Always **1** | **1 + (1 per tool batch)** — usually 2–4 |
| Retrieval | Always semantic, always top-5 | Agent picks: semantic / keyword / SQL-style / multiple |
| Numeric questions | Best effort from chunks | Fetched from canonical tables — no interpolation |
| Multi-step questions | Misses ("look up GISID 1660 then check its PCI rehab" needs 2 steps) | Handles natively — chain of tool calls |
| Cost per turn | ~$0.04 | ~$0.04–0.10 (more tokens because tool results land in context) |
| Latency | ~2 s | ~3–6 s (per-tool round trips) |
| Citations | Source filename + page | Source filename + page + structured row reference |
| Code shape | Pipe-chain | `create_tool_calling_agent` + `AgentExecutor` (still LangChain) |

---

## Why these 7 tools — table at a glance

| # | Tool | Data it touches | Gap in Phase 1 it fills | Example query that needs this tool |
|---|---|---|---|---|
| 1 | `vector_search` | PDFs + Excel narrative chunks (FAISS index, BGE-base) | — (carry-over from Phase 1) | "How does a chip seal differ from a slurry seal?" |
| 2 | `bm25_search` | Same chunks, indexed via `rank_bm25` | Embedding misses exact identifiers (GISIDs, codes, road names) | "Find the description of `Rehab Code 30`" or "What's said about ABBY COURT?" |
| 3 | `lookup_segment(gisid)` | `App A Inventory` sheet → DataFrame | Per-row exact lookup; embeddings can't reliably retrieve a single row | "What's GISID 1660's selected rehab year and segment cost?" |
| 4 | `find_segments_by_pci(min, max)` | `App A Inventory` sheet → DataFrame | Set queries (filter + count) are not what RAG is good at | "How many residential segments are at PCI < 50?" |
| 5 | `get_rehab_for_pci(pci, road_class)` | `Rehabs` sheet → lookup table | The canonical rule book — must be deterministic, not paraphrased | "What does the IMS rehab table recommend for asphalt PCI 65 on a residential road?" |
| 6 | `get_unit_cost(line_item)` | 2024 Bid Tabulation → DataFrame | 7-bidder structured prices don't survive PDF-to-chunk extraction well | "What did contractors charge per ton for recycled asphalt patching in 2024?" |
| 7 | `lookup_pavepal(road_id)` | `roadSegments.json` → in-memory dict | PavePal's per-segment scanning data; `road_id` is a clean key | "What defects did PavePal detect on segment `68d703322294ad50adb9e400`?" |

The principle behind the split: **deterministic tools for numeric / identifier-driven queries, semantic search for conceptual queries.** This is the "code computes scores, LLM narrates them" lesson from Bidly — Claude doesn't compute PCI bands or unit costs; it calls a function that returns the row, and then it explains the row.

---

## Implementation walkthrough

### Setup — what changes from Phase 1

```bash
conda activate capstone_env
pip install rank-bm25 langchain  # langchain pulls in agent abstractions
```

You already have everything else from Phase 1 (`langchain-anthropic`, `langchain-community`, `pypdf`, `openpyxl`, FAISS, BGE-base).

#### Project layout (Phase 2 additions only)

```
pavepal-capstone/
├── ingest/                     ← (unchanged from Phase 1)
├── chat/
│   ├── retrieve.py             ← (Phase 1)
│   ├── prompt.py               ← UPDATED for agent
│   ├── chain.py                ← Phase 1 single-shot chain (still works)
│   └── log.py                  ← (Phase 1)
├── tools/                      ← NEW — one file per tool family
│   ├── __init__.py
│   ├── data_loaders.py         ← startup-time DataFrame loading
│   ├── search_tools.py         ← Tools 1, 2 (vector + BM25)
│   ├── excel_tools.py          ← Tools 3, 4, 5 (segment / pci / rehab)
│   ├── cost_tools.py           ← Tool 6 (bid tab)
│   └── pavepal_tools.py        ← Tool 7 (GeoJSON)
├── agent/                      ← NEW
│   ├── system_prompt.py
│   └── run_agent.py            ← entrypoint replacing chat/chain.py
├── indices/
│   ├── phase1_faiss/           ← (already built)
│   └── phase2_bm25.pkl         ← NEW
└── logs/
    └── phase2_agent.jsonl
```

#### Data loading at startup (one place, reused by all tools)

```python
# tools/data_loaders.py
import json, pickle
from pathlib import Path
import pandas as pd
from langchain_community.vectorstores import FAISS
from ingest.embed import embeddings

DATA = Path("data_20260426/UBC Capstone Project")
INDICES = Path("indices")

# --- FAISS for vector_search (built in Phase 1) ---
VECTORSTORE = FAISS.load_local(
    str(INDICES / "phase1_faiss"), embeddings, allow_dangerous_deserialization=True,
)

# --- BM25 (built in Phase 2 step below) ---
with open(INDICES / "phase2_bm25.pkl", "rb") as f:
    _bm = pickle.load(f)
BM25 = _bm["bm25"]
BM25_CHUNKS = _bm["chunks"]

# --- Excel inventory (App A) — both 2015 and 2022 vintages ---
DF_INVENTORY_2015 = (
    pd.read_excel(
        DATA / "relookingforroaddata_2015_baseline/PeachTree_Corners_Analysis_Rev2.xlsx",
        sheet_name="App A Inventory", header=7,
    )
    .dropna(how="all")
    .dropna(subset=["GISID"])
)

DF_INVENTORY_2022 = (
    pd.read_excel(
        DATA / "relookingforroaddata_2023_update/PeachtreeCornersGA2022_ESA_5Yr_Rev2.xlsm",
        sheet_name="Inventory", header=3,
    )
    .dropna(how="all")
    .dropna(subset=["GISID"])
)

# --- Rehab activity → unit-rate table (the rule book) ---
DF_REHABS = pd.read_excel(
    DATA / "relookingforroaddata_2015_baseline/PeachTree_Corners_Analysis_Rev2.xlsx",
    sheet_name="Rehabs", header=8,
).dropna(subset=["Rehab Activity"])

# --- 2024 Bid Tabulation — manually structured (the PDF table is messy) ---
DF_BIDS = pd.DataFrame([
    # item, unit, qty, then per-bidder unit prices [b1..b7]
    {"item": "Adjust Manholes to Grade",         "unit": "EA", "qty": 56,
     "prices": [1790, 1500, 1850, 185, 508, 350, 548.42]},
    {"item": "Recycled Asphalt Patching",        "unit": "TN", "qty": 9600,
     "prices": [167.30, 195, 135, 152.41, 180, 218, 157.68]},
    {"item": "Recycled Asphalt 9.5mm Superpave", "unit": "TN", "qty": 6100,
     "prices": [141, 165, 165, 140.62, 147, 156, 152.85]},
    {"item": "Recycled Asphalt D Mix",           "unit": "TN", "qty": 3700,
     "prices": [179.40, 160, 175, 169.05, 165, 200, 176.84]},
    {"item": "Milling Asphalt Pavement",         "unit": "SY", "qty": 44200,
     "prices": [5.20, 5.50, 8.10, 2.38, 4.75, 5.65, None]},
    # ... extend with the rest of the bid tab line items
])

# --- PavePal CV-derived segments ---
with open(DATA / "roadSegments (2).json") as f:
    _segs = json.load(f)
PAVEPAL_SEGMENTS = {f["_id"]: f for f in _segs["features"]}
```

> The Excel headers (rows 7, 3, 8) are exactly as documented in `data_dict.md`. The bid-tab structuring is a one-time hand job — the PDF table is too irregular for reliable auto-extraction.

---

### Tool 1: `vector_search` — semantic search over text

**What it does:** the same retrieval Phase 1 already runs, but exposed as a callable tool the agent can choose to invoke (or not).

**When the agent should reach for it:** open-ended conceptual questions where the user's wording probably won't match the document's wording verbatim.

**When NOT to use it:** when an exact identifier (GISID, road name, code number) is in the query — `bm25_search` will be more precise.

```python
# tools/search_tools.py
from langchain_core.tools import tool
from tools.data_loaders import VECTORSTORE

def _format_docs(docs) -> str:
    """Compact citation-friendly format the LLM can quote."""
    parts = []
    for i, d in enumerate(docs, 1):
        src = d.metadata.get("source", "?")
        page = d.metadata.get("page")
        sheet = d.metadata.get("sheet")
        loc = (f" p.{page + 1}" if page is not None
               else f" sheet '{sheet}' row {d.metadata.get('row','?')}" if sheet
               else "")
        parts.append(f"[{i}] (source: {src}{loc})\n{d.page_content.strip()}")
    return "\n\n".join(parts)

@tool
def vector_search(query: str, k: int = 5) -> str:
    """Semantic search over PDFs and Excel narrative chunks. Best for open-ended
    conceptual questions, e.g. "how does a chip seal differ from slurry seal".
    Returns the top-K most semantically similar chunks with their sources.
    """
    docs = VECTORSTORE.similarity_search(query, k=k)
    return _format_docs(docs)
```

---

### Tool 2: `bm25_search` — keyword search over the same corpus

**What it does:** classical BM25 (Okapi) keyword scoring over the same chunks the FAISS index holds. Catches exact-token matches that embeddings miss.

**When the agent should reach for it:** queries that include a verbatim identifier — `GISID 1660`, `Rehab Code 30`, `ABBY COURT`, acronyms like `LADD`.

#### Step 1 — build the BM25 index (one-time, mirrors lecture 5)

```python
# ingest/build_bm25.py
import pickle, re
from pathlib import Path
from rank_bm25 import BM25Okapi

from ingest.load_pdfs import load_pdfs
from ingest.load_excels import load_all_excels
from ingest.chunk import chunk_documents

INDEX_PATH = Path("indices/phase2_bm25.pkl")

def tokenize(text: str) -> list[str]:
    return re.findall(r"\w+", text.lower())

def build():
    chunks = chunk_documents(load_pdfs() + load_all_excels())
    tokenized = [tokenize(c.page_content) for c in chunks]
    bm25 = BM25Okapi(tokenized)
    INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
    with INDEX_PATH.open("wb") as f:
        pickle.dump({"bm25": bm25, "chunks": chunks}, f)
    print(f"Saved BM25 index over {len(chunks)} chunks to {INDEX_PATH}")

if __name__ == "__main__":
    build()
```

#### Step 2 — wrap as a tool

```python
# tools/search_tools.py  (continued)
import re
import numpy as np
from tools.data_loaders import BM25, BM25_CHUNKS

def _tokenize(text: str) -> list[str]:
    return re.findall(r"\w+", text.lower())

@tool
def bm25_search(query: str, k: int = 5) -> str:
    """Exact-keyword search over the same corpus as vector_search.
    Best for queries containing a verbatim identifier (GISID, road name,
    rehab code, acronym). Returns the top-K BM25-ranked chunks.
    """
    scores = BM25.get_scores(_tokenize(query))
    top_idx = np.argsort(scores)[::-1][:k]
    docs = [BM25_CHUNKS[i] for i in top_idx]
    return _format_docs(docs)
```

> Phase 1's `_format_docs` is reused so the agent sees identical formatting whether it called vector or BM25 search — makes the two interchangeable from the agent's perspective.

---

### Tool 3: `lookup_segment(gisid)` — exact row from the inventory

**What it does:** SQL-style "WHERE GISID = X" lookup against the 2015 or 2022 Excel inventory.

**When the agent should reach for it:** any time a specific segment is named — by GISID, or after another tool returned a GISID.

```python
# tools/excel_tools.py
import json
from typing import Literal
from langchain_core.tools import tool
from tools.data_loaders import DF_INVENTORY_2015, DF_INVENTORY_2022

@tool
def lookup_segment(gisid: int, vintage: Literal["2015", "2022"] = "2015") -> str:
    """Get the full inventory record for a single road segment by GISID.
    Returns columns like On Street, From/To, FunCL, Pavement Area, PCI,
    Condition Rating, Selected Rehab Year, Rehab Activity, Segment Cost.
    Use vintage='2022' for the more recent ESA workbook.
    """
    df = DF_INVENTORY_2015 if vintage == "2015" else DF_INVENTORY_2022
    row = df[df["GISID"] == gisid]
    if row.empty:
        return json.dumps({"error": f"No segment with GISID {gisid} in {vintage} inventory"})
    record = row.iloc[0].dropna().to_dict()
    record["_source"] = f"App A Inventory ({vintage}), GISID {gisid}"
    return json.dumps(record, default=str)
```

---

### Tool 4: `find_segments_by_pci(min_pci, max_pci, funcl)` — set query

**What it does:** filter the inventory by PCI range and (optionally) functional class — answers questions of the form "how many segments have property X?"

**When the agent should reach for it:** quantitative set queries that pure RAG handles poorly — counting, ranges, top-N lists.

```python
# tools/excel_tools.py  (continued)
from typing import Optional

@tool
def find_segments_by_pci(
    min_pci: float,
    max_pci: float,
    funcl: Optional[str] = None,
    limit: int = 20,
) -> str:
    """Find segments whose PCI falls in [min_pci, max_pci]. Optional `funcl`
    filters by functional class (e.g. 'Residential', 'Major Collector').
    Returns up to `limit` matching segments with GISID, On Street, PCI, FunCL,
    plus a total count of matches.
    """
    df = DF_INVENTORY_2015
    pci_col = "Pavement Condition Index (PCI)"
    mask = df[pci_col].between(min_pci, max_pci)
    if funcl:
        mask &= df["FunCL"].str.contains(funcl, case=False, na=False)
    hits = df[mask]
    sample = hits.head(limit)[["GISID", "On Street", pci_col, "FunCL"]]
    return json.dumps({
        "total_matches": int(len(hits)),
        "returned": int(len(sample)),
        "segments": sample.to_dict(orient="records"),
        "_source": "App A Inventory (2015)",
    }, default=str)
```

---

### Tool 5: `get_rehab_for_pci(pci, road_class, pavetype)` — the rule book

**What it does:** the single most important deterministic lookup in the whole system. Maps `(PCI, road class, pavement type)` → recommended rehab activity + unit rate. This is the IMS rule book made queryable.

**When the agent should reach for it:** any time the user asks "what should we do for a road at PCI X?" — never paraphrase this; always look it up.

```python
# tools/excel_tools.py  (continued)
from tools.data_loaders import DF_REHABS

ROAD_CLASS_TO_RATE_COL = {
    "Minor Arterial":   "MIA Unit Rate ($/yd2)",
    "Major Collector":  "MJC Unit Rate ($/yd2)",
    "Minor Collector":  "MIC Unit Rate ($/yd2)",
    "Residential":      "RSS Unit Rate ($/yd2)",
}

@tool
def get_rehab_for_pci(
    pci: float,
    road_class: str = "Residential",
    pavetype: str = "Asphalt",
) -> str:
    """Look up the recommended rehab activity from the IMS Rehabs rule book
    for a given (PCI, road_class, pavetype). Returns the activity name, code,
    PCI band it covers, unit rate ($/yd²) for that road class, and the
    'Reset PCI' (post-rehab PCI). road_class options: 'Minor Arterial',
    'Major Collector', 'Minor Collector', 'Residential'.
    """
    rate_col = ROAD_CLASS_TO_RATE_COL.get(road_class, "RSS Unit Rate ($/yd2)")
    df = DF_REHABS[DF_REHABS["Pavetype"] == pavetype]
    candidates = df[(df["Min PCI"] <= pci) & (df["Max PCI"] >= pci)]
    if candidates.empty:
        return json.dumps({"error": f"No rehab band found for {pavetype} at PCI {pci}"})
    rows = []
    for _, r in candidates.iterrows():
        rows.append({
            "rehab_code":    int(r["Rehab Code"]) if pd.notna(r["Rehab Code"]) else None,
            "activity":      r["Rehab Activity"],
            "min_pci":       float(r["Min PCI"]),
            "max_pci":       float(r["Max PCI"]),
            "unit_rate_per_yd2": float(r[rate_col]) if pd.notna(r[rate_col]) else None,
            "reset_pci":     float(r["Reset PCI"]) if pd.notna(r["Reset PCI"]) else None,
        })
    return json.dumps({
        "matches": rows,
        "_source": f"PeachTree_Corners_Analysis_Rev2.xlsx, sheet Rehabs, road_class={road_class}",
    })
```

> `import pandas as pd` is already at the top of `excel_tools.py` from Tool 3.

---

### Tool 6: `get_unit_cost(line_item_keyword)` — current contractor prices

**What it does:** keyword search across the 2024 Bid Tabulation line items, returning the per-bidder unit prices and the min/max/mean across bidders.

**When the agent should reach for it:** "how much does X cost in 2024?" — this is the only source of *current* dollar pricing in the corpus. The IMS workbooks have 2015 unit rates; this is much fresher.

```python
# tools/cost_tools.py
import json
import pandas as pd
from langchain_core.tools import tool
from tools.data_loaders import DF_BIDS

@tool
def get_unit_cost(line_item_keyword: str) -> str:
    """Look up 2024 contractor bid prices for a pavement line item.
    `line_item_keyword` is matched case-insensitively against the bid line
    descriptions (e.g. 'patching', 'milling', 'manhole'). Returns the line
    item, unit, total quantity, all 7 bidder prices, and the min/max/mean
    unit price across bidders.
    """
    matches = DF_BIDS[
        DF_BIDS["item"].str.contains(line_item_keyword, case=False, na=False)
    ]
    if matches.empty:
        return json.dumps({"error": f"No bid line item matching '{line_item_keyword}'"})
    out = []
    for _, r in matches.iterrows():
        prices = [p for p in r["prices"] if p is not None]
        out.append({
            "item": r["item"],
            "unit": r["unit"],
            "qty":  r["qty"],
            "bidder_unit_prices": r["prices"],
            "min_unit_price":  min(prices),
            "max_unit_price":  max(prices),
            "mean_unit_price": round(sum(prices) / len(prices), 2),
        })
    return json.dumps({
        "matches": out,
        "_source": "PTC 24-05 2024 Street Resurfacing Full Bid Tabulation.pdf",
    })
```

---

### Tool 7: `lookup_pavepal(road_id)` — PavePal's CV-derived segment data

**What it does:** dictionary lookup on `roadSegments.json` keyed by `_id` (the Mongo ObjectId PavePal uses). Returns the per-segment CV defects, PCI, scanning status.

**When the agent should reach for it:** when the user names a specific segment via PavePal's `road_id`, or after another part of the pipeline produces one.

```python
# tools/pavepal_tools.py
import json
from langchain_core.tools import tool
from tools.data_loaders import PAVEPAL_SEGMENTS

@tool
def lookup_pavepal(road_id: str) -> str:
    """Get PavePal's CV-derived data for one road segment by its road_id
    (Mongo ObjectId from roadSegments.json). Returns name, ROADCLASS, PCI,
    pci_category, defect counts, scanned status, length_km.
    """
    seg = PAVEPAL_SEGMENTS.get(road_id)
    if not seg:
        return json.dumps({"error": f"No PavePal segment with road_id {road_id}"})
    p = seg.get("properties", {})
    return json.dumps({
        "road_id":      road_id,
        "name":         p.get("name"),
        "roadclass":    p.get("ROADCLASS"),
        "speed_limit":  p.get("speed_limit"),
        "length_km":    p.get("length_km"),
        "scanned":      p.get("scanned"),
        "pci":          p.get("pci"),
        "pci_category": p.get("pci_category"),
        "defects":      p.get("defects", {}),
        "_source":      "roadSegments.json",
    })
```

---

## Wiring it together — the agent

### Step 1 — agent system prompt

```python
# agent/system_prompt.py
AGENT_SYSTEM_PROMPT = """You are a pavement-management assistant for PavePal.

You have 7 tools available:
- vector_search(query, k):  semantic search over PDFs and Excel narrative chunks.
                            Use for open-ended/conceptual questions.
- bm25_search(query, k):    keyword search over the same chunks.
                            Use when the user mentions an exact identifier,
                            code, road name, or acronym.
- lookup_segment(gisid, vintage):
                            exact inventory record for one segment by GISID.
- find_segments_by_pci(min_pci, max_pci, funcl, limit):
                            filter segments by PCI range. Use for set queries
                            ("how many", "which segments are at PCI < X").
- get_rehab_for_pci(pci, road_class, pavetype):
                            CANONICAL rule-book lookup. Use this — never
                            paraphrase rehab recommendations from chunks.
- get_unit_cost(line_item_keyword):
                            2024 contractor bid prices. The only source of
                            CURRENT dollar pricing — prefer over 2015 rates
                            in chunks.
- lookup_pavepal(road_id):  PavePal's CV-derived defects + PCI for a segment.

Rules:
1. Prefer DETERMINISTIC tools (lookup_segment, get_rehab_for_pci, get_unit_cost,
   lookup_pavepal) over text retrieval for any numeric or identifier-based
   question. Numbers in dense chunks may be paraphrased; tool results are exact.
2. Cite every claim. If a claim came from vector_search/bm25_search, cite
   [chunk N]. If from a deterministic tool, cite the tool's `_source` field.
3. If the tools return nothing useful, say "I don't have that information."
   Do NOT invent rehab activities, PCI values, or costs.
4. You can chain multiple tool calls in one turn (e.g. lookup_segment to get
   the PCI, then get_rehab_for_pci to get the recommended treatment, then
   get_unit_cost for the activity's price).
"""
```

### Step 2 — assemble the agent

```python
# agent/run_agent.py
import os
from dotenv import load_dotenv
load_dotenv()

from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate
from langchain.agents import AgentExecutor, create_tool_calling_agent

from tools.search_tools  import vector_search, bm25_search
from tools.excel_tools   import lookup_segment, find_segments_by_pci, get_rehab_for_pci
from tools.cost_tools    import get_unit_cost
from tools.pavepal_tools import lookup_pavepal
from agent.system_prompt import AGENT_SYSTEM_PROMPT

TOOLS = [
    vector_search, bm25_search,
    lookup_segment, find_segments_by_pci, get_rehab_for_pci,
    get_unit_cost,
    lookup_pavepal,
]

llm = ChatAnthropic(
    model="claude-sonnet-4-6",
    temperature=0,
    max_tokens=2048,
    anthropic_api_key=os.environ["ANTHROPIC_API_KEY"],
)

prompt = ChatPromptTemplate.from_messages([
    ("system", AGENT_SYSTEM_PROMPT),
    ("placeholder", "{chat_history}"),
    ("user", "{input}"),
    ("placeholder", "{agent_scratchpad}"),    # where tool calls + results go
])

agent = create_tool_calling_agent(llm, TOOLS, prompt)

agent_executor = AgentExecutor(
    agent=agent,
    tools=TOOLS,
    max_iterations=10,        # hard cap, mirrors Bidly's MAX_TOOL_ITERATIONS
    return_intermediate_steps=True,
    verbose=True,             # prints each tool call to stdout — turn off in prod
)

def ask(question: str, chat_history: list | None = None) -> dict:
    return agent_executor.invoke({
        "input": question,
        "chat_history": chat_history or [],
    })

if __name__ == "__main__":
    result = ask(
        "For GISID 1660, what's the PCI, what does the IMS rule book recommend, "
        "and roughly what would the rehab cost using 2024 unit prices?"
    )
    print("\n=== ANSWER ===")
    print(result["output"])
    print("\n=== TOOL CALLS ===")
    for step in result["intermediate_steps"]:
        action, observation = step
        print(f"  {action.tool}({action.tool_input}) → {observation[:120]}...")
```

### Step 3 — run a representative query end-to-end

A query like *"For GISID 1660, what's the PCI, what does the rule book recommend, and what would it cost in 2024?"* should produce a tool-call trace like:

```
1. lookup_segment(gisid=1660, vintage="2015")
   → {GISID: 1660, On Street: ABBY COURT, PCI: 78.9, FunCL: Residential, ...}

2. get_rehab_for_pci(pci=78.9, road_class="Residential", pavetype="Asphalt")
   → {activity: "Preventative Maintenance", code: 10, unit_rate: 0.25, ...}

3. get_unit_cost(line_item_keyword="surface preparation")
   → {matches: [{item: "Surface Preparation", mean_unit_price: 0.41, ...}]}

→ Final answer: "GISID 1660 (ABBY COURT) has a PCI of 78.9 [tool: lookup_segment].
   For a residential asphalt road in this PCI band (80-85), the IMS rule book
   recommends Preventative Maintenance at $0.25/yd² [tool: get_rehab_for_pci].
   2024 unit prices for surface prep average ~$0.41/yd² [tool: get_unit_cost],
   so cost has risen ~64% since the 2015 base rate. ..."
```

This is exactly the multi-step reasoning Phase 1 couldn't do.

### Step 4 — log everything (Phase 1's logger still works, with one addition)

Add an `intermediate_steps` field to the JSON-lines log so you can later analyze which tools the agent actually used:

```python
# chat/log.py  (add to log_turn signature)
def log_turn(question, answer, intermediate_steps, ...):
    record["tool_calls"] = [
        {"tool": s[0].tool, "input": s[0].tool_input, "output_preview": str(s[1])[:200]}
        for s in intermediate_steps
    ]
    ...
```

### Step 5 — run the gold-set evaluation

Same 30-question gold set from Phase 1. **Expected wins** in Phase 2:
- Numeric/identifier questions go from ~50% correct (Phase 1) to ~90% correct (Phase 2)
- Refusal calibration improves (the deterministic tools return errors when no data exists, so the agent has stronger evidence to refuse)
- Citations point to specific rows + sources, not just "GDOT_p042"

What might **regress** and to watch for:
- Per-turn cost rises 1.5–2× (more tokens because tool results sit in context)
- Latency rises 1.5–3× (per-tool round trips)
- Cost questions can confuse the agent if the keyword passed to `get_unit_cost` doesn't match any bid line — write fallbacks into the system prompt

---

## Phase 3 preview — Researcher → Verifier → Composer

Only build this if Phase 2's evaluation reveals one specific weakness: **the agent occasionally still hallucinates a number even with the deterministic tools available.** That's the gap a Verifier specifically closes.

### High-level diagram

```
                        User Q
                          │
                          ▼
          ┌────────────────────────────────┐
          │       Researcher Agent         │
          │                                │
          │  System prompt: "gather facts" │
          │  Has access to all 7 tools     │
          │  Output: structured evidence   │
          │  bundle + candidate answer     │
          └──────────────┬─────────────────┘
                         │ JSON: { evidence: [...],
                         │         candidate_answer: "..." }
                         ▼
          ┌────────────────────────────────┐
          │        Verifier Agent          │
          │                                │
          │  System prompt: "be skeptical" │
          │  DIFFERENT priors than         │
          │  Researcher; cross-checks      │
          │  every numeric claim against   │
          │  evidence; can re-call tools.  │
          │  Output: pass/fail + issues    │
          └──────────────┬─────────────────┘
                         │ JSON: { passes: bool,
                         │         issues: [...],
                         │         corrections: {...} }
                         ▼
          ┌────────────────────────────────┐
          │        Composer Agent          │
          │                                │
          │  System prompt: "write clearly │
          │  with citations + caveats"     │
          │  No tools; pure formatting.    │
          └──────────────┬─────────────────┘
                         │
                         ▼
                   Final answer
                  (with citations
                   + verifier caveats)
```

### High-level steps to build

| Step | What changes from Phase 2 |
|---|---|
| 1 | Define a JSON schema for the Researcher's evidence bundle (chunks + tool outputs + candidate answer + reasoning). |
| 2 | Researcher = Phase 2's agent, but its final output is structured (use Anthropic's tool-output forcing or a Pydantic schema). |
| 3 | Verifier = a fresh Claude call with no chat history, only the evidence bundle, prompted to find inconsistencies. Can re-invoke deterministic tools to spot-check numeric claims. |
| 4 | Composer = a third Claude call that takes (Researcher answer + Verifier corrections) and writes user-facing prose. |
| 5 | Persist Researcher and Verifier outputs to a Postgres `runs` table — this is the Bidly pattern, and it's how you debug what each agent produced. |

### What it actually buys you

| Property | Phase 2 (single agent + tools) | Phase 3 (Researcher → Verifier → Composer) |
|---|---|---|
| Hallucination rate on numeric claims | Low (tools handle most numbers) | Lower (Verifier flags any claim not backed by tool evidence) |
| Multi-step reasoning | Strong | Same |
| Latency / cost | 1× | 2.5–3× (3 LLM calls instead of 1) |
| Implementation complexity | ~500 LOC | +400 LOC + Postgres `runs` table |
| Debuggability | One conversation log per turn | One log per agent per turn — but each is cleaner |

### Honest framing

Phase 3 is the right call **only if** Phase 2's gold-set eval shows a specific hallucination rate you need to drive down. It is not a capstone-required tier. Most of the architectural value of multi-agent for this corpus is captured by tools + a strong system prompt — the Verifier is purely about catching the residual ~5–10% of numeric mistakes a single-agent setup will still make.

---

## What changes vs Phase 1 — short summary table

| Component | Phase 1 | Phase 2 | Phase 3 (stretch) |
|---|---|---|---|
| LLM model | `claude-sonnet-4-6` | `claude-sonnet-4-6` (with `.bind_tools()`) | Same model × 3 different prompts |
| LLM calls per turn | 1 | 2–4 | 3+ |
| Retrieval | Vector only (FAISS) | Vector + BM25 + 5 deterministic SQL tools | Same as Phase 2 + verifier re-invokes tools |
| State | None | None (single conversation) | Postgres `runs` table per agent step |
| Citation source | PDF page / Excel sheet | Page / sheet / row / tool name | Same as Phase 2 + verifier annotations |
| Code that's new | (baseline) | `tools/` directory + `agent/run_agent.py` | `verifier/`, `composer/`, schema for evidence bundle |
| Eval expected pass rate | 60–70% | 80–90% | 90–95% on numeric subset specifically |

---

## References (within this repo)

- [20260428_project_plan.md](20260428_project_plan.md) — Phase 1 build steps; Phase 2 reuses ingestion, chunking, FAISS index, embedding model
- [data_dict.md](../private_testing_repo/pavepal-capstone/data_dict.md) — exact header rows, sheet structures, GISID semantics, 4-vs-7-bucket category systems
- [bidly_reference/bidly_architecture.md](../bidly_reference/bidly_architecture.md) — the tool-use loop and agent-as-config-triple pattern this is modeled on
- [bidly_reference/true_rag_framework.md](../bidly_reference/true_rag_framework.md) — agentic RAG section maps onto this Phase 2 design
- `Lecture_notes/05_info-retrieval-intro-to-transformers.ipynb` — sparse / BM25 retrieval reference
- `Lecture_notes/07_llms-rag.ipynb` — LangChain + chunking + retriever pattern (reused)
- `Lecture_notes/08_llms-tools-and-multimodal.ipynb` — `create_tool_calling_agent` pattern and the agentic loop
