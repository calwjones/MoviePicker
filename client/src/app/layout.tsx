import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

export const metadata: Metadata = {
  title: "MoviePicker",
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
      <body className="antialiased bg-charcoal text-cream" style={{ fontFamily: '"Inter", system-ui, sans-serif' }}>
        <AuthProvider>
          <main className="min-h-dvh">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
