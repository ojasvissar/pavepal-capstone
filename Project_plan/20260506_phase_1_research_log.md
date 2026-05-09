# Phase 1 Project Plan — Knowledge Hub (working doc)

**Date:** 2026-05-06
**Status:** Not set in stone. This is a knowledge hub capturing the **options, evidence, and trade-offs** behind each Phase 1 decision — so we can revisit any pick once we have eval data.
**Supersedes:** [Project_plan/archive/20260429_project_plan_phase_1.md](Project_plan/archive/20260429_project_plan_phase_1.md) (archived). The old plan is kept for historical context; this doc is now the source of truth for Phase 1 picks.

---

## Running example — page 21 of GDOT

Throughout this doc we use **page 21 of the GDOT PDF** (*Part 3: Fog Seal Field Test Study*) as a concrete example. Here is the raw `pypdf` extract for that page (top portion):

```
 
4 
 
 
Part 3: Fog Seal Field Test Study 
The third part of this report presents the field test study of fog seal. Thirteen test sites on I-475 
with different raveling conditions (very light, light, medium, severe with a loss of aggregates 
ranging from 0%-20%; GDOT defined all of them to be Severity Level 1) were selected for 
conducting various field tests, including locked-wheel friction test, IRI test, and visual inspection 
of aggregate loss test. The following tests summarize the major research findings: 
Friction Tests 
• A pavement’s surface friction decreases right after fog seal application. Based on 
measurement results, the skid number (SN) decreases about 45% immediately after the fog 
seal application. 
• The SN recovers to 30-35 in 2-4 days, and 35 or above in 5-7 days after fog seal application. 
...
```

§3.1 references this to discuss pypdf's output quirks. §3.2 uses one snippet from this page to walk through dense-vs-sparse preprocessing.

---

## Running example — JSON records

§4 references two real records (one from each file) to walk through the flattening decisions.

**`roadSegments` record 1** — a "full" record with 40 fields:

```json
{
  "name": "PEACHTREE INDUSTRIAL BLVD ACCESS RD",
  "ROADCLASS": "Major Arterial",
  "speed_limit": 55,
  "length": 94.92,
  "MUNILEFT": "NORCROSS", "ZIPLEFT": "30071",
  "defects": {"transverse cracks": 5, "longitudinal cracks": 12},
  "pci": 82, "pci_category": "Very Good", "raw_pci": 179.10,
  "centerline_id": "222121", "osmid": 1000,
  "EVEN_HAND": "L", "LAR": "L", "LAR_DIR": "NB", "QUAD": "NW",
  "FROMLEFT": 6450, "TOLEFT": 6458, "FROMRIGHT": 0, "TORIGHT": 0,
  "ESNLEFT": "196", "ESNRIGHT": "196", "MSAGLEFT": "NORCROSS",
  "FEDROUTE": null, "STROUTE": null, "ONEWAYDIR": "To-From",
  "ROW_WIDTH": 0.0, "STREETNAME": "RD-69088",
  "geometry": {"type": "LineString", "coordinates": [[-84.241, 33.943], [-84.240, 33.944]]}
}
```

**`locations` record 0** — a sparse 7-field record:

```json
{
  "name": "GX010224_time_4_00250",
  "image_path": "session_1/05142025/.../GX010224_time_4_00250.jpg",
  "defects": {"transverse cracks": 1, "manhole covers": 1},
  "road_name": "ENGINEERING DR",
  "geometry": {"type": "Point", "coordinates": [-84.225, 33.961]},
  "road_id": "68d703...", "region_id": "usa_georgia_peachtree-corners"
}
```

The two schemas are wildly different — that's why we have two flatten templates, not one. §4.1–§4.4 reference these records to show how each decision applies. §4.4's edge-case discussion uses a third record (`roadSegments` record 0 — River Trail Dr) shown inline there.

---

## 1. Scope

Phase 1 = a hybrid RAG pipeline grounded in the **GDOT Pavement Preservation Guide** (chunked PDF) plus the partner's **road-condition data** (`roadSegments` and `locations` JSONs, flattened to natural-language sentences and embedded record-by-record).

| Component | Owner | Status | Notes |
|---|---|---|---|
| GDOT PDF processing | Ojasv | **Drafted in §3** | Parser, asymmetric preprocessing (dense vs sparse), per-page chunking, query-side symmetry |
| JSON flattening | Ojasv | **Drafted in §4** | Each record → one natural-language sentence → one chunk → one vector. Joins GDOT chunks in the same vector store. ~22,800 JSON vectors + ~520 GDOT chunks ≈ ~23K total. |
| Dense embedding | William | **Drafted in §5** | Model + vector store + source-aware retrieval policy |
| Sparse retrieval (BM25) | Claudia | **Drafted in §6** | Library + tokenization + why BM25 over learned sparse |
| Fusion (RRF) | Diana | **Drafted in §7** | Algorithm choice + tuning parameters + library |
| Generator (LLM) | Team | **Decided: Gemini 2.5 Pro** | Native tool use, strong refusal calibration, 1M context, free Studio tier for dev |

---

## 2. High-level pipeline (text-only)

```
ONE-TIME INDEXING
  GDOT PDF → extract text → chunk → embed each chunk → store in vector DB
                                  → tokenize each chunk → BM25 sparse index

PER USER QUESTION
  Question → embed (dense) + tokenize (sparse)
           → top-K from Chroma  +  top-K from BM25
           → fuse with RRF → top-N chunks
           → prompt + chunks → Gemini 2.5 Pro → cited answer
```

Two non-obvious invariants:
- **Same embedding model** is used for chunks at index time AND for the user question at query time. Mixing models breaks the vector space.
- **Same chunk list** feeds both indices. If the BM25 index and the Chroma index are built over different chunks, RRF fuses incompatible rankings.

---

## 3. PDF parsing and chunking (Owner: Ojasv)

### 3.1 Parser library

| Library | Strengths | Weaknesses |
|---|---|---|
| **`pypdf` (via LangChain `PyPDFLoader`)** | Pure Python, lightweight, lecture-07 default, fast (~5s for 470 pages), page-aware | Loses text in complex tables; no layout understanding |
| `pdfplumber` | Excellent table extraction without ML; preserves layout positions | Slower; older API |
| `PyMuPDF` (fitz) | Fastest; bookmarks, fonts, links | C-based; AGPL license complications |
| `Unstructured.io` | ML-powered layout-aware extraction (tables, images, headings) | Heavy install (PyTorch); slow (~10s/page); many transitive deps |
| `Docling` (IBM) | Best-in-class table parsing; outputs structured Markdown | Requires ONNX model download; newer |
| `LlamaParse` | Very accurate on hard PDFs | Hosted API, per-page cost, network dependency |
| Vision LLM (Gemini, Claude) | Highest accuracy on tables + diagrams | Slow + expensive (~$0.01–0.05 per page) |

**Pick: `pypdf` via `PyPDFLoader` as default; `pdfplumber` as a targeted fallback for table-heavy pages.**

| Reason | Detail |
|---|---|
| Lecture-07 alignment | Team has worked examples |
| Simple install | Already in env stack |
| Fast | ~5s for the entire 470-page GDOT extract |
| Page metadata for free | Each page becomes a `Document` with `metadata["page"]` populated — citations work out of the box |
| Good enough for prose | GDOT is mostly prose with treatment descriptions |

**Fallback plan if eval reveals table loss:** identify the specific GDOT pages with critical tables (treatment cost matrices, decision tables — usually 10–30 of 470). Re-extract those with `pdfplumber.Page.extract_table()`, render as Markdown, feed into the same chunking pipeline. Don't replace pypdf wholesale — supplement it where needed.

#### How pypdf and pdfplumber differ mechanically

The fundamental difference is what each tool *sees* in a page:

| | **pypdf** | **pdfplumber** |
|---|---|---|
| Mental model | Page = stream of text in reading order | Page = 2D grid of characters with `(x, y)` coordinates |
| How it extracts text | Walks the PDF's text-drawing instructions, glues glyphs into lines | Same, but also tracks where each character sits on the page |
| Tables | No concept of them — cells become run-on text in whatever order it guesses | Detects tables by finding *vertically aligned* characters (= columns), returns structured `[[row], [row], ...]` arrays |
| Output for a 5-col table | `"5 12 4 8 3"` mangled together | `[["transverse", "longitudinal", ...], [5, 12, ...]]` structured |
| Speed | Fast (no layout analysis) | Slower (does layout analysis) |
| Output for prose | Fine | Fine |

