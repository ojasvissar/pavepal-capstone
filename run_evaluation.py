from __future__ import annotations

import argparse
from pathlib import Path

from src.pavepal.config import DATA_DIR, PROJECT_ROOT
from src.pavepal.eval_framework import run_retrieval_evaluation


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run retrieval evaluation for Pavepal.")
    parser.add_argument(
        "--benchmark",
        type=Path,
        default=PROJECT_ROOT / "evaluation" / "benchmark_queries.json",
        help="Path to benchmark query JSON file.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=PROJECT_ROOT / "evaluation" / "outputs",
        help="Directory for evaluation reports.",
    )
    parser.add_argument("--top-k", type=int, default=6, help="Number of retrieved chunks per query.")
    parser.add_argument("--alpha", type=float, default=0.65, help="Dense score weight.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    report = run_retrieval_evaluation(
        data_dir=DATA_DIR,
        benchmark_path=args.benchmark,
        output_dir=args.output_dir,
        top_k=args.top_k,
        alpha=args.alpha,
    )
    summary = report["summary"]
    metrics = summary["metrics"]
    print("Retrieval evaluation complete.")
    print(f"Queries evaluated: {summary['queries_evaluated']}")
    print(f"Mean Precision@k: {metrics['mean_precision_at_k']}")
    print(f"Mean Recall@k: {metrics['mean_recall_at_k']}")
    print(f"Mean MRR: {metrics['mean_reciprocal_rank']}")
    print(f"Mean nDCG@k: {metrics['mean_ndcg_at_k']}")
    print(f"Outputs written to: {args.output_dir}")


if __name__ == "__main__":
    main()
