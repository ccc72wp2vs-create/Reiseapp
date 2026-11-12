/**
 * Touch-friendly vertical drag & drop without dependencies.
 * Drag starts only from the handle (touch-action: none), so normal scrolling
 * keeps working. Items also expose move-up/down buttons as an accessible
 * fallback (see the consumers).
 */
import { GripVertical } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { t } from '../i18n';
import { cx } from './ui';

interface DragState {
  id: string;
  index: number;
  startY: number;
  dy: number;
  rects: DOMRect[];
  target: number;
}

export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
  disabled,
  className,
}: {
  items: T[];
  onReorder: (ids: string[]) => void;
  renderItem: (item: T, handle: ReactNode, index: number) => ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const refs = useRef<(HTMLLIElement | null)[]>([]);
  const [drag, setDrag] = useState<DragState | null>(null);

  function onPointerDown(e: React.PointerEvent, index: number) {
    if (disabled || items.length < 2) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const rects = refs.current.slice(0, items.length).map((el) => el!.getBoundingClientRect());
    setDrag({ id: items[index].id, index, startY: e.clientY, dy: 0, rects, target: index });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    const r = drag.rects[drag.index];
    const center = r.top + r.height / 2 + dy;
    // New index = number of other items whose midpoint lies above the dragged center.
    const target = drag.rects.filter((rect, i) => i !== drag.index && center > rect.top + rect.height / 2).length;
    setDrag({ ...drag, dy, target });
  }

  function onPointerUp() {
    if (!drag) return;
    const { index, target } = drag;
    setDrag(null);
    if (index !== target) {
      const ids = items.map((i) => i.id);
      const [moved] = ids.splice(index, 1);
      ids.splice(target, 0, moved);
      onReorder(ids);
    }
  }

  function offsetFor(i: number): number {
    if (!drag) return 0;
    if (i === drag.index) return drag.dy;
    const h = drag.rects[drag.index].height + 10;
    if (drag.index < drag.target && i > drag.index && i <= drag.target) return -h;
    if (drag.index > drag.target && i < drag.index && i >= drag.target) return h;
    return 0;
  }

  return (
    <ul className={cx('space-y-2.5', className)}>
      {items.map((item, i) => {
        const handle = disabled ? null : (
          <button
            type="button"
            aria-label={t.common.dragHandle}
            className="grid h-11 w-8 shrink-0 cursor-grab touch-none place-items-center rounded-xl text-text-3 active:cursor-grabbing"
            onPointerDown={(e) => onPointerDown(e, i)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <GripVertical size={18} />
          </button>
        );
        const dragging = drag?.id === item.id;
        return (
          <li
            key={item.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            style={{
              transform: `translateY(${offsetFor(i)}px)`,
              transition: dragging ? 'none' : drag ? 'transform 160ms ease' : undefined,
              zIndex: dragging ? 10 : undefined,
              position: 'relative',
            }}
            className={cx(dragging && 'scale-[1.02] drop-shadow-2xl')}
          >
            {renderItem(item, handle, i)}
          </li>
        );
      })}
    </ul>
  );
}

export function moveId(ids: string[], id: string, dir: -1 | 1): string[] | null {
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
