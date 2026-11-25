import type { Metadata, Viewport } from 'next';
import './globals.css';
import { I18nProvider } from '@/components/I18nProvider';
import { ToastProvider } from '@/components/ui';
import { currentActor, currentLocale } from '@/lib/server/session';
import { dirOf } from '@/lib/i18n/config';

export const metadata: Metadata = {
  title: 'AI Creator Studio',
  description: 'Create, edit and publish videos with templates, code and AI engines.',
};

export const viewport: Viewport = { themeColor: '#07070b', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor().catch(() => null);
  const locale = await currentLocale(actor);
  return (
    <html lang={locale} dir={dirOf(locale)} suppressHydrationWarning>
      <body className="studio-glow min-h-screen">
        <I18nProvider locale={locale}>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
