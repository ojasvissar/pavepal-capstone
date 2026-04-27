import { knowledgeBase, starterPrompts, type KnowledgeChunk } from './knowledgeBase';

export type AnswerMode = 'overview' | 'retrieval' | 'guide' | 'cost' | 'fallback';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface RetrievedSource {
  id: string;
  title: string;
  summary: string;
  score: number;
  reason: string;
}

export interface ChatMessageModel {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  citations?: string[];
  sources?: RetrievedSource[];
}

export interface AssistantResponse {
  answer: string;
  citations: string[];
  sources: RetrievedSource[];
  mode: AnswerMode;
  confidence: ConfidenceLevel;
  followUp: string;
  provider: 'ollama' | 'fallback';
  modelName?: string;
}

export { starterPrompts };

const defaultModelBaseUrl = (import.meta.env.VITE_PAVEPAL_MODEL_URL ?? 'http://localhost:11434').toString();
const defaultModelName = (import.meta.env.VITE_PAVEPAL_MODEL_NAME ?? 'llama3.2').toString();

const stopWords = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'their',
  'this',
  'to',
  'was',
  'what',
  'when',
  'where',
  'which',
  'with',
  'you',
]);

function normalize(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
}

function tokenize(text: string) {
  return normalize(text)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && !stopWords.has(token));
}

function scoreChunk(question: string, chunk: KnowledgeChunk) {
  const queryTokens = new Set(tokenize(question));
  const contentTokens = tokenize([chunk.title, chunk.summary, chunk.content, chunk.tags.join(' ')].join(' '));
  let score = 0;

  for (const token of contentTokens) {
    if (queryTokens.has(token)) {
      score += 3;
    }
  }

  const joinedQuestion = normalize(question);

  if (joinedQuestion.includes('pavepal') && chunk.id === 'company-overview') {
    score += 10;
  }

  if (joinedQuestion.includes('data') || joinedQuestion.includes('source') || joinedQuestion.includes('retrieval')) {
    if (chunk.category === 'data' || chunk.category === 'project') {
      score += 4;
    }
  }

  if (joinedQuestion.includes('guide') || joinedQuestion.includes('recommend') || joinedQuestion.includes('repair')) {
    if (chunk.category === 'guide' || chunk.category === 'cost') {
      score += 4;
    }
  }

  if (joinedQuestion.includes('cost') || joinedQuestion.includes('price') || joinedQuestion.includes('cheap')) {
    if (chunk.category === 'cost') {
      score += 5;
    }
  }

  if (joinedQuestion.includes('pci') || joinedQuestion.includes('segment') || joinedQuestion.includes('defect')) {
    if (chunk.category === 'data' || chunk.category === 'cost') {
      score += 4;
    }
  }

  return score;
}

function classifyMode(question: string): AnswerMode {
  const normalized = normalize(question);

  if (normalized.includes('what is pavepal') || normalized.includes('what does pavepal do')) {
    return 'overview';
  }

  if (normalized.includes('data') || normalized.includes('source') || normalized.includes('retrieval')) {
    return 'retrieval';
  }

  if (normalized.includes('guide') || normalized.includes('recommend') || normalized.includes('repair')) {
    return 'guide';
  }

  if (normalized.includes('cost') || normalized.includes('price') || normalized.includes('cheap')) {
    return 'cost';
  }

  return 'fallback';
}

function describeReason(question: string, chunk: KnowledgeChunk) {
  const normalized = normalize(question);

  if (chunk.id === 'company-overview') {
    return 'Defines PavePal as a computer-vision road assessment platform.';
  }

  if (chunk.id === 'project-scope') {
    return 'Explains the capstone goal of measuring retrieval quality and failure modes.';
  }

  if (chunk.id === 'inspection-data') {
    return normalized.includes('pci') || normalized.includes('defect')
      ? 'Connects the chat to segment PCI and defect detections.'
      : 'Provides the road inventory and defect taxonomy used by the demo.';
  }

  if (chunk.id === 'gdot-guide') {
    return 'Acts as the engineering rule book for treatment selection and grounding.';
  }

  if (chunk.id === 'rehab-activities') {
    return 'Supplies the PCI band-to-repair and cost mapping for cheapest-repair questions.';
  }

  return 'Relevant to the question terms and the local PavePal scope.';
}

function rankSources(question: string) {
  return knowledgeBase
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
      score,
      reason: describeReason(question, chunk),
    }));
}

