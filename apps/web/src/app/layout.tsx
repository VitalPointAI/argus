import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Argus - Strategic Intelligence Platform',
  description: 'OSINT with verification and confidence scoring',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen">
          <nav className="bg-slate-900 text-white">
            <div className="max-w-7xl mx-auto px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🦚</span>
                  <span className="text-xl font-bold">Argus</span>
                </div>
                <div className="flex gap-6">
                  <a href="/" className="hover:text-argus-300">Dashboard</a>
                  <a href="/domains" className="hover:text-argus-300">Domains</a>
                  <a href="/sources" className="hover:text-argus-300">Sources</a>
                  <a href="/briefings" className="hover:text-argus-300">Briefings</a>
                </div>
              </div>
            </div>
          </nav>
          <main className="max-w-7xl mx-auto px-4 py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
