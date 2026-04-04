export default function Footer() {
  return (
    <footer className="mt-auto py-6 px-6 text-center text-cream-dim/60 text-xs border-t border-cream/5">
      <p>
        Match<span className="text-coral">Sticked</span> · {new Date().getFullYear()}
      </p>
      <p className="mt-1">
        Pick a movie together. No more scrolling debates.
      </p>
    </footer>
  );
}
