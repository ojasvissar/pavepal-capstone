import { useEffect, useMemo, useRef, useState } from 'react';
import { answerQuestion, starterPrompts, knowledgeBase } from './lib/rag.js';

const brandLogoUrl = 'https://static.wixstatic.com/media/cc1f3a_760dc06313af4c13af4bac3b41b602a6~mv2.png/v1/fill/w_312,h_72,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/Primary%20logo%20(full%20color)_edited.png';

const initialMessages = [
  {
    id: 'welcome',
    role: 'assistant',
    text: 'PavePal is an AI-powered road and asset intelligence platform. It uses vehicle-mounted computer vision to detect pavement defects, score road segments with PCI, and support maintenance planning with evidence from city reports and engineering guidance.',
    citations: ['company-overview', 'project-scope'],
  },
];

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

function App() {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [lastResponse, setLastResponse] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      <header className="topbar">
        <div className="brand-lockup">
          <img className="brand-logo" src={brandLogoUrl} alt="PavePal logo" />
          <div className="brand-copy-block compact">
            <p className="brand-kicker">AI-Powered Road & Asset Intelligence</p>
            <p className="brand-subcopy">
              Ask the AI about road inspection, pavement condition, defects, and rehab planning.
            </p>
          </div>
        </div>
      </header>

      <section className="workspace" aria-label="PavePal AI chat workspace">
        <section className="chat-panel panel-card">
          <div className="panel-header">
            <div>
              <p className="section-label">AI Chat</p>
              <h1>Ask the model first.</h1>
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
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void submitQuestion(prompt)}
                    disabled={isLoading}
                  >
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

        <aside className="workspace-panel panel-card">
          <section className="info-card">
            <div className="panel-header compact">
              <div>
                <p className="section-label">Retrieval trace</p>
                <h2>Answer context & evidence</h2>
              </div>
            </div>
            <div className="source-list">
              {previewSources?.map((source) => (
                <SourceCard key={source.id} source={source} />
              ))}
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}

export default App;
