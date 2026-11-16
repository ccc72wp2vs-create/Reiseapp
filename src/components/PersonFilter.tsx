/**
 * Person / group filter chips: "Alle" or one or more travelers.
 * An empty selection means "all travelers".
 */
import { useState } from 'react';
import { groupCouples } from '../../shared/couples';
import type { TravelerDto } from '../../shared/types';
import { t } from '../i18n';
import { Chip } from './ui';

export function usePersonSelection(travelers: TravelerDto[]) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : travelers.filter((x) => x.id === id || cur.includes(x.id)).map((x) => x.id)));
  const same = (ids: string[]) => ids.length === selected.length && ids.every((id) => selected.includes(id));
  /** Selects exactly this group (e.g. a couple); tapping it again clears the filter. */
  const toggleGroup = (ids: string[]) => setSelected(same(ids) ? [] : travelers.filter((x) => ids.includes(x.id)).map((x) => x.id));
  return { selected, filtered: selected.length > 0, toggle, toggleGroup, isGroup: same, clear: () => setSelected([]) };
}

export function PersonFilter({
  travelers,
  selection,
  bleed = 'px-0',
}: {
  travelers: TravelerDto[];
  selection: ReturnType<typeof usePersonSelection>;
  /** Classes to let the chip row bleed to the card / page edge. */
  bleed?: string;
}) {
  if (travelers.length < 2) return null;
  const couples = travelers.length > 2 ? groupCouples(travelers).filter((c) => c.memberIds.length > 1) : [];
  const byId = new Map(travelers.map((x) => [x.id, x]));
  return (
    <div>
      <div className={`no-scrollbar flex gap-2 overflow-x-auto pb-1 ${bleed}`} role="group" aria-label={t.home.costsFilterHint}>
        <Chip active={!selection.filtered} onClick={selection.clear}>
          {t.home.costsAll}
        </Chip>
        {travelers.map((x) => (
          <Chip
            key={x.id}
            active={selection.selected.includes(x.id)}
            onClick={() => selection.toggle(x.id)}
            icon={<span className="h-2.5 w-2.5 rounded-full" style={{ background: x.color }} />}
          >
            {x.name}
          </Chip>
        ))}
        {couples.map((c) => (
          <Chip
            key={`couple-${c.key}`}
            active={selection.isGroup(c.memberIds)}
            onClick={() => selection.toggleGroup(c.memberIds)}
            icon={
              <span className="flex -space-x-1">
                {c.memberIds.map((id) => (
                  <span key={id} className="h-2.5 w-2.5 rounded-full ring-1 ring-surface" style={{ background: byId.get(id)?.color }} />
                ))}
              </span>
            }
          >
            {c.memberIds.map((id) => byId.get(id)?.name).join(' & ')}
          </Chip>
        ))}
      </div>
      <p className="mt-1 text-[12px] text-text-3">{t.home.costsFilterHint}</p>
    </div>
  );
}
