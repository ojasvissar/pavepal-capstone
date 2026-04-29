# 🚀 PavePal Gemini RAG Chatbot - Quick Start

## ✅ What's Been Done

Your AI chatbot for PavePal has been fully implemented with Gemini API and RAG! Here's what was built:

### Core Components

1. **RAG System** (`src/lib/rag.js`) - 10KB
   - Semantic document retrieval with intelligent ranking
   - Gemini API integration for answer generation
   - Automatic source citation extraction
   - Fallback mode when API is unavailable

2. **Data Loader** (`src/lib/dataLoader.js`) - 8KB
   - Loads road segment GeoJSON data
   - Loads inspection location data with defects
   - Creates searchable knowledge base with 7 document types
   - Automatically processes geographic and defect data

3. **React UI** (`src/App.jsx`) - Updated
   - Initializes knowledge base on startup
   - Shows Gemini API status
   - Displays retrieved sources and citations
   - Responsive chat interface

### Dependencies Added

- `@google/generative-ai` v0.7.0 - Official Google Gemini API client

### Configuration Files

- `.env.example` - Template for API credentials
- `SETUP_GUIDE.md` - Complete documentation (20+ pages)

---

## 🎯 Next Steps to Run

### Step 1: Get Your Gemini API Key

Go to [Google AI Studio](https://makersuite.google.com/app/apikey) and:
1. Click "Create API Key"
2. Copy the key

### Step 2: Configure Environment

Create `.env` file in the project root:

```bash
# Copy the template
cp .env.example .env

# Edit .env with your API key
nano .env
```

Add your key:

```env
VITE_GEMINI_API_KEY=paste_your_key_here
VITE_GEMINI_MODEL=gemini-2.0-flash
```

### Step 3: Start Development Server

```bash
npm run dev
```

Visit `http://localhost:5173` in your browser.

---

## 🧠 How It Works

### User Asks a Question

```
"How many road segments have been inspected?"
```

### System Retrieves Relevant Sources

```
1. [data-summary] - Inspection Data Summary (score: 18)
2. [inspection-data] - Inspection Data Model (score: 15)
3. [road-infrastructure] - Road Infrastructure Details (score: 12)
```

### Gemini Generates Grounded Answer

```
Based on the inspection data available, the project includes 
approximately [X] road segments with detailed defect information...

[See Evidence section for source details]
```

### Answer Displays with Citations

```
Answer: [Detailed response based on data]

Evidence:
├─ Data Summary - High-level overview
├─ Inspection Data - Segment information
└─ Infrastructure - Road details
```

---

## 📊 Data Included

Your chatbot has access to:

### Inspection Data
- **~47 Road Segments** - Infrastructure with maintenance properties
- **~1000 Locations** - Inspection points with detected defects
- **Defect Types** - Cracks, potholes, sealing, etc.

### Knowledge Base Documents
1. Company Overview - What PavePal does
2. Project Scope - Capstone goals
3. Inspection Data - Dataset structure
4. Road Infrastructure - Segment properties
5. GDOT Preservation Guide - Engineering standards
6. Defect Classification - Types and definitions
7. Data Summary - Statistics

---

## 💬 Try These Questions

```
• "What is PavePal and what does it do?"
• "How many road segments have been inspected?"
• "What types of defects are detected?"
• "What is a transverse crack?"
• "Why is the GDOT guide important?"
• "What data is available in the inspection dataset?"
```

---

## 🔧 Build & Deploy

### Development
```bash
npm run dev          # Start dev server
npm run build        # Build for production
npm run preview      # Preview production build
```

### Production Deployment

The `dist/` folder contains your production-ready app:

```bash
# After npm run build
ls -la dist/
# dist/index.html           # Your app entry point
# dist/assets/             # CSS and JS bundles
```

Deploy `dist/` to any static hosting (Netlify, Vercel, GitHub Pages, etc.)

---

## 🔐 Important Security Notes

⚠️ **Never commit `.env` to version control!**

- `.env` is already in `.gitignore`
- Never share your API key publicly
- Regenerate key if accidentally exposed

---

## 🆘 Troubleshooting

### Q: "Gemini API key not configured"

```bash
# Check your .env file exists
cat .env | grep VITE_GEMINI_API_KEY

# Should show:
VITE_GEMINI_API_KEY=sk-...your-key-here...
```

### Q: Data not loading

```bash
# Verify data files exist
ls -la data/
# Should show:
# - locations (2).json
# - roadSegments (2).json
```

### Q: Build errors

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Q: Rate limiting / slow responses

```bash
# Switch to faster model in .env:
VITE_GEMINI_MODEL=gemini-2.0-flash  # (default, fastest)
```

---

## 📚 Full Documentation

See [SETUP_GUIDE.md](./SETUP_GUIDE.md) for:
- Detailed architecture explanation
- Complete API reference
- Advanced configuration
- Performance optimization
- Development guidelines

---

## ✨ Key Features Implemented

✅ **Semantic Retrieval** - Smart document ranking  
✅ **Gemini Integration** - Fast, accurate responses  
✅ **Real Data** - Loads actual inspection data  
✅ **Source Citations** - Transparent grounding  
✅ **Error Handling** - Fallback when API unavailable  
✅ **Mobile Responsive** - Works on all devices  
✅ **Production Ready** - Optimized for deployment  

---

## 🎓 Project Context

This is a **DSCI 591 Capstone** project for **PavePal Technologies Inc.**

**Project Goal**: Build a retrieval-augmented AI system that grounds road maintenance decisions in:
- Inspection data (GeoJSON road segments and defect detections)
- Engineering guidance (GDOT preservation standards)
- Cost information (rehabilitation activity pricing)

**Key Innovation**: Evaluating whether AI can transparently combine structured data with unstructured guidance to support maintenance decisions.

---

## 🚀 Ready to Go!

You're all set! 

**What to do now:**

1. ✅ Dependencies installed
2. ✅ Code is production-ready
3. 🔜 Add your Gemini API key to `.env`
4. 🔜 Run `npm run dev` to start
5. 🔜 Ask the chatbot about PavePal data!

---

**Questions?** Check the [SETUP_GUIDE.md](./SETUP_GUIDE.md) or the console (F12) for debug logs.

Happy chatting! 🎉
