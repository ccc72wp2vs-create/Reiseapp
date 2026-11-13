import { Ambulance, BedDouble, Building2, CreditCard, Flame, Hospital, Pencil, Phone, ShieldAlert, Siren } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { countryInfo, type EmergencyProfile } from '../../../shared/countries';
import { destinationOn, todayIn } from '../../../shared/trip';
import { PageHeader, useTrip } from '../../components/AppShell';
import { toast } from '../../components/toast';
import { Button, Card, SectionTitle, Sheet, Skeleton, TextAreaField } from '../../components/ui';
import { t } from '../../i18n';
import { errorMessage, http } from '../../lib/api';
import { tripStore, useOnline } from '../../lib/store';

/** Numbers per emergency profile of the trip's country. */
const THAI_NUMBERS: { label: string; hint: string; tel: string; icon: ReactNode }[] = [
  { label: 'Touristenpolizei', hint: 'Englischsprachig, rund um die Uhr', tel: '1155', icon: <ShieldAlert size={20} /> },
  { label: 'Rettungsdienst / Notarzt', hint: 'Medizinischer Notfall', tel: '1669', icon: <Ambulance size={20} /> },
  { label: 'Polizei', hint: 'Allgemeiner Notruf', tel: '191', icon: <Siren size={20} /> },
  { label: 'Feuerwehr', hint: 'Brand', tel: '199', icon: <Flame size={20} /> },
];

const PROFILE_NUMBERS: Record<EmergencyProfile, { label: string; hint: string; tel: string; icon: ReactNode }[]> = {
  th: THAI_NUMBERS,
  eu: [{ label: 'Notruf 112', hint: 'Polizei, Feuerwehr und Rettungsdienst – europaweit, kostenlos', tel: '112', icon: <Siren size={20} /> }],
  tr: [{ label: 'Notruf 112', hint: 'Polizei, Feuerwehr und Rettungsdienst – kostenlos', tel: '112', icon: <Siren size={20} /> }],
};

function CallRow({ label, hint, tel, display, icon }: { label: string; hint: string; tel: string; display?: string; icon: ReactNode }) {
  const button = (
    <span className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-danger px-4 text-[15px] font-bold tabular text-white">
      <Phone size={15} /> {display ?? tel}
    </span>
  );
  // Long international numbers go below the text so nothing gets squeezed.
  const long = (display ?? tel).length > 6;
  return (
    <a href={`tel:${tel}`} className="flex items-start gap-3 p-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-danger-soft text-danger">{icon}</span>
      <span className="min-w-0 flex-1 self-center">
        <span className="block font-semibold">{label}</span>
        <span className="block text-[13px] text-text-3">{hint}</span>
        {long && <span className="mt-2 block">{button}</span>}
      </span>
      {!long && <span className="self-center">{button}</span>}
    </a>
  );
}

