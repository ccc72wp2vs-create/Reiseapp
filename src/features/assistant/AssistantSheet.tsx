import { ArrowUp, Compass, LocateFixed, PlaneTakeoff, RotateCcw, SlidersHorizontal, Sparkles, Sun, Wallet } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import type { AssistantCard, AssistantProposal, AssistantResponse } from '../../../shared/assistant';
import { useTrip } from '../../components/AppShell';
import { toast } from '../../components/toast';
import { cx, Sheet } from '../../components/ui';
import { errorMessage, http } from '../../lib/api';
import { tripStore, useOnline } from '../../lib/store';
import { setDone } from '../bookings/CheckinReminders';
import { AnswerCard, ProposalCard, type ProposalState } from './cards';
import { PreferencesSheet } from './PreferencesSheet';

const ExpenseSheet = lazy(() => import('../wallet/ExpenseSheet'));

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  cards?: AssistantCard[];
  proposal?: AssistantProposal | null;
  state?: ProposalState;
  ai?: boolean;
}

const QUICK = [
  { label: 'Meinen Tag planen', icon: Sun, q: 'Plane uns morgen einen abwechslungsreichen Tag.' },
  { label: 'Orte entdecken', icon: Compass, q: 'Was können wir hier in der Nähe unternehmen?' },
  { label: 'Nächsten Flug anzeigen', icon: PlaneTakeoff, q: 'Wann geht unser nächster Flug und wann öffnet der Check-in?' },
  { label: 'Reisekasse prüfen', icon: Wallet, q: 'Wie viel haben wir ausgegeben und wer schuldet wem noch etwas?' },
];

/** The conversation lives only in this browser tab (sessionStorage), never on the server. */
const storageKey = (tripId: string) => `travio.assistant.${tripId}`;
function loadHistory(tripId: string): Msg[] {
  try {
    const raw = sessionStorage.getItem(storageKey(tripId));
    return raw ? (JSON.parse(raw) as Msg[]) : [];
  } catch {
    return [];
  }
}
function saveHistory(tripId: string, msgs: Msg[]) {
  try {
    sessionStorage.setItem(storageKey(tripId), JSON.stringify(msgs.slice(-20)));
  } catch {
    /* private mode – keep in memory only */
  }
}

