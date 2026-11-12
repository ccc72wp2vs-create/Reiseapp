import { Link } from 'react-router';
import { EmptyState } from '../../components/ui';
import { t } from '../../i18n';

export default function NotFoundPage() {
  return (
    <div className="px-safe pt-safe">
      <div className="pt-10">
        <EmptyState
          title={t.errors.notFound}
          text={t.errors.pageNotFound}
          action={
            <Link to="/" className="font-semibold text-accent">
              {t.nav.home}
            </Link>
          }
        />
      </div>
    </div>
  );
}
