# Phase 1 — Naive RAG, Step-by-Step Build Guide

**Scope:** Phase 1 only. The goal here is a working proof-of-concept end-to-end pipeline: corpus → indexed knowledge base → user query → grounded answer. Phase 2 (agentic RAG with deterministic Excel tools) is deliberately out of scope in this document.

**Code style:** mirrors the LangChain stack from `Lecture_notes/07_llms-rag.ipynb` (`RecursiveCharacterTextSplitter`, `HuggingFaceEmbeddings`, FAISS, `ChatPromptTemplate`, the pipe-chain pattern). Loaders are extended to handle the project's PDFs and Excel workbooks. Generation switches to Claude Sonnet 4.6 instead of the small local Qwen used in lecture, because we need a capable model for real recommendations.

---

## Setup — environment and dependencies

Add the following to the `capstone_env` conda environment. The first set is the LangChain stack from lecture 07; the second set is what's specific to this corpus (PDFs + Excel) and to using Claude as the generator.

```bash
# Activate the existing env
conda activate capstone_env

# Lecture-07 stack
pip install langchain langchain-community langchain-text-splitters \
            langchain-huggingface sentence-transformers faiss-cpu

# Corpus-specific + generation
pip install pypdf openpyxl langchain-anthropic python-dotenv tiktoken
```

Create a `.env` in the project root (and add it to `.gitignore`) with one line:

```env
ANTHROPIC_API_KEY=sk-ant-...
```

You can swap `langchain-anthropic` + Claude for `langchain-openai` + GPT-4o by changing two lines in step 10. Embeddings stay local and free either way (`HuggingFaceEmbeddings` runs on your laptop CPU).

---

## Indexing (run once, plus whenever the corpus changes)

### 1. Extract text from PDFs

Pull raw text from each of the four PDFs (GDOT, 2015 IMS report, 2023 IMS report, 2024 Bid Tabulation). Start with `pypdf` because it's already installed and Just Works for ~95% of pages. The 472-page GDOT guide extracts in ~5 seconds. If you find that tables and equations come out scrambled (likely on a couple of GDOT chapters), switch those specific PDFs to `Docling` or `Unstructured.io`, which are layout-aware. Keep page numbers attached to each text block — you'll need them for citations later.

**Output:** a list of `(filename, page_number, text)` tuples — roughly 730 pages across the four PDFs.

```python
# ingest/load_pdfs.py
from pathlib import Path
from langchain_community.document_loaders import PyPDFLoader
from langchain_core.documents import Document

DATA_DIR = Path("data_20260426/UBC Capstone Project")

PDF_PATHS = [
    DATA_DIR / "GDOT PAVEMENT PRESERVATION GUIDE (1) (1).pdf",
    DATA_DIR / "relookingforroaddata_2015_baseline/Peachtree Corners GA 2015 Report_Rev2.pdf",
    DATA_DIR / "relookingforroaddata_2023_update/Peachtree Corners Report 2023.pdf",
    DATA_DIR / "relookingforroaddata_2023_update/PTC 24-05 2024 Street Resurfacing Full Bid Tabulation.pdf",
]

def load_pdfs() -> list[Document]:
    """Each Document = one PDF page. PyPDFLoader stamps `source` and `page` into metadata."""
    documents: list[Document] = []
    for path in PDF_PATHS:
        loader = PyPDFLoader(str(path))
        pages = loader.load()                                   # one Document per page
        for d in pages:
            d.metadata["source"] = path.name                    # short filename, not full path
            # PyPDFLoader already populates d.metadata["page"] (0-indexed)
        documents.extend(pages)
        print(f"  {path.name}: {len(pages)} pages")
    return documents

if __name__ == "__main__":
    docs = load_pdfs()
    print(f"\nTotal pages loaded: {len(docs)}")
    print("Sample metadata:", docs[0].metadata)
    print("Sample text (first 200 chars):", docs[0].page_content[:200])
```

> Following lecture 07's pattern of attaching `metadata["source"]` to each `Document` so retrieval results stay traceable to a file.

