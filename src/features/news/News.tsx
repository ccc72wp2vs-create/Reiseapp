/**
 * "Lage vor Ort" in the app: hint line, morning briefing, list sheet, the
 * section in the stop view and festival suggestions for the ideas.
 */
import { AlertTriangle, CloudRain, ExternalLink, Info, Lightbulb, MapPin, Newspaper, ShieldAlert, Ship, Sparkles, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { newsFor, SEVERITY_RANK, type NewsItemDto, type NewsKind, type NewsSeverity } from '../../../shared/news';
import type { TripSnapshot } from '../../../shared/types';
import { toast } from '../../components/toast';
import { Button, Sheet, cx } from '../../components/ui';
import { t } from '../../i18n';
import { http } from '../../lib/api';
import { tripStore, useOnline } from '../../lib/store';

// ---------------------------------------------------------------- data
const cache = new Map<string, { at: number; items: NewsItemDto[] }>();

export function useNews(tripId: string): NewsItemDto[] {
  const online = useOnline();
  const [items, setItems] = useState<NewsItemDto[]>(() => cache.get(tripId)?.items ?? []);
  useEffect(() => {
    const hit = cache.get(tripId);
    if (hit) setItems(hit.items);
    if (!online || (hit && Date.now() - hit.at < 15 * 60_000)) return;
    let off = false;
    http
      .get<{ items: NewsItemDto[] }>(`/trips/${tripId}/news`)
      .then((r) => {
        cache.set(tripId, { at: Date.now(), items: r.items });
        if (!off) setItems(r.items);
      })
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, [tripId, online]);
  return items;
}

const since = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString();

// ---------------------------------------------------------------- pieces
const KIND_ICON: Record<NewsKind, ReactNode> = {
  traffic: <Ship size={16} />,
  weather: <CloudRain size={16} />,
  safety: <ShieldAlert size={16} />,
  festival: <Sparkles size={16} />,
  advisory: <Info size={16} />,
};
const SEV_TONE: Record<NewsSeverity, string> = {
  urgent: 'bg-danger-soft text-danger',
  important: 'bg-warn-soft text-warn',
  info: 'bg-accent-soft text-accent',
};

function ago(iso: string) {
  const h = Math.round((Date.now() - Date.parse(iso)) / 3600_000);
  if (h < 1) return t.news.justNow;
  if (h < 24) return t.news.hoursAgo(h);
  return t.news.daysAgo(Math.round(h / 24));
}

function NewsRow({ n, snap, canEdit }: { n: NewsItemDto; snap: TripSnapshot; canEdit: boolean }) {
  const stop = snap.destinations.find((d) => d.id === n.destinationId);
  return (
    <li className="flex gap-3 rounded-[1.25rem] border border-line bg-surface p-3.5">
      <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-xl', SEV_TONE[n.severity])}>{KIND_ICON[n.kind]}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-text-3">
          {t.news.severity[n.severity]} · {stop?.name ?? t.news.countryWide}
        </p>
        <p className="mt-0.5 font-semibold leading-snug">{n.summary ?? n.title}</p>
        {n.summary && <p className="mt-0.5 text-[12px] italic text-text-3">„{n.title}“</p>}
        <p className="mt-1 text-[12px] text-text-3">
          {n.source} · {ago(n.publishedAt)}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-3">
          {n.url && (
            <a href={n.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent">
              {t.news.openSource} <ExternalLink size={12} />
            </a>
          )}
          {n.kind === 'festival' && canEdit && stop && <SaveIdea n={n} snap={snap} />}
        </div>
      </div>
    </li>
  );
}

function SaveIdea({ n, snap }: { n: NewsItemDto; snap: TripSnapshot }) {
  const saved = snap.places.some((p) => p.externalUrl && p.externalUrl === n.url);
  if (saved) return <span className="text-[13px] font-semibold text-success">{t.news.ideaSaved}</span>;
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent"
      onClick={() => {
        tripStore.places.create({ name: n.title.slice(0, 120), category: 'sightseeing', destinationId: n.destinationId, externalUrl: n.url, notes: n.summary ?? `${t.news.fromNews} (${n.source})` });
        toast(t.news.ideaAdded);
      }}
    >
      <Lightbulb size={13} /> {t.news.saveIdea}
    </button>
  );
}

export function NewsSheet({ snap, items, destinationId, canEdit, onClose }: { snap: TripSnapshot; items: NewsItemDto[]; destinationId: string | null; canEdit: boolean; onClose: () => void }) {
  const [all, setAll] = useState(false);
  const list = all ? [...items].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.publishedAt.localeCompare(a.publishedAt)) : newsFor(items, destinationId);
  const stop = snap.destinations.find((d) => d.id === destinationId);
  return (
    <Sheet open onClose={onClose} title={t.news.title} footer={<Button variant="secondary" block onClick={onClose}>{t.common.close}</Button>}>
      <div className="mb-3 flex items-center justify-between gap-2 text-[13px] text-text-3">
        <span className="inline-flex items-center gap-1">
          <MapPin size={14} /> {all ? t.news.allStops : (stop?.name ?? t.news.countryWide)}
        </span>
        <button type="button" className="font-semibold text-accent" onClick={() => setAll(!all)}>
          {all ? t.news.onlyHere : t.news.showAll}
        </button>
      </div>
      {list.length === 0 ? (
        <p className="py-6 text-center text-text-3">{t.news.nothing}</p>
      ) : (
        <ul className="space-y-2.5">
          {list.map((n) => (
            <NewsRow key={n.id} n={n} snap={snap} canEdit={canEdit} />
          ))}
        </ul>
      )}
      <p className="mt-4 text-[11px] leading-snug text-text-3">{t.news.sources}</p>
    </Sheet>
  );
}

/** A) One line on the home screen – only when something urgent/important exists. */
export function NewsHint({ items, destinationId, onOpen }: { items: NewsItemDto[]; destinationId: string | null; onOpen: () => void }) {
  const relevant = newsFor(items, destinationId, since(72)).filter((n) => n.severity !== 'info');
  if (!relevant.length) return null;
  const top = relevant[0];
  const urgent = top.severity === 'urgent';
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx('mt-3 flex w-full items-center gap-3 rounded-[1.25rem] border p-4 text-left', urgent ? 'border-danger/35 bg-danger-soft' : 'border-warn/35 bg-warn-soft')}
    >
      <AlertTriangle size={20} className={cx('shrink-0', urgent ? 'text-danger' : 'text-warn')} />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold leading-snug">{top.summary ?? top.title}</span>
        {relevant.length > 1 && <span className="block text-[12px] text-text-3">{t.news.more(relevant.length - 1)}</span>}
      </span>
    </button>
  );
}

