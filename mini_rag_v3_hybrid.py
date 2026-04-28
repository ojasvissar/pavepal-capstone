"""
Mini-RAG v3: Hybrid retrieval (TF-IDF + neural) combined with
Reciprocal Rank Fusion.

What this script does:
  1. Reads the GDOT PDF (same as v1 and v2).
  2. Chunks it (same as v1 and v2).
  3. Builds BOTH a TF-IDF index and a neural embedding index.
  4. For each question, runs both searches and combines them with RRF.
  5. Prints all three results side by side: TF-IDF only, neural only, hybrid.

Reciprocal Rank Fusion (RRF) in plain words:
  - Each search method ranks chunks 1st, 2nd, 3rd, etc.
  - For each chunk, score = 1/(rank + k) where k is a constant (60 is standard).
  - A chunk that ranks well in BOTH methods gets a higher combined score.
  - A chunk only one method liked gets a lower combined score.
  - Sort by combined score, return top 3.

Before running, make sure these libraries are installed (one Jupyter cell):
    %pip install pypdf scikit-learn sentence-transformers

This script does NOT use FAISS — to keep it simple it does similarity by
hand with numpy. Fine for ~500 chunks; you'd want FAISS at larger scale.
"""

import time
import re
from pypdf import PdfReader
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sentence_transformers import SentenceTransformer
import numpy as np

# ----------------------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------------------
PDF_PATH = "data/GDOT_PAVEMENT_PRESERVATION_GUIDE.pdf"  # update if needed
PAGES_TO_READ = 472

MIN_CHARS = 200
MAX_CHARS = 600

EMBED_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

K_RRF = 60          # standard RRF constant from the literature
TOP_K_PER_METHOD = 10   # each method returns its top 10
TOP_K_FINAL = 3     # show the top 3 after fusion

QUERIES = [
    "What is pavement preservation?",
    "When should chip seal be applied?",
    "What is the difference between preventive maintenance and rehabilitation?",
    "How is PCI calculated?",
    "What treatments are recommended for high-traffic asphalt roads?",
]


def banner(text):
    print("\n" + "=" * 72)
    print(text)
    print("=" * 72)


# ----------------------------------------------------------------------------
# Step 1: extract text
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
print(f"  Pages read:              {PAGES_TO_READ}")
print(f"  Characters extracted:    {len(full_text):,}")
print(f"  TIME:                    {t1 - t0:.2f} sec")


# ----------------------------------------------------------------------------
# Step 2: chunk
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
print(f"  Number of chunks:        {len(chunks)}")
print(f"  TIME:                    {t3 - t2:.2f} sec")


# ----------------------------------------------------------------------------
# Step 3a: build TF-IDF index
# ----------------------------------------------------------------------------
banner("STEP 3a: Build TF-IDF (keyword) index")
t4 = time.perf_counter()

tfidf_vectorizer = TfidfVectorizer(
    lowercase=True,
    stop_words="english",
    ngram_range=(1, 2),
    max_df=0.9,
    min_df=1,
)
tfidf_matrix = tfidf_vectorizer.fit_transform(chunks)

t5 = time.perf_counter()
print(f"  TF-IDF vocabulary size:  {len(tfidf_vectorizer.vocabulary_):,} terms")
print(f"  TIME:                    {t5 - t4:.2f} sec")


# ----------------------------------------------------------------------------
# Step 3b: build neural index
# ----------------------------------------------------------------------------
banner("STEP 3b: Build neural embedding index")
t6 = time.perf_counter()

model = SentenceTransformer(EMBED_MODEL_NAME)
chunk_vecs = model.encode(
    chunks,
    batch_size=32,
    show_progress_bar=False,
    normalize_embeddings=True,
    convert_to_numpy=True,
).astype("float32")

t7 = time.perf_counter()
print(f"  Embedding dimension:     {chunk_vecs.shape[1]}")
print(f"  TIME:                    {t7 - t6:.2f} sec")


# ----------------------------------------------------------------------------
# Search functions
# ----------------------------------------------------------------------------
def tfidf_search(query, top_k):
    q_vec = tfidf_vectorizer.transform([query])
    sims = cosine_similarity(q_vec, tfidf_matrix).flatten()
    top = sims.argsort()[-top_k:][::-1]
    return [(int(i), float(sims[i])) for i in top]


def neural_search(query, top_k):
    q_vec = model.encode(
        [query], normalize_embeddings=True, convert_to_numpy=True
    ).astype("float32")
    sims = (chunk_vecs @ q_vec[0])  # cosine since both are normalized
    top = sims.argsort()[-top_k:][::-1]
    return [(int(i), float(sims[i])) for i in top]


def rrf_combine(rank_lists, k=K_RRF):
    """
    Reciprocal Rank Fusion.
    Each rank_list is a list of (chunk_idx, _) sorted best-first.
    Returns a sorted list of (chunk_idx, rrf_score), best first.
    """
    scores = {}
    for rank_list in rank_lists:
        for rank, (idx, _) in enumerate(rank_list):
            scores[idx] = scores.get(idx, 0.0) + 1.0 / (k + rank + 1)
    return sorted(scores.items(), key=lambda x: -x[1])


# ----------------------------------------------------------------------------
# Step 4: run queries with all three methods, side by side
# ----------------------------------------------------------------------------
banner("STEP 4: Compare TF-IDF vs Neural vs Hybrid (top hit per method)")

for q in QUERIES:
    print(f"\n  Q: {q}")
    print("  " + "-" * 70)

    tfidf_hits = tfidf_search(q, TOP_K_PER_METHOD)
    neural_hits = neural_search(q, TOP_K_PER_METHOD)
    hybrid_hits = rrf_combine([tfidf_hits, neural_hits])[:TOP_K_FINAL]

    # Show top-1 from each method
    for label, hits in [
        ("TF-IDF  ", tfidf_hits[:1]),
        ("Neural  ", neural_hits[:1]),
        ("Hybrid  ", hybrid_hits[:1]),
    ]:
        idx, score = hits[0]
        snippet = chunks[idx][:200].replace("\n", " ")
        agreed = ""
        # Mark when hybrid's top pick was also in both top-3 lists
        if label.strip() == "Hybrid":
            tfidf_top3 = {i for i, _ in tfidf_hits[:3]}
            neural_top3 = {i for i, _ in neural_hits[:3]}
            if idx in tfidf_top3 and idx in neural_top3:
                agreed = " [BOTH METHODS AGREED]"
            elif idx in neural_top3:
                agreed = " [from neural's top 3]"
            elif idx in tfidf_top3:
                agreed = " [from TF-IDF's top 3]"
        print(f"    {label} chunk {idx:3d}  score {score:6.3f}{agreed}")
        print(f"            \"{snippet}...\"")


# ----------------------------------------------------------------------------
# Summary
# ----------------------------------------------------------------------------
banner("HOW TO READ THESE RESULTS")
print("""
  For each question, look at whether the three methods agree or disagree.

  - If all three return the same chunk: easy question, any method works
  - If TF-IDF and Neural disagree, hybrid usually picks the better one
  - [BOTH METHODS AGREED] means hybrid is highly confident
  - When hybrid's pick differs from both, that's a sign hybrid found
    something both methods individually overlooked

  Compare the snippets to your earlier v1 (TF-IDF) and v2 (neural) results.
  If hybrid's top hit looks more relevant than either individual method
  on the harder questions (PCI calculation, preventive vs rehab), that's
  evidence that hybrid is helping.
""")
