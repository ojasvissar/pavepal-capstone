import { GoogleGenerativeAI } from '@google/generative-ai';
import { createKnowledgeBase } from './dataLoader.js';

/**
 * Gemini API Configuration
 */
const defaultGeminiApiKey = (import.meta.env.VITE_GEMINI_API_KEY ?? '').toString().trim();
const defaultGeminiModel = (import.meta.env.VITE_GEMINI_MODEL ?? 'gemini-2.0-flash').toString();

let geminiClient = null;

function getGeminiClient() {
  if (!geminiClient && defaultGeminiApiKey) {
    geminiClient = new GoogleGenerativeAI(defaultGeminiApiKey);
  }
  return geminiClient;
}

/**
 * Global state for knowledge base and data
 */
let cachedKnowledgeBase = null;
export let knowledgeBase = [];
export const starterPrompts = [
  'What is PavePal and what does it do?',
  'How many road segments have been inspected?',
  'What types of defects are detected?',
  'Why is the GDOT guide important?',
];

/**
 * Initialize knowledge base from data files
 */
export async function initializeKnowledgeBase() {
  try {
    const { knowledgeBase: kb } = await createKnowledgeBase();
    cachedKnowledgeBase = kb;
    knowledgeBase = kb;
    return kb;
  } catch (error) {
    console.error('Error initializing knowledge base:', error);
    return [];
  }
}

/**
 * Text normalization and tokenization
 */
const stopWords = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how', 'in', 'is', 'it',
  'of', 'on', 'or', 'that', 'the', 'their', 'this', 'to', 'was', 'what', 'when', 'where',
  'which', 'with', 'you', 'about', 'these', 'those', 'just', 'only', 'no', 'so', 'if',
]);

function normalize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
}

function tokenize(text) {
  return normalize(text)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && !stopWords.has(token));
}

/**
 * Score a knowledge base chunk against a question
 */
function scoreChunk(question, chunk) {
  const queryTokens = new Set(tokenize(question));
  const chunkText = [chunk.title, chunk.summary, chunk.content, (chunk.tags || []).join(' ')].join(' ');
  const contentTokens = tokenize(chunkText);
  let score = 0;

  // Basic token matching
  for (const token of contentTokens) {
    if (queryTokens.has(token)) {
      score += 3;
    }
  }

  const normalizedQuestion = normalize(question);

  // Company-specific boosts
  if (normalizedQuestion.includes('pavepal') && chunk.id === 'company-overview') {
    score += 10;
  }

  // Data and structure queries
  if (
    normalizedQuestion.includes('data') ||
    normalizedQuestion.includes('source') ||
    normalizedQuestion.includes('retrieval') ||
    normalizedQuestion.includes('segment') ||
    normalizedQuestion.includes('road')
  ) {
    if (chunk.category === 'data') score += 6;
    if (chunk.category === 'project') score += 3;
  }

  // Guidance and maintenance queries
  if (
    normalizedQuestion.includes('guide') ||
    normalizedQuestion.includes('recommend') ||
    normalizedQuestion.includes('repair') ||
    normalizedQuestion.includes('treatment')
  ) {
    if (chunk.category === 'guide') score += 8;
    if (chunk.category === 'data') score += 4;
  }

  // Defect-specific queries
  if (
    normalizedQuestion.includes('defect') ||
    normalizedQuestion.includes('crack') ||
    normalizedQuestion.includes('pothole') ||
    normalizedQuestion.includes('damage')
  ) {
    if (chunk.id === 'defect-classification' || chunk.id === 'inspection-data') {
      score += 7;
    }
  }

  // Statistics and quantitative queries
  if (normalizedQuestion.includes('how many') || normalizedQuestion.includes('statistics')) {
    if (chunk.id === 'data-summary' || chunk.id === 'inspection-data') {
      score += 6;
    }
  }

  return score;
}

/**
 * Describe why a source was retrieved
 */
function describeReason(chunk) {
  const reasons = {
    'company-overview': 'Core information about PavePal as a road assessment platform.',
    'project-scope': 'Explains the capstone goals of grounded retrieval and evaluation.',
    'inspection-data': 'Describes the structure and content of the inspection dataset.',
    'road-infrastructure': 'Details about road segments and infrastructure properties.',
    'gdot-guide': 'Engineering guidance for maintenance decisions and treatment selection.',
    'defect-classification': 'Classification and definitions of pavement defects detected.',
    'data-summary': 'High-level summary of the inspection dataset and statistics.',
  };

  return reasons[chunk.id] || 'Relevant evidence from the project knowledge base.';
}

/**
 * Rank and retrieve top sources for a question
 */
