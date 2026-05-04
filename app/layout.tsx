import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./auth";
import AuthGate from "./AuthGate";
import { StoreProvider } from "./store";
import { ThemeProvider } from "./theme";
import { PomodoroProvider } from "./pomodoro";
import { GoogleProvider } from "./google";
import ServiceWorkerRegister from "./components/ServiceWorkerRegister";
import { ToastProvider } from "./toast";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Vague — Tâches",
  description: "Gestionnaire de tâches multi-projets, sync temps réel, IA intégrée.",
  manifest: "/manifest.webmanifest",
  applicationName: "Vague",
  appleWebApp: {
    capable: true,
    title: "Vague",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
      { url: "/apple-icon-167.png", sizes: "167x167", type: "image/png" },
      { url: "/apple-icon-152.png", sizes: "152x152", type: "image/png" },
    ],
    shortcut: ["/favicon-32.png"],
  },
  formatDetection: {
    telephone: false,
    date: false,
    email: false,
  },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1b20" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover" as const,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Vague" />
      </head>
      <body className="min-h-full bg-[var(--bg)] text-[var(--text)]">
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <AuthGate>
                <StoreProvider>
                  <GoogleProvider>
                    <PomodoroProvider>{children}</PomodoroProvider>
                  </GoogleProvider>
                </StoreProvider>
              </AuthGate>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
