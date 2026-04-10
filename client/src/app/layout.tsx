import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import ConditionalFooter from "@/components/ConditionalFooter";
import GlobalInviteListener from "@/components/GlobalInviteListener";

export const metadata: Metadata = {
  title: "MatchSticked",
  description: "Pick a movie together. No more scrolling debates.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700;800;900&display=swap"
        />
      </head>
      <body className="antialiased bg-charcoal text-cream flex flex-col min-h-dvh" style={{ fontFamily: '"Inter", system-ui, sans-serif' }}>
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
