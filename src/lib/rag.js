export const knowledgeBase = [
  {
    id: 'company-overview',
    title: 'PavePal company overview',
    category: 'company',
    summary: 'Road assessment platform focused on computer vision and maintenance planning.',
    content:
      'PavePal is a road assessment platform that helps users proactively maintain road networks. It uses computer vision to detect road defects and road assets at a customer-defined inspection frequency.',
    tags: ['PavePal', 'road assessment', 'computer vision', 'defects', 'assets'],
  },
  {
    id: 'project-scope',
    title: 'Capstone project scope',
    category: 'project',
    summary: 'Ground AI retrieval across inspection data, guidance documents, and cost tables.',
    content:
      'The capstone focuses on retrieval quality and failure modes. The goal is to connect structured road inspection data with unstructured engineering guidance and evaluate whether an AI system can ground maintenance decisions transparently.',
    tags: ['RAG', 'retrieval', 'grounding', 'evaluation', 'maintenance decisions'],
  },
  {
    id: 'inspection-data',
    title: 'Inspection data model',
    category: 'data',
    summary: '20,829 image-level detections and 1,960 road segments with PCI scores.',
    content:
      'The live dataset includes GeoJSON road segments, image-level defect detections, and segment-level PCI scores. Defect classes include longitudinal cracks, transverse cracks, block cracks, alligator cracks, potholes, patching, repaired cracks, sealing, and manhole covers.',
    tags: ['PCI', 'road segments', 'defects', 'GeoJSON', 'inspection'],
  },
  {
    id: 'gdot-guide',
    title: 'GDOT preservation guide',
    category: 'guide',
    summary: 'Authoritative engineering guidance for preservation and treatment selection.',
    content:
      'The GDOT Pavement Preservation Guide serves as the grounding reference for treatment selection, construction procedures, and QA/QC. It is the primary rule book for answering what repair is appropriate for a given condition.',
    tags: ['GDOT', 'preservation', 'treatment selection', 'engineering guidance'],
  },
  {
    id: 'rehab-activities',
    title: 'Rehab activities and cost data',
    category: 'cost',
    summary: 'PCI bands map to rehab actions and unit costs, including 2024 bid tabulation prices.',
    content:
      'The rehab activities sheet links pavement type and PCI ranges to recommended actions and base rates. The 2024 bid tabulation adds real-world contractor pricing that can be used to ground cost estimates.',
    tags: ['rehab', 'cost', 'bid tabulation', 'unit rate', 'PCI band'],
  },
];

export const starterPrompts = [
  'What is PavePal and what does it do?',
  'How does the chatbot ground answers?',
  'What data sources are in the project?',
  'Why is the GDOT guide important?',
];

const defaultAnthropicApiKey = (import.meta.env.VITE_ANTHROPIC_API_KEY ?? '').toString().trim();
const defaultAnthropicModel = (import.meta.env.VITE_ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-latest').toString();
const defaultAnthropicBaseUrl = (import.meta.env.VITE_ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com').toString();

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

function normalize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
}

function tokenize(text) {
  return normalize(text)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && !stopWords.has(token));
}

function scoreChunk(question, chunk) {
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

function classifyMode(question) {
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

function describeReason(question, chunk) {
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

function rankSources(question) {
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

function buildAnswer(question, sources) {
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

function determineConfidence(sources, question) {
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

function buildFollowUp(mode) {
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

export function baseModelQuery(question, mode, sources) {
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

async function callClaudeModel(question, mode, sources) {
  if (!defaultAnthropicApiKey) {
    return null;
  }

  try {
    const response = await fetch(`${defaultAnthropicBaseUrl.replace(/\/$/, '')}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': defaultAnthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: defaultAnthropicModel,
        max_tokens: 700,
        system: buildModelSystemPrompt(),
        messages: [{ role: 'user', content: baseModelQuery(question, mode, sources) }],
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();

    return (
      payload.content
        ?.filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('\n')
        .trim() || null
    );
  } catch {
    return null;
  }
}

export async function answerQuestion(question) {
  const sources = rankSources(question);
  const citations = sources.map((source) => source.id);
  const mode = classifyMode(question);
  const modelAnswer = await callClaudeModel(question, mode, sources);

  return {
    answer: modelAnswer ?? buildAnswer(question, sources),
    citations,
    sources,
    mode,
    confidence: determineConfidence(sources, question),
    followUp: buildFollowUp(mode),
    provider: modelAnswer ? 'claude' : 'fallback',
    modelName: modelAnswer ? defaultAnthropicModel : undefined,
  };
}
