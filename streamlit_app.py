from __future__ import annotations

import re
import time

import streamlit as st

from src.pavepal.chatbot import PavepalAssistant
from src.pavepal.config import DATA_DIR, load_settings


def _extract_retry_seconds(warning: str | None) -> int:
    if not warning:
        return 0
    match = re.search(r"retry in[^\d]*(\d+)", warning, re.IGNORECASE)
    if not match:
        match = re.search(r"seconds:\s*(\d+)", warning)
    return int(match.group(1)) if match else 30


st.set_page_config(page_title="Pavepal AI", page_icon="🛣️", layout="wide")

st.markdown(
    """
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Fraunces:wght@500;600;700&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/icon?family=Material+Icons|Material+Symbols+Outlined|Material+Symbols+Rounded|Material+Symbols+Sharp" rel="stylesheet">

    <style>
    /* Streamlit icon fonts: ensure ligatures render or hide broken fallback text */
    .material-icons,
    .material-icons-outlined,
    .material-symbols-outlined,
    .material-symbols-rounded,
    .material-symbols-sharp,
    [class*="material-icons"],
    [class*="material-symbols"] {
        font-family: 'Material Symbols Rounded', 'Material Symbols Outlined', 'Material Icons', sans-serif !important;
        font-weight: normal !important;
        font-style: normal !important;
        font-size: 20px !important;
        line-height: 1 !important;
        letter-spacing: normal !important;
        text-transform: none !important;
        display: inline-block !important;
        white-space: nowrap !important;
        word-wrap: normal !important;
        direction: ltr !important;
        -webkit-font-feature-settings: 'liga' !important;
        -webkit-font-smoothing: antialiased !important;
        font-feature-settings: 'liga' !important;
    }
    /* Hide the broken Material icon text inside expander summaries (and nearby controls) */
    [data-testid="stExpander"] details > summary .material-icons,
    [data-testid="stExpander"] details > summary .material-icons-outlined,
    [data-testid="stExpander"] details > summary .material-symbols-outlined,
    [data-testid="stExpander"] details > summary .material-symbols-rounded,
    [data-testid="stExpander"] details > summary .material-symbols-sharp,
    [data-testid="stExpander"] details > summary [class*="material-icons"],
    [data-testid="stExpander"] details > summary [class*="material-symbols"] {
        font-size: 0 !important;
        line-height: 0 !important;
        width: 0 !important;
        height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        color: transparent !important;
        overflow: hidden !important;
    }
    [data-testid="stExpander"] details > summary {
        list-style: none !important;
        position: relative;
        padding-right: 1.7rem !important;
    }
    [data-testid="stExpander"] details > summary::-webkit-details-marker { display: none !important; }
    [data-testid="stExpander"] details > summary::after {
        content: "";
        position: absolute;
        right: 0.75rem;
        top: 50%;
        width: 8px;
        height: 8px;
        border-right: 2px solid var(--pp-muted, #4d6a57);
        border-bottom: 2px solid var(--pp-muted, #4d6a57);
        transform: translateY(-70%) rotate(45deg);
        transition: transform 0.15s ease;
    }
    [data-testid="stExpander"] details[open] > summary::after {
        transform: translateY(-30%) rotate(-135deg);
    }
    :root {
        --pp-bg: #f4faf6;
        --pp-surface: #ffffff;
        --pp-paper: #ecf6ef;
        --pp-border: #cfe6d6;
        --pp-text: #112a1c;
        --pp-muted: #4d6a57;
        --pp-accent: #1f8a4c;
        --pp-accent-strong: #14653a;
        --pp-accent-soft: #e6f5ec;
        --pp-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
        --pp-serif: 'Fraunces', Georgia, 'Times New Roman', serif;
    }

    html, body, [data-testid="stAppViewContainer"], [data-testid="stMain"], .stApp {
        background: var(--pp-bg) !important;
        color: var(--pp-text) !important;
        font-family: var(--pp-mono) !important;
    }
    [data-testid="stHeader"] { background: transparent !important; }
    .block-container { max-width: 920px; padding-top: 1.4rem; padding-bottom: 6rem; }

    [data-testid="stSidebar"] {
        background: #ebf5ee !important;
        border-right: 1px solid var(--pp-border);
    }
    [data-testid="stSidebar"] :not(.material-icons):not(.material-icons-outlined):not(.material-symbols-outlined):not(.material-symbols-rounded):not(.material-symbols-sharp):not([class*="material-icons"]):not([class*="material-symbols"]) {
        color: var(--pp-text) !important;
        font-family: var(--pp-mono) !important;
    }
    [data-testid="stSidebar"] h1, [data-testid="stSidebar"] h2, [data-testid="stSidebar"] h3 {
        font-family: var(--pp-serif) !important;
        font-weight: 600 !important;
        letter-spacing: -0.01em;
    }

    .brand-row {
        display: flex;
        align-items: center;
        gap: 0.7rem;
        margin-bottom: 0.8rem;
    }
    .brand-mark {
        width: 38px; height: 38px;
        border-radius: 10px;
        background: #ffffff;
        border: 1px solid var(--pp-border);
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 1px 2px rgba(20, 52, 35, 0.05);
    }
    .brand-name {
        font-family: var(--pp-serif);
        font-weight: 700;
        font-size: 1.15rem;
        letter-spacing: -0.01em;
        color: var(--pp-text);
        line-height: 1;
    }
    .brand-tag {
        font-family: var(--pp-mono);
        font-size: 0.72rem;
        color: var(--pp-muted);
        letter-spacing: 0.06em;
        text-transform: uppercase;
        margin-top: 0.18rem;
    }

    .hero {
        background: var(--pp-paper);
        border: 1px solid var(--pp-border);
        border-radius: 14px;
        padding: 1.1rem 1.2rem;
        margin-bottom: 0.9rem;
        position: relative;
        overflow: hidden;
    }
    .hero::after {
        content: "";
        position: absolute; right: -40px; top: -40px;
        width: 160px; height: 160px;
        background: radial-gradient(closest-side, rgba(31, 138, 76, 0.10), transparent 70%);
        pointer-events: none;
    }
    .hero h1 {
        font-family: var(--pp-serif);
        font-weight: 700;
        font-size: 1.6rem;
        margin: 0;
        letter-spacing: -0.015em;
        color: var(--pp-text);
    }
    .hero p { margin: 0.35rem 0 0 0; color: var(--pp-muted); font-size: 0.95rem; }
    .pill-row { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-top: 0.7rem; }
    .pill {
        background: var(--pp-accent-soft);
        border: 1px solid #d6e7d8;
        color: var(--pp-accent-strong);
        font-family: var(--pp-mono);
        border-radius: 999px;
        padding: 0.18rem 0.6rem;
        font-size: 0.72rem;
        font-weight: 500;
        letter-spacing: 0.02em;
    }

    .stChatMessage {
        background: var(--pp-surface) !important;
        border: 1px solid var(--pp-border) !important;
        border-radius: 12px !important;
        box-shadow: 0 1px 2px rgba(20, 52, 35, 0.04);
    }
    [data-testid="stChatMessageContent"] :not(.material-icons):not(.material-icons-outlined):not(.material-symbols-outlined):not(.material-symbols-rounded):not(.material-symbols-sharp):not([class*="material-icons"]):not([class*="material-symbols"]),
    [data-testid="stMarkdownContainer"] :not(.material-icons):not(.material-icons-outlined):not(.material-symbols-outlined):not(.material-symbols-rounded):not(.material-symbols-sharp):not([class*="material-icons"]):not([class*="material-symbols"]) {
        color: var(--pp-text) !important;
        font-family: var(--pp-mono) !important;
    }

    .stButton > button, .stDownloadButton > button {
        background: var(--pp-accent) !important;
        color: #ffffff !important;
        border: 1px solid var(--pp-accent) !important;
        border-radius: 10px !important;
        font-family: var(--pp-mono) !important;
        font-weight: 600 !important;
        letter-spacing: 0.02em;
        box-shadow: none !important;
    }
    .stButton > button:hover, .stDownloadButton > button:hover {
        background: var(--pp-accent-strong) !important;
        border-color: var(--pp-accent-strong) !important;
    }

    .stSlider [data-baseweb="slider"] div[role="slider"] {
        background-color: var(--pp-accent) !important;
    }

    [data-testid="stBottomBlockContainer"],
    [data-testid="stBottomBlockContainer"] > div {
        background: var(--pp-bg) !important;
        border-top: 0 !important;
        box-shadow: none !important;
    }
    [data-testid="stChatInput"] { max-width: 920px; margin: 0 auto; }
    [data-testid="stChatInput"] > div {
        background: var(--pp-surface) !important;
        border: 1px solid var(--pp-border) !important;
        border-radius: 14px !important;
        box-shadow: 0 4px 14px rgba(20, 52, 35, 0.06) !important;
    }
    [data-testid="stChatInput"] textarea {
        background: var(--pp-surface) !important;
        color: var(--pp-text) !important;
        font-family: var(--pp-mono) !important;
        border: 0 !important;
    }
    [data-testid="stChatInput"] textarea::placeholder {
        color: var(--pp-muted) !important;
        opacity: 1 !important;
        font-family: var(--pp-mono) !important;
    }
    [data-testid="stChatInput"] button {
        background: var(--pp-accent) !important;
        color: #ffffff !important;
        border-color: var(--pp-accent) !important;
        border-radius: 10px !important;
    }
    [data-testid="stChatInput"] button:hover {
        background: var(--pp-accent-strong) !important;
        border-color: var(--pp-accent-strong) !important;
    }

    .source-card {
        background: var(--pp-surface);
        border: 1px solid var(--pp-border);
        border-radius: 12px;
        padding: 0.7rem 0.85rem;
        margin-bottom: 0.55rem;
    }
    .source-title { font-weight: 700; font-size: 0.92rem; margin-bottom: 0.2rem; font-family: var(--pp-serif); }
    .source-meta { color: var(--pp-muted); font-size: 0.8rem; margin-bottom: 0.18rem; }
    .source-preview { color: #233c2c; font-size: 0.87rem; }

    .meta-line {
        font-family: var(--pp-mono);
        color: var(--pp-muted);
        font-size: 0.75rem;
        letter-spacing: 0.04em;
        margin-top: 0.4rem;
    }
    .meta-line code {
        background: #d8ecdf;
        padding: 0.05rem 0.35rem;
        border-radius: 5px;
        color: var(--pp-text);
        font-size: 0.74rem;
    }
    .status-dot {
        display: inline-block;
        width: 8px; height: 8px;
        border-radius: 50%;
        margin-right: 0.4rem;
        vertical-align: middle;
    }
    .status-ok { background: #1f8a4c; box-shadow: 0 0 0 3px rgba(31, 138, 76, 0.18); }
    .status-bad { background: #c0392b; box-shadow: 0 0 0 3px rgba(192, 57, 43, 0.18); }
    .env-card {
        background: #ffffff;
        border: 1px solid var(--pp-border);
        border-radius: 10px;
        padding: 0.55rem 0.7rem;
        margin-top: 0.4rem;
        font-family: var(--pp-mono);
        font-size: 0.78rem;
    }
    .env-row { display: flex; justify-content: space-between; gap: 0.5rem; padding: 0.12rem 0; }
    .env-key { color: var(--pp-muted); }
    .env-val { color: var(--pp-text); font-weight: 600; word-break: break-all; text-align: right; }
    </style>
    """,
    unsafe_allow_html=True,
)


