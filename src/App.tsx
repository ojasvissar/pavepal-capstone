import { useEffect, useMemo, useRef, useState } from 'react';
import { answerQuestion, starterPrompts, type AssistantResponse, type ChatMessageModel, type RetrievedSource } from './lib/rag';
import { knowledgeBase } from './lib/knowledgeBase';

type PipelineStep = {
  label: string;
  detail: string;
};

const pipeline: PipelineStep[] = [
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

const initialMessages: ChatMessageModel[] = [
  {
    id: 'welcome',
    role: 'assistant',
    text:
      'PavePal is a road assessment platform. It uses vehicle-mounted computer vision to detect pavement defects, score road segments with PCI, and support maintenance planning with evidence from city reports and engineering guidance.',
    citations: ['company-overview', 'project-scope'],
  },
];

function MetricTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function PipelinePill({ step }: { step: PipelineStep }) {
  return (
    <div className="pipeline-pill">
      <strong>{step.label}</strong>
      <span>{step.detail}</span>
    </div>
  );
}

function SourceCard({ source }: { source: RetrievedSource }) {
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

function KnowledgeCard({ title, summary, detail }: { title: string; summary: string; detail: string }) {
  return (
    <article className="knowledge-card">
      <p className="knowledge-label">{detail}</p>
      <h3>{title}</h3>
      <p>{summary}</p>
    </article>
  );
}

function ChatBubble({ message }: { message: ChatMessageModel }) {
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
  const [messages, setMessages] = useState<ChatMessageModel[]>(initialMessages);
  const [input, setInput] = useState(starterPrompts[0]);
  const [lastResponse, setLastResponse] = useState<AssistantResponse | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const latestAssistantMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === 'assistant'),
    [messages],
  );

  const previewSources = lastResponse?.sources ?? knowledgeBase.slice(0, 3).map((source, index) => ({
    id: source.id,
    title: source.title,
    summary: source.summary,
    score: 12 - index,
    reason: 'Sample evidence pulled from the curated demo corpus.',
  }));

  function submitQuestion(question: string) {
    const trimmed = question.trim();
    if (!trimmed) {
      return;
    }

    const nextUserMessage: ChatMessageModel = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmed,
    };

    const response = answerQuestion(trimmed);
    setLastResponse(response);

    const nextAssistantMessage: ChatMessageModel = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      text: response.answer,
      citations: response.citations,
      sources: response.sources,
    };

    setMessages((current) => [...current, nextUserMessage, nextAssistantMessage]);
    setInput('');
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
            <p>Confidence: {lastResponse?.confidence ?? 'high'}.</p>
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
            <div className="status-pill">Dummy data enabled</div>
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
            />
            <div className="composer-actions">
              <div className="prompt-list" aria-label="Suggested prompts">
                {starterPrompts.map((prompt) => (
                  <button key={prompt} type="button" onClick={() => submitQuestion(prompt)}>
                    {prompt}
                  </button>
                ))}
              </div>
              <button className="send-button" type="submit">
                Send
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
