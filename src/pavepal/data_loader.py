from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import json
from typing import Any

from pypdf import PdfReader


@dataclass
class Document:
    doc_id: str
    source: str
    text: str
    metadata: dict[str, Any]


def _safe_load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _format_defects(defects: dict[str, Any]) -> str:
    if not defects:
        return "none"
    return ", ".join(f"{k}: {v}" for k, v in defects.items())


def load_road_documents(road_segments_path: Path) -> list[Document]:
    payload = _safe_load_json(road_segments_path)
    docs: list[Document] = []

    for idx, feature in enumerate(payload.get("features", [])):
        props = feature.get("properties", {})
        defects = props.get("defects", {})
        text = (
            f"Road segment inspection summary. "
            f"Road name: {props.get('name', 'unknown')}. "
            f"Road class: {props.get('ROADCLASS', 'unknown')}. "
            f"Speed limit: {props.get('speed_limit', 'unknown')} mph. "
            f"Length km: {props.get('length_km', 'unknown')}. "
            f"Scan status: {props.get('scanned', 'unknown')}. "
            f"PCI score: {props.get('pci', 'unknown')}. "
            f"PCI category: {props.get('pci_category', 'unknown')}. "
            f"Observed defects: {_format_defects(defects)}."
        )
        docs.append(
            Document(
                doc_id=f"road-{idx}",
                source="roadSegments",
                text=text,
                metadata={
                    "road_name": props.get("name"),
                    "road_class": props.get("ROADCLASS"),
                    "pci": props.get("pci"),
                    "pci_category": props.get("pci_category"),
                    "defects": defects,
                },
            )
        )

    return docs


def load_location_documents(locations_path: Path) -> list[Document]:
    payload = _safe_load_json(locations_path)
    docs: list[Document] = []

    for idx, feature in enumerate(payload.get("features", [])):
        props = feature.get("properties", {})
        coordinates = feature.get("geometry", {}).get("coordinates", [])
        defects = props.get("defects", {})
        lon = coordinates[0] if len(coordinates) > 0 else "unknown"
        lat = coordinates[1] if len(coordinates) > 1 else "unknown"

        text = (
            f"Inspection location record. "
            f"Road name: {props.get('road_name', 'unknown')}. "
            f"Capture name: {props.get('name', 'unknown')}. "
            f"Longitude: {lon}. Latitude: {lat}. "
            f"Observed defects: {_format_defects(defects)}."
        )
        docs.append(
            Document(
                doc_id=f"location-{idx}",
                source="locations",
                text=text,
                metadata={
                    "road_name": props.get("road_name"),
                    "capture_name": props.get("name"),
                    "coordinates": coordinates,
                    "defects": defects,
                },
            )
        )

    return docs


def load_pdf_documents(pdf_path: Path, chunk_size: int = 1300, overlap: int = 200) -> list[Document]:
    reader = PdfReader(str(pdf_path))
    docs: list[Document] = []
    step = max(1, chunk_size - overlap)

    for page_idx, page in enumerate(reader.pages):
        page_text = (page.extract_text() or "").strip()
        if not page_text:
            continue

        for start in range(0, len(page_text), step):
            chunk = page_text[start : start + chunk_size]
            if len(chunk.strip()) < 120:
                continue
            chunk_idx = start // step
            docs.append(
                Document(
                    doc_id=f"manual-{page_idx}-{chunk_idx}",
                    source=pdf_path.name,
                    text=chunk,
                    metadata={"page": page_idx + 1, "chunk": chunk_idx},
                )
            )

    return docs


def load_all_documents(data_dir: Path) -> list[Document]:
    road_segments_path = data_dir / "roadSegments (2).json"
    locations_path = data_dir / "locations (2).json"

    docs: list[Document] = []
    docs.extend(load_road_documents(road_segments_path))
    docs.extend(load_location_documents(locations_path))

    pdf_files = sorted(data_dir.glob("*.pdf"))
    for pdf_file in pdf_files:
        docs.extend(load_pdf_documents(pdf_file))

    return docs
