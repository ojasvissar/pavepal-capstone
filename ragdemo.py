# ---
# jupyter:
#   jupytext:
#     formats: py:percent
#     text_representation:
#       extension: .py
#       format_name: percent
#       format_version: '1.3'
#       jupytext_version: 1.17.3
#   kernelspec:
#     display_name: Python (571)
#     language: python
#     name: '571'
# ---

# %%
# !pip install pypdf scikit-learn


# %pip install pypdf scikit-learn

# %%
"""
Mini-RAG feasibility test on the GDOT pavement preservation guide.

What this script does:
  1. Reads the first 20 pages of the GDOT PDF.
  2. Splits the text into paragraph-sized chunks.
  3. Builds a searchable index over those chunks.
  4. Runs 5 test queries and prints the top match for each.
  5. Times every step so you can see how long each part takes.

Note on the search method:
  In a real system you would use neural embeddings (e.g. sentence-transformers
  + FAISS). The sandbox running this script can't load PyTorch, so this demo
  uses TF-IDF instead. TF-IDF is a simpler, keyword-based method.
  The timings for ingestion and chunking are realistic. Embedding time on a
  real laptop with sentence-transformers will be 30 sec to 2 min for ~30 chunks.
  The retrieval and answer-quality tradeoffs differ between TF-IDF and neural,
  but the END-TO-END SHAPE of the pipeline is identical.
"""

import time
import re
from pathlib import Path
from pypdf import PdfReader
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

PDF_PATH = "data/GDOT_PAVEMENT_PRESERVATION_GUIDE.pdf"
PAGES_TO_READ = 20  # out of 472 total

# Five test questions a city engineer might actually ask.
QUERIES = [
    "What is pavement preservation?",
    "When should chip seal be applied?",
    "What is the difference between preventive maintenance and rehabilitation?",
    "How is PCI calculated?",
    "What treatments are recommended for high-traffic asphalt roads?",
]

def banner(text):
    print("\n" + "=" * 68)
    print(text)
    print("=" * 68)

# ----------------------------------------------------------------------------
# Step 1: extract text from the PDF
# ----------------------------------------------------------------------------
banner(f"STEP 1: Extract text from first {PAGES_TO_READ} pages")
t0 = time.perf_counter()

reader = PdfReader(PDF_PATH)
total_pages = len(reader.pages)
texts = []
for i in range(min(PAGES_TO_READ, total_pages)):
    page_text = reader.pages[i].extract_text() or ""
    texts.append(page_text)
full_text = "\n\n".join(texts)

t1 = time.perf_counter()
print(f"  PDF total pages:         {total_pages}")
print(f"  Pages read:              {PAGES_TO_READ}")
print(f"  Characters extracted:    {len(full_text):,}")
print(f"  Words extracted:         {len(full_text.split()):,}")
print(f"  TIME:                    {t1 - t0:.2f} sec")

# ----------------------------------------------------------------------------
# Step 2: chunk the text
# ----------------------------------------------------------------------------
banner("STEP 2: Split into chunks")
t2 = time.perf_counter()

# Simple paragraph-based chunking with a minimum size filter.
raw_paragraphs = re.split(r"\n\s*\n+", full_text)
chunks = []
buf = ""
MIN_CHARS = 200  # merge tiny fragments
MAX_CHARS = 1500  # cap so no chunk is too long
for p in raw_paragraphs:
    p = re.sub(r"\s+", " ", p).strip()
    if not p:
        continue
    if len(buf) + len(p) < MAX_CHARS:
        buf = (buf + " " + p).strip()
    else:
        if len(buf) >= MIN_CHARS:
            chunks.append(buf)
        buf = p
    if len(buf) >= MAX_CHARS:
        chunks.append(buf)
        buf = ""
if len(buf) >= MIN_CHARS:
    chunks.append(buf)