### 2. Parse the Excel workbooks

Excel is mostly tabular numeric data, but a few sheets are narrative — `Definitions`, `Acronyms`, `Comps` (the life-cycle reasoning), and the row-by-row activity descriptions in `Rehabs`. Treat those narrative sheets as text and feed them into the same chunking pipeline as the PDFs. Treat the *purely tabular* sheets (e.g. `App A Inventory`, the wide `ACP` sheet) two ways: (a) generate **one short text snippet per row** ("Segment 1660 on Abby Court has PCI 78.9, condition Very Good, scheduled for rehab in year 0"), so they're searchable; and (b) load the same rows into a regular SQL table so a future Phase 2 can do exact lookups. For Phase 1, only (a) is strictly necessary, but doing (b) at the same time costs ~10 lines of code and saves a re-ingest later.

Watch out for the **header-row-on-row-8** quirk we documented in `data_dict.md` — set `header=7` in pandas. Skip the chartsheets entirely.

**Output:** narrative chunks from a handful of sheets + ~1,000 row-summaries from the inventory sheets.

```python
# ingest/load_excels.py
from pathlib import Path
import pandas as pd
from langchain_core.documents import Document

DATA_DIR = Path("data_20260426/UBC Capstone Project")

# (file_path, sheet_name, header_row_0indexed, kind)
NARRATIVE_SHEETS = [
    (DATA_DIR / "relookingforroaddata_2015_baseline/PeachtreeCorners_byGISID_Rev2.xlsx",
     "Acronyms", 9, "narrative"),
    (DATA_DIR / "relookingforroaddata_2015_baseline/PeachtreeCorners_byGISID_Rev2.xlsx",
     "Comps", 11, "narrative"),
    (DATA_DIR / "relookingforroaddata_2015_baseline/PeachTree_Corners_Analysis_Rev2.xlsx",
     "Rehabs", 8, "narrative"),  # rule book — PCI band → activity → cost
]

# (file_path, sheet_name, header_row, key_col, row_template)
TABULAR_SHEETS = [
    (
        DATA_DIR / "relookingforroaddata_2015_baseline/PeachTree_Corners_Analysis_Rev2.xlsx",
        "App A Inventory", 7, "GISID",
        # Template controls the natural-language form of each row
        "Segment GISID {GISID} on {On Street} ({From Street} → {To Street}), "
        "{FunCL} road, {Pavetype}, area {Pavement Area (yd2):.0f} yd². "
        "PCI {Pavement Condition Index (PCI):.1f} ({Condition Rating}). "
        "Selected rehab year: {Selected Rehab Year}, activity: {Rehab Activity}, "
        "segment cost ${Segment Cost ($):,.0f}."
    ),
]

def load_narrative_sheets() -> list[Document]:
    """Sheets that are mostly prose — load each non-empty cell as a small Document."""
    docs: list[Document] = []
    for path, sheet, hdr, kind in NARRATIVE_SHEETS:
        df = pd.read_excel(path, sheet_name=sheet, header=hdr).dropna(how="all")
        for i, row in df.iterrows():
            text = " | ".join(f"{c}: {v}" for c, v in row.items() if pd.notna(v))
            if not text.strip():
                continue
            docs.append(Document(
                page_content=text,
                metadata={"source": path.name, "sheet": sheet, "row": int(i), "kind": kind},
            ))
    return docs

def load_tabular_sheets() -> list[Document]:
    """Tabular sheets — convert each row into a one-sentence summary."""
    docs: list[Document] = []
    for path, sheet, hdr, key, template in TABULAR_SHEETS:
        df = pd.read_excel(path, sheet_name=sheet, header=hdr).dropna(how="all")
        for i, row in df.iterrows():
            try:
                text = template.format(**row.to_dict())
            except (KeyError, ValueError):
                continue   # skip rows with missing fields
            docs.append(Document(
                page_content=text,
                metadata={"source": path.name, "sheet": sheet,
                          "row": int(i), "key": str(row.get(key, "")), "kind": "tabular"},
            ))
    return docs

def load_all_excels() -> list[Document]:
    return load_narrative_sheets() + load_tabular_sheets()

if __name__ == "__main__":
    docs = load_all_excels()
    print(f"Excel documents: {len(docs)}")
    for d in docs[:3]:
        print("-", d.metadata, ":", d.page_content[:160])
```

