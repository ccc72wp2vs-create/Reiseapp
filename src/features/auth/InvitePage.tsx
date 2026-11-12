import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { TripDto, UserDto } from '../../../shared/types';
import { toast } from '../../components/toast';
import { Badge, Button, ErrorState, Skeleton, TextField } from '../../components/ui';
import { t } from '../../i18n';
import { errorMessage, http } from '../../lib/api';
import { auth, useAuth } from '../../lib/auth';
import { formatDateTime } from '../../lib/format';
import { tripsList, tripStore } from '../../lib/store';
import { AuthLayout } from './AuthLayout';

interface Preview {
  tripName: string;
  inviterName: string | null;
  role: 'owner' | 'editor' | 'viewer';
  expiresAt: string;
  valid: boolean;
}

export default function InvitePage() {
  const { token = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: '', displayName: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    http
      .get<Preview>(`/invitations/${encodeURIComponent(token)}`)
      .then(setPreview)
      .catch((e) => setLoadError(errorMessage(e)));
  }, [token]);

  async function accept(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await http.post<{ trip: TripDto; user: UserDto }>(`/invitations/${encodeURIComponent(token)}/accept`, user ? {} : { account: form });
      auth.setUser(res.user);
      await tripsList.load();
      await tripStore.select(res.trip.id);
      toast(t.success.created);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title={t.auth.inviteTitle}>
      {loadError ? (
        <ErrorState message={loadError} />
      ) : !preview ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : !preview.valid ? (
        <ErrorState message={t.auth.inviteInvalid} />
      ) : (
        <div className="space-y-5">
          <p className="text-[17px] leading-relaxed">{t.auth.inviteText(preview.inviterName ?? 'Jemand', preview.tripName)}</p>
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-text-3">
            <Badge tone="accent">
              {t.auth.inviteRole}: {t.roles[preview.role]}
            </Badge>
            <span>bis {formatDateTime(preview.expiresAt)}</span>
          </div>
          {user ? (
            <>
              <p className="text-[14px] text-text-2">{t.auth.inviteLoggedInAs(user.displayName)}</p>
              <Button block size="lg" loading={busy} onClick={() => void accept()}>
                {t.auth.inviteAccept}
              </Button>
            </>
          ) : (
            <form onSubmit={accept} className="space-y-4">
              <TextField label={t.auth.displayName} required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
              <TextField label={t.auth.email} type="email" autoComplete="username" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <TextField
                label={t.auth.password}
                type="password"
                autoComplete="new-password"
                hint={t.auth.passwordHint}
                minLength={10}
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <Button type="submit" block size="lg" loading={busy}>
                {t.auth.inviteAccept}
              </Button>
              <p className="text-center text-[13px] text-text-3">
                {t.auth.inviteHaveAccount}{' '}
                <Link className="font-semibold text-accent" to="/anmelden" state={{ from: `/einladung/${token}` }}>
                  {t.auth.login}
                </Link>
              </p>
            </form>
          )}
          {error && (
            <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </AuthLayout>
  );
}
