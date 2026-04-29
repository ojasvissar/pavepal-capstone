from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any

import numpy as np

from .data_loader import Document, load_all_documents
from .retriever import HybridRetriever, RetrievedDocument


@dataclass
class QuerySpec:
    query_id: str
    query: str
    expected_sources: list[str]
    expected_road_names: list[str]
    expected_keywords: list[str]
    notes: str


def load_benchmark(path: Path) -> list[QuerySpec]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    specs: list[QuerySpec] = []
    for row in payload:
        specs.append(
            QuerySpec(
                query_id=row["query_id"],
                query=row["query"],
                expected_sources=row.get("expected_sources", []),
                expected_road_names=row.get("expected_road_names", []),
                expected_keywords=row.get("expected_keywords", []),
                notes=row.get("notes", ""),
            )
        )
    return specs


def _to_float(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return fallback


def _doc_is_relevant(doc: Document, spec: QuerySpec) -> bool:
    if not spec.expected_sources and not spec.expected_road_names and not spec.expected_keywords:
        return False

    source_ok = True
    if spec.expected_sources:
        source_ok = doc.source in spec.expected_sources

    road_ok = True
    if spec.expected_road_names:
        road_name = (doc.metadata or {}).get("road_name")
        road_ok = isinstance(road_name, str) and road_name in spec.expected_road_names

    keyword_ok = True
    if spec.expected_keywords:
        lowered = doc.text.lower()
        keyword_ok = any(keyword.lower() in lowered for keyword in spec.expected_keywords)

    return source_ok and road_ok and keyword_ok


def _dcg(binary_relevance: list[int]) -> float:
    total = 0.0
    for i, rel in enumerate(binary_relevance, start=1):
        if rel:
            total += 1.0 / np.log2(i + 1)
    return float(total)


def _classify_failure_modes(
    spec: QuerySpec,
    retrieved: list[RetrievedDocument],
    binary_relevance: list[int],
) -> list[str]:
    failures: list[str] = []
    if not any(binary_relevance):
        failures.append("no_relevant_retrieval")

    expected_sources = set(spec.expected_sources)
    observed_sources = {item.document.source for item in retrieved}
    if "roadSegments" in expected_sources and "roadSegments" not in observed_sources:
        failures.append("missing_structured_evidence")
    expected_manual = [s for s in expected_sources if s not in {"roadSegments", "locations"}]
    if expected_manual and not any(src in observed_sources for src in expected_manual):
        failures.append("missing_manual_evidence")

    pci_categories = {
        (item.document.metadata or {}).get("pci_category")
        for item in retrieved
        if (item.document.metadata or {}).get("pci_category")
    }
    if len(pci_categories) >= 3:
        failures.append("conflicting_condition_signals")

    if retrieved:
        sorted_scores = sorted((item.score for item in retrieved), reverse=True)
        if len(sorted_scores) >= 2 and (sorted_scores[0] - sorted_scores[1]) < 0.01:
            failures.append("low_retrieval_confidence_gap")

    return failures


def run_retrieval_evaluation(
    data_dir: Path,
    benchmark_path: Path,
    output_dir: Path,
    top_k: int = 6,
    alpha: float = 0.65,
) -> dict[str, Any]:
    documents = load_all_documents(data_dir)

    def disabled_embedding_fn(_texts: list[str], _task_type: str) -> np.ndarray:
        raise RuntimeError("Dense embeddings disabled for offline/stable evaluation run.")

    retriever = HybridRetriever(documents, disabled_embedding_fn)
    benchmark = load_benchmark(benchmark_path)

    per_query: list[dict[str, Any]] = []
    precision_scores: list[float] = []
    recall_scores: list[float] = []
    mrr_scores: list[float] = []
    ndcg_scores: list[float] = []
    failure_counts: dict[str, int] = {}

    for spec in benchmark:
        retrieved = retriever.search(spec.query, top_k=top_k, alpha=alpha)
        binary_relevance = [1 if _doc_is_relevant(item.document, spec) else 0 for item in retrieved]

        hits = int(sum(binary_relevance))
        precision_k = hits / max(len(retrieved), 1)
        recall_denominator = max(
            1,
            sum(1 for doc in documents if _doc_is_relevant(doc, spec)),
        )
        recall_k = hits / recall_denominator

        first_rel_rank = next((i + 1 for i, rel in enumerate(binary_relevance) if rel), None)
        reciprocal_rank = 0.0 if first_rel_rank is None else 1.0 / first_rel_rank

        dcg = _dcg(binary_relevance)
        ideal_rels = [1] * min(recall_denominator, len(retrieved))
        idcg = _dcg(ideal_rels) or 1.0
        ndcg = dcg / idcg

        failures = _classify_failure_modes(spec, retrieved, binary_relevance)
        for failure in failures:
            failure_counts[failure] = failure_counts.get(failure, 0) + 1

        precision_scores.append(precision_k)
        recall_scores.append(recall_k)
        mrr_scores.append(reciprocal_rank)
        ndcg_scores.append(ndcg)

        per_query.append(
            {
                "query_id": spec.query_id,
                "query": spec.query,
                "notes": spec.notes,
                "precision_at_k": round(precision_k, 4),
                "recall_at_k": round(recall_k, 4),
                "reciprocal_rank": round(reciprocal_rank, 4),
                "ndcg_at_k": round(ndcg, 4),
                "failure_modes": failures,
                "retrieved": [
                    {
                        "rank": i + 1,
                        "doc_id": item.document.doc_id,
                        "source": item.document.source,
                        "score": round(_to_float(item.score), 4),
                        "dense_score": round(_to_float(item.dense_score), 4),
                        "sparse_score": round(_to_float(item.sparse_score), 4),
                        "road_name": (item.document.metadata or {}).get("road_name"),
                        "pci": (item.document.metadata or {}).get("pci"),
                        "preview": item.document.text[:200].replace("\n", " "),
                        "is_relevant": bool(binary_relevance[i]),
                    }
                    for i, item in enumerate(retrieved)
                ],
            }
        )

    summary = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "dataset_documents": len(documents),
        "queries_evaluated": len(benchmark),
        "top_k": top_k,
        "alpha": alpha,
        "metrics": {
            "mean_precision_at_k": round(float(np.mean(precision_scores or [0.0])), 4),
            "mean_recall_at_k": round(float(np.mean(recall_scores or [0.0])), 4),
            "mean_reciprocal_rank": round(float(np.mean(mrr_scores or [0.0])), 4),
            "mean_ndcg_at_k": round(float(np.mean(ndcg_scores or [0.0])), 4),
        },
        "failure_mode_counts": dict(sorted(failure_counts.items(), key=lambda kv: kv[0])),
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    report = {"summary": summary, "per_query": per_query}
    (output_dir / "retrieval_eval.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=True),
        encoding="utf-8",
    )
    _write_markdown_report(summary, per_query, output_dir / "retrieval_eval.md")
    return report


def _write_markdown_report(summary: dict[str, Any], per_query: list[dict[str, Any]], path: Path) -> None:
    lines: list[str] = []
    lines.append("# Retrieval Evaluation Report")
    lines.append("")
    lines.append("## Summary")
    lines.append("")
    lines.append(f"- Generated at: `{summary['generated_at_utc']}`")
    lines.append(f"- Documents indexed: `{summary['dataset_documents']}`")
    lines.append(f"- Queries evaluated: `{summary['queries_evaluated']}`")
    lines.append(f"- top_k: `{summary['top_k']}`")
    lines.append(f"- alpha: `{summary['alpha']}`")
    metrics = summary["metrics"]
    lines.append(f"- Mean Precision@k: `{metrics['mean_precision_at_k']}`")
    lines.append(f"- Mean Recall@k: `{metrics['mean_recall_at_k']}`")
    lines.append(f"- Mean MRR: `{metrics['mean_reciprocal_rank']}`")
    lines.append(f"- Mean nDCG@k: `{metrics['mean_ndcg_at_k']}`")
    lines.append("")
    lines.append("## Failure Modes")
    lines.append("")
    failures = summary["failure_mode_counts"]
    if failures:
        for name, count in failures.items():
            lines.append(f"- `{name}`: {count}")
    else:
        lines.append("- None detected in this run.")
    lines.append("")
    lines.append("## Per Query Results")
    lines.append("")
    for item in per_query:
        lines.append(f"### {item['query_id']}: {item['query']}")
        lines.append(f"- Precision@k: `{item['precision_at_k']}`")
        lines.append(f"- Recall@k: `{item['recall_at_k']}`")
        lines.append(f"- MRR: `{item['reciprocal_rank']}`")
        lines.append(f"- nDCG@k: `{item['ndcg_at_k']}`")
        fm = item["failure_modes"] or ["none"]
        lines.append(f"- Failure modes: `{', '.join(fm)}`")
        lines.append("- Top retrieved:")
        for row in item["retrieved"][:3]:
            lines.append(
                f"  - [{row['rank']}] {row['source']}/{row['doc_id']} | score={row['score']} | relevant={row['is_relevant']}"
            )
        lines.append("")

    path.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")
