import type { KnowledgeChunk } from '../lib/knowledgeBase';

interface SourceCardProps {
  source: KnowledgeChunk;
}

export function SourceCard({ source }: SourceCardProps) {
  return (
    <article className="source-card">
      <div className="source-topline">
        <span>{source.category}</span>
        <span>{source.id}</span>
      </div>
      <h3>{source.title}</h3>
      <p>{source.summary}</p>
    </article>
  );
}