PAVEPAL_LOGO_SVG = """
<svg width="22" height="22" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="44" height="44" rx="11" fill="#ffffff" stroke="#1f8a4c" stroke-width="2"/>
  <path d="M14 36 L24 10 L34 36" stroke="#1f8a4c" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M21 22 L24 28 L27 22" stroke="#1f8a4c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <circle cx="24" cy="33" r="1.6" fill="#1f8a4c"/>
</svg>
"""


@st.cache_resource(show_spinner=True)
def get_assistant(
    gemini_api_key: str,
    gemini_model: str,
    gemini_embedding_model: str,
) -> PavepalAssistant:
    return PavepalAssistant(
        data_dir=DATA_DIR,
        gemini_api_key=gemini_api_key,
        gemini_model=gemini_model,
        gemini_embedding_model=gemini_embedding_model,
    )


env_settings = load_settings()


def mask_key(value: str) -> str:
    if not value:
        return "—"
    if len(value) <= 8:
        return "••••"
    return f"{value[:4]}••••{value[-4:]}"


api_key_present = bool(env_settings["gemini_api_key"])
status_label = "connected" if api_key_present else "missing key"
status_class = "status-ok" if api_key_present else "status-bad"

st.markdown(
    f"""
    <div class="brand-row">
      <div class="brand-mark">{PAVEPAL_LOGO_SVG}</div>
      <div>
        <div class="brand-name">Pavepal</div>
        <div class="brand-tag">// road intelligence assistant</div>
      </div>
    </div>
    <div class="hero">
      <h1>Grounded answers for road maintenance.</h1>
      <p>Hybrid retrieval over inspection data and engineering manuals, with transparent sources and failure-mode awareness.</p>
      <div class="pill-row">
        <span class="pill"><span class="status-dot {status_class}"></span>{status_label}</span>
        <span class="pill">grounded</span>
        <span class="pill">source-traced</span>
        <span class="pill">hybrid retrieval</span>
        <span class="pill">failure-aware</span>
      </div>
      <div class="meta-line">model: <code>{env_settings['gemini_model']}</code> · embeddings: <code>{env_settings['gemini_embedding_model']}</code> · key: <code>{mask_key(env_settings['gemini_api_key'])}</code></div>
    </div>
    """,
    unsafe_allow_html=True,
)