t3 = time.perf_counter()
chunk_lens = [len(c) for c in chunks]
print(f"  Number of chunks:        {len(chunks)}")
print(f"  Avg chunk length:        {sum(chunk_lens) // max(len(chunks), 1):,} chars")
print(f"  Min / max chunk:         {min(chunk_lens)} / {max(chunk_lens)} chars")
print(f"  TIME:                    {t3 - t2:.2f} sec")

# ----------------------------------------------------------------------------
# Step 3: build the search index (TF-IDF in this demo)
# ----------------------------------------------------------------------------
banner("STEP 3: Build searchable index")
t4 = time.perf_counter()

vectorizer = TfidfVectorizer(
    lowercase=True,
    stop_words="english",
    ngram_range=(1, 2),  # unigrams + bigrams
    max_df=0.9,
    min_df=1,
)
chunk_matrix = vectorizer.fit_transform(chunks)

t5 = time.perf_counter()
print(f"  Index vocabulary size:   {len(vectorizer.vocabulary_):,} terms")
print(f"  Matrix shape:            {chunk_matrix.shape}")
print(f"  TIME:                    {t5 - t4:.2f} sec")
print()
print("  (On a real laptop with sentence-transformers + FAISS, this step")
print("   takes ~30 sec to 2 min for the first run because the embedding")
print("   model has to download (~80 MB). Subsequent runs are cached.)")

# ----------------------------------------------------------------------------
# Step 4: run the test queries
# ----------------------------------------------------------------------------
banner("STEP 4: Run test queries (top match for each)")

per_query_times = []
for q in QUERIES:
    tq0 = time.perf_counter()
    q_vec = vectorizer.transform([q])
    sims = cosine_similarity(q_vec, chunk_matrix).flatten()
    top_idx = sims.argsort()[-3:][::-1]  # top 3
    tq1 = time.perf_counter()
    per_query_times.append(tq1 - tq0)

    print(f"\n  Q: {q}")
    print(f"     query time: {(tq1 - tq0) * 1000:.1f} ms")
    best = top_idx[0]
    snippet = chunks[best][:280].replace("\n", " ")
    print(f"     best match (chunk {best}, score {sims[best]:.3f}):")
    print(f"     \"{snippet}...\"")

# ----------------------------------------------------------------------------
# Summary
# ----------------------------------------------------------------------------
banner("SUMMARY")
total_build = (t1 - t0) + (t3 - t2) + (t5 - t4)
avg_query = sum(per_query_times) / len(per_query_times)
print(f"  One-time build cost (extract + chunk + index): {total_build:.2f} sec")
print(f"  Average per-query time:                        {avg_query * 1000:.1f} ms")
print()
print(f"  Extrapolation to the FULL GDOT manual (472 pages, ~24x more text):")
print(f"    Estimated build time:    ~{total_build * (472 / PAGES_TO_READ):.0f} sec one-time")
print(f"    Per-query time:          unchanged (~{avg_query * 1000:.0f} ms — search is fast)")
print()
print(f"  These are realistic for the keyword-based (TF-IDF) baseline.")
print(f"  Neural embeddings will roughly: 30 sec to 2 min for first build")
print(f"  (model download), then 1-2 minutes to embed ~700 chunks the first")
print(f"  time, cached after.")


# %%
"""
Mini-RAG feasibility test on the GDOT pavement preservation guide.

What this script does:
  1. Reads the first 20 pages of the GDOT PDF.
  2. Splits the text into paragraph-sized chunks.
  3. Builds a searchable index over those chunks.
  4. Runs 5 test queries and prints the top match for each.
  5. Times every step so you can see how long each part takes.

Note on the search method:
  In a real system you would use neural embeddings (e.g. sentence-transformers
  + FAISS). The sandbox running this script can't load PyTorch, so this demo
  uses TF-IDF instead. TF-IDF is a simpler, keyword-based method.
  The timings for ingestion and chunking are realistic. Embedding time on a
  real laptop with sentence-transformers will be 30 sec to 2 min for ~30 chunks.
  The retrieval and answer-quality tradeoffs differ between TF-IDF and neural,
  but the END-TO-END SHAPE of the pipeline is identical.
"""

