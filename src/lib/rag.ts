import { knowledgeBase, starterPrompts, type KnowledgeChunk } from './knowledgeBase';

export interface RetrievedSource {
  id: string;
  title: string;
  summary: string;
  score: number;
}

export interface ChatMessageModel {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  citations?: string[];
  sources?: RetrievedSource[];
}

export { starterPrompts };

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

  if (joinedQuestion.includes('data') || joinedQuestion.includes('source')) {
    if (chunk.category === 'data' || chunk.category === 'project') {
      score += 4;
    }
  }

  if (joinedQuestion.includes('guide') || joinedQuestion.includes('recommend')) {
    if (chunk.category === 'guide' || chunk.category === 'cost') {
      score += 4;
    }
  }

  if (joinedQuestion.includes('cost') || joinedQuestion.includes('price')) {
    if (chunk.category === 'cost') {
      score += 5;
    }
  }

  return score;
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

export function answerQuestion(question: string) {
  const sources = rankSources(question);
  const citations = sources.map((source) => source.id);

  return {
    answer: buildAnswer(question, sources),
    citations,
    sources,
  };
}
