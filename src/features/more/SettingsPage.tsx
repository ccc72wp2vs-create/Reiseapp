import { Download, LogOut, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { UserDto } from '../../../shared/types';
import { PageHeader } from '../../components/AppShell';
import { toast } from '../../components/toast';
import { Button, Card, ConfirmDialog, Input, SectionTitle, Segmented, TextField } from '../../components/ui';
import { t } from '../../i18n';
import { errorMessage, http } from '../../lib/api';
import { auth, useAuth } from '../../lib/auth';
import { tripStore, useOnline } from '../../lib/store';
import { getThemePref, setThemePref, type ThemePref } from '../../lib/theme';

export default function SettingsPage() {
  const { user } = useAuth();
  const online = useOnline();
  const navigate = useNavigate();
  const [theme, setTheme] = useState<ThemePref>(getThemePref());
  const [name, setName] = useState(user?.displayName ?? '');
  const [pw, setPw] = useState({ current: '', next: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePw, setDeletePw] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  async function saveName() {
    setBusy('name');
    try {
      const r = await http.patch<{ user: UserDto }>('/auth/me', { displayName: name.trim() });
      auth.setUser(r.user);
      toast(t.success.saved);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  }

  async function changePassword() {
    setBusy('pw');
    try {
      await http.patch('/auth/me', { currentPassword: pw.current, newPassword: pw.next });
      setPw({ current: '', next: '' });
      toast(t.settings.passwordChanged);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader title={t.settings.title} />
      <div className="px-safe">
        <SectionTitle>{t.settings.appearance}</SectionTitle>
        <Segmented
          value={theme}
          onChange={(v) => {
            setTheme(v);
            setThemePref(v);
          }}
          options={[
            { value: 'dark', label: t.settings.theme.dark },
            { value: 'light', label: t.settings.theme.light },
            { value: 'system', label: t.settings.theme.system },
          ]}
        />
        <p className="mt-3 text-[13px] text-text-3">
          {t.settings.language}: {t.settings.languageValue}
        </p>

        <SectionTitle>{t.settings.profile}</SectionTitle>
        <Card className="space-y-4 p-5">
          <p className="text-[14px] text-text-2">{user?.email}</p>
          <div className="flex gap-2">
            <Input aria-label={t.auth.displayName} value={name} onChange={(e) => setName(e.target.value)} />
            <Button loading={busy === 'name'} disabled={!online || !name.trim() || name === user?.displayName} onClick={() => void saveName()}>
              {t.common.save}
            </Button>
          </div>
        </Card>

        <SectionTitle>{t.settings.changePassword}</SectionTitle>
        <Card className="space-y-4 p-5">
          <TextField label={t.settings.currentPassword} type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          <TextField label={t.settings.newPassword} type="password" autoComplete="new-password" hint={t.auth.passwordHint} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          <Button block loading={busy === 'pw'} disabled={!online || !pw.current || pw.next.length < 10} onClick={() => void changePassword()}>
            {t.settings.changePassword}
          </Button>
        </Card>

        <SectionTitle>{t.more.privacy}</SectionTitle>
        <Card className="space-y-4 p-5">
          <div>
            <a href="/api/v1/auth/export" className="inline-flex items-center gap-2 font-semibold text-accent">
              <Download size={16} /> {t.settings.exportAll}
            </a>
            <p className="mt-1 text-[13px] text-text-3">{t.settings.exportHint}</p>
          </div>
          <div className="border-t border-line pt-4">
            <Button variant="secondary" size="sm" onClick={() => setConfirmClear(true)}>
              {t.settings.clearLocal}
            </Button>
            <p className="mt-2 text-[13px] text-text-3">{t.settings.clearLocalHint}</p>
          </div>
          <div className="border-t border-line pt-4">
            <Button variant="danger" size="sm" icon={<Trash2 size={16} />} disabled={!online} onClick={() => setConfirmDelete(true)}>
              {t.settings.deleteAccount}
            </Button>
            <p className="mt-2 text-[13px] text-text-3">{t.settings.deleteAccountHint}</p>
          </div>
        </Card>

        <Button
          variant="secondary"
          block
          size="lg"
          className="mt-8"
          icon={<LogOut size={18} />}
          onClick={async () => {
            await auth.logout();
            navigate('/anmelden', { replace: true });
          }}
        >
          {t.auth.logout}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title={t.settings.clearLocal}
        message={t.settings.clearLocalHint}
        confirmLabel={t.common.confirm}
        onConfirm={async () => {
          await tripStore.clearLocal();
          window.location.assign('/');
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t.settings.deleteAccount}
        message={t.settings.deleteAccountHint}
        onConfirm={async () => {
          await http.del('/auth/me', { password: deletePw });
          await auth.expire();
          navigate('/anmelden', { replace: true });
        }}
      >
        <div className="mt-4">
          <TextField label={t.settings.deleteAccountConfirm} type="password" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} />
        </div>
      </ConfirmDialog>
    </div>
  );
}