import time
import re
from pathlib import Path
from pypdf import PdfReader
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

PDF_PATH = "data/GDOT_PAVEMENT_PRESERVATION_GUIDE.pdf"
PAGES_TO_READ = 472  # out of 472 total

# Five test questions a city engineer might actually ask.
QUERIES = [
    "What is pavement preservation?",
    "When should chip seal be applied?",
    "What is the difference between preventive maintenance and rehabilitation?",
    "How is PCI calculated?",
    "What treatments are recommended for high-traffic asphalt roads?",
]

def banner(text):
    print("\n" + "=" * 68)
    print(text)
    print("=" * 68)

# ----------------------------------------------------------------------------
# Step 1: extract text from the PDF
# ----------------------------------------------------------------------------
banner(f"STEP 1: Extract text from first {PAGES_TO_READ} pages")
t0 = time.perf_counter()

reader = PdfReader(PDF_PATH)
total_pages = len(reader.pages)
texts = []
for i in range(min(PAGES_TO_READ, total_pages)):
    page_text = reader.pages[i].extract_text() or ""
    texts.append(page_text)
full_text = "\n\n".join(texts)

t1 = time.perf_counter()
print(f"  PDF total pages:         {total_pages}")
print(f"  Pages read:              {PAGES_TO_READ}")
print(f"  Characters extracted:    {len(full_text):,}")
print(f"  Words extracted:         {len(full_text.split()):,}")
print(f"  TIME:                    {t1 - t0:.2f} sec")

# ----------------------------------------------------------------------------
# Step 2: chunk the text
# ----------------------------------------------------------------------------
banner("STEP 2: Split into chunks")
t2 = time.perf_counter()

# Simple paragraph-based chunking with a minimum size filter.
raw_paragraphs = re.split(r"\n\s*\n+", full_text)
chunks = []
buf = ""
MIN_CHARS = 200  # merge tiny fragments
MAX_CHARS = 1500  # cap so no chunk is too long
for p in raw_paragraphs:
    p = re.sub(r"\s+", " ", p).strip()
    if not p:
        continue
    if len(buf) + len(p) < MAX_CHARS:
        buf = (buf + " " + p).strip()
    else:
        if len(buf) >= MIN_CHARS:
            chunks.append(buf)
        buf = p
    if len(buf) >= MAX_CHARS:
        chunks.append(buf)
        buf = ""
if len(buf) >= MIN_CHARS:
    chunks.append(buf)

t3 = time.perf_counter()
chunk_lens = [len(c) for c in chunks]
print(f"  Number of chunks:        {len(chunks)}")
print(f"  Avg chunk length:        {sum(chunk_lens) // max(len(chunks), 1):,} chars")
print(f"  Min / max chunk:         {min(chunk_lens)} / {max(chunk_lens)} chars")
print(f"  TIME:                    {t3 - t2:.2f} sec")

# ----------------------------------------------------------------------------
# Step 3: build the search index (TF-IDF in this demo)
# ----------------------------------------------------------------------------
banner("STEP 3: Build searchable index")
t4 = time.perf_counter()

vectorizer = TfidfVectorizer(
    lowercase=True,
    stop_words="english",
    ngram_range=(1, 2),  # unigrams + bigrams
    max_df=0.9,
    min_df=1,
)
chunk_matrix = vectorizer.fit_transform(chunks)

t5 = time.perf_counter()
print(f"  Index vocabulary size:   {len(vectorizer.vocabulary_):,} terms")
print(f"  Matrix shape:            {chunk_matrix.shape}")
print(f"  TIME:                    {t5 - t4:.2f} sec")
print()
print("  (On a real laptop with sentence-transformers + FAISS, this step")
print("   takes ~30 sec to 2 min for the first run because the embedding")
print("   model has to download (~80 MB). Subsequent runs are cached.)")

