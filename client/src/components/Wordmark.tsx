import MatchstickLogo from './MatchstickLogo';

const SIZES = {
  sm: { text: 'text-base', mark: 14, gap: 'gap-1.5' },
  md: { text: 'text-2xl', mark: 22, gap: 'gap-2' },
  lg: { text: 'text-5xl', mark: 48, gap: 'gap-3' },
} as const;

interface WordmarkProps {
  size?: keyof typeof SIZES;
  /** Show the lit match beside the name. */
  mark?: boolean;
  className?: string;
}

/** The Matchsticked lockup: the lit match plus the two-tone name. */
export default function Wordmark({ size = 'md', mark = true, className = '' }: WordmarkProps) {
  const s = SIZES[size];
  return (
    <span className={`inline-flex items-center ${s.gap} font-display font-bold tracking-tight leading-none ${s.text} ${className}`}>
      {mark && <MatchstickLogo size={s.mark} decorative className="shrink-0 -my-1" />}
      <span>
        Match<span className="text-ember">sticked</span>
      </span>
    </span>
  );
}
