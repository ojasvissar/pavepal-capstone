# PavePal RAG Dashboard

Local Vite + React prototype for a retrieval-augmented PavePal dashboard that can answer with Claude API.

## What it does

The dashboard explains what PavePal is, what it does, and how a chat assistant can ground answers in a small curated knowledge base. If a Claude API key is available, the assistant will call Claude; otherwise it falls back to deterministic retrieval.

## Run it

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal.

## Configure Claude

This project expects a Claude API key in your environment.

```bash
VITE_ANTHROPIC_API_KEY=your_api_key_here
VITE_ANTHROPIC_MODEL=claude-3-5-sonnet-latest
```

You can also override the API base URL if needed:

```bash
VITE_ANTHROPIC_BASE_URL=https://api.anthropic.com
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

- The demo uses Claude when an API key is available and otherwise falls back to deterministic retrieval.
- Because the API key is read from a Vite env var, this setup is only appropriate for local prototyping. Move the Claude call behind a server proxy before shipping.
- The generated build output in `dist/` is ignored and should not be committed.