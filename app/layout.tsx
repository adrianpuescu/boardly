import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Nunito } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});
const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  weight: ["400", "600", "700", "800", "900"],
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Boardly — Play board games with friends",
  description:
    "A friendly platform for turn-based board games. Chess is just the beginning.",
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "Boardly — Play board games with friends",
    description:
      "A friendly platform for turn-based board games. Chess is just the beginning.",
    type: "website",
    url: "/",
    siteName: "Boardly",
    images: [
      {
        url: "/icons/icon-512.png",
        width: 512,
        height: 512,
        alt: "Boardly",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Boardly — Play board games with friends",
    description:
      "A friendly platform for turn-based board games. Chess is just the beginning.",
    images: ["/icons/icon-512.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Boardly",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#F97316",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${nunito.variable} antialiased`}
      >
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