> The `row_template` approach is what turns a 50-column spreadsheet row into a sentence the embedding model can actually understand. It's worth investing 5 minutes per sheet to write a good template — bad templates → bad retrieval.

### 3. Chunk the text

Split each PDF/Excel text blob into pieces of ~500 tokens with 64 tokens of overlap. Don't split mid-sentence; prefer paragraph or section boundaries when they exist. For the GDOT guide specifically, try to keep chapter/section headings inside the first chunk of each new section so the chunk itself "knows" where it lives in the document.

Why 500 tokens? Small enough that a top-5 retrieval injects only ~2,500 tokens into the prompt (cheap, focused). Big enough that a chunk usually contains a complete idea — a full pavement-treatment description, not half of one.

**Output:** roughly **500 chunks** total across the corpus, each tagged with `(source_file, page_or_sheet, chunk_index, content)`.

```python
# ingest/chunk.py
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

# RecursiveCharacterTextSplitter is what lecture 07 uses.
# It tries paragraph boundaries first, then sentences, then words — never mid-word.
# chunk_size is in CHARACTERS, not tokens. ~2000 chars ≈ ~500 tokens for English.
splitter = RecursiveCharacterTextSplitter(
    chunk_size=2000,
    chunk_overlap=250,
    separators=["\n\n", "\n", ". ", " ", ""],   # try in this order
    length_function=len,
)

def chunk_documents(docs: list[Document]) -> list[Document]:
    chunks = splitter.split_documents(docs)
    # Tag each chunk with its position within its source for stable citations
    seen: dict[str, int] = {}
    for c in chunks:
        key = (c.metadata.get("source", ""), c.metadata.get("page", c.metadata.get("sheet", "")))
        seen[key] = seen.get(key, -1) + 1
        c.metadata["chunk_index"] = seen[key]
    return chunks

if __name__ == "__main__":
    from load_pdfs import load_pdfs
    from load_excels import load_all_excels
    all_docs = load_pdfs() + load_all_excels()
    chunks = chunk_documents(all_docs)
    print(f"Total chunks: {len(chunks)}")
    print("Sample:", chunks[0].metadata, "::", chunks[0].page_content[:120])
```

> Tabular-row Documents from step 2 will pass through the splitter unchanged because each is already short — that's fine.

### 4. Embed each chunk

Send every chunk's text through an embedding model — a small encoder model that turns each chunk into a fixed-length vector of floats representing its meaning. **This is a different family of models from the generative LLMs in step 10** (Claude / Mistral / Llama etc.); embedding models are encoder-only and output a single vector per input.

#### Top 3 local (open-source, free, runs on your laptop)

| Model | Dim | Disk size | When to pick it |
|---|---:|---:|---|
| `sentence-transformers/all-MiniLM-L6-v2` | 384 | 80 MB | Smallest + fastest. The lecture-07 default. Use it if you want a 5-minute setup. |
| **`BAAI/bge-base-en-v1.5`** | 768 | 440 MB | **Best balance.** Trained specifically for retrieval (not just general semantic similarity), ~2× the dims of MiniLM, still small enough to run anywhere. |
| `BAAI/bge-large-en-v1.5` | 1024 | 1.3 GB | Top free quality. Worth the disk only if `bge-base` retrieval is measurably insufficient. |

#### Top 2 API (paid, hosted)

| Model | Dim | Cost / 1M tokens | Cost to embed our ~227K-token corpus once |
|---|---:|---:|---:|
| OpenAI `text-embedding-3-small` | 1536 | $0.020 | $0.005 |
| OpenAI `text-embedding-3-large` | 3072 | $0.130 | $0.030 |

