import './globals.css';
import Script from 'next/script';
import { ThemeProvider } from '@/context/ThemeContext';
import SplashScreen from '@/components/ui/SplashScreen';
import SessionManager from '@/components/admin/SessionManager';
import AuthGateProvider from '@/components/auth/AuthGateProvider';

const SITE_URL = 'https://profit-loss.barmeto.com';
const SITE_NAME = 'Barmeto Profit & Loss';
const OG_IMAGE = `${SITE_URL}/images/barmeto-logo.png`;

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Barmeto — Profit & Loss',
    template: '%s | Barmeto Profit & Loss',
  },
  description:
    'Reconcile Flipkart, Meesho, Amazon, Myntra and JioMart settlement sheets against your SKU costs — true net profit per SKU, in one dashboard.',
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: '/images/barmeto-logo.png', type: 'image/png', sizes: 'any' }],
    apple: [{ url: '/images/barmeto-logo.png', type: 'image/png' }],
    shortcut: '/images/barmeto-logo.png',
  },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: 'Barmeto — Profit & Loss',
    description: 'Per-SKU profit/loss across every marketplace you sell on.',
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: SITE_NAME }],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/png" href="/images/barmeto-logo.png" />
        <link rel="shortcut icon" type="image/png" href="/images/barmeto-logo.png" />
        <link rel="apple-touch-icon" href="/images/barmeto-logo.png" />
      </head>
      <body className="antialiased bg-surface text-foreground min-h-screen">
        <Script id="theme-init" strategy="beforeInteractive">{`(function(){var d=document.documentElement;try{var raw=localStorage.getItem('barmeto-theme-config');if(raw){var obj=JSON.parse(raw),data=obj.data,ts=obj.ts;if(Date.now()-ts<600000&&data&&data.mode){var mode=data.mode,colors=data[mode]||{},t=data.typography,br=data.borderRadius;d.setAttribute('data-theme',mode);for(var k in colors)d.style.setProperty('--color-'+k,colors[k]);function rgb(h){return[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)].join(',')}if(colors['accent'])d.style.setProperty('--color-accent-rgb',rgb(colors['accent']));if(colors['accent-light'])d.style.setProperty('--color-accent-light-rgb',rgb(colors['accent-light']));if(colors['accent-vivid'])d.style.setProperty('--color-accent-vivid-rgb',rgb(colors['accent-vivid']));if(colors['cyan'])d.style.setProperty('--color-cyan-rgb',rgb(colors['cyan']));if(t){if(t.fontFamily)d.style.setProperty('--font-sans',t.fontFamily+',ui-sans-serif,system-ui,sans-serif');if(t.scale!=null)d.style.setProperty('--si-font-scale',t.scale);}if(br)for(var k2 in br){if(k2!=='preset')d.style.setProperty(k2==='base'?'--radius':'--radius-'+k2,br[k2]);}return;}}}catch(e){}d.setAttribute('data-theme','light');})()`}</Script>
        <ThemeProvider>
          <SplashScreen />
          <SessionManager />
          <AuthGateProvider>{children}</AuthGateProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
