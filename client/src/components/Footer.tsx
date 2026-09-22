import Wordmark from './Wordmark';

export default function Footer() {
  return (
    <footer className="mt-auto py-6 px-6 text-center text-cream-dim/60 text-xs border-t border-cream/5">
      <p>
        <Wordmark size="sm" mark={false} className="font-semibold" /> · {new Date().getFullYear()}
      </p>
      <p className="mt-1">
        Pick a movie together. No more scrolling debates.
      </p>
    </footer>
  );
}
