import type { Metadata } from "next";
import { Spectral, Hanken_Grotesk, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

// Workforce DS type system (design spec / readme §Type): Spectral (display
// serif, hospitality voice) over Hanken Grotesk (humanist sans UI/body),
// with Spline Sans Mono for all numerics — money, hours, times, IDs, KPI
// values. Loaded via next/font (self-hosted at build time — no client-side
// fetch of design assets). Fallback stacks live in globals.css.
const heading = Spectral({
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-heading-gf",
  display: "swap",
});

const body = Hanken_Grotesk({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-body-gf",
  display: "swap",
});

const mono = Spline_Sans_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-mono-gf",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sporacle",
  description: "Well & Being spa operating tool",
};

// Apply the persisted appearance choice before first paint (no flash of the
// wrong theme). "system" / unset leaves prefers-color-scheme to decide.
const THEME_BOOT = `(function(){try{var t=localStorage.getItem("sporacle-theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        {children}
      </body>
    </html>
  );
}
