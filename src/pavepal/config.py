from pathlib import Path
import os

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"


def load_settings() -> dict:
    load_dotenv(PROJECT_ROOT / ".env")
    return {
        "gemini_api_key": os.getenv("GEMINI_API_KEY", ""),
        "gemini_model": os.getenv("GEMINI_MODEL", "gemini-1.5-flash"),
        "gemini_embedding_model": os.getenv("GEMINI_EMBEDDING_MODEL", "models/text-embedding-004"),
    }
