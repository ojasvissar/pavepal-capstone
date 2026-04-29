# PavePal AI Chatbot - RAG Implementation with Gemini

## Overview

This is a **Retrieval-Augmented Generation (RAG)** chatbot built for PavePal, a road assessment platform. The chatbot uses Google's Gemini API to provide grounded, transparent answers about road inspection data, pavement defects, and maintenance decisions.

## Features

✅ **Intelligent Retrieval** - Ranks and retrieves relevant documents from PavePal's knowledge base based on semantic similarity  
✅ **Gemini Integration** - Uses Google Gemini 2.0 Flash for fast, accurate responses  
✅ **Data-Driven Answers** - Grounds responses in actual inspection data and engineering guidance  
✅ **Source Citations** - Provides transparent source references for all answers  
✅ **Real-time Data Loading** - Loads and processes inspection data from GeoJSON files  
✅ **Fallback Mode** - Continues functioning if API is unavailable  

## Project Structure

```
pavepal-capstone/
├── src/
│   ├── App.jsx              # Main React component
│   ├── main.jsx            # Application entry point
│   ├── styles.css          # Styling
│   └── lib/
│       ├── rag.js          # RAG system with Gemini integration
│       └── dataLoader.js   # Data loading and processing
├── data/
│   ├── locations (2).json        # Inspection locations with defects
│   ├── roadSegments (2).json     # Road segment data
│   └── GDOT_PAVEMENT_PRESERVATION_GUIDE.pdf
├── docs/                   # Project documentation
├── package.json           # Dependencies
├── vite.config.js         # Vite configuration
├── .env.example           # Environment variable template
└── index.html             # HTML template
```

## Data Sources

The chatbot's knowledge base consists of:

1. **Company Information** - PavePal overview and project scope
2. **Inspection Data** - Road segments and location-based defect detections
3. **Defect Classification** - Pavement defect types and definitions
4. **Engineering Guidance** - References to GDOT preservation standards
5. **Infrastructure Data** - Road properties, municipalities, speed limits

### Data Files

- **locations (2).json** - 1000+ inspection locations with:
  - Geographic coordinates (lat/lon)
  - Detected defects (cracks, potholes, etc.)
  - Associated road information
  - Image paths for reference

- **roadSegments (2).json** - Road infrastructure data with:
  - Centerline IDs and segment properties
  - Speed limits and road class
  - Municipality and ownership information
  - Defect summaries per segment
  - Geographic LineString coordinates

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

This installs:
- `react` and `react-dom` - UI framework
- `@google/generative-ai` - Gemini API client

### 2. Get Your Gemini API Key

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Click "Create API Key"
3. Copy your API key

### 3. Configure Environment

Create a `.env` file in the project root (use `.env.example` as a template):

```bash
cp .env.example .env
```

Edit `.env` and add your API key:

```env
VITE_GEMINI_API_KEY=your_gemini_api_key_here
VITE_GEMINI_MODEL=gemini-2.0-flash
```

**Important**: Never commit `.env` to version control. It's already in `.gitignore`.

### 4. Run Development Server

```bash
npm run dev
```

The app will open at `http://localhost:5173` (or another port if 5173 is busy).

### 5. Build for Production

```bash
npm run build
npm run preview
```

## How the RAG System Works

### 1. Query Processing

When you ask a question:

```
User: "How many road segments have been inspected?"
↓
Normalize & tokenize query
↓
Score each knowledge base document
↓
Retrieve top 3 most relevant sources
```

### 2. Retrieval Ranking

Documents are ranked by:

- **Token matching** - How many query words appear in the document
- **Category boosting** - Prioritizes relevant document types
- **Intent detection** - Matches question intent to appropriate sources

Example scoring rules:
- Question about "defects" → prioritize defect classification documents
- Question with "how many" → prioritize data summary documents
- Question about "repair" → prioritize GDOT guide documents

### 3. Answer Generation

Retrieved sources are sent to Gemini with context:

```
System Prompt: [Role definition and guidelines]
↓
User Query: [Question + Retrieved sources]
↓
Gemini API
↓
Grounded Answer with Citations
```

### 4. Citation Extraction

Citations are extracted from the model's response by detecting `[source-id]` patterns and mapped back to source documents.

## API Reference

### Main Functions

#### `answerQuestion(question)`

Main function to answer user questions with RAG.

```javascript
const response = await answerQuestion("How many defects were found?");

// Returns:
{
  answer: "The inspection revealed...",
  citations: ["inspection-data", "data-summary"],
  sources: [
    {
      id: "data-summary",
      title: "Inspection Data Summary",
      summary: "...",
      content: "...",
      score: 15,
      reason: "High-level summary of dataset"
    },
    // ... more sources
  ],
  confidence: "high",
  provider: "gemini",
  modelName: "gemini-2.0-flash"
}
```

#### `initializeKnowledgeBase()`

