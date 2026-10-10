import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CogniTwin AI — Cognitive Digital Twin LMS & Bayesian Knowledge Tracing',
  description:
    'AI-native learning platform tracking student knowledge through Bayesian Knowledge Tracing, NotebookLM document synthesis, peer study lounges, and gamified physics workbenches.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full bg-slate-950 text-slate-100 flex flex-col">{children}</body>
    </html>
  );
}