**Plain version:** pypdf reads the PDF like a flat text file. pdfplumber reads it like a spatial layout — that spatial awareness is what lets it reconstruct tables.

#### Shared blind spot — images

Both tools only handle PDFs where text exists *as text*. If a GDOT page is a scanned image or a pure-image flowchart, neither extracts anything meaningful — there's nothing in the PDF stream to walk through. For those pages we'd need either:

| Tool | Notes |
|---|---|
| OCR (Tesseract via `pytesseract`) | Free, local. Decent on clean scans, brittle on tables. |
| Vision LLM (Gemini 2.5 Pro on the page image) | Highest quality. ~$0.005–0.02 per page; ~$2–5 to process the entire 470-page GDOT once. |

**Default plan:** stay with pypdf + pdfplumber. Only escalate to vision-LLM if the T1 probe ([working log](20260506_working_log.md)) finds substantial image-only content in GDOT.

#### Concrete artifacts in pypdf's output

Looking at the *Running example* (page 21 extract at the top of this doc), a few real-world quirks worth flagging — these are the kinds of artifacts pypdf produces and that downstream code has to live with:

- A stray `" 4 "` line at the top — that's the in-document page number ("Part 3, page 4"), not the PDF page number
- Bullets rendered as `• ` (a Unicode bullet character followed by space)
- Curly apostrophe in `pavement's` (Unicode `’`, not ASCII `'`)
- Trailing spaces on every line, and multiple blank lines
- Hard-wrapped lines (every ~85 chars) that need to be re-flowed before they read as paragraphs

These survive into the chunk verbatim — pypdf doesn't clean any of it. None of these break the pipeline (BGE handles bullets and curly quotes fine; BM25's `\w+` regex strips them). But it means the chunk is *not* pristine prose, and any debug printout will show these warts.

### 3.2 Preprocessing — asymmetric for dense vs sparse

The meeting note's instinct (*"removing stop words, lemmatization etc"*) needs re-examination for modern hybrid RAG. The two retrieval paths want different preprocessing:

| Step | Dense (BGE) | Sparse (BM25) | Why |
|---|---|---|---|
| **Lemmatization** (`running` → `run`) | **Don't** | **Don't** | Modern transformers handle morphology natively. For BM25, lemmatization risks merging meaningful distinct terms (e.g. *"reseal"* vs *"resealing"*). Negligible recall benefit, real precision loss. |
| **Stopword removal** | **Don't** | Skip — usually | BGE was trained on full prose. BM25's TF-IDF already deweights common words automatically. |
| **Lowercasing** | Don't need to — model is case-aware | **Yes** | BM25 is exact-token matching, so `"PCI"` and `"pci"` need to match. |
| **Punctuation stripping** | Don't | Yes — but keep digits | BM25 tokenizer: `re.findall(r"\w+", text.lower())` — preserves digits (so `"GISID 1660"` matches), drops punctuation. |
| **Special tokens** (URLs, identifiers) | Leave intact | Leave intact | These are exactly the cases BM25 catches that BGE misses. |

**Pick:**

| Path | Preprocessing |
|---|---|
| Dense (BGE) | **None.** Feed raw chunked text directly to the embedder. |
| Sparse (BM25) | Lowercase + simple regex tokenize: `re.findall(r"\w+", text.lower())`. No lemmatization, no stopword removal. |

This is the same approach the old plan used — a deliberate modern choice, not a gap. Classical IR (BM25-only era) DID benefit from lemmatization + stopword removal, but modern hybrid RAG has dense covering the paraphrase channel, so sparse can stay simple.

#### Pipeline location of preprocessing

Preprocessing sits AFTER parsing (and after chunking), and **diverges per retrieval path**:

```
PDF
 │
 ▼
┌─────────────┐
│  PARSING    │  pypdf reads the PDF binary, returns text per page
│  (pypdf)    │
└──────┬──────┘
       │  raw page text + page metadata
       ▼
┌──────────────────────────────────────┐
│         CHUNKING (500 tok)           │  same chunk list feeds both paths
└──┬────────────────────────┬──────────┘
   │                        │
   ▼ DENSE PATH             ▼ SPARSE PATH
┌───────────────┐         ┌──────────────────────┐
│ Preprocessing │         │  Preprocessing       │
│   = NONE      │         │  lowercase + \w+     │
└──────┬────────┘         └──────────┬───────────┘
       │                             │
       ▼                             ▼
   BGE embed                     BM25 token list
   → 768-d vector                → ["word", "word", ...]
       │                             │
       ▼                             ▼
   Chroma index                  rank-bm25 index
```

#### Worked example — one snippet from page 21

Take this snippet from the *Running example* (page 21 extract at the top of this doc):

> *"A pavement's surface friction decreases right after fog seal application."*

| Path | Preprocessing | Result |
|---|---|---|
| **Dense (BGE)** | None — raw text in | `"A pavement's surface friction decreases right after fog seal application."` (unchanged) |
| **Sparse (BM25)** | `re.findall(r"\w+", text.lower())` | `["a", "pavement", "s", "surface", "friction", "decreases", "right", "after", "fog", "seal", "application"]` |

What changed in the sparse path:
- Lowercased everything
- Stripped the apostrophe (so `pavement's` → `pavement` + `s` — note the orphan `s` token)
- Stripped the period
- Split on whitespace into a list

#### Why those choices — for *each* path

**Why dense (BGE) does NOT preprocess:**

| Concern | Reason |
|---|---|
| BGE was trained on full prose | The model *learned* what apostrophes, casing, and morphology mean. Stripping them changes the input distribution from what the model expects. |
| Case carries meaning | `"PCI"` (an acronym) and `"pci"` (the same acronym lowercased) both map to similar vectors anyway. BGE handles it. |
| Morphology handled natively | `"resealing"` and `"reseal"` end up as nearby vectors automatically. Lemmatization would offer almost no gain. |
| Stopwords are signal too | Stopwords help disambiguate sentence structure; removing them can flatten meaning. |

**Why sparse (BM25) DOES preprocess:**

| Concern | Reason |
|---|---|
| BM25 is **exact token matching** | If query says `"PCI"` and chunk says `"pci"`, they don't match unless both are lowercased. So lowercasing is required for case-insensitive search. |
| Punctuation is noise | BM25 treats `"application"` and `"application."` as different tokens unless we strip the period. The `\w+` regex does that cleanly. |
| Digits matter — keep them | `\w+` preserves digits, so `"I-475"` becomes `["i", "475"]` and `"45%"` becomes `["45"]`. Both still searchable. |
| Why NO stopword removal | BM25's IDF math automatically de-weights words that appear in many documents (= stopwords). Manual removal is redundant. |
| Why NO lemmatization | In pavement terminology, `"reseal"` and `"resealing"` are often used to describe the same concept but in different grammatical roles. The dense channel already covers paraphrase; sparse should keep terms exact. Merging them via lemmatization can blur precise terminology like `"fog seal"` vs `"chip seal"`. |

#### Concrete payoff for page 21

Imagine the user query: *"How long for friction to recover after a fog seal?"*

| Path | What happens |
|---|---|
| Dense (BGE) | Query embedding sits close to the embedded chunk that says *"The SN recovers to 30-35 in 2-4 days..."* — even though the chunk uses *"recovers"* not *"recover"*, and *"SN"* not *"friction"*. Semantic similarity bridges the vocabulary gap. |
| Sparse (BM25) | `["fog", "seal", "friction"]` from the query overlap with `["fog", "seal", "friction"]` in the chunk's token list. Exact-match win on the rare term *"fog seal"*. |

Each path catches what the other might miss. That's the whole point of running them in parallel and fusing — and why their preprocessing intentionally diverges.

### 3.3 Chunking strategy

GDOT gets chunked into **500-token chunks with 50-token overlap.** Two further choices to lock in:

#### Per-page chunking

`PyPDFLoader` returns one `Document` per page (with `page` metadata). Chunk those page-Documents *individually* — that way no chunk ever spans two pages.

