import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Button, TextField } from '../../components/ui';
import { t } from '../../i18n';
import { errorMessage } from '../../lib/api';
import { auth, useAuth } from '../../lib/auth';
import { useOnline } from '../../lib/store';
import { AuthLayout } from './AuthLayout';

export default function LoginPage() {
  const { user, setupRequired } = useAuth();
  const online = useOnline();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  if (user) return <Navigate to={from} replace />;
  if (setupRequired) return <Navigate to="/einrichtung" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await auth.login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title={t.auth.loginTitle} subtitle={t.auth.loginSubtitle}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <TextField label={t.auth.email} type="email" autoComplete="username" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label={t.auth.password} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && (
          <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] text-danger">
            {error}
          </p>
        )}
        {!online && <p className="text-[14px] text-warn">{t.auth.offlineLogin}</p>}
        <Button type="submit" block size="lg" loading={busy} disabled={!online || !email || !password}>
          {t.auth.login}
        </Button>
        <p className="pt-2 text-center text-[13px] text-text-3">{t.auth.noRegistration}</p>
      </form>
    </AuthLayout>
  );
}