export default function EmergencyPage() {
  const { snap, canEdit } = useTrip();
  const [editing, setEditing] = useState(false);
  if (!snap) {
    return (
      <div className="space-y-4 px-safe pt-safe">
        <Skeleton className="mt-6 h-10 w-1/2" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  const { trip, destinations } = snap;
  const probe = destinationOn(destinations, todayIn(trip.homeTimezone)).current ?? destinations[0];
  const today = todayIn(probe?.timezone ?? trip.homeTimezone);
  const where = destinationOn(destinations, today);
  const here = where.current ?? where.leaving ?? where.next ?? destinations[0] ?? null;
  const profile = countryInfo(trip.destinationCountry).emergency;
  const numbers = profile ? PROFILE_NUMBERS[profile] : [];
  const near = here?.lat != null && here?.lng != null ? { lat: here.lat, lng: here.lng } : null;

  return (
    <div>
      <PageHeader title={t.emergency.title} eyebrow={t.emergency.eyebrow} />
      <div className="px-safe pt-4">
        {numbers.length > 0 ? (
          <>
            <p className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] text-danger">{t.emergency.intro}</p>
            <SectionTitle>{t.emergency.numbers(trip.destinationCountry)}</SectionTitle>
            <Card className="divide-y divide-line">
              {numbers.map((n) => (
                <CallRow key={n.tel} {...n} />
              ))}
            </Card>
          </>
        ) : (
          <p className="rounded-2xl bg-info-soft px-4 py-3 text-[14px] text-info">{t.emergency.noNumbers(trip.destinationCountry)}</p>
        )}

        <SectionTitle>{t.emergency.hospital}</SectionTitle>
        <Card className="p-4">
          <p className="text-[14px] text-text-2">{here ? t.emergency.hospitalNear(here.name) : t.emergency.hospitalGeneric}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-4 text-[14px] font-semibold"
              target="_blank"
              rel="noopener noreferrer"
              href={near ? `https://maps.apple.com/?q=Hospital&sll=${near.lat},${near.lng}` : 'https://maps.apple.com/?q=Hospital'}
            >
              <Hospital size={16} /> Apple Karten
            </a>
            <a
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-4 text-[14px] font-semibold"
              target="_blank"
              rel="noopener noreferrer"
              href={near ? `https://www.google.com/maps/search/hospital/@${near.lat},${near.lng},13z` : 'https://www.google.com/maps/search/hospital'}
            >
              <Hospital size={16} /> Google Maps
            </a>
          </div>
          <p className="mt-2 text-[12px] text-text-3">{profile === 'th' ? t.emergency.hospitalHintTh : t.emergency.hospitalHint}</p>
        </Card>

        {here?.accommodationName && (
          <>
            <SectionTitle>{t.emergency.stay}</SectionTitle>
            <Card className="flex items-start gap-3 p-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
                <BedDouble size={20} />
              </span>
              <div className="min-w-0">
                <p className="font-semibold">{here.accommodationName}</p>
                {here.accommodationAddress && <p className="text-[14px] text-text-2">{here.accommodationAddress}</p>}
                <p className="text-[13px] text-text-3">{here.name}</p>
              </div>
            </Card>
          </>
        )}

        <SectionTitle>{profile === 'th' ? t.emergency.embassy : t.emergency.cards}</SectionTitle>
        <Card className="divide-y divide-line">
          {profile === 'th' && (
            <CallRow label="Deutsche Botschaft Bangkok" hint="9 South Sathorn Road, Bangkok 10120 · auch außerhalb der Öffnungszeiten" tel="+6622879000" display="+66 2 287 9000" icon={<Building2 size={20} />} />
          )}
          <CallRow label="Karten sperren (DE)" hint="Sperr-Notruf für Bank- und Kreditkarten" tel="+49116116" display="+49 116 116" icon={<CreditCard size={20} />} />
        </Card>

        <SectionTitle
          action={
            canEdit && (
              <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-[14px] font-semibold text-accent">
                <Pencil size={14} /> {t.common.edit}
              </button>
            )
          }
        >
          {t.emergency.ownInfo}
        </SectionTitle>
        <Card className="p-4">
          {trip.emergencyNotes ? (
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{linkify(trip.emergencyNotes)}</p>
          ) : (
            <p className="text-[14px] text-text-3">{t.emergency.ownInfoEmpty}</p>
          )}
        </Card>
        <p className="mt-6 text-[12px] text-text-3">{t.emergency.offline}</p>
      </div>
      {editing && <NotesSheet tripId={trip.id} version={trip.version} initial={trip.emergencyNotes ?? ''} onClose={() => setEditing(false)} />}
    </div>
  );
}

/** Makes phone numbers in free text tappable. */
function linkify(text: string): ReactNode[] {
  const parts = text.split(/(\+?\d[\d ()/-]{5,}\d)/g);
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <a key={i} href={`tel:${p.replace(/[^\d+]/g, '')}`} className="font-semibold text-accent underline">
        {p}
      </a>
    ) : (
      p
    ),
  );
}

function NotesSheet({ tripId, version, initial, onClose }: { tripId: string; version: number; initial: string; onClose: () => void }) {
  const online = useOnline();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      open
      onClose={onClose}
      title={t.emergency.ownInfo}
      footer={
        <>
          <Button variant="secondary" block onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button
            block
            loading={busy}
            disabled={!online}
            onClick={async () => {
              setBusy(true);
              try {
                await tripStore.mutate(() => http.patch(`/trips/${tripId}`, { emergencyNotes: value.trim() || null, version }));
                toast(t.success.saved);
                onClose();
              } catch (e) {
                toast(errorMessage(e), 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            {t.common.save}
          </Button>
        </>
      }
    >
      <TextAreaField label={t.emergency.ownInfo} value={value} rows={8} placeholder={t.emergency.placeholder} onChange={(e) => setValue(e.target.value)} />
      <p className="mt-2 text-[12px] text-text-3">{t.emergency.privacy}</p>
    </Sheet>
  );
}
