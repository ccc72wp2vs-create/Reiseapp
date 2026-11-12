import type { ReactNode } from 'react';
import { CoverArt, Logo } from '../../components/CoverArt';
import { t } from '../../i18n';

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <CoverArt name="Krabi Ao Nang" className="absolute inset-x-0 top-0 h-[46dvh]" />
      <div className="absolute inset-x-0 top-[30dvh] h-[20dvh] bg-gradient-to-b from-transparent to-bg" aria-hidden />
      <div className="relative mx-auto flex min-h-dvh max-w-md flex-col px-safe pt-safe">
        <div className="pt-4">
          <Logo size={34} className="text-sand" />
        </div>
        <div className="mt-auto pb-10 pt-[24dvh]">
          <p className="mb-2 text-[13px] font-semibold uppercase tracking-[0.18em] text-accent">{t.app.tagline}</p>
          <h1 className="font-display text-[38px] font-semibold leading-[1.05]">{title}</h1>
          {subtitle && <p className="mt-3 text-[15px] leading-relaxed text-text-2">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
