'use client';

import { usePathname } from 'next/navigation';
import Footer from './Footer';

const HIDDEN_PREFIXES = ['/session', '/solo', '/roulette', '/discover'];

export default function ConditionalFooter() {
  const pathname = usePathname();
  if (!pathname) return null;
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;
  return <Footer />;
}