with st.sidebar:
    st.markdown(
        f"<div class='brand-row'><div class='brand-mark'>{PAVEPAL_LOGO_SVG}</div>"
        "<div><div class='brand-name'>Pavepal</div><div class='brand-tag'>// console</div></div></div>",
        unsafe_allow_html=True,
    )

    st.header("Connection")
    st.markdown(
        f"<div class='env-card'>"
        f"<div class='env-row'><span class='env-key'>status</span>"
        f"<span class='env-val'><span class='status-dot {status_class}'></span>{status_label}</span></div>"
        f"<div class='env-row'><span class='env-key'>model</span><span class='env-val'>{env_settings['gemini_model']}</span></div>"
        f"<div class='env-row'><span class='env-key'>embeddings</span><span class='env-val'>{env_settings['gemini_embedding_model']}</span></div>"
        f"<div class='env-row'><span class='env-key'>api key</span><span class='env-val'>{mask_key(env_settings['gemini_api_key'])}</span></div>"
        f"</div>",
        unsafe_allow_html=True,
    )
    st.caption("loaded from .env")

    st.header("Runtime overrides")
    runtime_model = st.text_input(
        "Gemini model",
        value=env_settings["gemini_model"],
        help="Override GEMINI_MODEL for this session only.",
    )
    runtime_embedding = st.text_input(
        "Gemini embedding model",
        value=env_settings["gemini_embedding_model"],
        help="Override GEMINI_EMBEDDING_MODEL for this session only.",
    )

    st.header("Retrieval")
    top_k = st.slider("Retrieved context chunks", min_value=3, max_value=10, value=6)
    alpha = st.slider("Dense weight (alpha)", min_value=0.1, max_value=0.9, value=0.65)
    st.caption("hybrid = α·dense + (1−α)·sparse")

    if st.button("Clear chat history", use_container_width=True):
        st.session_state.messages = [
            {
                "role": "assistant",
                "content": "Ready. Ask about road conditions, treatments, or supporting evidence from your data and manuals.",
            }
        ]
        st.rerun()