function buildAnswer(question: string, sources: RetrievedSource[]) {
  const normalized = normalize(question);

  if (normalized.includes('what is pavepal') || normalized.includes('what does pavepal do')) {
    return [
      'PavePal is a road assessment platform that uses computer vision to inspect roads, detect pavement defects, and turn those observations into segment-level condition data.',
      'In this project, the assistant is meant to ground answers in the inspection data, the GDOT preservation guide, and the city\'s historical rehabilitation work so maintenance suggestions stay explainable.',
    ].join(' ');
  }

  if (normalized.includes('how does the chatbot') || normalized.includes('ground')) {
    return [
      'The chatbot is designed as a retrieval-augmented assistant: it first searches a small local knowledge base, then builds an answer from the most relevant evidence chunks.',
      'That makes it useful for testing whether the model cites the right road data, chooses the right guidance source, and avoids unsupported claims.',
    ].join(' ');
  }

  if (normalized.includes('data source') || normalized.includes('what data')) {
    return [
      'The project combines image-level defect detections, road segment PCI scores, the GDOT Pavement Preservation Guide, historical pavement reports, and cost tables.',
      'Those sources let the assistant explain both what the road looks like and what maintenance actions are justified.',
    ].join(' ');
  }

  if (normalized.includes('why') && normalized.includes('gdot')) {
    return [
      'The GDOT guide is the engineering reference that keeps the assistant grounded in accepted pavement preservation practice.',
      'It is the main source for checking whether a suggested treatment is appropriate for a given condition band.',
    ].join(' ');
  }

  if (normalized.includes('cost') || normalized.includes('price') || normalized.includes('cheap')) {
    return [
      'The cost side of the project comes from the rehab activities table and the 2024 bid tabulation, which together support a cheapest-acceptable-repair style answer.',
      'A good assistant should prefer the lowest-cost treatment that still falls inside the applicable PCI and pavement-type range.',
    ].join(' ');
  }

  if (sources.length === 0) {
    return 'I could not find a strong local match. Try asking about PavePal, PCI, road segments, the GDOT guide, or rehab costs.';
  }

  const lead = sources[0];
  return `The strongest local evidence points to ${lead.title}. ${lead.summary} The assistant should use that evidence together with the other retrieved sources to answer the question in a grounded way.`;
}

function determineConfidence(sources: RetrievedSource[], question: string): ConfidenceLevel {
  const normalized = normalize(question);

  if (normalized.includes('what is pavepal') || normalized.includes('what does pavepal do')) {
    return 'high';
  }

  if (sources.length >= 2 && sources[0]?.score >= 10) {
    return 'high';
  }

  if (sources.length === 1 || sources[0]?.score >= 5) {
    return 'medium';
  }

  return 'low';
}

function buildFollowUp(mode: AnswerMode) {
  switch (mode) {
    case 'overview':
      return 'Ask about the data sources, PCI scoring, or the GDOT guide next.';
    case 'retrieval':
      return 'Try a question about road segments, defects, or the evidence trail.';
    case 'guide':
      return 'Ask for the cheapest acceptable rehab or a repair recommendation.';
    case 'cost':
      return 'Ask what treatment a specific PCI band should trigger.';
    default:
      return 'Try a more specific question about PavePal, PCI, or maintenance guidance.';
  }
}

function buildModelSystemPrompt() {
  return [
    'You are the PavePal dashboard assistant.',
    'Answer only from the supplied project context and retrieved evidence.',
    'If the context is insufficient, say so clearly instead of inventing details.',
    'Keep the response concise and practical.',
    'When relevant, mention source ids like [company-overview] or [gdot-guide].',
  ].join(' ');
}

function buildModelUserPrompt(question: string, mode: AnswerMode, sources: RetrievedSource[]) {
  const contextBlock =
    sources.length > 0
      ? sources
          .map(
            (source) =>
              `- [${source.id}] ${source.title}: ${source.summary} Evidence note: ${source.reason}`,
          )
          .join('\n')
      : '- No strong local sources matched the question.';

  return [
    `Question: ${question}`,
    `Mode: ${mode}`,
    'Context:',
    contextBlock,
    'Write a grounded answer in 2 short paragraphs or fewer.',
  ].join('\n');
}

async function callLocalModel(question: string, mode: AnswerMode, sources: RetrievedSource[]) {
  try {
    const response = await fetch(`${defaultModelBaseUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: defaultModelName,
        stream: false,
        messages: [
          { role: 'system', content: buildModelSystemPrompt() },
          { role: 'user', content: buildModelUserPrompt(question, mode, sources) },
        ],
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      message?: {
        content?: string;
      };
    };

    return payload.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

export async function answerQuestion(question: string): Promise<AssistantResponse> {
  const sources = rankSources(question);
  const citations = sources.map((source) => source.id);
  const mode = classifyMode(question);
  const modelAnswer = await callLocalModel(question, mode, sources);

  return {
    answer: modelAnswer ?? buildAnswer(question, sources),
    citations,
    sources,
    mode,
    confidence: determineConfidence(sources, question),
    followUp: buildFollowUp(mode),
    provider: modelAnswer ? 'ollama' : 'fallback',
    modelName: modelAnswer ? defaultModelName : undefined,
  };
}
