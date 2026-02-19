import type { Metadata } from 'next';
import Link from 'next/link';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sheets CRM",
  description: "Postgres-backed CRM table with CSV import/export and AI actions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="border-b bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
            <Link href="/" className="text-sm font-medium">
              Sheets CRM
            </Link>
            <nav className="flex items-center gap-3 text-sm">
              <Link className="rounded border px-2 py-1" href="/snippets">
                Snippets
              </Link>
            </nav>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
