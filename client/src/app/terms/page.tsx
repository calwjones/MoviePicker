import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — Matchsticked',
  description: 'The rules for using Matchsticked.',
};

const SECTIONS: Array<{ heading: string; body: string[] }> = [
  {
    heading: 'Using the service',
    body: [
      'You must be 13 or older to use Matchsticked.',
      'You are responsible for what happens under your account. Keep your password safe and tell us if you suspect it is compromised.',
      'Do not abuse the service: no scraping, no automated swipe-bots, no harassment of other users, no attempts to break or probe security boundaries.',
    ],
  },
  {
    heading: 'Your content',
    body: [
      'You own the swipes, ratings, and lists you create. You give us a limited licence to store and display them so the app can function — that is it.',
      'Movie metadata and posters belong to TMDb under their attribution terms.',
    ],
  },
  {
    heading: 'Account termination',
    body: [
      'You can delete your account from the profile screen at any time. Deletion is immediate and irreversible.',
      'We can suspend or terminate accounts that violate these terms or put the service at risk. We will email you when we do, except in cases involving immediate harm.',
    ],
  },
  {
    heading: 'Disclaimer',
    body: [
      'Matchsticked is provided as-is. We do not guarantee that recommendations will be good or that the service will be available 24/7. We recommend not relying on it for life-or-death movie decisions.',
    ],
  },
  {
    heading: 'Liability',
    body: [
      'To the maximum extent permitted by law, our liability is limited to the amount you have paid us in the past 12 months — which, for a free app, is zero.',
    ],
  },
  {
    heading: 'Changes',
    body: [
      'If we materially change these terms, we will post the new version here and update the "last updated" date. Continued use means you accept the change.',
    ],
  },
];

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-cream">
      <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
      <p className="text-cream-dim text-sm mb-10">Last updated: April 22, 2026</p>
      {SECTIONS.map((section) => (
        <section key={section.heading} className="mb-8">
          <h2 className="text-xl font-semibold mb-3">{section.heading}</h2>
          {section.body.map((line, i) => (
            <p key={i} className="text-cream-dim leading-relaxed mb-2">
              {line}
            </p>
          ))}
        </section>
      ))}
      <p className="text-cream-dim text-sm mt-12">
        Questions? <a className="text-coral underline" href="mailto:hello@matchsticked.com">hello@matchsticked.com</a>
      </p>
    </main>
  );
}
