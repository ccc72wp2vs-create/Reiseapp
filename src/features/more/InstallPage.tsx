import { CheckCircle2, Share, SquarePlus } from 'lucide-react';
import { PageHeader } from '../../components/AppShell';
import { Logo } from '../../components/CoverArt';
import { Card, SectionTitle } from '../../components/ui';
import { t } from '../../i18n';
import { isStandalone } from '../../lib/pwa';

export default function InstallPage() {
  const standalone = isStandalone();
  return (
    <div>
      <PageHeader title={t.install.title} />
      <div className="px-safe pt-4">
        {standalone && (
          <p className="mb-4 flex items-center gap-2 rounded-2xl bg-success-soft px-4 py-3 text-[14px] text-success">
            <CheckCircle2 size={18} /> {t.install.installed}
          </p>
        )}
        <Card className="flex items-center gap-4 p-5">
          <Logo size={56} withWordmark={false} />
          <p className="text-[15px] leading-relaxed text-text-2">{t.install.intro}</p>
        </Card>
        <ol className="mt-6 space-y-3">
          {t.install.steps.map((s, i) => (
            <li key={s} className="flex items-center gap-4 rounded-[1.25rem] border border-line bg-surface p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent font-bold text-accent-ink">{i + 1}</span>
              <span className="flex-1 text-[15px]">{s}</span>
              {i === 1 && <Share size={20} className="text-accent" />}
              {i === 2 && <SquarePlus size={20} className="text-accent" />}
            </li>
          ))}
        </ol>
        <SectionTitle>{t.install.other}</SectionTitle>
        <p className="text-[14px] leading-relaxed text-text-2">{t.install.otherText}</p>
      </div>
    </div>
  );
}
