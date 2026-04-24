import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — Matchsticked',
  description: 'How Matchsticked collects, uses, and protects your data.',
};

const SECTIONS: Array<{ heading: string; body: string[] }> = [
  {
    heading: 'What we collect',
    body: [
      'Account: email, username, and (optionally) an Apple user identifier when you sign in with Apple.',
      'Activity: the movies you swipe, watch, rate, dismiss, save, or import — and the sessions you join.',
      'Device: an Expo push token if you opt into notifications, plus a coarse platform tag (ios/android).',
      'We do not collect contacts, location, advertising identifiers, or browsing history outside Matchsticked.',
    ],
  },
  {
    heading: 'How we use it',
    body: [
      'To run Matchsticked: power the matching algorithm, recommend movies, and sync your library across devices.',
      'To send the notifications you ask for (matches, invites, friend requests). You can turn off any category in your profile.',
      'To debug issues using minimal server logs. Logs are retained for 30 days and never sold or shared.',
    ],
  },
  {
    heading: 'Who we share it with',
    body: [
      'TMDb, for movie metadata and posters. Requests are anonymous; TMDb does not see your account.',
      'Letterboxd, only when you trigger an import — we scrape your public profile by username.',
      'Apple Push and Google FCM (via Expo), only to deliver notifications you opted into.',
      'We never sell your data, share it with advertisers, or use it to train models.',
    ],
  },
  {
    heading: 'Your controls',
    body: [
      'Edit your username, providers, and notification preferences from your profile screen.',
      'Delete your account at any time from the profile screen — this hard-deletes everything we have linked to you, including swipes, matches, and device tokens. There is no recovery and no soft-delete.',
      'Email privacy@matchsticked.com for any data request we have not built a button for yet.',
    ],
  },
  {
    heading: 'Children',
    body: [
      'Matchsticked is not directed at children under 13. We do not knowingly collect data from anyone under 13. If you believe a child has created an account, email us and we will delete it.',
    ],
  },
  {
    heading: 'Changes',
    body: [
      'We will post any material change here and bump the "last updated" date. Continued use after a change means you accept the new policy.',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-cream">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
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
        Questions? <a className="text-coral underline" href="mailto:privacy@matchsticked.com">privacy@matchsticked.com</a>
      </p>
    </main>
  );
}
