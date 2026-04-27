# PavePal RAG Dashboard

Local Vite + React prototype for a retrieval-augmented PavePal dashboard that can answer with a real local AI model.

## What it does

The dashboard explains what PavePal is, what it does, and how a chat assistant can ground answers in a small curated knowledge base. If Ollama is available, the assistant will call a real local model; otherwise it falls back to deterministic retrieval.

## Run it

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal.

## Run the AI model

This project expects a local Ollama server at `http://localhost:11434`.

```bash
ollama pull llama3.2
ollama serve
```

If you want to point the app at a different Ollama endpoint or model, create a `.env` file with:

```bash
VITE_PAVEPAL_MODEL_URL=http://localhost:11434
VITE_PAVEPAL_MODEL_NAME=llama3.2
```

## Build it

```bash
npm run build
```

## Preview the production build

```bash
npm run preview
```

## Project structure

- `src/App.tsx` contains the dashboard and chat UI.
- `src/lib/rag.ts` contains the local retrieval and answer logic.
- `src/lib/knowledgeBase.ts` contains the dummy PavePal corpus.
- `src/styles.css` contains the visual system for the dashboard.

## Notes

- The demo uses a real model when Ollama is available and otherwise falls back to deterministic retrieval.
- The generated build output in `dist/` is ignored and should not be committed.