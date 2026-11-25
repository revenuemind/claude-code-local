'use client';
import { useEffect } from 'react';
import { useI18n } from '@/components/I18nProvider';

export default function StudioError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="card mx-auto mt-16 max-w-md space-y-4 p-8 text-center">
      <div className="text-3xl">⚠</div>
      <h1 className="font-display text-lg font-semibold">{t('common.error')}</h1>
      {error.digest && <p className="font-mono text-xs text-mute">{error.digest}</p>}
      <button className="btn btn-primary" onClick={reset}>{t('common.retry')}</button>
    </div>
  );
}
