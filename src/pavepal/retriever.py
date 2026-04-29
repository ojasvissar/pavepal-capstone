from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Callable

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from .data_loader import Document


EmbeddingFn = Callable[[list[str], str], np.ndarray]
logger = logging.getLogger(__name__)


@dataclass
class RetrievedDocument:
    document: Document
    score: float
    dense_score: float
    sparse_score: float


class HybridRetriever:
    """Hybrid search using dense embeddings + TF-IDF sparse matching."""

    def __init__(self, documents: list[Document], embedding_fn: EmbeddingFn):
        if not documents:
            raise ValueError("No documents available for retrieval.")

        self.documents = documents
        self.embedding_fn = embedding_fn
        self.texts = [doc.text for doc in documents]

        self.use_dense = True
        try:
            self.dense_matrix = embedding_fn(self.texts, "retrieval_document")
        except Exception as exc:
            # Some Gemini API keys/models do not expose embedContent on v1beta.
            # Fall back to sparse retrieval so chat remains usable.
            self.use_dense = False
            self.dense_matrix = None
            logger.warning(
                "Dense embedding unavailable; falling back to sparse retrieval only: %s",
                exc,
            )
        self.vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2))
        self.sparse_matrix = self.vectorizer.fit_transform(self.texts)

    @staticmethod
    def _normalize(scores: np.ndarray) -> np.ndarray:
        min_score = float(np.min(scores))
        max_score = float(np.max(scores))
        if max_score - min_score < 1e-9:
            return np.zeros_like(scores)
        return (scores - min_score) / (max_score - min_score)

    def search(self, query: str, top_k: int = 6, alpha: float = 0.65) -> list[RetrievedDocument]:
        query_sparse = self.vectorizer.transform([query])
        sparse_scores = cosine_similarity(query_sparse, self.sparse_matrix)[0]

        sparse_norm = self._normalize(sparse_scores)
        dense_scores = np.zeros_like(sparse_scores)
        fused = sparse_norm

        if self.use_dense and self.dense_matrix is not None:
            query_embedding = self.embedding_fn([query], "retrieval_query")
            dense_scores = cosine_similarity(query_embedding, self.dense_matrix)[0]
            dense_norm = self._normalize(dense_scores)
            fused = alpha * dense_norm + (1.0 - alpha) * sparse_norm

        ranked_indices = np.argsort(fused)[::-1][:top_k]
        results: list[RetrievedDocument] = []
        for idx in ranked_indices:
            results.append(
                RetrievedDocument(
                    document=self.documents[idx],
                    score=float(fused[idx]),
                    dense_score=float(dense_scores[idx]),
                    sparse_score=float(sparse_scores[idx]),
                )
            )

        return results
