import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import ConditionalFooter from "@/components/ConditionalFooter";
import GlobalInviteListener from "@/components/GlobalInviteListener";

// Self-hosted at build time: no render-blocking request to Google, no CSP
// exception, and the --font-* variables the components reference actually exist.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", display: "swap" });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://matchsticked.com";
const DESCRIPTION = "Pick a movie together. No more scrolling debates.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "MatchSticked", template: "%s · MatchSticked" },
  description: DESCRIPTION,
  applicationName: "MatchSticked",
  openGraph: {
    type: "website",
    siteName: "MatchSticked",
    title: "MatchSticked",
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: "MatchSticked", description: DESCRIPTION },
  appleWebApp: { capable: true, title: "MatchSticked", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0D0D0D",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${playfair.variable}`}>
      <body className="antialiased bg-charcoal text-cream flex flex-col min-h-dvh font-sans">
        <AuthProvider>
          <main className="flex-1 flex flex-col">
            {children}
          </main>
          <ConditionalFooter />
          <GlobalInviteListener />
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
