import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Argus - Strategic Intelligence Platform',
  description: 'OSINT with verification and confidence scoring',
};

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Public pages don't need the navbar - they have their own design
  return (
    <AuthProvider>
      {children}
    </AuthProvider>
  );
}
