import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { AskRequest, AskResponse, type EventView } from '@lanyard/contracts';
import { api } from '../../app/api';
import { Button, Card, TextInput } from '../../ui';

export function AskConference({ view }: { view: EventView }) {
  const [question, setQuestion] = useState('');
  const [reply, setReply] = useState<{ question: string; answer: AskResponse }>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const ask = async (event: FormEvent) => {
    event.preventDefault();
    const request = AskRequest.safeParse({ question: question.trim() });
    if (!request.success || pending) return;
    setPending(true);
    setError('');
    try {
      const answer = AskResponse.parse(
        await api.post(`/events/${encodeURIComponent(view.event.id)}/ask`, request.data),
      );
      setReply({ question: request.data.question, answer });
    } catch {
      setError('The conference assistant is unavailable right now. Please try again.');
    } finally {
      setPending(false);
    }
  };
  const sessions = [...view.now, ...view.next];
  return (
    <Card as="section" className="ops-ask" aria-labelledby="ops-ask-title">
      <div className="ops-section-heading">
        <div>
          <span className="ops-eyebrow">Conference intelligence</span>
          <h2 id="ops-ask-title">Ask the conference</h2>
        </div>
        <span>Grounded in session transcripts and questions</span>
      </div>
      <form onSubmit={(event) => void ask(event)}>
        <div className="ops-ask-input">
          <div className="ops-ask-field"><TextInput label="What would you like to understand?"
            id="ops-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={500}
            placeholder="What are attendees asking about observability?"
            required
            disabled={pending}
          /></div>
          <Button type="submit" icon="ask" disabled={pending || !question.trim()}>
            {pending ? 'Asking…' : 'Ask conference →'}
          </Button>
        </div>
      </form>
      <p role="status" aria-live="polite" className="ops-notice">
        {error ||
          (pending
            ? 'Finding relevant sessions and questions…'
            : reply
              ? 'Answer ready below.'
              : '')}
      </p>
      {reply && (
        <div className="ops-answer">
          <h3>{reply.question}</h3>
          <p>{reply.answer.answer}</p>
          {reply.answer.citations.length ? (
            <nav aria-label="Answer sources">
              <h4>Sources</h4>
              <ul>
                {reply.answer.citations.map((citation, i) => (
                  <li key={`${citation.sessionId}:${citation.chunkId ?? citation.questionId ?? i}`}>
                    <Link to={`/a/s/${encodeURIComponent(citation.sessionId)}`}>
                      {sessions.find((session) => session.id === citation.sessionId)?.title ??
                        `Session ${citation.sessionId}`}
                    </Link>
                    {citation.chunkId
                      ? ' · transcript'
                      : citation.questionId
                        ? ' · audience question'
                        : ''}
                  </li>
                ))}
              </ul>
            </nav>
          ) : (
            <p className="ops-source-note">No session sources were returned for this answer.</p>
          )}
        </div>
      )}
    </Card>
  );
}