| Approach | Behaviour |
|---|---|
| **Per-page chunking** ✅ | A 600-token page → 1 chunk + 100-token overlap-tail; a 1,200-token page → 2–3 chunks. **Citations always point to one page.** |
| Document-level chunking | Concatenate all 470 pages, then chunk uniformly. Chunks may span pages. Citations become "pages 47–48" — messier. |

#### Separators

LangChain default for `RecursiveCharacterTextSplitter`: `["\n\n", "\n", ". ", " ", ""]` — try paragraph break, then line break, then sentence, then word, then character. Works for GDOT prose because pypdf typically inserts `\n\n` between paragraphs. No customization unless we observe weird splits during sanity check.

#### Worked example — page 21 (the small-page case)

Page 21 = ~260 tokens. The 500-token number is a **ceiling, not a target** — so page 21 produces **ONE chunk of 260 tokens**, NOT padded with content from page 22.

```
PAGE 21 (260 tok)        PAGE 22 (~350 tok)
   │                         │
   ▼                         ▼
Chunk_21 (260 tok)       Chunk_22 (350 tok)
   ↓                         ↓
 1 vector                 1 vector
 metadata.page=21         metadata.page=22
```

No bleed across page boundaries. Each chunk's citation is unambiguous. The splitter never fires on page 21 because the page is already under the chunk-size ceiling.

#### Worked example — a larger page (the splitter fires)

If a page is **700 tokens** (denser content), the splitter produces 2 chunks within that page:

| Chunk | Token range | Size |
|---|---|---|
| A | 0 – 499 | 500 |
| B | 450 – 699 | 250 |

The **50-token overlap** (tokens 450–499 appear in both A and B) bridges any mid-paragraph cut — if a sentence happens to cross the 500-token line, neither chunk loses it entirely.

For a 1,200-token page → 3 chunks: 500 + 500 (with 50 overlap) + 300.

#### Why 500 specifically — BGE's input cap

Three layered reasons, in order of importance:

| Reason | Detail |
|---|---|
| **1. BGE-base input cap = 512 tokens** | Anything past 512 gets *silently truncated* — the tail of the chunk simply disappears from the embedding vector. 500 leaves a 12-token safety margin for BGE's special tokens (`[CLS]`, `[SEP]`). This is the hard ceiling. |
| 2. Content size match | Pavement-guide treatment descriptions tend to be one focused paragraph — empirically ~300–500 tokens. 500 captures one cleanly. |
| 3. Granularity sweet spot | 200-token chunks are too narrow (split-paragraph risk, index bloat); 800-token chunks already truncate in BGE-base AND blur the embedding. 500 sits in the middle. |

If we ever swapped to a larger-input embedder (e.g., `text-embedding-004` at 2,048 tokens, or `bge-large`), chunk size could grow proportionally. **Chunk size is bound to the embedder's input cap, not chosen in isolation.**

#### Trade-offs of per-page chunking — and how overlap helps

Per-page chunking gives **clean, unambiguous citations** (*"page 21"*, not *"pages 21–22"*). The cost: a topic that spans a page break ends up split across two separate chunks.

Two mitigations cover the realistic failure modes:

| Mitigation | What it covers |
|---|---|
| **50-token overlap between chunks on the same page** | Catches mid-paragraph splits *within* a long page (e.g., a 700-token page producing 2 chunks). Note: overlap does NOT cross page boundaries — it lives strictly inside one page's chunk list. |
| **Hybrid retrieval (BM25 + dense fusion)** | Catches cross-page topic splits — both page 21's chunk and page 22's chunk will rank highly for a query about the topic, RRF surfaces both, and the LLM sees both at answer time. |

The trade-off (clean citations + minor cross-page narrative loss) is intentional, and it works well in our setup because we have a hybrid retriever, not dense alone.

> **Worth knowing for later:** Gemini 2.5 Pro accepts images natively. So even without multimodal embeddings, there's a Phase-1.5 option: when retrieval surfaces a chunk that references *"Figure 3.2"*, attach the actual image to the prompt at *answer time*. No vector-space alignment needed.

### 3.4 PDF processing summary

| Decision | Pick |
|---|---|
| Parser | `pypdf` via `PyPDFLoader`; `pdfplumber` table-page fallback |
| Dense preprocessing | None — raw text into BGE |
| Sparse preprocessing | Lowercase + regex word tokenize, preserve digits |
| Chunking | Per-page, 500-tok chunks, 50-tok overlap, default separators |

### 3.5 Query-side processing

§3.2 specifies how index-side chunks are preprocessed. The user query needs the **same** treatment on the BM25 side, plus a **query-only prefix** on the BGE side. Both are silent failure modes — get them wrong and retrieval degrades without raising any error.

The two symmetry rules at a glance:

| Channel | Index-side | Query-side |
|---|---|---|
| Sparse (BM25) | `re.findall(r"\w+", text.lower())` | **Same tokenizer** — must match exactly |
| Dense (BGE) | Raw chunk text | **Prefix prepended:** `"Represent this sentence for searching relevant passages: "` + raw query |

#### Rule 1 — BM25 query tokenization must match the index

`rank-bm25` accepts a token list at both index time and query time. It does NOT enforce that the two were produced by the same tokenizer. Index with `re.findall(r"\w+", text.lower())` but query with `query.split()` and BM25 happily returns 0 hits for queries that should obviously match.

**Worked example.** User asks: *"What's the cheapest fix for PCI 65?"*

| Query tokenizer | Tokens passed to BM25 | Matches indexed `["pci", "65", ...]`? |
|---|---|---|
| `query.split()` (naive) | `["What's", "the", "cheapest", "fix", "for", "PCI", "65?"]` | **No** — `"PCI"` uppercase, `"65?"` has trailing punctuation |
| **`re.findall(r"\w+", q.lower())`** ✅ | `["what", "s", "the", "cheapest", "fix", "for", "pci", "65"]` | **Yes** |

**Pick:** define the tokenizer once and call the same function at index time and query time. One source of truth — no copy-paste between the two paths.

#### Rule 2 — BGE query prefix

`BAAI/bge-base-en-v1.5` was trained with **asymmetric encoding** — queries had a fixed prefix prepended at training time, passages did not. The model card explicitly recommends keeping that prefix at inference time.

Without the prefix, the query vector lands in a different region than where BGE was trained to put queries — measurable retrieval drop (~2–5 MTEB points typical). One of the most common reasons people report *"my BGE retrieval is mediocre"* online.

LangChain's `HuggingFaceEmbeddings` handles the asymmetry via a `query_instruction` parameter:

```python
embedder = HuggingFaceEmbeddings(
    model_name="BAAI/bge-base-en-v1.5",
    query_instruction="Represent this sentence for searching relevant passages: ",
)
# embedder.embed_documents(chunks) → no prefix
# embedder.embed_query(question)   → prefix added automatically
```

**Pick:** use `HuggingFaceEmbeddings` with `query_instruction` set. Don't hand-roll the embed call without it.

This isn't unique to BGE — E5, GTE, and most retrieval-tuned encoders have analogous prefixes. If we ever swap the embedding model, check its model card for the equivalent.

---

## 4. JSON flattening (Owner: Ojasv)

### 4.1 Why flatten + embed at all (vs just reading the JSON)?

The question is what you can *search* by. A JSON reader gives you the file in memory; it doesn't help you find anything.

| Approach | What you can ask |
|---|---|
| Read JSON, no index | Nothing — you'd have to scan 22,789 records yourself |
| Read JSON, exact match by field | Only field-equality queries: `road_name == "ENGINEERING DR"` ✓ but `"tell me about cracked roads"` ✗ |
| **DB (SQL)** | Exact filters, ranges, joins, aggregations — *"WHERE pci < 60"* ✓. The path the team considered first. |
| **Embed flattened JSON (current pick)** | Semantic similarity over arbitrary phrasings — *"roads with bad cracks"* matches *"transverse cracks: 5, longitudinal cracks: 12"* without the word "bad" |

The team's pick to embed is choosing **semantic search** as the access pattern. Embedders take text (not Python dicts), so we *flatten* — convert `{"pci": 82, "defects": {...}}` into a sentence the embedding model can process.

