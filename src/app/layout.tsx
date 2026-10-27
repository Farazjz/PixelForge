import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "PixelForge AI — Pixel Art Studio",
  description:
    "Professional pixel-art studio with a full manual editor (layers, frames, palettes, selections) and bring-your-own-AI generation & editing.",
  keywords: ["pixel art", "sprite editor", "AI image generation", "game assets", "PixelForge"],
  authors: [{ name: "PixelForge AI" }],
  openGraph: {
    title: "PixelForge AI — Pixel Art Studio",
    description: "Manual pixel editor + bring-your-own-AI generation, conversion and animation.",
    siteName: "PixelForge AI",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body className="antialiased bg-background text-foreground">
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
