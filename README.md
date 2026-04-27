# PavePal RAG Dashboard

A green and white themed Vite + React AI chatbot for PavePal that answers questions using Claude API with local fallback retrieval.

## What it does

- **AI Chat Interface** — Ask questions about PavePal, road inspection, pavement condition, and maintenance planning
- **Claude API Integration** — Real AI responses powered by Anthropic's Claude model
- **Local Fallback** — Deterministic retrieval from knowledge base when no API key is available
- **Evidence Display** — Shows sources and retrieval context for every answer
- **Green & White Theme** — Clean, professional light-mode interface with green accent colors

## Run it

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (typically http://localhost:5173/).

## Configure Claude API

To enable real AI responses:

1. Copy `.env.example` to `.env`
2. Add your Anthropic API key:

```bash
VITE_ANTHROPIC_API_KEY=sk-ant-your_key_here
VITE_ANTHROPIC_MODEL=claude-3-5-sonnet-latest
VITE_ANTHROPIC_BASE_URL=https://api.anthropic.com
```

Get an API key at [console.anthropic.com](https://console.anthropic.com).

## Build for production

```bash
npm run build
```

Output is in `dist/`.

## Preview production build

```bash
npm run preview
```

## Project structure

- `docs/` — Project documentation and briefing materials
- `src/App.jsx` — Main dashboard and chat UI component
- `src/lib/rag.js` — RAG logic: retrieval, Claude API calls, fallback retrieval
- `src/styles.css` — Green and white visual design system
- `src/main.jsx` — React entry point
- `vite.config.js` — Vite build configuration
- `.env.example` — Claude API configuration template

## Features

### Chat Panel
- Message bubbles with user (green) and assistant (light gray) styling
- Suggested starter prompts for quick queries
- Real-time thinking indicator while processing

### Evidence Panel
- Shows retrieval sources for each answer
- Displays knowledge base chunks and confidence scores
- Helps users understand the answer's context

### Responsive Design
- Desktop-optimized 2-column layout
- Mobile-friendly single-column fallback
- Smooth scrolling and animations

## Technical notes

- **Frontend only** — API key is in the browser; use a backend proxy before production
- **System prompt** — Defined in `buildModelSystemPrompt()` in `src/lib/rag.js`
- **Base query** — Built in `baseModelQuery(question, mode, sources)` 
- **Knowledge base** — 5 dummy chunks in `src/lib/rag.js`
- **No TypeScript** — Plain JavaScript/JSX for rapid prototyping
- **Vite 6.4.2** — Fast dev server with hot module reload

## Commits on feature branch

The `feat/pavepal-rag-dashboard` branch includes:
- App scaffold with Vite + React
- RAG logic with local retrieval
- Claude API integration with fallback
- Pure JavaScript conversion (no TypeScript)
- PavePal branding with green and white theme
- Tabbed dashboard → simplified AI-first chat layout
- Alignment and spacing refinements