# ----------------------------------------------------------------------------
# Step 4: run the test queries
# ----------------------------------------------------------------------------
banner("STEP 4: Run test queries (top match for each)")

per_query_times = []
for q in QUERIES:
    tq0 = time.perf_counter()
    q_vec = vectorizer.transform([q])
    sims = cosine_similarity(q_vec, chunk_matrix).flatten()
    top_idx = sims.argsort()[-3:][::-1]  # top 3
    tq1 = time.perf_counter()
    per_query_times.append(tq1 - tq0)

    print(f"\n  Q: {q}")
    print(f"     query time: {(tq1 - tq0) * 1000:.1f} ms")
    best = top_idx[0]
    snippet = chunks[best][:280].replace("\n", " ")
    print(f"     best match (chunk {best}, score {sims[best]:.3f}):")
    print(f"     \"{snippet}...\"")

# ----------------------------------------------------------------------------
# Summary
# ----------------------------------------------------------------------------
banner("SUMMARY")
total_build = (t1 - t0) + (t3 - t2) + (t5 - t4)
avg_query = sum(per_query_times) / len(per_query_times)
print(f"  One-time build cost (extract + chunk + index): {total_build:.2f} sec")
print(f"  Average per-query time:                        {avg_query * 1000:.1f} ms")
print()
print(f"  Extrapolation to the FULL GDOT manual (472 pages, ~24x more text):")
print(f"    Estimated build time:    ~{total_build * (472 / PAGES_TO_READ):.0f} sec one-time")
print(f"    Per-query time:          unchanged (~{avg_query * 1000:.0f} ms — search is fast)")
print()
print(f"  These are realistic for the keyword-based (TF-IDF) baseline.")
print(f"  Neural embeddings will roughly: 30 sec to 2 min for first build")
print(f"  (model download), then 1-2 minutes to embed ~700 chunks the first")
print(f"  time, cached after.")


# %%
"""
Mini-RAG feasibility test on the GDOT pavement preservation guide.

What this script does:
  1. Reads the first 20 pages of the GDOT PDF.
  2. Splits the text into paragraph-sized chunks.
  3. Builds a searchable index over those chunks.
  4. Runs 5 test queries and prints the top match for each.
  5. Times every step so you can see how long each part takes.

Note on the search method:
  In a real system you would use neural embeddings (e.g. sentence-transformers
  + FAISS). The sandbox running this script can't load PyTorch, so this demo
  uses TF-IDF instead. TF-IDF is a simpler, keyword-based method.
  The timings for ingestion and chunking are realistic. Embedding time on a
  real laptop with sentence-transformers will be 30 sec to 2 min for ~30 chunks.
  The retrieval and answer-quality tradeoffs differ between TF-IDF and neural,
  but the END-TO-END SHAPE of the pipeline is identical.
"""

import time
import re
from pathlib import Path
from pypdf import PdfReader
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

PDF_PATH = "data/GDOT_PAVEMENT_PRESERVATION_GUIDE.pdf"
PAGES_TO_READ = 472  # out of 472 total

# Five test questions a city engineer might actually ask.
QUERIES = [
    "What is pavement preservation?",
    "When should chip seal be applied?",
    "What is the difference between preventive maintenance and rehabilitation?",
    "How is PCI calculated?",
    "What treatments are recommended for high-traffic asphalt roads?",
]

def banner(text):
    print("\n" + "=" * 68)
    print(text)
    print("=" * 68)

# ----------------------------------------------------------------------------
# Step 1: extract text from the PDF
# ----------------------------------------------------------------------------
banner(f"STEP 1: Extract text from first {PAGES_TO_READ} pages")
t0 = time.perf_counter()

reader = PdfReader(PDF_PATH)
total_pages = len(reader.pages)
texts = []
for i in range(min(PAGES_TO_READ, total_pages)):
    page_text = reader.pages[i].extract_text() or ""
    texts.append(page_text)