**Trade-off accepted:** aggregation queries (*"how many roads are Poor?"*) become weak in the embed-only path. If those matter heavily in Phase 1 demos, the DB path would have been the better call.

#### Worked example — query on record 1

User asks: *"Which roads have a lot of cracking?"*

| Approach | Outcome on `roadSegments` record 1 (Running example) |
|---|---|
| SQL `WHERE defects LIKE '%cracking%'` | **Misses it** — the field stores `"transverse cracks"` and `"longitudinal cracks"`, not the word `"cracking"` |
| Embed *"Detected defects: 5 transverse cracks, 12 longitudinal cracks"* | **Hits it** — BGE knows `"cracks"` and `"cracking"` are semantically near; *"a lot"* maps near *"5 + 12 = 17"* in vector space |

That gap is the reason we embed at all — SQL needs literal token match, semantic search bridges paraphrase.

### 4.2 What fields go into the embedded text

| | (a) Minimal | (b) Everything | (c) Minimal-in-text + Everything-in-metadata |
|---|---|---|---|
| Embedded text contains | ~10 meaningful fields | All 40 fields | ~10 meaningful fields |
| Queryable via Chroma metadata filter | Only those 10 | All 40 | All 40 |
| Embedding noise | Low | High — junk fields dilute the vector | Low |
| Future filter flexibility | Limited | Full | Full |

**Pick: (c) minimal-in-text + everything-in-metadata.**

Embedded text is for *semantic similarity* — junk fields like `EVEN_HAND: 'L'` dilute the vector. Metadata is for *structured filtering* — Chroma can do `where={"pci": {"$lt": 60}}` without needing those fields embedded. So including everything in metadata costs almost nothing and unlocks full filter flexibility.

For `roadSegments`:

| Category | Examples | In embedded text? |
|---|---|---|
| Human-meaningful | `name`, `road_class`, `pci`, `pci_category`, `defects`, `length`, `municipality`, `zip`, `speed_limit` | **Yes** |
| GIS internals | `centerline_id`, `osmid`, `EVEN_HAND`, `LAR`, `LAR_DIR`, `QUAD` | No — meaningless to humans/LLM |
| Address ranges | `FROMLEFT`, `TOLEFT`, `FROMRIGHT`, `TORIGHT` | No — numeric ranges with no retrieval value |
| Emergency / 911 | `ESNLEFT`, `ESNRIGHT`, `MSAGLEFT`, `MSAGRIGHT` | No — no Phase 1 question references these |
| Mostly-null routes | `FEDROUTE`, `STROUTE`, `FEDRTETYPE`, `STRTETYPE` | No — null for most segments |

For `locations`: only `road_name` and `defects` go to embedded text. `image_path` and `name` (image ID) go to metadata only.

#### Worked example — classifying record 1's 40 fields

Applying this principle to the *Running example* `roadSegments` record 1, with actual values shown:

| Category | Fields with values | In embedded text? |
|---|---|---|
| Human-meaningful | `name` *(PEACHTREE INDUSTRIAL BLVD ACCESS RD)*, `ROADCLASS` *(Major Arterial)*, `pci` *(82)*, `pci_category` *(Very Good)*, `defects` *(5 transverse, 12 longitudinal)*, `MUNILEFT` *(Norcross)*, `ZIPLEFT` *(30071)*, `speed_limit` *(55)*, `length` *(95 m)* | **Yes** |
| GIS internals | `centerline_id` *(222121)*, `osmid` *(1000)*, `EVEN_HAND` *(L)*, `LAR` *(L)*, `LAR_DIR` *(NB)*, `QUAD` *(NW)*, `STREETNAME` *(RD-69088)* | No |
| Address ranges | `FROMLEFT` *(6450)*, `TOLEFT` *(6458)*, `FROMRIGHT` *(0)*, `TORIGHT` *(0)* | No |
| Emergency / 911 | `ESNLEFT` *(196)*, `ESNRIGHT` *(196)*, `MSAGLEFT` *(NORCROSS)*, `MSAGRIGHT` *(NORCROSS)* | No |
| Mostly-null routes | `FEDROUTE` *(null)*, `STROUTE` *(null)*, `ONEWAYDIR` *(To-From)* | No |

If we dumped all 40 fields into the embedded sentence, the meaningful parts (*Major Arterial, PCI 82, transverse cracks*) would drown in noise like `EVEN_HAND L, LAR L, LAR_DIR NB, QUAD NW, FROMLEFT 6450, TOLEFT 6458`. But every field still goes to `metadata` — Chroma can later filter on any of them: `where={"pci": {"$lt": 60}}`, `where={"ZIPLEFT": "30071"}`, `where={"ROADCLASS": "Major Arterial"}`.

### 4.3 Template style

| Style | Example | For embedding |
|---|---|---|
| **A — Template natural sentence** ✅ | *"Peachtree Industrial Blvd Access Rd is a Major Arterial road in Norcross (zip 30071), 95 m long, speed limit 55 mph. PCI 82 (Very Good). Detected defects: 5 transverse cracks, 12 longitudinal cracks."* | **Best** — embedders trained on prose |
| B — Key-value flat | `name: PEACHTREE... \| road_class: Major Arterial \| pci: 82 \| ...` | OK — less natural |
| C — Raw JSON-as-text | `{"name": "PEACHTREE...", "pci": 82, ...}` | Worst — punctuation tokens dominate |

**Pick: (A).** One template per source file (one for `roadSegments`, one for `locations`), applied to every record.

### 4.4 Edge-case handling

Real records aren't always clean — fields can be null, empty, or non-text. §4.4 specifies, for each kind of brokenness, exactly what the flattener does so the embedded sentence never reads as broken English.

| Field state | Final pick | Why |
|---|---|---|
| `pci` is null or missing (~25% of `roadSegments`) | Drop the PCI clause from the sentence. Set `metadata.pci = null`. | Road is still searchable by name, road class, etc. PCI-filter queries (`where pci < 60`) cleanly exclude nulls. |
| `defects` is `{}` (empty dict) | Render explicitly as *"No defects detected."* | Absence is meaningful — *"which roads have no defects?"* needs something to embed against. |
| `road_name` is null on a `locations` record | Drop the road_name clause from the sentence. Keep in metadata. | *"Inspection point on null"* reads as broken text — better to render only the defects clause. |
| Geometry (LineString / Point coords) | Never in the sentence. Optionally in metadata as GeoJSON for Phase 2 spatial. | Coordinates like `[-84.21, 33.97]` carry no semantic meaning to a language model. |

#### Worked example — record 0 (River Trail Dr) hits two of these at once

The first record in `roadSegments` triggers two rules simultaneously:

```json
{
  "name": "RIVER TRAIL DR",
  "ROADCLASS": "Private",
  "speed_limit": 25,
  "MUNILEFT": "PEACHTREE CORNERS", "ZIPLEFT": "30092",
  "length": 40.31,
  "defects": {}
  // pci, pci_category, raw_pci all MISSING entirely
}
```

What fires:
- **Empty `defects`** → render explicitly as *"No defects detected."*
- **Missing `pci`** → drop the PCI clause silently

Final flattened sentence:

> *"River Trail Dr is a Private road in Peachtree Corners (zip 30092), 40 m long, speed limit 25 mph. **No defects detected.**"*

Net result: the record stays in the corpus, doesn't break any queries, and contributes meaningfully to *"roads with no defects"* searches.

### 4.5 Concrete output (what one flattened chunk looks like)

```python
# roadSegments record → flattened Document
Document(
    page_content=(
        "Peachtree Industrial Blvd Access Rd is a Major Arterial road "
        "in Norcross (zip 30071), 95 m long, speed limit 55 mph. "
        "PCI score 82 (Very Good). "
        "Detected defects: 5 transverse cracks, 12 longitudinal cracks."
    ),
    metadata={
        "source": "roadSegments",
        "kind": "road_segment",
        "centerline_id": "222121",
        "name": "PEACHTREE INDUSTRIAL BLVD ACCESS RD",
        "road_class": "Major Arterial",
        "speed_limit": 55,
        "length_m": 94.91,
        "pci": 82, "pci_category": "Very Good", "raw_pci": 179.10,
        "owned_by": 1, "maint_by": 1,
        "municipality": "NORCROSS", "zip": "30071",
        # geometry omitted from text; GeoJSON in metadata if needed
    }
)

# locations record → flattened Document
Document(
    page_content=(
        "Inspection point on Engineering Dr. "
        "Detected defects: 1 transverse crack, 1 manhole cover."
    ),
    metadata={
        "source": "locations",
        "kind": "inspection_point",
        "name": "GX010224_time_4_00250",
        "road_name": "ENGINEERING DR",
        "image_path": "session_1/05142025/.../GX010224_time_4_00250.jpg",
    }
)
```

