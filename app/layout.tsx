import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./auth";
import AuthGate from "./AuthGate";
import { StoreProvider } from "./store";
import { ThemeProvider } from "./theme";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Vague — Gestion de tâches",
  description: "Gestionnaire de tâches multi-projets, sync temps réel",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Vague",
    statusBarStyle: "default",
  },
};

export const viewport = {
  themeColor: "#6366f1",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover" as const,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <ThemeProvider>
          <AuthProvider>
            <AuthGate>
              <StoreProvider>{children}</StoreProvider>
            </AuthGate>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