full_text = "\n\n".join(texts)

t1 = time.perf_counter()
print(f"  PDF total pages:         {total_pages}")
print(f"  Pages read:              {PAGES_TO_READ}")
print(f"  Characters extracted:    {len(full_text):,}")
print(f"  Words extracted:         {len(full_text.split()):,}")
print(f"  TIME:                    {t1 - t0:.2f} sec")

# ----------------------------------------------------------------------------
# Step 2: chunk the text
# ----------------------------------------------------------------------------
banner("STEP 2: Split into chunks")
t2 = time.perf_counter()

# Simple paragraph-based chunking with a minimum size filter.
raw_paragraphs = re.split(r"\n\s*\n+", full_text)
chunks = []
buf = ""
MIN_CHARS = 200  # merge tiny fragments
MAX_CHARS = 600  # cap so no chunk is too long
for p in raw_paragraphs:
    p = re.sub(r"\s+", " ", p).strip()
    if not p:
        continue
    if len(buf) + len(p) < MAX_CHARS:
        buf = (buf + " " + p).strip()
    else:
        if len(buf) >= MIN_CHARS:
            chunks.append(buf)
        buf = p
    if len(buf) >= MAX_CHARS:
        chunks.append(buf)
        buf = ""
if len(buf) >= MIN_CHARS:
    chunks.append(buf)

t3 = time.perf_counter()
chunk_lens = [len(c) for c in chunks]
print(f"  Number of chunks:        {len(chunks)}")
print(f"  Avg chunk length:        {sum(chunk_lens) // max(len(chunks), 1):,} chars")
print(f"  Min / max chunk:         {min(chunk_lens)} / {max(chunk_lens)} chars")
print(f"  TIME:                    {t3 - t2:.2f} sec")

# ----------------------------------------------------------------------------
# Step 3: build the search index (TF-IDF in this demo)
# ----------------------------------------------------------------------------
banner("STEP 3: Build searchable index")
t4 = time.perf_counter()

vectorizer = TfidfVectorizer(
    lowercase=True,
    stop_words="english",
    ngram_range=(1, 2),  # unigrams + bigrams
    max_df=0.9,
    min_df=1,
)
chunk_matrix = vectorizer.fit_transform(chunks)

t5 = time.perf_counter()
print(f"  Index vocabulary size:   {len(vectorizer.vocabulary_):,} terms")
print(f"  Matrix shape:            {chunk_matrix.shape}")
print(f"  TIME:                    {t5 - t4:.2f} sec")
print()
print("  (On a real laptop with sentence-transformers + FAISS, this step")
print("   takes ~30 sec to 2 min for the first run because the embedding")
print("   model has to download (~80 MB). Subsequent runs are cached.)")

# ----------------------------------------------------------------------------
# Step 4: run the test queries
# ----------------------------------------------------------------------------
banner("STEP 4: Run test queries (top match for each)")

per_query_times = []
for q in QUERIES:
    tq0 = time.perf_counter()
    q_vec = vectorizer.transform([q])
    sims = cosine_similarity(q_vec, chunk_matrix).flatten()
    top_idx = sims.argsort()[-3:][::-1]  # top 3
    tq1 = time.perf_counter()
    per_query_times.append(tq1 - tq0)

    print(f"\n  Q: {q}")
    print(f"     query time: {(tq1 - tq0) * 1000:.1f} ms")
    best = top_idx[0]
    snippet = chunks[best][:280].replace("\n", " ")
    print(f"     best match (chunk {best}, score {sims[best]:.3f}):")
    print(f"     \"{snippet}...\"")