---

## 5. Dense Embedding component (Owner: William)

### 5.1 What dense embedding is (in plain language)

A dense embedding is a fixed-length list of floats (e.g. 768 numbers) that represents the *meaning* of a piece of text. Feed text into a small encoder neural network → out comes a vector. Two pieces of text with similar meaning → two vectors close together in the high-dimensional space.

Once every chunk of GDOT has a vector, *"find the most relevant chunk for this question"* becomes *"find the chunk whose vector is closest to the question's vector."*

```
"Asphalt pavement rehabilitation methods"  → [0.12, -0.34, 0.81, ..., 0.05]   (768 floats)
"Repair techniques for roads"               → [0.15, -0.30, 0.79, ..., 0.07]   ← nearby!
"Recipe for chocolate cake"                 → [-0.42, 0.66, -0.11, ..., 0.88]  ← far away
```

The model has been pretrained on huge amounts of text so that synonyms, paraphrases, and topically-related sentences end up near each other — even when they share no exact words. That's the *semantic* part of semantic search.

### 5.2 Embedding model selection — MiniLM vs BGE-base

The two leading **local, free** options that came up:

| | `sentence-transformers/all-MiniLM-L6-v2` | `BAAI/bge-base-en-v1.5` |
|---|---|---|
| Publisher | UKP Lab (TU Darmstadt) | BAAI (Beijing Academy of AI) |
| Released | 2021 | 2023 |
| Training objective | General sentence similarity | **Retrieval (contrastive on query–passage pairs)** |
| Parameters | 22M | 110M |
| Output dim | 384 | 768 |
| MTEB retrieval avg | ~41 | ~53 |
| Disk size | ~80 MB | ~440 MB |
| Loadable via | Same `sentence-transformers` library | Same `sentence-transformers` library |

#### What "retrieval-tuned" means (and why BGE wins for RAG)

This is the most important difference. Embedding models all output vectors, but the **training objective** determines what kind of similarity they actually capture.

| Training objective | What it learns to put close together |
|---|---|
| **General sentence similarity** (older sentence-transformers models like MiniLM) | Two sentences that humans labeled as "saying the same thing" — *"I love dogs"* near *"Dogs are great"* |
| **Retrieval (contrastive)** — BGE, E5, GTE | A short *query* and a long *passage that answers it*, even when they look nothing alike — *"how to fix asphalt cracks"* near a 200-word paragraph titled *"Crack Sealing Procedures"* |

In RAG, queries and passages are **asymmetric**:

- Query is short, often a question, casual: *"What's the cheapest fix for PCI 65?"*
- Passage is long, declarative, technical: *"For asphalt pavement with PCI between 60 and 70, recommended treatments include thin overlay, microsurfacing, or chip seal..."*

A model trained only on symmetric (sentence ≈ sentence) pairs hasn't been taught to bridge that style/length gap. BGE was — its training data was *exactly* (query, positive-passage, negative-passage) triples, with the model pulled toward the positive and pushed away from the negative. That's contrastive learning; it's what makes BGE retrieval-tuned.

The MTEB retrieval gap (~12 points) is the concrete, measurable consequence.

#### "sentence-transformers" name confusion

`sentence-transformers` is overloaded — it's **two different things**:

| Meaning | Concretely |
|---|---|
| (a) A Python **library** | `pip install sentence-transformers` — an inference wrapper. Loads any embedding model. Not a rival to BGE. |
| (b) A Hugging Face **namespace / publisher account** | `sentence-transformers/all-MiniLM-L6-v2`, etc. Older general-purpose models live here. BGE lives under `BAAI/`. |

So **the real comparison is MiniLM vs BGE — two specific models**, both loadable from the same Python library. "Sentence-transformers" is just a tool, not a competitor.

#### Does the choice of generator (Gemini) affect the embedding model?

Barely. They're independent:

| | Embedding model | Generator (Gemini) |
|---|---|---|
| Architecture | Encoder-only | Decoder-based |
| Output | One fixed-length vector per input | A stream of tokens |
| Sees the other? | Embeddings never reach Gemini. Only the *retrieved chunks of text* do. | Gemini doesn't know which embedding model fetched its context. |

The only "match Gemini" benefits to using Google's `text-embedding-004`:
- One API key for both calls (less env-var sprawl)
- Single billing dashboard

That's all. Vector quality is independent of generator quality.

#### Local vs API — what about Google's `text-embedding-004`?

Once we go beyond MiniLM-vs-BGE local picks, the natural next question: *should we use a hosted API model instead, especially Google's since we're already on Gemini for generation?* Worth treating as a real alternative we evaluated, not a footnote.

| | `BAAI/bge-base-en-v1.5` (local) | Google `text-embedding-004` (API) |
|---|---|---|
| Where it runs | Local CPU (or MPS on Apple Silicon) | Google API call per embed |
| Output dim | 768 | 768 |
| Input token cap | 512 | 2,048 (4× larger) |
| Cost | Free | Free in AI Studio tier; otherwise ~$0.000025 / 1k chars |
| Latency per embed | ~10 ms | ~50–200 ms (network round-trip) |
| Network dependency | None — fully offline | Required at index AND query time |
| MTEB retrieval avg | ~53 | ~60 (a few points stronger) |
| Reproducibility | Pinned local checkpoint, permanent | API model versions can rotate underneath us |

**The case for `text-embedding-004`:**
- Single-vendor story — one API key, one billing dashboard, simpler ops
- Higher MTEB retrieval score by a measurable margin
- 4× larger input cap (2,048 tok), so chunking would be less constrained
- No model download, no local memory footprint

**The case against (and why we still pick BGE):**
- **Iteration cost.** Every chunk-size sweep re-embeds the corpus. With BGE local that's free and instant; with the API every iteration costs latency + tokens + a network round-trip. We *will* sweep chunk sizes — local wins here.
- **Reproducibility.** API model versions can change silently. A pinned checkpoint (`bge-base-en-v1.5`) is permanent — same vectors today and 6 months from now.
- **Per-query latency.** Every user question would require a Google call just to embed *before* retrieval can run — extra failure mode + ~50–200 ms before anything else happens.
- **The MTEB gap is closeable.** BM25 is right next to dense in the hybrid pipeline; what dense misses, sparse often catches. The eval-set delta is likely smaller than MTEB suggests.

#### Recommendation: `BAAI/bge-base-en-v1.5` (local)

| Reason | Detail |
|---|---|
| Retrieval-tuned | Trained on the exact task we're doing — short queries → long passages |
| Free + offline | Re-embedding while tuning chunk size is instant; no API cost per iteration |
| One-line upgrade path | If retrieval plateaus, swap `bge-base` → `bge-large` (still local) without changing infra |
| Strength: 512-token input cap | Aligns naturally with our 500-token chunk size (see §3.3) |
| Reproducibility | Pinned checkpoint — vectors are stable across the project lifetime |