function rankSources(question) {
  const kb = cachedKnowledgeBase || knowledgeBase;
  if (!kb || kb.length === 0) {
    return [];
  }

  return kb
    .map((chunk) => ({
      chunk,
      score: scoreChunk(question, chunk),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map(({ chunk, score }) => ({
      id: chunk.id,
      title: chunk.title,
      summary: chunk.summary,
      content: chunk.content,
      score: Math.round(score),
      reason: describeReason(chunk),
    }));
}

/**
 * Build system prompt for Gemini
 */
function buildSystemPrompt() {
  return `You are the PavePal AI Assistant, an expert on road assessment, pavement inspection, and maintenance planning.

Your responsibilities:
1. Answer questions about PavePal, road inspection data, pavement defects, and maintenance guidance
2. Provide grounded answers based only on the provided context
3. Always cite your sources using the format [source-id]
4. Be clear about limitations and what you don't know
5. Keep responses concise, practical, and professional
6. When discussing defects, use the proper classification system
7. For maintenance decisions, refer to the GDOT preservation guide

Guidelines:
- Only use information from the provided context
- If you don't have information, explicitly say so
- Be specific with data when available
- Suggest consulting professional engineers for critical decisions
- Maintain transparency about your knowledge sources`;
}

/**
 * Build user prompt with context
 */
function buildUserPrompt(question, sources) {
  if (sources.length === 0) {
    return `Question: ${question}\n\nI don't have specific context for this question in my knowledge base. Please provide a general response based on your knowledge of road assessment and pavement maintenance.`;
  }

  const contextBlock = sources
    .map((source) => {
      return `[${source.id}] ${source.title}\nSummary: ${source.summary}\nContent: ${source.content}\n`;
    })
    .join('\n---\n');

  return `Question: ${question}\n\nRelevant Context:\n${contextBlock}\n\nPlease provide a grounded answer based on the context above. Cite sources using [source-id] format.`;
}

/**
 * Call Gemini API for answer generation
 */
async function callGeminiModel(question, sources) {
  const client = getGeminiClient();

  if (!client) {
    console.warn('Gemini API key not configured. Using fallback answer.');
    return null;
  }

  try {
    const model = client.getGenerativeModel({ model: defaultGeminiModel });

    const response = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: buildUserPrompt(question, sources) }],
        },
      ],
      systemInstruction: buildSystemPrompt(),
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.7,
        topP: 0.9,
      },
    });

    const textContent = response.response.candidates?.[0]?.content?.parts?.[0]?.text;

    return textContent?.trim() || null;
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    return null;
  }
}

/**
 * Build fallback answer when API is unavailable
 */
function buildFallbackAnswer(question, sources) {
  const normalized = normalize(question);

  if (normalized.includes('what is pavepal') || normalized.includes('what does pavepal do')) {
    return 'PavePal is a road assessment platform that uses computer vision to detect pavement defects and help users proactively maintain their road networks. It analyzes inspection data to support maintenance decision-making.';
  }

  if (normalized.includes('how many') || normalized.includes('statistics')) {
    return 'The inspection dataset contains detailed information about road segments and detected defects. For specific statistics, please configure your Gemini API key.';
  }

  if (normalized.includes('defect') || normalized.includes('crack')) {
    return 'PavePal detects various defect types including transverse cracks, longitudinal cracks, potholes, and other pavement damage. Each defect type requires different treatment approaches based on the GDOT preservation guide.';
  }

  if (sources.length > 0) {
    const topSource = sources[0];
    return `Based on the available information about "${topSource.title}": ${topSource.summary}. ${topSource.reason}`;
  }

  return 'I have information about PavePal, road inspection data, pavement defects, and maintenance guidance. Try asking about PavePal, road segments, defects, or the GDOT preservation guide.';
}

/**
 * Extract citations from answer text
 */
function extractCitations(answerText, sources) {
  const citationIds = [];
  const sourceIds = sources.map((s) => s.id);

  for (const sourceId of sourceIds) {
    const pattern = new RegExp(`\\[${sourceId}\\]`, 'g');
    if (pattern.test(answerText)) {
      citationIds.push(sourceId);
    }
  }

  return citationIds.length > 0 ? citationIds : sources.map((s) => s.id);
}

/**
 * Main function to answer a question using RAG
 */
export async function answerQuestion(question) {
  const sources = rankSources(question);
  const modelAnswer = await callGeminiModel(question, sources);
  const answer = modelAnswer || buildFallbackAnswer(question, sources);
  const citations = extractCitations(answer, sources);

  return {
    answer,
    citations,
    sources,
    confidence: sources.length > 0 ? (sources[0]?.score >= 8 ? 'high' : 'medium') : 'low',
    provider: modelAnswer ? 'gemini' : 'fallback',
    modelName: modelAnswer ? defaultGeminiModel : undefined,
  };
}

/**
 * Export for testing/debugging
 */
export { buildSystemPrompt, buildUserPrompt, rankSources };
