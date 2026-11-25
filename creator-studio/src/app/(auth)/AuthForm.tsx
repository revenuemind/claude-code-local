'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Field, Spinner } from '@/components/ui';
import { apiFetch } from '@/lib/client/api';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const { t, locale } = useI18n();
  const [form, setForm] = useState({ name: '', email: '', password: '', orgName: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      if (mode === 'register') await apiFetch('/api/auth/register', { body: { ...form, orgName: form.orgName || undefined, uiLocale: locale } });
      else await apiFetch('/api/auth/login', { body: { email: form.email, password: form.password } });
      window.location.href = '/dashboard';
    } catch (err) {
      setError(mode === 'login' ? t('auth.invalid') : (err as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden overflow-hidden border-e border-line lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(800px_500px_at_20%_20%,rgba(139,108,255,.25),transparent_60%),radial-gradient(700px_400px_at_80%_80%,rgba(56,214,245,.15),transparent_60%)]" />
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-accent to-cyan font-display text-lg font-black text-accent-ink">◆</div>
          <span className="font-display text-lg font-bold">{t('app.name')}</span>
        </div>
        <div>
          <h2 className="font-display text-4xl font-extrabold leading-tight">{t('app.tagline')}</h2>
          <ul className="mt-8 grid gap-3 text-sm text-ink-2">
            <li>✦ 50+ {t('nav.templates').toLowerCase()} · 9:16 · 16:9 · 1:1 · 4:5</li>
            <li>✦ {t('wizard.modes.code')} · {t('wizard.modes.ai')} · {t('wizard.modes.hybrid')}</li>
            <li>✦ עברית · English · Русский · العربية · አማርኛ</li>
          </ul>
        </div>
        <p className="text-xs text-mute">© AI Creator Studio</p>
      </section>
      <section className="flex flex-col items-center justify-center p-6">
        <div className="mb-6 flex w-full max-w-sm justify-end"><LanguageSwitcher /></div>
        <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-7" noValidate>
          <h1 className="font-display text-2xl font-bold">{mode === 'login' ? t('auth.welcomeBack') : t('auth.createTitle')}</h1>
          {mode === 'register' && <Field label={t('auth.fullName')}><input className="field" value={form.name} onChange={set('name')} required autoComplete="name" /></Field>}
          <Field label={t('auth.email')}><input className="field" type="email" value={form.email} onChange={set('email')} required autoComplete="email" dir="ltr" /></Field>
          <Field label={t('auth.password')} hint={mode === 'register' ? t('auth.passwordHint') : undefined}>
            <input className="field" type="password" value={form.password} onChange={set('password')} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} dir="ltr" />
          </Field>
          {mode === 'register' && <Field label={<>{t('auth.orgName')} <span className="text-mute">({t('common.optional')})</span></>}><input className="field" value={form.orgName} onChange={set('orgName')} /></Field>}
          {error && <p role="alert" className="text-sm text-bad">{error}</p>}
          <button className="btn btn-primary w-full" disabled={busy} type="submit">{busy && <Spinner />}{mode === 'login' ? t('auth.signIn') : t('auth.signUp')}</button>
          <p className="text-center text-sm text-mute">
            {mode === 'login' ? t('auth.noAccount') : t('auth.haveAccount')}{' '}
            <Link className="font-semibold text-accent-2 hover:underline" href={mode === 'login' ? '/register' : '/login'}>{mode === 'login' ? t('auth.signUp') : t('auth.signIn')}</Link>
          </p>
        </form>
      </section>
    </main>
  );
}
