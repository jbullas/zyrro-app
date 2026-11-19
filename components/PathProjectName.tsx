'use client';

import { useEffect, useState } from 'react';
import LinkButton from '@/components/LinkButton';
import PathNaming from '@/components/PathNaming';
import {
  NAMES_STATUS,
  namesLimitText,
  PATH_REFUSAL_FALLBACK,
  PATH_REFUSAL_TEXT,
  type ChatChoiceSet,
  type NameSuggestion,
} from '@/lib/chat-choices';

// #182 (brief 182-name-path-later): the project name on "Your path", given,
// changed or removed at any time after the conversation's own naming step.
// The names are the choice's saved set (the #181 kind), else a fresh set made
// in the background (the same waiting line and polling as after the choice);
// "New names" makes a fresh set once a set runs out, within the limit. The
// server owns every check; this sends the name and shows what comes back.

export type LaterNames = { status: 'generating' | 'ready' | 'failed' | null; names: NameSuggestion[] };

const POLL_MS = 3000;
const FAILED_LINE = 'I couldn’t put names together this time.';

type Props = {
  conversationId: string;
  projectName: string | null;
  laterNames: LaterNames | null;
  // The read-back after a save, a fresh set or a poll: the parent shows it.
  // Must be stable (useCallback): the polling effect depends on it.
  onConversation: (data: unknown) => void;
};

async function refusalLine(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({})) as { error?: string; retry_in_minutes?: number };
  if (body.error === 'names_limited' && typeof body.retry_in_minutes === 'number') return namesLimitText(body.retry_in_minutes);
  return (body.error && PATH_REFUSAL_TEXT[body.error]) || PATH_REFUSAL_FALLBACK;
}

export default function PathProjectName({ conversationId, projectName, laterNames, onConversation }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const status = laterNames?.status ?? null;
  const names = laterNames?.names ?? [];
  const generating = status === 'generating';

  async function post(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/path-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId, ...body }),
      });
      if (!res.ok) {
        setError(await refusalLine(res));
        return false;
      }
      onConversation(await res.json());
      return true;
    } catch (err) {
      console.error(err);
      setError(PATH_REFUSAL_FALLBACK);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const newNames = () => post({ action: 'name_path_names' });

  async function save(name: string | null) {
    if (await post({ action: 'name_path_save', name })) setOpen(false);
  }

  function openNaming() {
    setOpen(true);
    setError('');
    // No set to show (an old 3-name set, or none): make a fresh one.
    if (!names.length && !generating) newNames();
  }

  // While a fresh set is being made, read the conversation back until it's done.
  // A reload with the step closed keeps polling too, so the set is there when opened.
  useEffect(() => {
    if (!generating) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const res = await fetch('/api/path-conversation');
        if (!res.ok || cancelled) return;
        const data = await res.json() as { conversation?: { chosen?: { later_names?: LaterNames | null } | null } };
        if (cancelled || data.conversation?.chosen?.later_names?.status === 'generating') return;
        onConversation(data);
      } catch {
        // Try again on the next tick.
      }
    }, POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [generating, onConversation]);

  if (!open) {
    return (
      <div>
        <LinkButton onClick={openNaming}>{projectName ? 'Rename project' : 'Name your project'}</LinkButton>
      </div>
    );
  }

  const choices: ChatChoiceSet = {
    mode: 'groups',
    purpose: 'naming',
    names,
    groups: [{ id: 'name', label: 'Which project name do you want?', mode: 'single', required: false, options: names.map(n => ({ id: n.id, label: n.name })) }],
    note: { placeholder: 'Or write your own', required_unless_picked: true },
  };
  const namesSlot = generating ? (
    <div className="mentor-typing">
      <span className="spinner spin" />
      <span>{NAMES_STATUS}</span>
    </div>
  ) : !names.length ? (
    status === 'failed' ? <p className="mentor-md-p">{FAILED_LINE}</p> : <></>
  ) : undefined;

  return (
    <div className="flex flex-col gap-16">
      {status === 'failed' && names.length > 0 && <p className="mentor-md-p">{FAILED_LINE}</p>}
      <PathNaming
        // A new set starts again from its first page.
        key={names.map(n => n.name).join('|')}
        choices={choices}
        disabled={busy}
        submitLabel="Save project name"
        namesSlot={namesSlot}
        onNewNames={newNames}
        onSubmit={(ids, note) => {
          const picked = ids.find(id => id.startsWith('name:'))?.slice(5);
          const name = picked ? names.find(n => n.id === picked)?.name : note;
          if (name) save(name);
        }}
        actions={
          <>
            {projectName && <LinkButton onClick={() => save(null)} disabled={busy}>Remove project name</LinkButton>}
            <LinkButton onClick={() => { setOpen(false); setError(''); }} disabled={busy}>Cancel</LinkButton>
          </>
        }
      />
      {!generating && !names.length && (
        <div>
          <LinkButton onClick={newNames} disabled={busy}>New names</LinkButton>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
