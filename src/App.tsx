import { ChatMessage } from './components/ChatMessage';
import { MetricCard } from './components/MetricCard';
import { SourceCard } from './components/SourceCard';
import { answerQuestion, starterPrompts, type ChatMessageModel } from './lib/rag';
import { knowledgeBase } from './lib/knowledgeBase';
import { useEffect, useRef, useState } from 'react';

const initialMessages: ChatMessageModel[] = [
  {
    id: 'welcome',
    role: 'assistant',
    text:
      'PavePal is a road assessment platform. It uses vehicle-mounted computer vision to detect pavement defects, score road segments with PCI, and support maintenance planning with evidence from city reports and engineering guidance.',
    citations: ['company-overview', 'project-scope'],
  },
];

function App() {
  const [messages, setMessages] = useState<ChatMessageModel[]>(initialMessages);
  const [input, setInput] = useState('What does PavePal do?');
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
        <div>
          <p className="eyebrow">PavePal / RAG dashboard prototype</p>
          <h1>Ask what the road network needs and see the supporting evidence.</h1>
          <p className="hero-copy">
            This local demo uses dummy knowledge sources drawn from the project scope to explain
            what PavePal is, what it does, and how a retrieval-augmented assistant should ground
                answers in road data and guidance documents.
          </p>
        </div>
        <div className="hero-stats">
          <MetricCard label="Road segments" value="1,960" detail="City inventory in scope" />
          <MetricCard label="Scanned images" value="20,829" detail="CV detections from field runs" />
          <MetricCard label="Knowledge chunks" value={String(knowledgeBase.length)} detail="Local retrieval corpus" />
        </div>
      </header>

      <main className="grid-layout">
        <section className="chat-panel">
          <div className="panel-header">
            <div>
              <p className="section-label">Assistant</p>
              <h2>RAG chat</h2>
            </div>
            <div className="status-pill">Dummy data enabled</div>
          </div>

          <div className="messages" aria-live="polite">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
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
          <section className="info-card">
            <div className="panel-header compact">
              <div>
                <p className="section-label">What PavePal does</p>
                <h2>Operational overview</h2>
              </div>
            </div>
            <ul className="bullet-list">
              <li>Captures road imagery using a vehicle-mounted inspection workflow.</li>
              <li>Detects defects such as cracks, potholes, patching, and manhole covers.</li>
              <li>Rolls image-level detections into segment-level PCI and defect summaries.</li>
              <li>Supports maintenance planning with engineering guides, historical reports, and cost data.</li>
            </ul>
          </section>

          <section className="info-card">
            <div className="panel-header compact">
              <div>
                <p className="section-label">Retrieval trace</p>
                <h2>Evidence sources</h2>
              </div>
            </div>
            <div className="source-list">
              {knowledgeBase.slice(0, 4).map((source) => (
                <SourceCard key={source.id} source={source} />
              ))}
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}

export default App;
