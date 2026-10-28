import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AccentProvider } from "@/context/accent-context";
import { AuthProvider } from "@/context/auth-context";
import { LeadsProvider } from "@/context/leads-context";
import { AppShell } from "@/components/layout/AppShell";
import { Toaster } from "sonner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VA Nexus — Connect. Automate. Accelerate.",
  description: "Venture Automation Nexus — AI-Powered Customer & Business Operations Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans min-h-screen bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AccentProvider>
            <AuthProvider>
              <LeadsProvider>
                <AppShell>{children}</AppShell>
                <Toaster
                  position="top-right"
                  duration={3000}
                  closeButton
                  richColors
                  visibleToasts={4}
                />
              </LeadsProvider>
            </AuthProvider>
          </AccentProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
