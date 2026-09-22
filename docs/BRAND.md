# Matchsticked brand

## The idea

**Matchsticked** is one invented word: *match* (everyone likes the same film) plus *matchstick*. Picking a film together is striking a match. The friction of everyone swiping produces a spark, and the film everyone agrees on is the flame. It's the warm, one-flame-in-a-dark-room moment of a movie night.

So the vocabulary is about fire. You **strike** a film you'd watch and **pass** on one you wouldn't. A film everyone strikes **lights up** as a match. The loader is a match being struck. Errors **fizzle out**.

## Voice

Warm, dry and a little cinephile. It talks like a friend who has already queued the trailer:

- Short and plain. "Everyone swipes", not "Collaborative preference discovery".
- A light joke is fine, especially in empty and error states ("This reel's gone missing"). Keep it light: one joke per screen at most.
- Discover's deck names are lowercase and casual ("girls night", "spooky not scary"). Headings elsewhere use sentence case.
- The name is always written **Matchsticked**: one word, one capital.

## Colour

| Token | Hex | Use |
| --- | --- | --- |
| `charcoal` | `#0D0D0D` | The dark room. Page background. |
| `card` / `card-hover` | `#1C1C1C` / `#262626` | Raised surfaces. |
| `cream` | `#F0E6D3` | Primary text, like old paper or a cinema ticket. |
| `cream-dim` | `#B8AFA3` | Secondary text, and the PASS side of a swipe. |
| `coral` | `#A12F0A` | The struck match head. **Fills only**: primary buttons, the active tab, badges. Always cream text on top (about 5.8:1). |
| `coral-dark` | `#7A2308` | Hover and pressed state for coral fills. |
| `ember` | `#E25A2E` | The glowing highlight on the match head. **Accent text and icons** on dark: links, rating stars, section labels, the "sticked" half of the wordmark (about 5.3:1). |
| flame gradient | `#FFE7B0 → #FF8A1F → #A12F0A` | The flame itself. Logo and loader only. |
| `danger` | `#EF4444` | Errors and destructive actions **only**. Never decoration. |
| `success` | `#4ADE80` | Confirmations. |

Coral is too dark to read as text on charcoal (about 2.7:1), which is why the accent colour for text is ember.

## Type

- **Playfair Display** (`font-display`) for the wordmark, page titles and movie titles. It's the cinema-poster and editorial voice.
- **Inter** (`font-sans`) for everything you read or tap.
- Both are self-hosted via `next/font` in `app/layout.tsx`. The share image uses a vendored copy of Playfair from `app/_fonts`.

## Marks

- **The lit match** (`MatchstickLogo`): the app icon, favicon and home-screen icon. On error and 404 screens it's shown unlit (greyscale).
- **Wordmark** (`Wordmark`): the lit match beside "Match" in cream and "sticked" in ember, set in Playfair. Use the component instead of retyping the name.
- **The match-strike loader** (`MatchStrikeLoader`): the full-page loader. It only appears if a load takes longer than 250ms.
- The swipe stamps and buttons pair a **flame** (strike, coral/ember) with an **×** (pass, cream-dim).

## Motion

Physical and quick. Cards carry the speed of your flick. Sheets follow your finger and spring back. Tabs ease in over about 160ms. Everything respects the OS reduce-motion setting.