# ----------------------------------------------------------------------------
# Summary
# ----------------------------------------------------------------------------
banner("SUMMARY")
total_build = (t1 - t0) + (t3 - t2) + (t5 - t4)
avg_query = sum(per_query_times) / len(per_query_times)
print(f"  One-time build cost (extract + chunk + index): {total_build:.2f} sec")
print(f"  Average per-query time:                        {avg_query * 1000:.1f} ms")
print()
print(f"  Extrapolation to the FULL GDOT manual (472 pages, ~24x more text):")
print(f"    Estimated build time:    ~{total_build * (472 / PAGES_TO_READ):.0f} sec one-time")
print(f"    Per-query time:          unchanged (~{avg_query * 1000:.0f} ms — search is fast)")
print()
print(f"  These are realistic for the keyword-based (TF-IDF) baseline.")
print(f"  Neural embeddings will roughly: 30 sec to 2 min for first build")
print(f"  (model download), then 1-2 minutes to embed ~700 chunks the first")
print(f"  time, cached after.")


# %%
# %pip install sentence-transformers faiss-cpu

# %%
from sentence_transformers import SentenceTransformer
print("Starting download test...")
m = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
print("DONE — model loaded")

# %%
"""
Mini-RAG v2: same pipeline as v1, but using neural embeddings instead of TF-IDF.

What changed from v1:
  - Step 3 builds a neural embedding index (sentence-transformers + FAISS)
    instead of a TF-IDF index.
  - Step 4 encodes the query with the same neural model and searches FAISS.

Everything else is identical so you can compare results directly.

Before running, install the libraries (run this once in a Jupyter cell):
    %pip install sentence-transformers faiss-cpu pypdf

The first run will download ~80 MB for the embedding model. Subsequent runs
are fast because the model is cached locally.
"""

import time
import re
from pypdf import PdfReader
from sentence_transformers import SentenceTransformer
import faiss
import numpy as np

# ----------------------------------------------------------------------------
# Configuration — point this at your PDF
# ----------------------------------------------------------------------------
PDF_PATH = "data/GDOT_PAVEMENT_PRESERVATION_GUIDE.pdf"  # update if needed
PAGES_TO_READ = 472  # full manual

MIN_CHARS = 200
MAX_CHARS = 600  # the smaller-chunk setting from v1's last run

EMBED_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"  # ~130 MB, strong on benchmarks

QUERIES = [
    "What is pavement preservation?",
    "When should chip seal be applied?",
    "What is the difference between preventive maintenance and rehabilitation?",
    "How is PCI calculated?",
    "What treatments are recommended for high-traffic asphalt roads?",
]


def banner(text):
    print("\n" + "=" * 68)
    print(text)
    print("=" * 68)


# ----------------------------------------------------------------------------
# Step 1: extract text from the PDF (same as v1)
# ----------------------------------------------------------------------------
banner(f"STEP 1: Extract text from first {PAGES_TO_READ} pages")
t0 = time.perf_counter()

reader = PdfReader(PDF_PATH)
total_pages = len(reader.pages)
texts = []
for i in range(min(PAGES_TO_READ, total_pages)):
    page_text = reader.pages[i].extract_text() or ""
    texts.append(page_text)
full_text = "\n\n".join(texts)

t1 = time.perf_counter()
print(f"  PDF total pages:         {total_pages}")
print(f"  Pages read:              {PAGES_TO_READ}")
print(f"  Characters extracted:    {len(full_text):,}")
print(f"  Words extracted:         {len(full_text.split()):,}")
print(f"  TIME:                    {t1 - t0:.2f} sec")


# ----------------------------------------------------------------------------
# Step 2: chunk the text (same as v1)
# ----------------------------------------------------------------------------
banner("STEP 2: Split into chunks")
t2 = time.perf_counter()

raw_paragraphs = re.split(r"\n\s*\n+", full_text)
chunks = []
buf = ""
for p in raw_paragraphs:
    p = re.sub(r"\s+", " ", p).strip()
    if not p:
        continue
    if len(buf) + len(p) < MAX_CHARS:
        buf = (buf + " " + p).strip()
    else:
        if len(buf) >= MIN_CHARS:
            chunks.append(buf)
        buf = p
    if len(buf) >= MAX_CHARS:
        chunks.append(buf)
        buf = ""
