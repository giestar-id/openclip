import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OpenClip — AI Video Clipper & Editor',
  description: 'Ubah video panjang menjadi klip pendek (15s/30s) dengan auto-caption, reframing 9:16, dan CapCut-style dashboard editor.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo+Black&family=Bangers&family=Bebas+Neue&family=Bungee&family=Caveat:wght@700&family=Cinzel:wght@700;900&family=Geist:wght@400;700;900&family=Inter:wght@400;600;700;800;900&family=JetBrains+Mono:wght@500;700&family=Kanit:wght@600;800;900&family=Luckiest+Guy&family=Montserrat:wght@400;600;700;800;900&family=Oswald:wght@600;700&family=Outfit:wght@600;700;800;900&family=Permanent+Marker&family=Playfair+Display:ital,wght@0,700;1,700&family=Plus+Jakarta+Sans:wght@600;700;800&family=Poppins:wght@400;600;700;800&family=PT+Sans+Caption:wght@400;700&family=PT+Serif+Caption&family=Righteous&family=Roboto:wght@400;700;900&family=Rubik:wght@600;700;900&family=Russo+One&family=Space+Grotesk:wght@500;700&family=Syne:wght@700;800&family=Titan+One&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background text-on-surface antialiased min-h-screen flex flex-col">
        {children}
      </body>
    </html>
  );
}
