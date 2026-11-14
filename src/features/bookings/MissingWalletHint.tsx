import { ArrowRight, Wallet } from 'lucide-react';
import { Link } from 'react-router';
import { missingInWallet } from '../../../shared/costs';
import type { TripSnapshot } from '../../../shared/types';
import { useTrip } from '../../components/AppShell';
import { t } from '../../i18n';

/** Paid bookings whose cost is not in the wallet yet – easy to overlook otherwise. */
export function MissingWalletHint({ snap }: { snap: TripSnapshot }) {
  const { canEdit } = useTrip();
  const n = missingInWallet(snap.bookings).length;
  if (!n || !canEdit) return null;
  return (
    <Link to="/buchungen?offen=1" className="mt-5 flex items-start gap-3 rounded-[1.25rem] border border-warn/35 bg-warn-soft p-4 transition active:scale-[0.99]">
      <Wallet className="mt-0.5 shrink-0 text-warn" size={20} />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold leading-snug">{t.bookings.missingWallet(n)}</p>
        <p className="mt-0.5 text-[13px] text-text-2">{t.bookings.missingWalletAction}</p>
      </div>
      <ArrowRight size={18} className="mt-0.5 shrink-0 text-warn" />
    </Link>
  );
}
