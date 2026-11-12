import { Bookmark, Check, Landmark, Sailboat, TreePalm, Umbrella, Waves, CloudUpload, Lock, Minus, Plus, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { PACKING_CATEGORIES, ROLE_RANK, type PackingCategory, type PackingVisibility } from '../../../shared/constants';
import type { PackingItemDto, PackingListDto, TripSnapshot } from '../../../shared/types';
import { PageHeader, useTrip } from '../../components/AppShell';
import { toast } from '../../components/toast';
import { Badge, Button, Card, Chip, ConfirmDialog, EmptyState, IconButton, Input, Progress, Segmented, Select, SelectField, Sheet, Skeleton, TextField, Toggle, cx } from '../../components/ui';
import { t } from '../../i18n';
import { tripStore, usePendingIds } from '../../lib/store';
import { DAY_PRESETS, type DayPreset } from './dayPresets';

const PRESET_ICONS = { boat: Sailboat, dive: Waves, temple: Landmark, beach: Umbrella, nature: TreePalm } as const;

export default function PackingPage() {
  const { snap } = useTrip();
  if (!snap) {
    return (
      <div className="space-y-4 px-safe pt-safe">
        <Skeleton className="mt-6 h-10 w-1/2" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  return <Packing snap={snap} />;
}

function canWrite(list: PackingListDto, userId: string | undefined, role: TripSnapshot['trip']['role']) {
  if (list.visibility === 'private' || list.isTemplate) return list.ownerUserId === userId;
  return ROLE_RANK[role] >= ROLE_RANK.editor;
}

function Packing({ snap }: { snap: TripSnapshot }) {
  const { user } = useTrip();
  const lists = snap.packingLists.filter((l) => !l.isTemplate);
  const templates = snap.packingLists.filter((l) => l.isTemplate);
  const [activeId, setActiveId] = useState<string | null>(lists[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const active = lists.find((l) => l.id === activeId) ?? lists[0] ?? null;

  return (
    <div>
      <PageHeader
        title={t.packing.title}
        eyebrow={snap.trip.name}
        action={
          <IconButton label={t.packing.newList} variant="primary" onClick={() => setCreating(true)}>
            <Plus size={22} />
          </IconButton>
        }
      />
      <div className="px-safe pt-5">
        {lists.length === 0 ? (
          <EmptyState
            icon={<Bookmark size={26} />}
            title={t.packing.empty}
            text={t.packing.emptyText}
            action={
              <Button icon={<Plus size={18} />} onClick={() => setCreating(true)}>
                {t.packing.newList}
              </Button>
            }
          />
        ) : (
          <>
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {lists.map((l) => {
                const items = snap.packingItems.filter((i) => i.listId === l.id);
                const packed = items.filter((i) => i.packed).length;
                return (
                  <Chip key={l.id} active={l.id === active?.id} onClick={() => setActiveId(l.id)} icon={l.visibility === 'private' ? <Lock size={13} /> : <Users size={13} />}>
                    {l.name} <span className="opacity-60">{items.length ? `${packed}/${items.length}` : ''}</span>
                  </Chip>
                );
              })}
            </div>
            {active && <ListView key={active.id} list={active} snap={snap} editable={canWrite(active, user?.id, snap.trip.role)} />}
          </>
        )}
        {templates.length > 0 && (
          <p className="mt-8 text-center text-[13px] text-text-3">
            {t.packing.templates}: {templates.map((x) => x.name).join(', ')}
          </p>
        )}
      </div>
      {creating && (
        <NewListSheet
          snap={snap}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setActiveId(id);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function ListView({ list, snap, editable }: { list: PackingListDto; snap: TripSnapshot; editable: boolean }) {
  const pending = usePendingIds();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<PackingCategory>('clothing');
  const [hidePacked, setHidePacked] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const items = snap.packingItems.filter((i) => i.listId === list.id);
  const packed = items.filter((i) => i.packed).length;
  const visible = hidePacked ? items.filter((i) => !i.packed) : items;

  function add() {
    if (!name.trim()) return;
    tripStore.packing.createItem({ listId: list.id, name: name.trim(), category, quantity: 1, packed: false });
    setName('');
  }

  function saveTemplate() {
    tripStore.packing.createList({ name: `${list.name} (${t.packing.template})`, visibility: 'private', isTemplate: true, fromListId: list.id });
    toast(t.packing.templateSaved);
  }

  return (
    <div className="mt-4">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-[24px] font-semibold leading-tight">{list.name}</h2>
            <p className="mt-1 flex items-center gap-1.5 text-[13px] text-text-3">
              {list.visibility === 'private' ? <Lock size={13} /> : <Users size={13} />}
              {list.visibility === 'private' ? t.packing.privateHint : t.packing.sharedHint}
            </p>
          </div>
          {!editable && <Badge>{t.common.readOnly}</Badge>}
        </div>
        <Progress className="mt-4" value={items.length ? packed / items.length : 0} label={t.packing.progress(packed, items.length)} />
        <p className="mt-2 text-[13px] font-semibold text-text-2">{t.packing.progress(packed, items.length)}</p>
      </Card>

      {editable && (
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input aria-label={t.packing.itemName} placeholder={t.packing.addItem} value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
          <Select aria-label={t.plan.category} value={category} onChange={(e) => setCategory(e.target.value as PackingCategory)} className="w-[8.5rem] text-[14px]">
            {PACKING_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t.packingCategories[c]}
              </option>
            ))}
          </Select>
          <IconButton label={t.packing.addItem} variant="primary" type="submit" disabled={!name.trim()} className="h-12 w-12">
            <Plus size={20} />
          </IconButton>
        </form>
      )}

      <div className="mt-3">
        <Toggle label={t.packing.hidePacked} checked={hidePacked} onChange={setHidePacked} />
      </div>

      {items.length === 0 ? (
        <p className="py-8 text-center text-text-3">{t.packing.emptyList}</p>
      ) : (
        PACKING_CATEGORIES.map((c) => {
          const group = visible.filter((i) => i.category === c);
          if (!group.length) return null;
          return (
            <section key={c} className="mt-5">
              <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-text-3">{t.packingCategories[c]}</h3>
              <ul className="overflow-hidden rounded-[1.25rem] border border-line bg-surface">
                {group.map((it) => (
                  <ItemRow key={it.id} item={it} editable={editable} pending={pending.has(it.id)} />
                ))}
              </ul>
            </section>
          );
        })
      )}

      <div className="mt-8 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" icon={<Bookmark size={16} />} disabled={!items.length} onClick={saveTemplate}>
          {t.packing.saveAsTemplate}
        </Button>
        {editable && (
          <Button variant="danger" size="sm" icon={<Trash2 size={16} />} onClick={() => setConfirm(true)}>
            {t.common.delete}
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t.common.delete}
        message={t.packing.deleteListConfirm(list.name)}
        onConfirm={() => {
          tripStore.packing.removeList(list.id);
          toast(t.success.deleted);
        }}
      />
    </div>
  );
}

function ItemRow({ item, editable, pending }: { item: PackingItemDto; editable: boolean; pending: boolean }) {
  return (
    <li className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-0">
      <button
        type="button"
        role="checkbox"
        aria-checked={item.packed}
        aria-label={item.name}
        disabled={!editable}
        onClick={() => tripStore.packing.updateItem(item.id, { packed: !item.packed })}
        className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 transition', item.packed ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong')}
      >
        {item.packed && <Check size={16} strokeWidth={3} />}
      </button>
      <span className={cx('min-w-0 flex-1 truncate text-[15px]', item.packed && 'text-text-3 line-through')}>{item.name}</span>
      {pending && <CloudUpload size={14} className="shrink-0 text-info" aria-label={t.plan.pendingSync} />}
      {editable ? (
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label="−"
            className="grid h-9 w-9 place-items-center rounded-full text-text-3"
            onClick={() => (item.quantity > 1 ? tripStore.packing.updateItem(item.id, { quantity: item.quantity - 1 }) : tripStore.packing.removeItem(item.id))}
          >
            {item.quantity > 1 ? <Minus size={15} /> : <Trash2 size={15} />}
          </button>
          <span className="w-6 text-center text-[14px] font-semibold tabular">{item.quantity}</span>
          <button type="button" aria-label="+" className="grid h-9 w-9 place-items-center rounded-full text-text-3" onClick={() => tripStore.packing.updateItem(item.id, { quantity: item.quantity + 1 })}>
            <Plus size={15} />
          </button>
        </div>
      ) : (
        <span className="text-[14px] text-text-3">×{item.quantity}</span>
      )}
    </li>
  );
}

function NewListSheet({ snap, onClose, onCreated }: { snap: TripSnapshot; onClose: () => void; onCreated: (id: string) => void }) {
  const canShared = ROLE_RANK[snap.trip.role] >= ROLE_RANK.editor;
  const templates = snap.packingLists.filter((l) => l.isTemplate);
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<PackingVisibility>('private');
  const [from, setFrom] = useState('');
  const [preset, setPreset] = useState<DayPreset | null>(null);
  return (
    <Sheet
      open
      onClose={onClose}
      title={t.packing.newList}
      footer={
        <>
          <Button variant="secondary" block onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button
            block
            disabled={!name.trim()}
            onClick={() => {
              const id = tripStore.packing.createList({ name: name.trim(), visibility, isTemplate: false, ...(from && !preset ? { fromListId: from } : {}) });
              if (id && preset) {
                for (const [itemName, category] of preset.items) tripStore.packing.createItem({ listId: id, name: itemName, category, quantity: 1, packed: false });
              }
              if (id) onCreated(id);
            }}
          >
            {t.common.save}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-[14px] font-semibold text-text-2">{t.packing.dayTrip}</p>
          <div className="flex flex-wrap gap-2">
            {DAY_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                aria-pressed={preset?.key === p.key}
                onClick={() => {
                  const on = preset?.key !== p.key;
                  setPreset(on ? p : null);
                  if (on) {
                    setName(p.label);
                    setFrom('');
                    if (canShared) setVisibility('shared');
                  }
                }}
                className={cx(
                  'inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-[14px] font-semibold',
                  preset?.key === p.key ? 'border-transparent bg-text text-bg' : 'border-line bg-surface text-text-2',
                )}
              >
                {(() => {
                  const Icon = PRESET_ICONS[p.icon];
                  return <Icon size={15} className={preset?.key === p.key ? '' : 'text-accent'} aria-hidden />;
                })()}
                {p.label}
              </button>
            ))}
          </div>
          {preset && <p className="mt-2 text-[13px] text-text-3">{t.packing.presetItems(preset.items.length)}</p>}
        </div>
        <TextField label={t.packing.listName} value={name} onChange={(e) => setName(e.target.value)} />
        <Segmented
          label={t.packing.visibility}
          value={visibility}
          onChange={setVisibility}
          options={[
            { value: 'private', label: <><Lock size={14} /> {t.packing.private}</> },
            ...(canShared ? [{ value: 'shared' as const, label: <><Users size={14} /> {t.packing.shared}</> }] : []),
          ]}
        />
        <p className="text-[13px] text-text-3">{visibility === 'private' ? t.packing.privateHint : t.packing.sharedHint}</p>
        {!preset && (
        <SelectField label={t.packing.fromTemplate} optional value={from} onChange={(e) => setFrom(e.target.value)}>
          <option value="">{t.packing.blank}</option>
          {templates.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
          {snap.packingLists
            .filter((x) => !x.isTemplate)
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
        </SelectField>
        )}
      </div>
    </Sheet>
  );
}