API embedding is effectively free at our corpus size. The reason to skip it anyway: every chunk-tuning iteration re-embeds the corpus, every dev laptop needs an API key, and our retrieval-quality bottleneck is far more likely chunking than embedding.

#### Final pick: `BAAI/bge-base-en-v1.5` (local)

**Why:**
- **Retrieval-tuned.** BGE was trained on retrieval pairs; MiniLM was trained on general sentence similarity. For a RAG pipeline that's retrieval, not paraphrase detection.
- **Small enough.** 440 MB on disk, ~110 M parameters — runs comfortably on a laptop CPU.
- **Free + offline.** No API key, no per-query cost, no network dependency. Re-embedding the corpus while you tune chunking is instant and free.
- **One-line swap path.** If retrieval quality becomes the bottleneck (you'll know from the gold-set eval), drop in `bge-large` (still local) or OpenAI `text-embedding-3-small` (cloud) by changing one line.

#### Code

```python
# ingest/embed.py
from langchain_huggingface import HuggingFaceEmbeddings

# Final pick: BGE-base — retrieval-tuned, 768-dim, ~440 MB local download.
embeddings = HuggingFaceEmbeddings(
    model_name="BAAI/bge-base-en-v1.5",
    model_kwargs={"device": "cpu"},                  # use "mps" on Apple Silicon for speed
    encode_kwargs={"normalize_embeddings": True},    # required for cosine similarity
)

# Alternatives — uncomment one to swap:
# embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
# embeddings = HuggingFaceEmbeddings(model_name="BAAI/bge-large-en-v1.5")
# from langchain_openai import OpenAIEmbeddings
# embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

if __name__ == "__main__":
    sample = embeddings.embed_query("What does GDOT recommend for asphalt at PCI 65?")
    print(f"Vector length: {len(sample)}, first 5 dims: {sample[:5]}")
```

> Embedding the corpus happens inside step 5 — `FAISS.from_documents` calls `embed_documents` for you in batches.
>
> **Gotcha when swapping models:** the FAISS index built with one model can't be queried with a different one. If you change the embedding model, **delete `indices/phase1_faiss/` and re-run `ingest/build_index.py`** — vectors of different dimensions can't share a store.

### 5. Store everything in a FAISS index

Lecture 07 uses **FAISS in-memory** as the vector store, then `vectorstore.save_local(...)` to persist to disk. Stick with that pattern for Phase 1 — no Postgres setup, no extra service, builds in seconds. You'll graduate to pgvector later when Phase 2 needs to share the chunks table with structured Excel mirrors and session logs.

**Output:** a queryable knowledge base on disk, ready to be loaded by the chat process.

```python
# ingest/build_index.py
from pathlib import Path
from langchain_community.vectorstores import FAISS

from load_pdfs import load_pdfs
from load_excels import load_all_excels
from chunk import chunk_documents
from embed import embeddings

INDEX_DIR = Path("indices/phase1_faiss")

def build_index():
    print("Loading source documents...")
    docs = load_pdfs() + load_all_excels()

    print(f"Chunking {len(docs)} source documents...")
    chunks = chunk_documents(docs)
    print(f"Got {len(chunks)} chunks.")

    print("Embedding + indexing...")
    vectorstore = FAISS.from_documents(chunks, embeddings)

    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    vectorstore.save_local(str(INDEX_DIR))
    print(f"Saved FAISS index to {INDEX_DIR}/")
    return vectorstore

if __name__ == "__main__":
    build_index()
```

To reload later (in the chat process):

```python
from langchain_community.vectorstores import FAISS
from embed import embeddings
vectorstore = FAISS.load_local(
    "indices/phase1_faiss", embeddings, allow_dangerous_deserialization=True,
)
```

### 6. Sanity-check the index

Before moving to the LLM step, hit the index with 5 known questions whose answers you've already eyeballed in the source documents. *"What does GDOT recommend for asphalt at PCI 65?"* should return chunks from the GDOT guide's Chapter 2 and the `Rehabs` sheet's PCI-band rows. If it doesn't, your chunking or embedding has a problem and you fix it now, not after you've wired up the LLM.

**Output:** confidence that retrieval works in isolation.

```python
# ingest/sanity_check.py
from langchain_community.vectorstores import FAISS
from embed import embeddings

vectorstore = FAISS.load_local(
    "indices/phase1_faiss", embeddings, allow_dangerous_deserialization=True,
)

SANITY_QUERIES = [
    "What does GDOT recommend for asphalt pavement with PCI 65?",
    "What is the unit cost of a thin overlay on a residential road?",
    "How many segments are scheduled for rehab in year 1 in Peachtree Corners?",
    "What is the difference between SDI, RI, and SI in pavement assessment?",
    "What are the bid prices for milling asphalt pavement in 2024?",
]

for q in SANITY_QUERIES:
    print(f"\nQ: {q}")
    hits = vectorstore.similarity_search_with_score(q, k=3)
    for doc, score in hits:
        src = f"{doc.metadata.get('source','?')} p.{doc.metadata.get('page','-')}"
        print(f"  [{score:.3f}] {src}: {doc.page_content[:120].strip()}...")
```

> If a query you *know* should hit Chapter 2 of the GDOT guide instead returns chunks from the bid tabulation, that's your signal to re-chunk or re-embed.

---

## Querying (every time the user sends a message)

### 7. Embed the user's question

Run the user's raw question through the **same** embedding model as the chunks. LangChain hides this inside the retriever — you don't usually call `embed_query` yourself once you're past the sanity-check phase. If you ever want to inspect the query vector for debugging, the call is `embeddings.embed_query(question)`.

```python
# This step is wrapped automatically by `vectorstore.as_retriever()` in step 8.
# To see the query vector explicitly during debugging:
vec = embeddings.embed_query("What does GDOT recommend for asphalt at PCI 65?")
print(f"Query vector dim: {len(vec)}")
```

### 8. Find the top-K most-similar chunks

LangChain's retriever is a thin wrapper around `vectorstore.similarity_search`. Set `k=5` as the default — bigger K means more context (more cost + more risk of distracting noise); smaller K is cheaper but might miss relevant chunks.

```python
# chat/retrieve.py
from langchain_community.vectorstores import FAISS
from embed import embeddings

vectorstore = FAISS.load_local(
    "indices/phase1_faiss", embeddings, allow_dangerous_deserialization=True,
)

retriever = vectorstore.as_retriever(search_kwargs={"k": 5})

# Quick check — what does retrieval return for one question?
if __name__ == "__main__":
    docs = retriever.invoke("Recommend a treatment for asphalt at PCI 65 on a residential road.")
    for i, d in enumerate(docs, 1):
        print(f"[{i}] {d.metadata.get('source','?')} :: {d.page_content[:150]}")
```

> `as_retriever()` returns an object with `.invoke(query)` — that's exactly the shape LangChain chains expect downstream.

### 9. Build the prompt

Same `ChatPromptTemplate` pattern as lecture 07, with three additions: explicit **citation requirement**, explicit **refusal instruction** for out-of-corpus questions, and **formatting** of each retrieved chunk so the model can reference it by number.

```python
# chat/prompt.py
from langchain_core.prompts import ChatPromptTemplate

SYSTEM_PROMPT = """You are a pavement-management assistant for PavePal.
Answer the user's question using ONLY the context below.

Rules:
1. If the answer is not in the context, say "I don't have that information." Do not guess.
2. Cite your sources by chunk number, like [1] or [3].
3. When the user asks about cost or a specific recommendation, prefer numeric values
   that appear verbatim in the context. Do not interpolate.

Context:
{context}
"""

PROMPT = ChatPromptTemplate.from_messages([
    ("system", SYSTEM_PROMPT),
    ("user", "{input}"),
])

def format_docs(docs) -> str:
    """Format retrieved Documents as numbered, source-tagged chunks."""
    parts = []
    for i, d in enumerate(docs, 1):
        src = d.metadata.get("source", "?")
        loc = ""
        if (page := d.metadata.get("page")) is not None:
            loc = f" p.{page + 1}"   # PyPDFLoader is 0-indexed; show 1-indexed to humans
        elif (sheet := d.metadata.get("sheet")) is not None:
            loc = f" sheet '{sheet}' row {d.metadata.get('row', '?')}"
        parts.append(f"[{i}] (source: {src}{loc})\n{d.page_content.strip()}")
    return "\n\n".join(parts)
```

> The bracketed `[1] [2] ...` numbering matches the lecture's pattern. Step 11 will resolve those tags back to filenames + page numbers for the user-visible citation footer.

### 10. Call the LLM

Wire retrieval + prompt + LLM into a single chain using LangChain's pipe operator — same shape as lecture 07's `rag_chain`. Set `temperature=0` so identical inputs produce identical outputs (this is what lets you measure consistency).

#### Top 3 local (open-source, runs on your laptop or a small GPU)

| Model | Params | RAM (fp16) | When to pick it |
|---|---:|---:|---|
| `microsoft/Phi-4-mini-instruct` | 3.8 B | 4–8 GB | Strongest reasoning at small size; great on math/structured output. Best laptop pick. |
| `meta-llama/Llama-3.2-3B-Instruct` | 3 B | 8 GB | Most popular small instruct model; long support tail; predictable behavior. |
| `mistralai/Mistral-7B-Instruct-v0.3` | 7 B | 16 GB | Best free quality if you have RAM/GPU. Solid all-rounder. |

A local generation model is a viable fallback if API access is ever blocked, but for a capstone-grade deliverable they're all meaningfully behind the frontier API models on instruction-following, refusal calibration, and citation accuracy. Treat local as "demo-still-runs-on-a-plane," not "production."

#### Top 3 API (paid, hosted)

| Model | Provider | Cost (input / output, $ per 1M tokens) | Cost per typical RAG turn | When to pick it |
|---|---|---|---:|---|
| **`claude-sonnet-4-6`** | Anthropic | $3 / $15 | ~$0.04 | **Strong reasoning, native tool-use (matters for Phase 2), 200K context. Final pick.** |
| `gpt-4o` | OpenAI | $2.50 / $10 | ~$0.03 | Strong alternative; useful if you want vendor diversity for evaluation. |
| `claude-haiku-4-5` | Anthropic | $1 / $5 | ~$0.013 | Same family as Sonnet, ~3× cheaper. Use for dev iteration loops, switch back to Sonnet for final eval. |

#### Final pick: Claude Sonnet 4.6 (Anthropic API)

**Why:**
- **Refusal calibration.** Sonnet reliably says "I don't have that information" when context doesn't support an answer — directly addresses the "will AI make things up?" success criterion.
- **Citation discipline.** Strong instruction-following means it actually emits the `[1]`, `[3]` citation tags we ask for in the prompt, instead of paraphrasing without sourcing.
- **Native tool-use.** Important when we extend to Phase 2 (`vector_search`, `lookup_segment`, etc.) — same SDK, same loop, no rework.
- **Long context.** 200K-token window comfortably fits 5–10 retrieved chunks plus conversation history without trimming.
- **Two-tier cost.** Switch the model name to `claude-haiku-4-5` for cheap dev iteration; switch back to Sonnet for the final eval run. Same SDK, no other code changes.

#### Code

```python
# chat/chain.py
import os
from dotenv import load_dotenv
load_dotenv()

from langchain_anthropic import ChatAnthropic
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser

from retrieve import retriever
from prompt import PROMPT, format_docs

# Final pick: Claude Sonnet 4.6 via langchain_anthropic.
llm = ChatAnthropic(
    model="claude-sonnet-4-6",
    temperature=0,                           # deterministic for consistency eval
    max_tokens=1024,
    anthropic_api_key=os.environ["ANTHROPIC_API_KEY"],
)

# Alternatives — uncomment one to swap:
# llm = ChatAnthropic(model="claude-haiku-4-5", temperature=0)         # cheaper dev iteration
# from langchain_openai import ChatOpenAI
# llm = ChatOpenAI(model="gpt-4o", temperature=0)                      # OpenAI alternative

# The chain:
#   1. Take the user's question.
#   2. Send it to the retriever -> get top-K Documents.
#   3. Format those into a "context" string.
#   4. Stuff context + user input into the prompt template.
#   5. Send to the LLM.
#   6. Parse the response to a plain string.
rag_chain = (
    RunnablePassthrough.assign(
        retrieved_docs=lambda x: retriever.invoke(x["input"])
    )
    | RunnablePassthrough.assign(
        context=lambda x: format_docs(x["retrieved_docs"])
    )
    | PROMPT
    | llm
    | StrOutputParser()
)

def ask(question: str) -> tuple[str, list]:
    """Returns (answer_text, retrieved_documents)."""
    retrieved_docs = retriever.invoke(question)
    answer = rag_chain.invoke({"input": question})
    return answer, retrieved_docs

if __name__ == "__main__":
    answer, docs = ask("What does GDOT recommend for asphalt at PCI 65?")
    print("ANSWER:")
    print(answer)
    print("\nSOURCES USED:")
    for i, d in enumerate(docs, 1):
        print(f"  [{i}] {d.metadata.get('source','?')} :: {d.page_content[:80].strip()}")
```

### 11. Post-process the answer

Parse the citation tags Claude emitted (`[1]`, `[3]`, ...), look up the chunks they refer to, and attach a "Sources:" footer to the answer with the actual filenames and page numbers. Now the user can verify any claim by opening the source.

```python
# chat/cite.py
import re

def attach_citations(answer: str, retrieved_docs: list) -> str:
    """Append a 'Sources:' block listing every chunk the answer cited."""
    # Find every [N] tag the model emitted
    cited = sorted(set(int(m) for m in re.findall(r"\[(\d+)\]", answer)))
    if not cited:
        return answer + "\n\n(No sources cited — flag for review.)"

    lines = ["", "**Sources:**"]
    for n in cited:
        if 1 <= n <= len(retrieved_docs):
            d = retrieved_docs[n - 1]
            src = d.metadata.get("source", "?")
            page = d.metadata.get("page")
            sheet = d.metadata.get("sheet")
            row = d.metadata.get("row")
            loc = (f", page {page + 1}" if page is not None
                   else f", sheet '{sheet}' row {row}" if sheet is not None
                   else "")
            lines.append(f"[{n}] {src}{loc}")
    return answer + "\n" + "\n".join(lines)

if __name__ == "__main__":
    from chain import ask
    ans, docs = ask("Recommend a treatment for asphalt at PCI 65, residential road.")
    print(attach_citations(ans, docs))
```

> If the model produces an answer with **no** `[N]` tags, that's a red flag — flag it for review during evaluation. Strong RAG answers always cite.

### 12. Log everything

Every chat turn should write to a log: the question, the chunks returned (and their similarity scores), the model's answer, the citations it actually used, and the input/output token counts. This logging is *not* optional — it's how you'll later score the gold set, debug failures, and satisfy the eval supervisor's "show your work" requirement.

For Phase 1 a JSON-lines file is fine. (You'll graduate to a Postgres `messages` table when Phase 2 needs cross-session memory.)

```python
# chat/log.py
import json, time, uuid
from pathlib import Path
import tiktoken

LOG_PATH = Path("logs/phase1_chat.jsonl")
LOG_PATH.parent.mkdir(parents=True, exist_ok=True)

# cl100k_base matches what OpenAI text-embedding-3 uses; close enough for cost estimation
_enc = tiktoken.get_encoding("cl100k_base")
def count_tokens(text: str) -> int:
    return len(_enc.encode(text))

def log_turn(question: str, retrieved_docs: list, answer: str,
             session_id: str | None = None) -> dict:
    record = {
        "session_id": session_id or str(uuid.uuid4()),
        "ts": time.time(),
        "question": question,
        "retrieved": [
            {
                "source": d.metadata.get("source"),
                "page": d.metadata.get("page"),
                "sheet": d.metadata.get("sheet"),
                "row": d.metadata.get("row"),
                "preview": d.page_content[:200],
            }
            for d in retrieved_docs
        ],
        "answer": answer,
        "tokens": {
            "question": count_tokens(question),
            "context": sum(count_tokens(d.page_content) for d in retrieved_docs),
            "answer": count_tokens(answer),
        },
    }
    with LOG_PATH.open("a") as f:
        f.write(json.dumps(record) + "\n")
    return record

if __name__ == "__main__":
    from chain import ask
    from cite import attach_citations
    q = "What does GDOT recommend for asphalt at PCI 65?"
    ans, docs = ask(q)
    full = attach_citations(ans, docs)
    log_turn(q, docs, full)
    print(full)
```

> Run a small batch of queries through this and inspect the log. If you see one source dominating every answer, your retrieval is over-fit to that document — re-balance chunks or tweak the prompt.

---

## What's worth iterating on within Phase 1

Phase 1 itself has two natural iterations worth running:

| Aspect | v1 (week 3) — get it working | v2 (week 4) — make it good |
|---|---|---|
| Chunk size | 2,000 chars (≈ 500 tokens) | Try 1,000 / 2,000 / 4,000 against gold set |
| Top-K | K = 5 | Tune K based on recall@K curves |
| Embedding model | `all-MiniLM-L6-v2` (free, 384-dim) | `text-embedding-3-small` (1536-dim) if recall plateaus |
| Retrieval | Vector only | Add BM25 fallback (`rank_bm25` from lecture 5) for exact terms (GISID, "Code 30", street names) |
| Citations | Tag-based | Verify the LLM cites the chunks it actually used (not just plausible-looking ones) |
| Eval | Manual spot-check on 5 Qs | Full 30-Q gold set with LLM-judge scoring |

You only commit to Phase 2 (the agentic-RAG layer with deterministic Excel tools) **after** v2 of Phase 1 is measured and bottlenecks are identified.

---

## File layout summary

```
pavepal-capstone/
├── .env                              # ANTHROPIC_API_KEY  (gitignored)
├── ingest/
│   ├── load_pdfs.py                  # Step 1
│   ├── load_excels.py                # Step 2
│   ├── chunk.py                      # Step 3
│   ├── embed.py                      # Step 4
│   ├── build_index.py                # Step 5  (run once)
│   └── sanity_check.py               # Step 6
├── chat/
│   ├── retrieve.py                   # Step 8
│   ├── prompt.py                     # Step 9
│   ├── chain.py                      # Steps 7, 10
│   ├── cite.py                       # Step 11
│   └── log.py                        # Step 12
├── indices/phase1_faiss/             # FAISS index on disk (built by step 5)
└── logs/phase1_chat.jsonl            # Per-turn log (written by step 12)
```

To go from zero to a working assistant:

```bash
# One-time
python ingest/build_index.py          # ~2 min including download of MiniLM weights
python ingest/sanity_check.py         # eyeball the retrieval

# Per-question
python chat/log.py                    # runs one full ask + cite + log cycle
```

---

## Pointers

| Concept | Source |
|---|---|
| `RecursiveCharacterTextSplitter`, `HuggingFaceEmbeddings`, `FAISS.from_documents`, `ChatPromptTemplate`, pipe-chain pattern | `Lecture_notes/07_llms-rag.ipynb` § 3.1–3.4 |
| BM25 (for the v2 hybrid retrieval upgrade) | `Lecture_notes/05_info-retrieval-intro-to-transformers.ipynb` § Sparse retrieval |
| Tool calling (relevant to Phase 2, not Phase 1) | `Lecture_notes/08_llms-tools-and-multimodal.ipynb` |
| LangChain `Document`, retrievers, runnables | https://python.langchain.com/docs/concepts/ |
| `langchain-anthropic` | https://python.langchain.com/docs/integrations/chat/anthropic/ |
| pypdf — extracting page text | https://pypdf.readthedocs.io/ |
| FAISS — fast similarity search | https://github.com/facebookresearch/faiss/wiki |
