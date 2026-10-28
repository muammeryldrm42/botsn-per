import type { Metadata } from "next";
import { IBM_Plex_Mono, Outfit } from "next/font/google";
import { Disclaimer } from "@/components/Disclaimer";
import { Header } from "@/components/Header";
import "./globals.css";

const sans = Outfit({ subsets: ["latin", "latin-ext"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: {
    default: "PER — Solana memecoin çağrıları",
    template: "%s · PER",
  },
  description:
    "Anahtarsız halka açık verilerle Solana memecoin sinyal panosu. Yatırım tavsiyesi değildir.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className={`${sans.variable} ${mono.variable}`}>
        <Header />
        <div className="shell">
          <Disclaimer />
          <main className="page">{children}</main>
        </div>
      </body>
    </html>
  );
}
