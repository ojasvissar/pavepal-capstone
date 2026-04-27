# PavePal RAG Dashboard

Local Vite + React prototype for a retrieval-augmented PavePal dashboard using dummy data.

## What it does

The dashboard explains what PavePal is, what it does, and how a chat assistant can ground answers in a small curated knowledge base. It uses local, fake retrieval data only; there is no backend or external API required.

## Run it

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal.

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

- The demo is intentionally local and deterministic.
- The generated build output in `dist/` is ignored and should not be committed.