if len(buf) >= MIN_CHARS:
    chunks.append(buf)

t3 = time.perf_counter()
chunk_lens = [len(c) for c in chunks]
print(f"  Number of chunks:        {len(chunks)}")
print(f"  Avg chunk length:        {sum(chunk_lens) // max(len(chunks), 1):,} chars")
print(f"  Min / max chunk:         {min(chunk_lens)} / {max(chunk_lens)} chars")
print(f"  TIME:                    {t3 - t2:.2f} sec")


# ----------------------------------------------------------------------------
# Step 3: load the embedding model and embed every chunk
# ----------------------------------------------------------------------------
banner("STEP 3a: Load embedding model")
t4 = time.perf_counter()
print(f"  Loading model: {EMBED_MODEL_NAME}")
print("  (first run downloads ~130 MB; cached after that)")

model = SentenceTransformer(EMBED_MODEL_NAME)

t5 = time.perf_counter()
print(f"  Embedding dimension:     {model.get_sentence_embedding_dimension()}")
print(f"  TIME:                    {t5 - t4:.2f} sec")


banner("STEP 3b: Embed all chunks and build FAISS index")
t6 = time.perf_counter()

# Encode all chunks. normalize_embeddings=True lets us use inner product
# as cosine similarity, which is the standard cheap trick.
chunk_vecs = model.encode(
    chunks,
    batch_size=32,
    show_progress_bar=False,
    normalize_embeddings=True,
    convert_to_numpy=True,
).astype("float32")

# FAISS index using inner product (== cosine similarity on normalized vectors)
dim = chunk_vecs.shape[1]
index = faiss.IndexFlatIP(dim)
index.add(chunk_vecs)

t7 = time.perf_counter()
print(f"  Chunks embedded:         {len(chunks)}")
print(f"  Vector dimension:        {dim}")
print(f"  FAISS index size:        {index.ntotal} vectors")
print(f"  TIME:                    {t7 - t6:.2f} sec")


# ----------------------------------------------------------------------------
# Step 4: run the test queries
# ----------------------------------------------------------------------------
banner("STEP 4: Run test queries (top match for each)")

per_query_times = []
for q in QUERIES:
    tq0 = time.perf_counter()
    q_vec = model.encode(
        [q], normalize_embeddings=True, convert_to_numpy=True
    ).astype("float32")
    scores, idxs = index.search(q_vec, k=3)
    tq1 = time.perf_counter()
    per_query_times.append(tq1 - tq0)

    print(f"\n  Q: {q}")
    print(f"     query time: {(tq1 - tq0) * 1000:.1f} ms")
    best = idxs[0][0]
    best_score = scores[0][0]
    snippet = chunks[best][:280].replace("\n", " ")
    print(f"     best match (chunk {best}, score {best_score:.3f}):")
    print(f'     "{snippet}..."')


# ----------------------------------------------------------------------------
# Summary
# ----------------------------------------------------------------------------
banner("SUMMARY")
load_time = t5 - t4
embed_time = t7 - t6
total_build = (t1 - t0) + (t3 - t2) + load_time + embed_time
avg_query = sum(per_query_times) / len(per_query_times)
print(f"  PDF extraction:          {t1 - t0:.2f} sec")
print(f"  Chunking:                {t3 - t2:.2f} sec")
print(f"  Model load (one-time):   {load_time:.2f} sec")
print(f"  Embedding all chunks:    {embed_time:.2f} sec")
print(f"  Total build (one-time):  {total_build:.2f} sec")
print(f"  Average per-query time:  {avg_query * 1000:.1f} ms")
print()
print("  Compare to v1 (TF-IDF):")
print("    v1 build was ~5 sec, v2 build is slower because of embedding.")
print("    But v2 should answer the 'PCI' and 'difference' questions much")
print("    better because it understands meaning, not just keywords.")

# %%
