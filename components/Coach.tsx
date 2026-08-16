import React, { useState, useRef, useEffect } from 'react';
import { UserProfile } from '../types';
import { BodySystemScore } from '../utils/bodySystems';
import { screenCoachMessage, CRISIS_RESOURCES, CoachBlockReason } from '../utils/coachSafety';
import { askCoach, CoachTurn } from '../services/claudeService';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { IconX, IconSparkles, IconLifebuoy, IconSend } from '@tabler/icons-react';

interface CoachProps {
  profile: UserProfile;
  systems: BodySystemScore[];
  /** The finding this conversation is anchored to. */
  subject: BodySystemScore | null;
  planFocus?: string;
  dailyCalorieTarget?: number;
  onClose: () => void;
}

interface Message extends CoachTurn {
  /** Set when this reply came from the safety screen, not the model. */
  blocked?: CoachBlockReason;
}

const CrisisResources: React.FC = () => (
  <div className="mt-3 p-3 rounded-tile bg-card border border-edge">
    <p className="inline-flex items-center gap-1.5 text-xs font-bold text-fg mb-2">
      <IconLifebuoy size={14} className="text-hydro" /> Someone to talk to
    </p>
    <ul className="space-y-1.5">
      {CRISIS_RESOURCES.map((r) => (
        <li key={r.name} className="text-xs text-fg-soft">
          <span className="font-semibold text-fg">{r.name}</span>
          <span className="text-fg-mute"> · {r.region}</span>
          <br />
          {r.contact}
        </li>
      ))}
    </ul>
  </div>
);

/**
 * Scoped coach.
 *
 * Anchored to a body-system finding rather than presented as a blank chat box:
 * safer, because the conversation starts inside a bounded topic, and better UX,
 * because a blank box leaves people with nothing to type.
 *
 * Every message passes the client-side safety screen BEFORE it can reach the
 * model. The model is also instructed to refuse the same categories, but that
 * is the second layer, not the first.
 */
export const Coach: React.FC<CoachProps> = ({
  profile, systems, subject, planFocus, dailyCalorieTarget, onClose,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, busy]);

  const starters = subject
    ? [
        `Why is my ${subject.label} support at ${subject.score}%?`,
        ...(subject.gaps.length
          ? [`What should I eat to fix ${subject.gaps[0].nutrient}?`]
          : []),
        `What's one change that would help most?`,
      ]
    : [
        'What should I focus on today?',
        'Which nutrient am I most short on?',
      ];

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setError(null);
    setInput('');

    // ── Safety screen runs BEFORE the network call. ───────────────────────
    const screen = screenCoachMessage(trimmed);
    if (!screen.allowed) {
      setMessages((m) => [
        ...m,
        { role: 'user', content: trimmed },
        { role: 'assistant', content: screen.response!, blocked: screen.reason },
      ]);
      return;
    }

    const next: Message[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(next);
    setBusy(true);
    try {
      const reply = await askCoach(
        next.map(({ role, content }) => ({ role, content })),
        {
          profile,
          systems: systems.map((s) => ({
            label: s.label,
            score: s.score,
            gaps: s.gaps.map((g) => g.nutrient),
          })),
          subject: subject?.label,
          planFocus,
          dailyCalorieTarget,
        }
      );
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (e) {
      // Deliberately no canned fallback — see askCoach.
      setError(e instanceof Error ? e.message : 'The coach is unavailable right now.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      labelledBy="coach-title"
      className="bg-card rounded-modal w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]"
    >
      <div className="flex justify-between items-start gap-3 p-6 pb-4 border-b border-edge">
        <div>
          <h3 id="coach-title" className="inline-flex items-center gap-2 text-xl font-bold text-fg">
            <IconSparkles size={20} className="text-nutri" /> Coach
          </h3>
          <p className="text-xs text-fg-mute mt-1">
            {subject
              ? `Talking about your ${subject.label} support`
              : 'Ask about your logged nutrition'}
          </p>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-fg-mute hover:text-fg p-1">
          <IconX size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4" role="log" aria-live="polite">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-fg-soft">
              {subject
                ? `Your ${subject.label} support is at ${subject.score}% today. Ask me anything about it.`
                : 'Ask me about what you logged today.'}
            </p>
            <div className="flex flex-col gap-2">
              {starters.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-sm px-4 py-2.5 rounded-tile bg-raised border border-edge text-fg-soft hover:border-nutri hover:text-fg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
            <div
              className={
                m.role === 'user'
                  ? 'max-w-[85%] px-4 py-2.5 rounded-tile bg-nutri-strong text-white dark:text-[#08210f] text-sm'
                  : m.blocked
                    ? 'w-full p-4 rounded-tile bg-spark/10 border border-spark/30 text-sm text-fg leading-relaxed'
                    : 'max-w-[92%] text-sm text-fg leading-relaxed whitespace-pre-wrap'
              }
            >
              {m.content}
              {m.blocked && (m.blocked === 'self-harm' || m.blocked === 'disordered-eating') && (
                <CrisisResources />
              )}
            </div>
          </div>
        ))}

        {busy && (
          <p className="text-sm text-fg-mute" aria-live="polite">Thinking…</p>
        )}
        {error && (
          <p role="alert" className="text-sm text-fat">{error}</p>
        )}
        <div ref={endRef} />
      </div>

      <div className="p-4 border-t border-edge">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(input); }}
            placeholder="Ask about your nutrition…"
            aria-label="Message the coach"
            disabled={busy}
            className="flex-1 p-3 rounded-control bg-raised border-2 border-edge text-fg placeholder:text-fg-mute focus:border-nutri focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:opacity-60"
          />
          <Button onClick={() => send(input)} disabled={busy || !input.trim()} aria-label="Send">
            <IconSend size={18} />
          </Button>
        </div>
        <p className="text-[11px] text-fg-mute mt-2">
          General wellness information, not medical advice. Your profile and today&apos;s
          scores are sent to Anthropic to answer.
        </p>
      </div>
    </Modal>
  );
};
