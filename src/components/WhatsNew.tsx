/**
 * "Neu in TRAVIO": after an update, a sheet with the most important changes
 * appears once. What this device has seen is remembered locally; the notes
 * can be opened again any time (Mehr → Neuigkeiten).
 */
import { ArrowRight, BadgeEuro, Bell, CalendarClock, Languages, Lightbulb, Plus, Receipt, Sparkles, Undo2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { CHANGELOG, unseenChanges, type ChangeEntry, type ChangeItem } from '../../shared/changelog';
import { t } from '../i18n';
import { Button, Sheet } from './ui';

const KEY = 'travio.seenVersion';
/** Devices that used TRAVIO before this feature existed have seen everything up to here. */
const BASELINE = '2.11.0';

const ICONS: Record<ChangeItem['icon'], ReactNode> = {
  plus: <Plus size={18} />,
  lightbulb: <Lightbulb size={18} />,
  bell: <Bell size={18} />,
  undo: <Undo2 size={18} />,
  language: <Languages size={18} />,
  receipt: <Receipt size={18} />,
  wallet: <BadgeEuro size={18} />,
  route: <CalendarClock size={18} />,
  sparkles: <Sparkles size={18} />,
};

function readSeen(): string {
  try {
    return localStorage.getItem(KEY) ?? BASELINE;
  } catch {
    return __APP_VERSION__;
  }
}
function markSeen() {
  try {
    localStorage.setItem(KEY, __APP_VERSION__);
  } catch {
    /* ignore */
  }
}

/** Opens automatically once after an update. */
export function WhatsNewOnUpdate() {
  const [entries, setEntries] = useState<ChangeEntry[]>([]);
  useEffect(() => {
    // A moment after start, so it does not compete with the first paint.
    const id = window.setTimeout(() => setEntries(unseenChanges(readSeen(), __APP_VERSION__)), 600);
    return () => window.clearTimeout(id);
  }, []);
  if (!entries.length) return null;
  return (
    <WhatsNewSheet
      entries={entries}
      onClose={() => {
        markSeen();
        setEntries([]);
      }}
    />
  );
}

export function WhatsNewSheet({ entries = CHANGELOG, onClose }: { entries?: ChangeEntry[]; onClose: () => void }) {
  const items = entries.flatMap((e) => e.items).slice(0, 8);
  return (
    <Sheet
      open
      onClose={onClose}
      title={t.whatsNew.title}
      footer={
        <Button block onClick={onClose}>
          {t.whatsNew.ok}
        </Button>
      }
    >
      <p className="-mt-1 mb-4 text-[13px] text-text-3">{t.whatsNew.version(__APP_VERSION__)}</p>
      <ul className="space-y-3">
        {items.map((it) => (
          <li key={it.title} className="flex gap-3 rounded-[1.25rem] border border-line bg-surface p-3.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">{ICONS[it.icon]}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-snug">{it.title}</p>
              <p className="mt-0.5 text-[13px] leading-snug text-text-2">{it.text}</p>
              {it.to && (
                <Link to={it.to} onClick={onClose} className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-semibold text-accent">
                  {t.whatsNew.show} <ArrowRight size={13} />
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