settings = {
    "gemini_api_key": env_settings["gemini_api_key"],
    "gemini_model": runtime_model.strip() or env_settings["gemini_model"],
    "gemini_embedding_model": runtime_embedding.strip() or env_settings["gemini_embedding_model"],
}

if not settings["gemini_api_key"]:
    st.error("GEMINI_API_KEY is not set. Add it to your .env file before using chat.")
    st.markdown("Create or update `.env` in the project root with:")
    st.code(
        "GEMINI_API_KEY=your_real_key\n"
        "GEMINI_MODEL=gemini-1.5-flash\n"
        "GEMINI_EMBEDDING_MODEL=models/text-embedding-004",
        language="bash",
    )
    st.stop()


if "messages" not in st.session_state:
    st.session_state.messages = [
        {
            "role": "assistant",
            "content": "Ready. Ask about road conditions, treatments, or supporting evidence from your data and manuals.",
        }
    ]

for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

user_query = st.chat_input("> ask pavepal anything about your road network…")

if user_query:
    st.session_state.messages.append({"role": "user", "content": user_query})

    with st.chat_message("user"):
        st.markdown(user_query)

    with st.chat_message("assistant"):
        with st.spinner("retrieving evidence and grounding response…"):
            assistant = get_assistant(
                gemini_api_key=settings["gemini_api_key"],
                gemini_model=settings["gemini_model"],
                gemini_embedding_model=settings["gemini_embedding_model"],
            )

            now = time.time()
            cooldown_until = float(st.session_state.get("rate_limit_until", 0.0))
            if cooldown_until > now:
                wait_seconds = int(cooldown_until - now)
                st.info(f"Rate-limit cooldown active (~{wait_seconds}s). Returning extractive fallback to avoid further 429s.")
                chunks = assistant.retriever.search(user_query, top_k=top_k, alpha=alpha)
                fallback_text = (
                    "Skipping Gemini call while rate-limit cooldown is active. Extractive fallback below.\n\n"
                    f"{assistant._fallback_answer_from_chunks(chunks)}"
                )
                result = {
                    "answer": fallback_text,
                    "warning": f"cooldown active for ~{wait_seconds}s",
                    "sources": [
                        {
                            "rank": i + 1,
                            "doc_id": c.document.doc_id,
                            "source": c.document.source,
                            "score": c.score,
                            "dense_score": c.dense_score,
                            "sparse_score": c.sparse_score,
                            "metadata": c.document.metadata,
                            "preview": c.document.text[:280].replace("\n", " "),
                        }
                        for i, c in enumerate(chunks)
                    ],
                }
            else:
                result = assistant.ask(user_query, top_k=top_k, alpha=alpha)
                warning_text = (result.get("warning") or "").lower()
                if "resourceexhausted" in warning_text or "quota" in warning_text or "rate" in warning_text:
                    retry_seconds = _extract_retry_seconds(result.get("warning"))
                    st.session_state["rate_limit_until"] = time.time() + max(retry_seconds, 30)

        if result.get("warning"):
            with st.expander("Gemini API issue (debug)", expanded=False):
                st.code(result["warning"], language="text")
            st.warning("Gemini API issue encountered. Showing fallback response with retrieved evidence.")
        st.markdown(result["answer"])

        with st.expander("sources used"):
            for source in result["sources"]:
                st.markdown(
                    (
                        "<div class='source-card'>"
                        f"<div class='source-title'>[{source['rank']}] {source['source']} / {source['doc_id']}</div>"
                        f"<div class='source-meta'>score={source['score']:.3f} · dense={source['dense_score']:.3f} · sparse={source['sparse_score']:.3f}</div>"
                        f"<div class='source-meta'>metadata={source['metadata']}</div>"
                        f"<div class='source-preview'>{source['preview']}</div>"
                        "</div>"
                    ),
                    unsafe_allow_html=True,
                )

    st.session_state.messages.append({"role": "assistant", "content": result["answer"]})