Loads and prepares the knowledge base.

```javascript
await initializeKnowledgeBase();
// Loads data files and creates searchable index
```

#### `rankSources(question)`

Retrieves relevant sources for a question.

```javascript
const sources = rankSources("What is PavePal?");
// Returns top 3 ranked sources
```

### Data Loader Functions

#### `loadRoadSegments()`

Loads road segment GeoJSON data.

```javascript
const segments = await loadRoadSegments();
// Returns array of processed road segments
```

#### `loadLocations()`

Loads inspection location data.

```javascript
const locations = await loadLocations();
// Returns array of processed inspection locations
```

#### `createKnowledgeBase()`

Creates the complete knowledge base with loaded data.

```javascript
const { knowledgeBase, roadSegments, locations } = await createKnowledgeBase();
```

## Example Queries

### About PavePal

- "What is PavePal and what does it do?"
- "How does the platform work?"
- "What are the main features?"

### Data and Statistics

- "How many road segments have been inspected?"
- "What types of defects are detected?"
- "How many locations were surveyed?"

### Defects and Conditions

- "What is a transverse crack?"
- "How are defects classified?"
- "What are the different types of pavement damage?"

### Maintenance Planning

- "Why is the GDOT guide important?"
- "What maintenance decisions does PavePal support?"
- "How is this data used for maintenance planning?"

## Configuration Options

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_GEMINI_API_KEY` | (required) | Your Google Gemini API key |
| `VITE_GEMINI_MODEL` | `gemini-2.0-flash` | Gemini model to use |

### Model Selection

Different Gemini models available:

- `gemini-2.0-flash` - Latest, fastest (default)
- `gemini-1.5-pro` - More capable, slower
- `gemini-1.5-flash` - Balanced speed/quality

Change in `.env`:

```env
VITE_GEMINI_MODEL=gemini-1.5-pro
```

## Troubleshooting

### Issue: "Gemini API key not configured"

**Solution**: Ensure your `.env` file has `VITE_GEMINI_API_KEY` set correctly.

```bash
# Verify the key is loaded
cat .env | grep VITE_GEMINI_API_KEY
```

### Issue: Data files not loading

**Solution**: Ensure data files are in the correct location:

```bash
ls -la data/
# Should show: locations (2).json, roadSegments (2).json
```

### Issue: Slow responses

**Solution**: Switch to faster model in `.env`:

```env
VITE_GEMINI_MODEL=gemini-2.0-flash
```

### Issue: Rate limiting errors

**Solution**: Gemini API has rate limits. Wait a moment before sending many queries.

## Performance Optimization

### Retrieval Performance

The RAG system uses:

- **Stop words filtering** - Removes common words that don't aid retrieval
- **Text normalization** - Converts text to comparable format
- **Category boosting** - Prioritizes relevant document types
- **Multi-factor scoring** - Combines multiple signals for ranking

### Response Time

Typical response times:
- Retrieval: ~10-50ms
- Gemini API: ~1-3 seconds (network dependent)
- Total: ~1-3.5 seconds per query

## Development

### Project Structure

```javascript
// rag.js - Core RAG system
export async function answerQuestion(question)
export async function initializeKnowledgeBase()
export { buildSystemPrompt, buildUserPrompt, rankSources }

// dataLoader.js - Data management
export async function loadRoadSegments()
export async function loadLocations()
export async function createKnowledgeBase()

// App.jsx - React UI component
// Main chat interface and response display
```

### Adding New Knowledge

To add new documents to the knowledge base, edit `src/lib/dataLoader.js` and add to the `knowledgeBase` array in `createKnowledgeBase()`:

```javascript
{
  id: 'unique-id',
  title: 'Document Title',
  category: 'category-name',
  summary: 'Short summary',
  content: 'Full content',
  tags: ['tag1', 'tag2']
}
```

### Modifying Retrieval Logic

Adjust retrieval scoring in `src/lib/rag.js`:

- **`scoreChunk()`** - Modify scoring algorithm
- **`rankSources()`** - Change number of results
- **`buildSystemPrompt()`** - Modify Gemini's instructions

## Contributing

To improve the RAG system:

1. Enhance retrieval accuracy by adjusting scoring weights
2. Add more domain-specific knowledge documents
3. Improve data loading for additional data sources
4. Optimize performance for faster responses

## License

This project is part of the DSCI 591 Capstone for PavePal Technologies Inc.

## Support

For issues or questions:

1. Check the **Troubleshooting** section above
2. Review [Gemini API Documentation](https://ai.google.dev/docs)
3. Check the project logs in the browser console (F12 → Console tab)

## Next Steps

- ✅ Implement basic RAG with Gemini
- 📋 Add vector embeddings for better retrieval
- 📋 Implement conversation memory
- 📋 Add analytics for retrieval quality
- 📋 Create admin panel for knowledge base management
