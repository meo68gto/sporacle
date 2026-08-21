import type { Metadata } from "next";
import { Cormorant_Garamond, Lora } from "next/font/google";
import "./globals.css";

// Classical DS type pairing (design spec §1.3): Cormorant Garamond display
// over Lora body. Loaded via next/font (self-hosted at build time — no
// client-side fetch of design assets). Serif fallbacks live in globals.css.
const heading = Cormorant_Garamond({
  weight: ["400", "600"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-heading-gf",
  display: "swap",
});

const body = Lora({
  weight: ["400", "600"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-body-gf",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sporacle",
  description: "Well & Being spa operating tool",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
