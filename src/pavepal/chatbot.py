from __future__ import annotations

import json
import time
from typing import Any

import numpy as np
import google.generativeai as genai
from google.api_core import exceptions as gexc

from .data_loader import load_all_documents
from .retriever import HybridRetriever, RetrievedDocument


_FALLBACK_MODEL_PREFERENCE = [
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    "gemini-1.5-flash-latest",
    "gemini-1.5-pro-latest",
]


def _discover_supported_models(primary: str) -> list[str]:
    """Return a list of model names that actually support generateContent for this API key."""
    try:
        available: list[str] = []
        for m in genai.list_models():
            methods = getattr(m, "supported_generation_methods", []) or []
            if "generateContent" not in methods:
                continue
            name = (m.name or "").replace("models/", "")
            if not name or name == primary:
                continue
            available.append(name)
        if not available:
            return []
        ordered: list[str] = []
        for preferred in _FALLBACK_MODEL_PREFERENCE:
            if preferred == primary:
                continue
            if preferred in available and preferred not in ordered:
                ordered.append(preferred)
        for name in available:
            if name not in ordered:
                ordered.append(name)
        return ordered[:4]
    except Exception:
        return []


class PavepalAssistant:
    def __init__(
        self,
        data_dir,
        gemini_api_key: str,
        gemini_model: str,
        gemini_embedding_model: str = "models/text-embedding-004",
    ):
        if not gemini_api_key:
            raise ValueError("GEMINI_API_KEY is not set.")

        genai.configure(api_key=gemini_api_key)
        self._primary_model_name = gemini_model
        self.model = genai.GenerativeModel(gemini_model)
        self.embedding_model = gemini_embedding_model
        self._fallback_model_names = _discover_supported_models(gemini_model)

        self.documents = load_all_documents(data_dir)
        self.retriever = HybridRetriever(self.documents, self._embed_texts)

    def _embed_texts(self, texts: list[str], task_type: str) -> np.ndarray:
        vectors: list[list[float]] = []
        for text in texts:
            res: dict[str, Any] = genai.embed_content(
                model=self.embedding_model,
                content=text,
                task_type=task_type,
            )
            vectors.append(res["embedding"])
        return np.array(vectors, dtype=np.float32)

    @staticmethod
    def _build_context(chunks: list[RetrievedDocument]) -> str:
        lines = []
        for i, chunk in enumerate(chunks, start=1):
            metadata = json.dumps(chunk.document.metadata, ensure_ascii=True)
            lines.append(
                f"[{i}] source={chunk.document.source} doc_id={chunk.document.doc_id} "
                f"metadata={metadata}\n{chunk.document.text}"
            )
        return "\n\n".join(lines)

    def _generate_with_resilience(self, prompt: str) -> str:
        """Try the primary model with one short retry, then fall back to alternative models for transient errors."""
        attempts: list[tuple[str, Any]] = [(self._primary_model_name, self.model)]
        for fallback_name in self._fallback_model_names:
            if fallback_name and fallback_name != self._primary_model_name:
                attempts.append((fallback_name, genai.GenerativeModel(fallback_name)))

        last_resource_error: gexc.ResourceExhausted | None = None
        last_exception: Exception | None = None
        for index, (name, model) in enumerate(attempts):
            try:
                response = model.generate_content(prompt)
                text = (response.text or "").strip()
                if text:
                    return text
                last_exception = RuntimeError(f"Empty response from model {name}.")
                continue
            except gexc.ResourceExhausted as exc:
                last_resource_error = exc
                last_exception = exc
                retry_delay = getattr(exc, "retry_delay", None)
                seconds = 0
                if retry_delay is not None:
                    seconds = int(getattr(retry_delay, "seconds", 0) or 0)
                if index == 0 and 0 < seconds <= 5:
                    time.sleep(seconds)
                    try:
                        response = model.generate_content(prompt)
                        text = (response.text or "").strip()
                        if text:
                            return text
                    except gexc.ResourceExhausted as inner:
                        last_resource_error = inner
                        last_exception = inner
                continue
            except (gexc.ServiceUnavailable, gexc.DeadlineExceeded, gexc.InternalServerError) as exc:
                last_exception = exc
                continue
            except (gexc.NotFound, gexc.InvalidArgument, gexc.PermissionDenied) as exc:
                last_exception = exc
                continue
            except Exception as exc:
                last_exception = exc
                continue

        if last_resource_error is not None:
            raise last_resource_error
        if last_exception is not None:
            raise last_exception
        raise RuntimeError("All Gemini model attempts failed without a captured error.")

    def _fallback_answer_from_chunks(self, chunks: list[RetrievedDocument]) -> str:
        roads: dict[str, dict[str, Any]] = {}
        for idx, chunk in enumerate(chunks, start=1):
            metadata = chunk.document.metadata or {}
            road_name = metadata.get("road_name")
            if not road_name:
                continue

            if road_name not in roads:
                roads[road_name] = {
                    "evidence": [],
                    "pci": None,
                    "pci_category": None,
                    "defect_points": 0.0,
                }

            road = roads[road_name]
            road["evidence"].append(idx)

            pci_value = metadata.get("pci")
            pci_category = metadata.get("pci_category")
            if isinstance(pci_value, (int, float)):
                existing = road["pci"]
                if existing is None or pci_value < existing:
                    road["pci"] = float(pci_value)
                    if isinstance(pci_category, str) and pci_category.strip():
                        road["pci_category"] = pci_category
            elif road["pci_category"] is None and isinstance(pci_category, str) and pci_category.strip():
                road["pci_category"] = pci_category

            defects = metadata.get("defects", {})
            if isinstance(defects, dict):
                for value in defects.values():
                    if isinstance(value, (int, float)):
                        road["defect_points"] += float(value)
                    elif isinstance(value, str):
                        try:
                            road["defect_points"] += float(value)
                        except ValueError:
                            continue

        if not roads:
            # If retrieved chunks are mostly manuals/PDFs, fall back to road documents
            # loaded from inspection JSON so users still get a practical ranking.
            for doc in self.documents:
                if doc.source != "roadSegments":
                    continue
                metadata = doc.metadata or {}
                road_name = metadata.get("road_name")
                if not road_name:
                    continue
                if road_name not in roads:
                    roads[road_name] = {
                        "evidence": [],
                        "pci": None,
                        "pci_category": None,
                        "defect_points": 0.0,
                    }
                road = roads[road_name]
                pci_value = metadata.get("pci")
                pci_category = metadata.get("pci_category")
                if isinstance(pci_value, (int, float)):
                    existing = road["pci"]
                    if existing is None or pci_value < existing:
                        road["pci"] = float(pci_value)
                        if isinstance(pci_category, str) and pci_category.strip():
                            road["pci_category"] = pci_category
                elif road["pci_category"] is None and isinstance(pci_category, str) and pci_category.strip():
                    road["pci_category"] = pci_category
                defects = metadata.get("defects", {})
                if isinstance(defects, dict):
                    for value in defects.values():
                        if isinstance(value, (int, float)):
                            road["defect_points"] += float(value)
                        elif isinstance(value, str):
                            try:
                                road["defect_points"] += float(value)
                            except ValueError:
                                continue

            if not roads:
                return (
                    "I could not derive a road priority ranking from available data. "
                    "Please verify road inspection JSON files are loaded correctly."
                )

        def rank_key(item: tuple[str, dict[str, Any]]) -> tuple[float, float]:
            _, data = item
            pci_rank = data["pci"] if data["pci"] is not None else 1e9
            defect_rank = -data["defect_points"]
            return (pci_rank, defect_rank)

        ranked = sorted(roads.items(), key=rank_key)[:5]
        lines: list[str] = ["**Priority candidates from retrieved evidence:**", ""]
        for i, (road_name, data) in enumerate(ranked, start=1):
            reasons: list[str] = []
            if data["pci"] is not None:
                reasons.append(f"low PCI {data['pci']:.1f}")
            if data["pci_category"]:
                reasons.append(f"category {data['pci_category']}")
            if data["defect_points"] > 0:
                reasons.append(f"higher observed defect load ({data['defect_points']:.1f})")
            if not reasons:
                reasons.append("appears frequently in top retrieved maintenance-related chunks")
            citations = sorted(set(data["evidence"]))[:3]
            if citations:
                cites = ", ".join(f"[{c}]" for c in citations)
                evidence_note = f"evidence {cites}"
            else:
                evidence_note = "evidence from roadSegments dataset"
            lines.append(f"{i}. **{road_name}** — {', '.join(reasons)}; {evidence_note}.")

        lines.append("")
        lines.append("_Suggested next inspection/action: verify these candidates with latest field survey and budget constraints._")
        return "\n".join(lines)

    def ask(self, query: str, top_k: int = 6, alpha: float = 0.65) -> dict[str, Any]:
        chunks = self.retriever.search(query=query, top_k=top_k, alpha=alpha)
        context = self._build_context(chunks)

        prompt = f"""
You are Pavepal, an assistant for pavement maintenance decision support.

Rules:
- Use only the evidence provided in CONTEXT.
- If evidence is insufficient, explicitly say what is missing.
- Keep recommendations practical and tied to the provided defects/PCI/manual info.
- Cite source blocks as [1], [2], etc.

USER QUESTION:
{query}

CONTEXT:
{context}

Return:
1) A concise answer.
2) A short "Why" section.
3) A short "Suggested next inspection/action" section.
""".strip()

        warning: str | None = None
        try:
            answer = self._generate_with_resilience(prompt)
        except gexc.ResourceExhausted as exc:
            retry_hint = ""
            retry_delay = getattr(exc, "retry_delay", None)
            if retry_delay:
                seconds = int(getattr(retry_delay, "seconds", 0) or 0)
                if seconds > 0:
                    retry_hint = f"\n\n_Retry recommended in ~{seconds}s._"
            answer = (
                "Gemini quota exhausted across attempted models, returning extractive fallback from retrieved evidence.\n\n"
                f"{self._fallback_answer_from_chunks(chunks)}"
                f"{retry_hint}"
            )
            warning = f"ResourceExhausted: {exc}"
        except Exception as exc:
            error_summary = f"{type(exc).__name__}: {exc}"
            answer = (
                "Gemini request failed, so this is an extractive fallback from retrieved evidence.\n\n"
                f"_Error: {error_summary[:240]}_\n\n"
                f"{self._fallback_answer_from_chunks(chunks)}"
            )
            warning = error_summary

        return {
            "answer": answer,
            "warning": warning,
            "sources": [
                {
                    "rank": i + 1,
                    "doc_id": chunk.document.doc_id,
                    "source": chunk.document.source,
                    "score": chunk.score,
                    "dense_score": chunk.dense_score,
                    "sparse_score": chunk.sparse_score,
                    "metadata": chunk.document.metadata,
                    "preview": chunk.document.text[:280].replace("\n", " "),
                }
                for i, chunk in enumerate(chunks)
            ],
        }