export default function AssistantSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { snap, canEdit } = useTrip();
  const online = useOnline();
  const tripId = snap!.trip.id;
  const [msgs, setMsgs] = useState<Msg[]>(() => loadHistory(tripId));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [expense, setExpense] = useState<Extract<AssistantProposal, { kind: 'add_expense' }> | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => saveHistory(tripId, msgs), [tripId, msgs]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs, busy]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    const userMsg: Msg = { id: crypto.randomUUID(), role: 'user', text: question };
    const next = [...msgs, userMsg];
    setMsgs(next);
    setInput('');
    setBusy(true);
    try {
      const history = next.slice(-6).map((m) => ({ role: m.role, content: m.text.slice(0, 1000) }));
      const res = await http.post<AssistantResponse>(`/trips/${tripId}/assistant`, { messages: history, location });
      setRemaining(res.remaining);
      setMsgs((m) => [...m, { id: crypto.randomUUID(), role: 'assistant', text: res.answer, cards: res.cards, proposal: res.proposal, state: 'open', ai: res.ai }]);
    } catch (e) {
      setMsgs((m) => [...m, { id: crypto.randomUUID(), role: 'assistant', text: `Das hat nicht geklappt: ${errorMessage(e)}` }]);
    } finally {
      setBusy(false);
    }
  }

  const setState = (id: string, state: ProposalState) => setMsgs((m) => m.map((x) => (x.id === id ? { ...x, state } : x)));

  /** Executes a confirmed proposal through the app's existing functions. */
  async function confirm(msg: Msg, selected: number[] = []) {
    const p = msg.proposal;
    if (!p || !snap) return;
    setState(msg.id, 'busy');
    try {
      switch (p.kind) {
        case 'add_activities': {
          const existing = new Set(snap.activities.filter((a) => a.date === p.date).map((a) => a.title.trim().toLowerCase()));
          let added = 0;
          for (const i of selected) {
            const it = p.items[i];
            if (!it || existing.has(it.title.trim().toLowerCase())) continue; // never create the same entry twice
            tripStore.activities.create({
              title: it.title,
              date: p.date,
              startTime: it.startTime,
              endTime: it.endTime,
              category: it.category,
              locationName: it.locationName,
              description: it.description,
              placeId: it.placeId,
              lat: it.lat ?? null,
              lng: it.lng ?? null,
              bookingStatus: 'planned',
              notes: it.source === 'idea' ? 'Vorschlag von „Frag TRAVIO“ – Öffnungszeiten, Preise und Wege bitte prüfen.' : it.source === 'osm' ? `Ort aus OpenStreetMap (© OpenStreetMap-Mitwirkende, Geoapify)${it.travel ? ` · ${it.travel}` : ''}` : null,
            });
            existing.add(it.title.trim().toLowerCase());
            added++;
          }
          toast(added === 1 ? '1 Programmpunkt hinzugefügt' : `${added} Programmpunkte hinzugefügt`);
          break;
        }
        case 'update_activity':
          tripStore.activities.update(p.activityId, { date: p.date, startTime: p.startTime, endTime: p.endTime });
          toast('Im Reiseplan verschoben');
          break;
        case 'favorite_place':
          tripStore.places.update(p.placeId, { favorite: true });
          toast('Als Favorit gemerkt');
          break;
        case 'mark_checkin': {
          const b = snap.bookings.find((x) => x.id === p.bookingId);
          if (!b) throw new Error('Flug nicht gefunden');
          await setDone(tripId, b, true);
          toast('Check-in als erledigt markiert');
          break;
        }
        case 'add_packing': {
          const listId = p.listId ?? tripStore.packing.createList({ name: p.listName, visibility: 'shared' });
          for (const it of p.items) tripStore.packing.createItem({ listId, name: it.name, category: it.category });
          toast(`${p.items.length} Dinge zur Packliste hinzugefügt`);
          break;
        }
        case 'add_expense':
          setExpense(p);
          setState(msg.id, 'open');
          return;
      }
      setState(msg.id, 'done');
    } catch (e) {
      toast.error(e);
      setState(msg.id, 'open');
    }
  }

  async function toggleLocation() {
    if (location) return setLocation(null);
    if (!('geolocation' in navigator)) return toast('Standort ist auf diesem Gerät nicht verfügbar.', 'error');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: Math.round(pos.coords.latitude * 1e4) / 1e4, lng: Math.round(pos.coords.longitude * 1e4) / 1e4 });
        setLocating(false);
        toast('Standort wird für diese Sitzung verwendet');
      },
      () => {
        setLocating(false);
        toast('Standort nicht freigegeben – ich nutze euren aktuellen Reiseort.', 'error');
      },
      { maximumAge: 300_000, timeout: 10_000 },
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void ask(input);
  }

  const empty = msgs.length === 0;
  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title="Frag TRAVIO"
        size="lg"
        footer={
          <form onSubmit={submit} className="flex w-full items-center gap-2">
            <button
              type="button"
              onClick={toggleLocation}
              aria-pressed={!!location}
              aria-label={location ? 'Standort nicht mehr verwenden' : 'Meinen Standort verwenden'}
              className={cx(
                'grid h-12 w-12 shrink-0 place-items-center rounded-full border transition',
                location ? 'border-accent/40 bg-accent-soft text-accent' : 'border-line bg-surface-2 text-text-3',
                locating && 'animate-pulse',
              )}
            >
              <LocateFixed size={19} />
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={online ? 'Frag mich etwas …' : 'Offline – Frag TRAVIO braucht Internet'}
              disabled={!online}
              maxLength={600}
              enterKeyHint="send"
              aria-label="Frage an TRAVIO"
              className="h-12 min-w-0 flex-1 rounded-full border border-line bg-surface-2 px-4 text-[16px] outline-none placeholder:text-text-3 focus:border-accent/50"
            />
            <button
              type="submit"
              disabled={!input.trim() || busy || !online}
              aria-label="Senden"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent text-accent-ink transition active:scale-95 disabled:opacity-40"
            >
              <ArrowUp size={20} strokeWidth={2.5} />
            </button>
          </form>
        }
      >
        {empty ? (
          <div className="pb-2">
            <div className="flex flex-col items-center pt-2 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-[1.25rem] bg-accent-soft text-accent">
                <Sparkles size={26} />
              </span>
              <p className="mt-3 font-display text-[22px] font-semibold">Wie kann ich dir bei deiner Reise helfen?</p>
              <p className="mt-1 text-[14px] text-text-2">Ich kenne eure Route, Buchungen, Pläne und die Reisekasse.</p>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              {QUICK.map(({ label, icon: Icon, q }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => void ask(q)}
                  disabled={!online || busy}
                  className="flex min-h-[76px] flex-col items-start justify-between gap-2 rounded-[1.25rem] border border-line bg-surface p-3.5 text-left text-[15px] font-semibold transition active:scale-[0.98] disabled:opacity-50"
                >
                  <Icon size={20} className="text-accent" />
                  {label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setPrefsOpen(true)} className="mx-auto mt-4 flex items-center gap-1.5 text-[14px] font-semibold text-text-2">
              <SlidersHorizontal size={15} /> Reisevorlieben
            </button>
          </div>
        ) : (
          <div className="space-y-4 pb-2">
            <div className="flex justify-end gap-4">
              <button type="button" onClick={() => setPrefsOpen(true)} className="flex items-center gap-1 text-[13px] font-semibold text-text-3">
                <SlidersHorizontal size={13} /> Vorlieben
              </button>
              <button type="button" onClick={() => setMsgs([])} className="flex items-center gap-1 text-[13px] font-semibold text-text-3">
                <RotateCcw size={13} /> Neues Gespräch
              </button>
            </div>
            {msgs.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-[1.25rem] rounded-br-md bg-accent px-4 py-2.5 text-[15px] text-accent-ink">{m.text}</p>
                </div>
              ) : (
                <div key={m.id} className="animate-fade space-y-2.5">
                  <p className="max-w-[92%] text-[15px] leading-relaxed">{m.text}</p>
                  {m.ai === false && <p className="text-[12px] text-text-3">Direkt aus euren Reisedaten (ohne KI).</p>}
                  {m.cards?.map((c, i) => <AnswerCard key={i} card={c} onNavigate={onClose} />)}
                  {m.proposal && (
                    <ProposalCard
                      proposal={m.proposal}
                      state={m.state ?? 'open'}
                      canEdit={canEdit}
                      onConfirm={(sel) => void confirm(m, sel)}
                      onDismiss={() => setState(m.id, 'dismissed')}
                      onNavigate={onClose}
                    />
                  )}
                </div>
              ),
            )}
            {busy && (
              <div className="flex items-center gap-1.5 py-1" aria-label="TRAVIO denkt nach" role="status">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-2 w-2 animate-pulse rounded-full bg-accent" style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            )}
            {remaining !== null && remaining <= 5 && <p className="text-center text-[12px] text-text-3">Noch {remaining} KI-Anfragen heute.</p>}
            <div ref={endRef} />
          </div>
        )}
      </Sheet>
      {prefsOpen && <PreferencesSheet tripId={tripId} onClose={() => setPrefsOpen(false)} />}
      <Suspense fallback={null}>
        {expense && (
          <ExpenseSheet
            open
            onClose={() => setExpense(null)}
            prefill={{ title: expense.title, amountMinor: expense.amountMinor, currency: expense.currency, date: expense.date }}
          />
        )}
      </Suspense>
    </>
  );
}