/** D) Morning briefing: once a day, the last 24 h for today's stop. */
export function NewsBriefing({ items, destinationId, stopName, onOpen }: { items: NewsItemDto[]; destinationId: string | null; stopName: string; onOpen: () => void }) {
  const day = new Date().toISOString().slice(0, 10);
  const key = `travio.briefing.${day}`;
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });
  // Urgent/important items already sit in the hint line above – the briefing adds the rest.
  const list = newsFor(items, destinationId, since(24)).filter((n) => n.severity === 'info').slice(0, 3);
  if (hidden || !list.length) return null;
  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(key, '1');
    } catch {
      /* ignore */
    }
  };
  return (
    <section className="mt-5 rounded-[1.5rem] border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2">
        <Newspaper size={16} className="text-accent" />
        <p className="flex-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-text-3">{t.news.briefing(stopName)}</p>
        <button type="button" aria-label={t.common.close} onClick={hide} className="grid h-8 w-8 place-items-center rounded-full text-text-3">
          <X size={16} />
        </button>
      </div>
      <ul className="mt-2 space-y-2">
        {list.map((n) => (
          <li key={n.id} className="flex gap-2 text-[14px] leading-snug">
            <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.severity === 'urgent' ? 'bg-danger' : n.severity === 'important' ? 'bg-warn' : 'bg-accent')} />
            <span>{n.summary ?? n.title}</span>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onOpen} className="mt-2 text-[13px] font-semibold text-accent">
        {t.news.details}
      </button>
    </section>
  );
}

/** B) "Lage vor Ort" in the stop view. */
export function StopNews({ items, destinationId, onOpen }: { items: NewsItemDto[]; destinationId: string; onOpen: () => void }) {
  const list = newsFor(items, destinationId, since(7 * 24)).slice(0, 3);
  return (
    <div className="rounded-[1.25rem] border border-line bg-surface p-4">
      {list.length === 0 ? (
        <p className="text-[14px] text-text-3">{t.news.calm}</p>
      ) : (
        <ul className="space-y-2">
          {list.map((n) => (
            <li key={n.id} className="flex gap-2 text-[14px] leading-snug">
              <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.severity === 'urgent' ? 'bg-danger' : n.severity === 'important' ? 'bg-warn' : 'bg-accent')} />
              <span>{n.summary ?? n.title}</span>
            </li>
          ))}
        </ul>
      )}
      {list.length > 0 && (
        <button type="button" onClick={onOpen} className="mt-2 text-[13px] font-semibold text-accent">
          {t.news.details}
        </button>
      )}
    </div>
  );
}

/** E) Festivals and markets from the news as idea suggestions. */
export function NewsIdeas({ snap, items, destinationId, canEdit }: { snap: TripSnapshot; items: NewsItemDto[]; destinationId: string | null; canEdit: boolean }) {
  const list = items.filter((n) => n.kind === 'festival' && (!destinationId || n.destinationId === destinationId)).slice(0, 3);
  if (!list.length) return null;
  return (
    <div className="mb-4 rounded-[1.25rem] border border-accent/25 bg-accent-soft p-3.5">
      <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold">
        <Sparkles size={15} className="text-accent" /> {t.news.ideasTitle}
      </p>
      <ul className="space-y-2">
        {list.map((n) => (
          <li key={n.id} className="rounded-2xl bg-surface p-3">
            <p className="text-[14px] font-semibold leading-snug">{n.summary ?? n.title}</p>
            <div className="mt-1 flex flex-wrap gap-3">
              {n.url && (
                <a href={n.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent">
                  {t.news.openSource} <ExternalLink size={12} />
                </a>
              )}
              {canEdit && n.destinationId && <SaveIdea n={n} snap={snap} />}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
