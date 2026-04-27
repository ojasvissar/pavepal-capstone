import type { ChatMessageModel } from '../lib/rag';

interface ChatMessageProps {
  message: ChatMessageModel;
}

export function ChatMessage({ message }: ChatMessageProps) {
  return (
    <article className={`message message-${message.role}`}>
      <div className="message-badge">{message.role === 'assistant' ? 'Assistant' : 'You'}</div>
      <p>{message.text}</p>
      {message.sources && message.sources.length > 0 ? (
        <div className="evidence-inline">
          <span>Evidence:</span>
          <ul>
            {message.sources.map((source) => (
              <li key={source.id}>
                {source.title} ({source.score})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
