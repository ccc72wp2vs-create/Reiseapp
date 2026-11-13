import { Briefcase, ChevronRight, CloudOff, Download, FlaskConical, Languages, Luggage, Map, Settings, Siren, Smartphone, Sparkles, Ticket, Trash2, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { PageHeader, useTrip } from '../../components/AppShell';
import { OfflineCapabilities } from '../../components/SyncStatus';
import { toast } from '../../components/toast';
import { Badge, Button, ConfirmDialog, SectionTitle, Sheet } from '../../components/ui';
import { t } from '../../i18n';
import { http } from '../../lib/api';
import { tripsList, tripStore, useOnline, useTrips } from '../../lib/store';
import { LANG_NAMES, phraseLangFor } from '../../lib/phrasebook';

function Row({ to, icon, label, hint, onClick }: { to?: string; icon: ReactNode; label: string; hint?: ReactNode; onClick?: () => void }) {
  const inner = (
    <>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block truncate text-[13px] text-text-3">{hint}</span>}
      </span>
      <ChevronRight size={18} className="text-text-3" />
    </>
  );
  const cls = 'flex w-full items-center gap-3 px-4 py-3.5 text-left';
  return <li className="border-b border-line last:border-0">{to ? <Link to={to} className={cls}>{inner}</Link> : <button type="button" onClick={onClick} className={cls}>{inner}</button>}</li>;
}

export default function MorePage() {
  const { snap } = useTrip();
  const { trips } = useTrips();
  const online = useOnline();
  const [offlineOpen, setOfflineOpen] = useState(false);
  const [confirmDemo, setConfirmDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const phraseLang = phraseLangFor(snap?.trip.destinationCountry);
  const hasDemo = (trips ?? []).some((x) => x.isDemo);
  const items = snap ? snap.packingItems.filter((i) => snap.packingLists.some((l) => l.id === i.listId && !l.isTemplate)) : [];

  async function loadDemo() {
    setBusy(true);
    try {
      const r = await http.post<{ tripId: string; created: boolean }>('/imports/demo-thailand');
      await tripsList.load();
      await tripStore.select(r.tripId);
      toast(r.created ? t.success.imported : t.success.alreadyImported, r.created ? 'success' : 'info');
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title={t.more.title} />
      <div className="px-safe">
        <SectionTitle>{t.more.trip}</SectionTitle>
        <ul className="overflow-hidden rounded-[1.5rem] border border-line bg-surface">
          <Row to="/reisen" icon={<Briefcase size={19} />} label={t.trips.title} hint={snap?.trip.name} />
          <Row to="/reise" icon={<Users size={19} />} label={t.trips.overview} hint={`${t.destinations.title} · ${t.travelers.title}`} />
          <Row to="/route" icon={<Map size={19} />} label={t.trips.route} />
          <Row to="/buchungen" icon={<Ticket size={19} />} label={t.bookings.title} hint={snap ? `${snap.bookings.length}` : undefined} />
          <Row to="/rueckblick" icon={<Sparkles size={19} />} label={t.recap.title} hint={t.recap.share} />
          {phraseLang && <Row to="/sprache" icon={<Languages size={19} />} label={`${t.phrasebook.titleGeneric}: ${LANG_NAMES[phraseLang]}`} hint={t.phrasebook.eyebrow} />}
          <Row to="/notfall" icon={<Siren size={19} />} label={t.emergency.title} hint={t.emergency.eyebrow} />
          <Row to="/packliste" icon={<Luggage size={19} />} label={t.packing.title} hint={items.length ? t.packing.progress(items.filter((i) => i.packed).length, items.length) : undefined} />
        </ul>

        <SectionTitle>{t.more.app}</SectionTitle>
        <ul className="overflow-hidden rounded-[1.5rem] border border-line bg-surface">
          <Row to="/einstellungen" icon={<Settings size={19} />} label={t.settings.title} hint={`${t.settings.appearance} · ${t.settings.profile} · ${t.more.privacy}`} />
          <Row to="/installieren" icon={<Smartphone size={19} />} label={t.more.install} />
          <Row onClick={() => setOfflineOpen(true)} icon={<CloudOff size={19} />} label={t.more.offline} />
        </ul>

        <SectionTitle>{t.more.demo}</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<FlaskConical size={16} />} loading={busy} disabled={!online} onClick={() => void loadDemo()}>
            {t.more.loadDemo}
          </Button>
          {hasDemo && (
            <Button variant="danger" icon={<Trash2 size={16} />} disabled={!online} onClick={() => setConfirmDemo(true)}>
              {t.more.deleteDemo}
            </Button>
          )}
        </div>

        <SectionTitle>{t.more.plannedFeatures}</SectionTitle>
        <ul className="flex flex-wrap gap-2">
          {t.more.plannedList.map((x) => (
            <li key={x}>
              <Badge tone="neutral" icon={<Sparkles size={12} />}>
                {x} · {t.more.planned}
              </Badge>
            </li>
          ))}
        </ul>

        <a href="/api/v1/auth/export" className="mt-8 inline-flex items-center gap-2 text-[14px] font-semibold text-accent">
          <Download size={16} /> {t.settings.exportAll}
        </a>
        <p className="mt-6 pb-4 text-[12px] text-text-3">
          TRAVIO · {t.more.version} {__APP_VERSION__}
        </p>
      </div>
      <Sheet open={offlineOpen} onClose={() => setOfflineOpen(false)} title={t.more.offline}>
        <OfflineCapabilities />
      </Sheet>
      <ConfirmDialog
        open={confirmDemo}
        onClose={() => setConfirmDemo(false)}
        title={t.more.deleteDemo}
        message={t.more.deleteDemoConfirm}
        onConfirm={async () => {
          await http.del('/demo');
          const list = await tripsList.load();
          if (!list.some((x) => x.id === tripStore.get().tripId)) await tripStore.select(null);
          toast(t.success.deleted);
        }}
      />
    </div>
  );
}
