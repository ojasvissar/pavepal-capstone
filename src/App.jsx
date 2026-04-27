import { useEffect, useMemo, useRef, useState } from 'react';
import { answerQuestion, starterPrompts, knowledgeBase } from './lib/rag.js';

const pipeline = [
  { label: 'Inspect', detail: 'vehicle-mounted imagery' },
  { label: 'Detect', detail: 'cracks, potholes, assets' },
  { label: 'Score', detail: 'PCI by road segment' },
  { label: 'Ground', detail: 'GDOT + city guidance' },
  { label: 'Prioritize', detail: 'cost-aware rehab' },
];

const operationalBullets = [
  'Captures road imagery using a vehicle-mounted inspection workflow.',
  'Detects defects such as cracks, potholes, patching, and manhole covers.',
  'Rolls image-level detections into segment-level PCI and defect summaries.',
  'Supports maintenance planning with engineering guides, historical reports, and cost data.',
];

const initialMessages = [
  {
    id: 'welcome',
    role: 'assistant',
    text:
      'PavePal is a road assessment platform. It uses vehicle-mounted computer vision to detect pavement defects, score road segments with PCI, and support maintenance planning with evidence from city reports and engineering guidance.',
    citations: ['company-overview', 'project-scope'],
  },
];

function MetricTile({ label, value, detail }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function PipelinePill({ step }) {
  return (
    <div className="pipeline-pill">
      <strong>{step.label}</strong>
      <span>{step.detail}</span>
    </div>
  );
}

function SourceCard({ source }) {
  return (
    <article className="source-card">
      <div className="source-topline">
        <span>{source.id}</span>
        <span>{source.score}</span>
      </div>
      <h3>{source.title}</h3>
      <p>{source.summary}</p>
      <p className="source-reason">{source.reason}</p>
    </article>
  );
}

function KnowledgeCard({ title, summary, detail }) {
  return (
    <article className="knowledge-card">
      <p className="knowledge-label">{detail}</p>
      <h3>{title}</h3>
      <p>{summary}</p>
    </article>
  );
}

function ChatBubble({ message }) {
  const roleLabel = message.role === 'assistant' ? 'Assistant' : 'You';

  return (
    <article className={`message message-${message.role}`}>
      <div className="message-badge">{roleLabel}</div>
      <p>{message.text}</p>
      {message.sources && message.sources.length > 0 ? (
        <div className="evidence-inline">
          <span>Evidence</span>
          <div className="evidence-grid">
            {message.sources.map((source) => (
              <div key={source.id} className="evidence-chip">
                <strong>{source.title}</strong>
                <span>{source.reason}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}

const dashboardStats = [
  { label: 'Road segments', value: '1,960', detail: 'City inventory in scope' },
  { label: 'Scanned images', value: '20,829', detail: 'CV detections from field runs' },
  { label: 'Knowledge chunks', value: String(knowledgeBase.length), detail: 'Local retrieval corpus' },
];

function App() {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState(starterPrompts[0]);
  const [lastResponse, setLastResponse] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const latestAssistantMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === 'assistant'),
    [messages],
  );

  const previewSources =
    lastResponse?.sources ??
    knowledgeBase.slice(0, 3).map((source, index) => ({
      id: source.id,
      title: source.title,
      summary: source.summary,
      score: 12 - index,
      reason: 'Sample evidence pulled from the curated demo corpus.',
    }));

  async function submitQuestion(question) {
    const trimmed = question.trim();
    if (!trimmed || isLoading) {
      return;
    }

    const nextUserMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmed,
    };

    setInput('');
    setMessages((current) => [...current, nextUserMessage]);
    setIsLoading(true);

    try {
      const response = await answerQuestion(trimmed);
      setLastResponse(response);

      const nextAssistantMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: response.answer,
        citations: response.citations,
        sources: response.sources,
      };

      setMessages((current) => [...current, nextAssistantMessage]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />

      <header className="hero-card">
        <div className="hero-copy-block">
          <p className="eyebrow">PavePal / RAG dashboard prototype</p>
          <h1>Ask what the road network needs and see the evidence trail.</h1>
          <p className="hero-copy">
            This local demo uses dummy knowledge sources drawn from the project scope to explain
            what PavePal is, what it does, and how a retrieval-augmented assistant should ground
            answers in road data and guidance documents.
          </p>
          <div className="pipeline-row">
            {pipeline.map((step) => (
              <PipelinePill key={step.label} step={step} />
            ))}
          </div>
        </div>

        <div className="hero-side">
          <div className="hero-stats">
            {dashboardStats.map((stat) => (
              <MetricTile key={stat.label} {...stat} />
            ))}
          </div>
          <div className="signal-card">
            <span>Current mode</span>
            <strong>{lastResponse?.mode ?? 'overview'}</strong>
            <p>
              {lastResponse
                ? lastResponse.provider === 'claude'
                  ? `Answered by ${lastResponse.modelName ?? 'Claude'}. Confidence: ${lastResponse.confidence}.`
                  : `Using fallback retrieval. Confidence: ${lastResponse.confidence}.`
                : 'Ready to query Claude API or the fallback knowledge base.'}
            </p>
          </div>
        </div>
      </header>

      <main className="dashboard-grid">
        <section className="chat-panel panel-card">
          <div className="panel-header">
            <div>
              <p className="section-label">Assistant</p>
              <h2>RAG chat</h2>
            </div>
            <div className="status-pill">Claude API ready</div>
          </div>

          <div className="messages" aria-live="polite">
            {messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}
            <div ref={endRef} />
          </div>

          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              submitQuestion(input);
            }}
          >
            <label className="sr-only" htmlFor="question-input">
              Ask a question about PavePal
            </label>
            <textarea
              id="question-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about PavePal, PCI, defects, or rehab recommendations..."
              rows={3}
              disabled={isLoading}
            />
            <div className="composer-actions">
              <div className="prompt-list" aria-label="Suggested prompts">
                {starterPrompts.map((prompt) => (
                  <button key={prompt} type="button" onClick={() => void submitQuestion(prompt)} disabled={isLoading}>
                    {prompt}
                  </button>
                ))}
              </div>
              <button className="send-button" type="submit" disabled={isLoading}>
                {isLoading ? 'Thinking...' : 'Send'}
              </button>
            </div>
          </form>
        </section>

        <aside className="side-panel">
          <section className="info-card panel-card">
            <div className="panel-header compact">
              <div>
                <p className="section-label">What PavePal does</p>
                <h2>Operational overview</h2>
              </div>
            </div>
            <ul className="bullet-list">
              {operationalBullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="info-card panel-card">
            <div className="panel-header compact">
              <div>
                <p className="section-label">Retrieval trace</p>
                <h2>Answer context</h2>
              </div>
            </div>
            <div className="trace-summary">
              <div>
                <span>Follow-up</span>
                <strong>{lastResponse?.followUp ?? 'Ask a question to see a grounded answer.'}</strong>
              </div>
              <div>
                <span>Latest answer</span>
                <strong>{latestAssistantMessage?.text ?? 'Waiting for the next prompt.'}</strong>
              </div>
            </div>
            <div className="source-list">
              {previewSources?.map((source) => (
                <SourceCard key={source.id} source={source} />
              ))}
            </div>
          </section>

          <section className="info-card panel-card">
            <div className="panel-header compact">
              <div>
                <p className="section-label">Knowledge base</p>
                <h2>Curated dummy corpus</h2>
              </div>
            </div>
            <div className="knowledge-grid">
              {knowledgeBase.map((source) => (
                <KnowledgeCard key={source.id} title={source.title} summary={source.summary} detail={source.category} />
              ))}
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}

export default App;