**Documented fallback if eval reveals a clear gap:** `text-embedding-004` (Google) is the API option to switch to. The interface change is one line — `HuggingFaceEmbeddings(...)` → `GoogleGenerativeAIEmbeddings(...)` — but every chunk would need re-embedding (vectors of different models can't share an index).

---

### 5.3 Chunk size — see §3.3

Chunk size is the most-tunable knob in the pipeline, but it's not chosen in isolation — it's bound to the embedder's input cap (BGE-base = 512 tokens). The full chunking decision (**500-token chunks, 50-token overlap, per-page boundaries, default `RecursiveCharacterTextSplitter` separators**) lives in [§3.3](#33-chunking-strategy) alongside parsing, with worked examples for the small-page case (page 21, 260 tok → one chunk) and the splitter-fires case (700-tok page → two chunks with overlap).

This is also **the** parameter most worth retuning in v2: build the gold set first, then sweep `[300, 500, 800, 1200]` and pick by recall@5 + answer quality on the eval set.

---

### 5.4 Vector store — FAISS vs Chroma

Both store `{vector, chunk_text, metadata}` rows and answer "give me the K closest vectors to this query." At our scale (~500 chunks) **retrieval quality is identical** and latency is sub-second for both. The choice is ergonomic.

| | FAISS | Chroma |
|---|---|---|
| Lives where | In-memory + saved-to-disk file | Embedded local DB (SQLite + Parquet under the hood) |
| Persistence | Manual: `save_local()` / `load_local()` | Automatic, transparent |
| Metadata filtering | None built-in — filter the K returned hits in Python | Built-in: `.query(where={"page": {"$gte": 100}})` |
| Deletes / updates | Awkward — usually rebuild | First-class CRUD |
| Dependencies | `faiss-cpu` (~10 MB wheel) | `chromadb` (~50 MB, more transitive deps) |
| Speed at 500 chunks | Sub-100 ms | Sub-100 ms |
| Lecture-07 alignment | **Yes — used directly** | No |

#### Recommendation: **Chroma**

With JSONs flattened and embedded alongside GDOT, the corpus is no longer single-source — it's a heavy multi-source mix:

| Source | Vector count | Share of corpus |
|---|---:|---:|
| GDOT chunks | ~520 | 2% |
| Flattened `roadSegments` | ~1,960 | 8% |
| Flattened `locations` | ~20,829 | **89%** |
| **Total** | **~23,300** | |

That **45:1 imbalance** between `locations` and GDOT changes everything. Put all 23K vectors into one un-filtered index and ask *"What does GDOT recommend at PCI 65?"* — the top-5 will likely include several `locations` snippets that just happen to mention "PCI" or "asphalt" or "crack". Pure dilution, because they outnumber GDOT 40-to-1. The actual GDOT answer can get bumped out by sheer numerosity.

The fix is **source-aware retrieval** — either filter by source at query time, or partition into per-source physical indices. Chroma's built-in metadata filter (`where={"source": "GDOT"}`) is the natural answer.

##### Three reasons Chroma now wins

| Reason | Detail |
|---|---|
| **Metadata filtering inside the query** | `chroma.similarity_search(q, k=5, where={"source": "GDOT"})` runs the filter inside the index — exact top-K of the filtered set. FAISS would force over-fetch + Python post-filter, which is wasteful and can return < K hits when the filtered subset is small. |
| **Multi-attribute filters come free** | Once filtering is built in, *"only segments with PCI < 60"* (`where={"pci": {"$lt": 60}}`) costs nothing extra. With FAISS that's all custom code on the side. |
| **Persistence is automatic** | Chroma writes to SQLite + Parquet on-disk by default. No explicit `save_local()` / `load_local()` ceremony at the chat-process boundary. |

##### What Chroma costs us

| Cost | Detail |
|---|---|
| Slight divergence from lecture 07 | Lecture uses FAISS. The team will need to translate the patterns — but the LangChain interface is nearly identical: `Chroma.from_documents(...)` instead of `FAISS.from_documents(...)` and most calling code is unchanged. ~30 minutes of code differences. |
| Slightly heavier dependency | `chromadb` (~50 MB, more transitive deps) vs `faiss-cpu` (~10 MB). Negligible at our scale. |
| Slightly slower at 23K vectors | Sub-100 ms vs FAISS's sub-50 ms — invisible to the user. |

##### When this could flip back to FAISS

If the corpus shrinks to single-source (e.g. JSONs move to a SQL DB and only GDOT stays embedded), the imbalance disappears, metadata filtering becomes useless, and FAISS's simplicity re-wins. **Chroma is the right call for the current 23K-vector multi-source setup, not a permanent commitment.**

---

### 5.5 Source-aware retrieval policy

§5.4 picks Chroma because it supports metadata filtering. §5.5 specifies *what we do with that capability* — when retrieval runs, which subset of the index does it actually query, and how do BM25 + Chroma stay symmetric about it?

#### The problem

The 23K-vector corpus is heavily imbalanced:

| Source | Vectors | Share |
|---|---:|---:|
| locations | ~20,829 | 89% |
| roadSegments | ~1,960 | 8% |
| GDOT | ~520 | 2% |

Default-unfiltered retrieval (`chroma.similarity_search(q, k=5)`, no `where=`) silently lets `locations` dominate. For queries that need GDOT, the actual answer can land at rank 4 or 5, surrounded by `locations` snippets that just happen to mention "PCI" or "asphalt".

#### Worked example — why default-unfiltered fails

User asks: *"What's the cheapest treatment for PCI 65?"*

Default top-5 looks like:

| Rank | Chunk | Source | Why it ranked |
|---|---|---|---|
| 1 | *"Inspection point on Engineering Dr. Defects: 1 transverse crack..."* | locations | "defects" + "PCI" in nearby field |
| 2 | *"River Trail Dr ... PCI 67 (Good)..."* | roadSegments | "PCI" + a number close to 65 |
| 3 | *"Inspection point on ..."* | locations | Same shape as #1 |
| 4 | *"For asphalt pavement with PCI 60–70, treatments include thin overlay, microsurfacing, or chip seal..."* | **GDOT** ← the answer | Real semantic match |
| 5 | *"Inspection point on ..."* | locations | Same shape as #1 |

Pass top-3 to the LLM and the actual answer never makes it. The 89% wins by sheer numerosity.

#### Decision space

Four realistic policies:

| Policy | How it works | Pros | Cons |
|---|---|---|---|
| A — Default unfiltered | One index call, top-K across everything | Trivial implementation | Fails on GDOT questions (above) |
| **B — Per-source retrieval, RRF the union** ✅ | Pull top-K from each source separately, RRF across all into final top-N | Always represents every source. No query classifier needed. Symmetric with hybrid (BM25 + dense) layering. | ~3× retrieval calls (negligible at this scale) |
| C — Rule-based query routing | Heuristics on query (mentions road name? mentions PCI/treatment?) pick which sources to query | More targeted than B | Heuristics rot; need maintenance as query patterns evolve |
| D — LLM-based query routing | Pre-flight LLM call classifies query → returns source filter → filtered retrieval | Most flexible | Adds ~500 ms latency before retrieval starts; overkill for Phase 1 |

#### Pick: B — per-source retrieval, RRF the union

```
                  ┌─────────────────┐
                  │   user query    │
                  └────────┬────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
   │ GDOT subset  │ │ roadSegments │ │  locations   │
   │ (~520 vecs)  │ │  (~1,960)    │ │  (~20,829)   │
   └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
          │                │                │
       dense              dense           dense
       + BM25             + BM25          + BM25       ← 6 ranked lists
          │                │                │
          └────────┬───────┴────────────────┘
                   ▼
            RRF fuse all 6 lists
                   ▼
             final top-N=5 chunks
```

**Why B over the others:**

| Reason | Detail |
|---|---|
| **Guarantees source coverage** | Every source contributes its best K to the fusion pool. GDOT can't be drowned out. |
| **No router to maintain** | Policies C and D need either heuristics or a classifier — both eat eng time and can drift. B is parameter-free. |
| **Cost is invisible at scale** | 3 filtered Chroma calls + 3 BM25 calls = 6 retrievals per query. At 23K total vectors split across 3 sources, each call is sub-100 ms. Total < 600 ms before fusion. |
| **Naturally hybrid-friendly** | The dense and sparse channels each fan out per-source the same way, so RRF treats all 6 lists symmetrically. |

#### BM25 implementation — per-source indexes

§5.4's filtering argument is Chroma-specific. `rank-bm25` is one big tokenized list with no metadata filter. Two ways to make BM25 source-aware:

| Approach | Detail |
|---|---|
| One BM25 index, post-filter | Retrieve top-K, drop hits whose source ≠ desired. Wasteful — most retrieved hits get thrown away. |
| **Per-source BM25 indexes** ✅ | Build 3 `BM25Okapi` instances (one per source). Query the relevant ones. Symmetric with Chroma's filter. ~3× memory of one index, but each is small (locations is the biggest at ~20K short tokens). |

**Pick:** per-source BM25 indexes, persisted as 3 pickle files alongside the Chroma DB.

#### Interaction with §7's `k_per_retriever`

Going from one combined index to per-source breaks the math from §7.3.

| | Original §7.3 (single-source) | Updated under policy B |
|---|---|---|
| Number of ranked lists feeding RRF | 2 (1 dense + 1 sparse) | **6** (3 sources × 2 channels) |
| `k_per_retriever` | 10 | **5** — keeps total RRF input ≤ 30 candidates |
| `top_n` to LLM | 5 | 5 (unchanged) |

Dropping `k_per_retriever` to 5 keeps the RRF pool at 30 candidates (similar order to the original 20). Going to 10 per source would yield 60 — RRF still works, but most rank-6-to-10 candidates from each source are noise that won't survive. **Pick: `k_per_retriever = 5` under policy B.** This supersedes the 10 in §7.3.

#### Implementation sketch

```python
# 6 retrievers: 3 sources × 2 channels
gdot_dense   = chroma.as_retriever(search_kwargs={"k": 5, "filter": {"source": "GDOT"}})
roads_dense  = chroma.as_retriever(search_kwargs={"k": 5, "filter": {"source": "roadSegments"}})
locs_dense   = chroma.as_retriever(search_kwargs={"k": 5, "filter": {"source": "locations"}})
gdot_bm25    = BM25Retriever.from_pickle("bm25_gdot.pkl",   k=5)
roads_bm25   = BM25Retriever.from_pickle("bm25_roads.pkl",  k=5)
locs_bm25    = BM25Retriever.from_pickle("bm25_locs.pkl",   k=5)

ensemble = EnsembleRetriever(
    retrievers=[gdot_dense, roads_dense, locs_dense, gdot_bm25, roads_bm25, locs_bm25],
    weights=[1/6] * 6,   # equal — RRF is scale-free anyway
)
# ensemble.invoke(query) → final top-N=5 after RRF over 30 candidates
```

#### When this could change

| Trigger | New policy |
|---|---|
| Eval shows policy B over-fetches and adds noise | Try policy C (rule-based routing) — query classifier picks 1–2 sources |
| New source added (e.g., partner adds work-order CSV) | Policy B scales — just becomes 4 sources × 2 channels = 8 lists |
| Single-source corpus (JSONs move to SQL DB) | Drop to policy A (no filter) — imbalance disappears, no need for source-awareness |

#### 5.5 Summary

| Decision | Pick |
|---|---|
| Retrieval policy | B — per-source retrieval, RRF over the union |
| BM25 storage | Per-source `BM25Okapi` instances (3 pickle files) |
| `k_per_retriever` (revises §7.3) | 5 (was 10 single-source; 6 retrievers × 5 = 30 RRF candidates) |
| `top_n` (final to LLM) | 5 (unchanged) |

---

## 6. Sparse retrieval — BM25 (Owner: Claudia)

### 6.1 Terminology — BM25 vs sparse vector search

"BM25" and "sparse vector search" overlap but aren't the same thing.

| Family | What it is |
|---|---|
| **Classical sparse (BM25, TF-IDF)** | Score documents by token frequency + inverse-document-frequency. No learning, no embeddings. The "sparse vector" is just `{token: tf-idf-weight}` — but the weights are *statistics*, not learned. |
| **Learned sparse (SPLADE, uniCOIL)** | Pass text through a transformer that emits a *learned* sparse vector. The weights are predicted, and tokens can be *expanded* (e.g., `"auto"` activates `"car"` and `"vehicle"`). Bridges lexical precision and semantic recall. |
| **Hybrid scoring tricks** (BM25F, multi-field BM25) | Variants of classical BM25 that weight different fields differently. Useful for documents with structured sections. |

When people say "sparse vector search" they usually mean **learned sparse** (SPLADE-family). Plain BM25 is technically sparse-vector too, just with hand-derived weights.

### 6.2 The realistic option space

| Option | Quality | Cost | Setup complexity | When it wins |
|---|---|---|---|---|
| **BM25 (Okapi)** | Solid baseline | ~5–50 ms per query at 23K chunks; zero model load | Trivial — `rank-bm25` is a pickle | When you have a dense channel covering semantic; need exact-token catching for the rest |
| TF-IDF | Strictly worse than BM25 | Same | Trivial | Never — BM25 supersedes it |
| **SPLADE / SPLADE++** | Best-in-class for sparse-only retrieval | ~50–200 ms per query (model inference); ~150 MB on disk | Needs a `sentence-transformers`-style model load + inverted-index build | When you can't afford a dense channel, OR want to push hybrid ceiling higher |
| BM25 + cross-encoder rerank | High quality at the very top | Adds ~100–500 ms per query (reranker inference) | Adds a cross-encoder model + a 2-stage pipeline | When top-3 quality matters more than top-K coverage |
| Elasticsearch / OpenSearch | BM25 + lots of operational features | Heavy infra (Java service, JVM tuning) | Overkill for 23K chunks | When you need full-text search at production scale |

### 6.3 Recommendation: BM25 (`rank-bm25`)

**Why BM25 and not SPLADE:**

| Reason | Detail |
|---|---|
| **The sparse channel's unique job is exact-token matching** | We have BGE doing semantic. The reason to add a sparse retriever isn't "improve semantic" — it's "catch what semantic misses": road names, GISIDs, image IDs, codes. BM25 does that perfectly. SPLADE's *learned expansion* feature would actually *blur* this exact-token strength. |
| **Zero inference cost** | BM25 scoring is `np.argsort` over a precomputed array. SPLADE adds 50–200 ms of transformer inference per query. With Gemini also taking 1–3 s, that's not free. |
| **Zero new model dependency** | `rank-bm25` is one pure-Python package. SPLADE adds a model download + ONNX/PyTorch runtime + inverted-index store. |
| **Easy to debug** | A BM25 score is a function of token overlap and IDF — you can hand-trace why a chunk ranked where it did. SPLADE's expanded tokens are opaque. |
| **Lecture-05 alignment** | The team already has worked examples for BM25 from `Lecture_notes/05_info-retrieval-intro-to-transformers.ipynb`. |

**When SPLADE would actually be worth it:** if eval shows that BGE+BM25 misses cases where the user's phrasing is technical-and-rare and uses NO tokens shared with the source. E.g., the user asks about "asphalt rejuvenator" but the GDOT chapter uses the term "fog seal" exclusively. SPLADE's learned expansion can bridge that — but you can also fix this in the prompt or by asking the user to rephrase.

### 6.4 Library pick: `rank-bm25` (with `bm25s` as a faster drop-in if needed)

| Library | Notes |
|---|---|
| **`rank-bm25`** ✅ | Pure Python, ~10–50 ms on our corpus. What the old plan picked. Just works. |
| `bm25s` | Newer (2024) pure-Python rewrite claiming 100× faster. API-compatible. **Drop-in upgrade if `rank-bm25` ever feels slow.** |
| `pyserini` | Java-backed, fastest. Overkill — adds a JVM dependency. |
| `whoosh` | Older Python full-text engine. Solid but slower than `rank-bm25`. |

**Pick: `rank-bm25` for v1; switch to `bm25s` only if we feel the latency pinch (we won't at 23K chunks).**

### 6.5 Tokenization (already locked in §3.2)

Quick recap of why this matters for BM25 specifically:

```python
def tokenize(text: str) -> list[str]:
    return re.findall(r"\w+", text.lower())
```

- **Lowercase** — so `"PCI"` matches `"pci"`
- **`\w+`** — preserves digits, so `"GISID 1660"` becomes `["gisid", "1660"]` (both searchable)
- **Drops punctuation** — `"5 transverse cracks, 12 longitudinal"` → `["5", "transverse", "cracks", "12", "longitudinal"]`
- **No lemmatization** — keeps `"resealing"` and `"reseal"` as distinct tokens (often what GDOT uses are precise terms; merging them would lose precision)

### 6.6 BM25 summary

| Decision | Pick |
|---|---|
| Sparse retriever | BM25 Okapi |
| Library | `rank-bm25` (v1); `bm25s` as faster drop-in if needed |
| Tokenization | Lowercase + `re.findall(r"\w+", text)` |
| Index storage | Pickle file alongside Chroma (not a database) |

---

## 7. Fusion — RRF (Owner: Diana)

### 7.1 Fusion options

Five options, in order of complexity:

| Method | How it works | Tuning | Pros | Cons |
|---|---|---|---|---|
| **Reciprocal Rank Fusion (RRF)** | For each chunk, sum `1 / (k + rank)` across retrievers. Sort by sum. | `k = 60` standard, almost never tuned | **Scale-free** (no score normalization); simple; robust | Throws away score-magnitude info |
| Weighted score fusion | `α · dense_score + (1−α) · sparse_score` after normalization | `α`, normalization scheme | Uses score magnitudes | Requires score normalization (min-max? z-score? softmax?), and `α` is corpus/query-type-specific |
| CombSUM / CombMNZ | Normalize, then sum (CombSUM) or sum × #lists-it-appears-in (CombMNZ) | Normalization scheme | Uses scores; CombMNZ rewards multi-list agreement | Same normalization fragility |
| Learning-to-Rank (LTR) | Train a model on (query, retriever-scores → relevance) | Model architecture, training data | Best quality if labeled data exists | Needs labels, training pipeline, slower at query time |
| Cross-encoder rerank on union | Take union of both top-K, run cross-encoder, sort by reranker score | Reranker model choice, top-K | Best quality at the very top of the list | ~100–500 ms per query; second model dependency |

### 7.2 Recommendation: RRF with `k_rrf = 60`

**Why RRF and not weighted fusion:**

| Reason | Detail |
|---|---|
| **BM25 and cosine-similarity scores live on incomparable scales** | A BM25 score of 12.5 means nothing relative to a cosine of 0.74. To weight them, you'd need to normalize — and *which* normalization (min-max? z-score? softmax?) materially changes the result. RRF dodges this entirely by using ranks. |
| **No tuning required** | The original RRF paper showed `k=60` works well across most retriever pairs and corpora. Weighted fusion's `α` typically needs per-corpus tuning. |
| **Robust to retriever quality imbalance** | If BM25 is way better than dense for one query and dense is way better for another, RRF handles both gracefully. Weighted fusion picks one global trade-off. |
| **Empirical evidence** | The Cormack-Clarke-Büttcher 2009 paper showed RRF matches or beats CombSUM, CombMNZ, and learned methods across many TREC tasks. It's been the default in IR ever since. |

**Why not cross-encoder rerank for v1:**

Cross-encoder rerank can genuinely help — it's how production systems like Cohere Rerank and Vectara push quality higher. But:
- Adds a second model (typically `cross-encoder/ms-marco-MiniLM-L-12-v2`, ~120 MB)
- Adds 100–500 ms per query
- Requires you to first decide RRF top-N is too small, which is itself an eval finding

**Phase-1.5 idea:** if eval reveals top-3 quality is the bottleneck (not top-10 recall), add cross-encoder reranking *after* RRF. RRF top-20 → cross-encoder → top-5 sent to LLM. This is the standard production pattern.

### 7.3 Tuning parameters for RRF

| Parameter | Default | Recommendation | Why |
|---|---|---|---|
| `k_rrf` | 60 | **60** | Paper default. Don't tune unless you have a measurable reason. |
| `k_per_retriever` (how many to pull from each) | varies | **10** (single-source) — see note below | Enough for RRF to find chunks that *almost* made one list and *did* make the other (the high-recall sweet spot). Lower (5) degrades RRF to "whichever retriever ranks higher wins." Higher (20+) adds noise. |

> **Note:** `k_per_retriever = 10` here assumes the original 2-retriever single-source setup. Under policy B in [§5.5](#55-source-aware-retrieval-policy) (per-source retrieval, 6 retrievers), `k_per_retriever` is revised down to **5** to keep total RRF input ≤ 30 candidates.
| `top_n` (final list size for LLM context) | 5 | **5** | Top-5 chunks at 500 tok each = ~2,500 tok of context. Comfortable for Gemini, focused enough that the LLM doesn't drown in irrelevance. |

### 7.4 Library pick: LangChain's `EnsembleRetriever`

```python
from langchain.retrievers import EnsembleRetriever

ensemble = EnsembleRetriever(
    retrievers=[bm25_retriever, chroma_retriever],
    weights=[0.5, 0.5],         # weights are equal; RRF is scale-free anyway
    # k=60 is the default RRF constant in EnsembleRetriever
)
```

Already decided in CLAUDE.md (LangChain over LlamaIndex). `EnsembleRetriever` does exactly RRF with the right defaults.

### 7.5 RRF summary

| Decision | Pick |
|---|---|
| Fusion algorithm | Reciprocal Rank Fusion (RRF), `k_rrf = 60` |
| `k_per_retriever` | 10 |
| `top_n` (final to LLM) | 5 |
| Reranker | None in v1; cross-encoder rerank is the Phase-1.5 option |
| Library | LangChain `EnsembleRetriever` |

---

## 8. Open / TBD components

These get filled in over the coming sessions:

| Component | Owner | Open questions |
|---|---|---|
| **Prompt design + citations** | TBD | System prompt, citation format, refusal instruction |
| **Evaluation** | TBD | Gold-set construction, hallucination + consistency scoring, retrieval recall@K |
| **Logging** | TBD | Per-turn JSONL → eventually messages table |

---

## 9. Decisions snapshot (as of 2026-05-06)

| Decision | Pick | Strength | Why it could change |
|---|---|---|---|
| **PDF: parser** | `pypdf` via `PyPDFLoader`; `pdfplumber` fallback for table-heavy pages | Strong | Eval reveals widespread table loss → pivot earlier to Docling/Unstructured |
| **PDF: dense preprocessing** | None — raw text into BGE | Strong | n/a |
| **PDF: sparse preprocessing** | Lowercase + regex word tokenize, preserve digits | Strong | n/a |
| **PDF: chunking** | Per-page, 500-tok, 50-tok overlap, default separators | Soft | See §5.3 chunk-size sweep planned for v2 |
| **JSON: what to flatten** | Minimal in text + everything in metadata | Strong | New filter use-case requires more in metadata → expand metadata schema (cheap) |
| **JSON: template style** | Style A — natural-language sentence | Strong | n/a |
| **JSON: missing values** | Keep records, omit clauses, preserve nulls in metadata | Strong | n/a |
| Embedding model | `BAAI/bge-base-en-v1.5` (local) | Strong | Eval shows BGE-base plateaus → upgrade to `bge-large` (still local) or `text-embedding-004` (Google API) |
| Image handling | Skip in v1 | Strong | Eval reveals figure-only critical content → OCR specific pages |
| Vector store | Chroma | Strong | Corpus shrinks back to single-source → FAISS's simplicity re-wins |
| **Retrieval policy** | B — per-source retrieval (3 sources × 2 channels = 6 lists), RRF over union | Strong | Single-source corpus → drop to A; eval shows over-fetch noise → try C (rule-based routing) |
| **BM25 storage** | Per-source `BM25Okapi` instances (3 pickle files alongside Chroma) | Strong | n/a |
| **Sparse retriever** | BM25 Okapi via `rank-bm25` | Strong | Eval shows technical-vocab-mismatch failures dense+BM25 can't catch → upgrade to SPLADE |
| **BM25 tokenization** | Lowercase + `re.findall(r"\w+", text)` | Strong | n/a |
| **Query-side BM25 tokenization** | Same as index — `re.findall(r"\w+", q.lower())` (one shared function) | Strong | n/a |
| **Query-side BGE prefix** | `"Represent this sentence for searching relevant passages: "` via LangChain `query_instruction` | Strong | Swap embedder → check the new model's recommended prefix |
| **Fusion algorithm** | Reciprocal Rank Fusion (RRF), `k_rrf = 60` | Strong | If we ever have labeled relevance data → consider learned fusion |
| **`k_per_retriever`** | **5** under policy B (was 10 single-source — see §5.5) | Soft | Tune in v2 based on recall@5 on gold set |
| **`top_n` (to LLM)** | 5 | Soft | Tune in v2 based on whether LLM has enough vs too much context |
| **Reranker** | None in v1 | Soft | If top-3 quality is the bottleneck → add cross-encoder rerank between RRF and LLM |
| **Fusion library** | LangChain `EnsembleRetriever` | Strong | n/a |
| Generator | Gemini 2.5 Pro | Strong | Vendor lock-in concern → swap to Claude Sonnet 4.6 (one-line change) |
