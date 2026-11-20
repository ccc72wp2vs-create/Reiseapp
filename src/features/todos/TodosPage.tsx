/**
 * To-dos for the group: who does what by when – e.g. "SIM-Karte verlängern",
 * "Fähre bestätigen". Tap the circle to tick off, tap the text to edit.
 */
import { Check, ListTodo, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { TodoDto, TripSnapshot } from '../../../shared/types';
import { PageHeader, useTrip } from '../../components/AppShell';
import { toast } from '../../components/toast';
import { Button, Card, EmptyState, IconButton, Input, Segmented, SelectField, Sheet, Skeleton, TextField, cx } from '../../components/ui';
import { t } from '../../i18n';
import { http } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { tripStore, useOnline } from '../../lib/store';
import { undoToast } from '../../lib/undo';

export default function TodosPage() {
  const { snap } = useTrip();
  if (!snap) return <Skeleton className="m-4 h-64" />;
  return <Todos snap={snap} />;
}

function Todos({ snap }: { snap: TripSnapshot }) {
  const { canEdit, me } = useTrip();
  const online = useOnline();
  const todos = snap.todos ?? [];
  const [filter, setFilter] = useState<'all' | 'mine'>('all');
  const [title, setTitle] = useState('');
  const [editing, setEditing] = useState<TodoDto | null>(null);
  const tripId = snap.trip.id;
  const name = (id: string | null) => snap.travelers.find((x) => x.id === id)?.name ?? null;
  const visible = todos.filter((x) => filter === 'all' || (me && x.assigneeTravelerId === me.id));
  const open = visible.filter((x) => !x.done);
  const done = visible.filter((x) => x.done);

  async function add() {
    if (!title.trim()) return;
    try {
      await tripStore.mutate(() => http.post(`/trips/${tripId}/todos`, { title: title.trim(), assigneeTravelerId: filter === 'mine' ? (me?.id ?? null) : null }));
      setTitle('');
    } catch (e) {
      toast.error(e);
    }
  }
  async function toggle(x: TodoDto) {
    try {
      await tripStore.mutate(() => http.patch(`/trips/${tripId}/todos/${x.id}`, { done: !x.done, version: x.version }));
    } catch (e) {
      toast.error(e);
    }
  }

  const row = (x: TodoDto) => (
    <li key={x.id} className="flex items-start gap-3 p-4">
      <button
        type="button"
        aria-label={x.done ? t.todos.reopen : t.todos.markDone}
        disabled={!canEdit || !online}
        onClick={() => toggle(x)}
        className={cx('mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition', x.done ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong')}
      >
        {x.done && <Check size={15} strokeWidth={3} />}
      </button>
      <button type="button" className="min-w-0 flex-1 text-left" disabled={!canEdit} onClick={() => setEditing(x)}>
        <p className={cx('font-semibold leading-snug', x.done && 'text-text-3 line-through')}>{x.title}</p>
        <p className="mt-0.5 text-[13px] text-text-3">
          {[name(x.assigneeTravelerId) ?? t.todos.anyone, x.dueDate ? t.todos.due(formatDate(x.dueDate)) : null].filter(Boolean).join(' · ')}
        </p>
        {x.notes && <p className="mt-1 text-[13px] text-text-2">{x.notes}</p>}
      </button>
    </li>
  );

  return (
    <div>
      <PageHeader title={t.todos.title} eyebrow={snap.trip.name}>
        <Segmented
          className="mt-5"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t.todos.all },
            { value: 'mine', label: t.todos.mine },
          ]}
        />
      </PageHeader>
      <div className="px-safe pb-nav pt-4">
        {canEdit && (
          <form
            className="mb-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <Input aria-label={t.todos.new} placeholder={t.todos.newPlaceholder} value={title} onChange={(e) => setTitle(e.target.value)} className="h-12 min-w-0 flex-1" />
            <IconButton label={t.todos.add} variant="primary" type="submit" disabled={!title.trim() || !online} className="h-12 w-12">
              <Plus size={20} />
            </IconButton>
          </form>
        )}
        {todos.length === 0 ? (
          <EmptyState icon={<ListTodo size={26} />} title={t.todos.empty} text={t.todos.emptyText} />
        ) : (
          <>
            {open.length > 0 ? <Card className="divide-y divide-line">{open.map(row)}</Card> : <p className="py-4 text-center text-success">{t.todos.allDone}</p>}
            {done.length > 0 && (
              <>
                <p className="mb-2 mt-6 text-[12px] font-semibold uppercase tracking-[0.14em] text-text-3">{t.todos.doneTitle(done.length)}</p>
                <Card className="divide-y divide-line">{done.map(row)}</Card>
              </>
            )}
          </>
        )}
      </div>
      {editing && <TodoSheet snap={snap} todo={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function TodoSheet({ snap, todo, onClose }: { snap: TripSnapshot; todo?: TodoDto | null; onClose: () => void }) {
  const online = useOnline();
  const [form, setForm] = useState({ title: todo?.title ?? '', assignee: todo?.assigneeTravelerId ?? '', due: todo?.dueDate ?? '', notes: todo?.notes ?? '' });
  const [busy, setBusy] = useState(false);
  const tripId = snap.trip.id;
  async function save() {
    setBusy(true);
    try {
      const body = { title: form.title.trim(), assigneeTravelerId: form.assignee || null, dueDate: form.due || null, notes: form.notes.trim() || null };
      await tripStore.mutate(() => (todo ? http.patch(`/trips/${tripId}/todos/${todo.id}`, { ...body, version: todo.version }) : http.post(`/trips/${tripId}/todos`, body)));
      toast(t.success.saved);
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!todo) return;
    try {
      await tripStore.mutate(() => http.del(`/trips/${tripId}/todos/${todo.id}`));
      undoToast(t.undo.deleted(todo.title), () =>
        tripStore.mutate(() => http.post(`/trips/${tripId}/todos`, { title: todo.title, notes: todo.notes, assigneeTravelerId: todo.assigneeTravelerId, dueDate: todo.dueDate, done: todo.done })),
      );
      onClose();
    } catch (e) {
      toast.error(e);
    }
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={todo ? t.todos.edit : t.todos.add}
      footer={
        <>
          <Button variant="secondary" block onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button block loading={busy} disabled={!form.title.trim() || !online} onClick={save}>
            {t.common.save}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField label={t.todos.titleField} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus={!todo} />
        <SelectField label={t.todos.who} value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })}>
          <option value="">{t.todos.anyone}</option>
          {snap.travelers.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </SelectField>
        <TextField label={t.todos.dueField} type="date" optional value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
        <TextField label={t.todos.notes} optional value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        {todo && (
          <Button variant="ghost" icon={<Trash2 size={16} />} disabled={!online} onClick={remove}>
            {t.common.delete}
          </Button>
        )}
      </div>
    </Sheet>
  );
}
