import Link from 'next/link';
import MatchstickLogo from '@/components/MatchstickLogo';

export const metadata = { title: 'Not found' };

export default function NotFound() {
  return (
    <div className="flex-1 min-h-dvh flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-5">
        <MatchstickLogo size={44} decorative className="mx-auto opacity-50 grayscale" />
        <p className="text-ember text-sm font-semibold uppercase tracking-widest">404</p>
        <h1 className="text-3xl font-bold font-display">This reel’s gone missing</h1>
        <p className="text-cream-dim">
          The page you’re after doesn’t exist, or the session link has expired.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Link
            href="/dashboard"
            className="px-6 py-3 bg-coral hover:bg-coral-dark text-cream rounded-xl font-semibold transition-colors"
          >
            Back to the dashboard
          </Link>
          <Link href="/" className="px-6 py-3 glass text-cream-dim hover:text-cream rounded-xl font-medium transition-colors">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
