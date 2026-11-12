import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { toast } from '../../components/toast';
import { Button, TextField } from '../../components/ui';
import { t } from '../../i18n';
import { errorMessage } from '../../lib/api';
import { auth, useAuth } from '../../lib/auth';
import { AuthLayout } from './AuthLayout';

export default function SetupPage() {
  const { user, setupRequired, setupEnabled } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ setupToken: '', email: '', displayName: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;
  if (!setupRequired) return <Navigate to="/anmelden" replace />;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await auth.setup(form);
      toast(t.auth.setupDone);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title={t.auth.setupTitle} subtitle={t.auth.setupSubtitle}>
      {!setupEnabled ? (
        <p className="rounded-2xl bg-warn-soft px-4 py-3 text-[15px] text-warn">{t.auth.setupDisabled}</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <TextField label={t.auth.setupToken} type="password" autoComplete="off" required value={form.setupToken} onChange={set('setupToken')} />
          <TextField label={t.auth.displayName} autoComplete="name" required value={form.displayName} onChange={set('displayName')} />
          <TextField label={t.auth.email} type="email" autoComplete="username" required value={form.email} onChange={set('email')} />
          <TextField
            label={t.auth.password}
            type="password"
            autoComplete="new-password"
            hint={t.auth.passwordHint}
            minLength={10}
            required
            value={form.password}
            onChange={set('password')}
          />
          {error && (
            <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] text-danger">
              {error}
            </p>
          )}
          <Button type="submit" block size="lg" loading={busy}>
            {t.auth.createAccount}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
