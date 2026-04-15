import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "You've been challenged! — Boardly",
  description:
    "Someone challenged you to a game of chess on Boardly. Accept the challenge!",
  openGraph: {
    title: "You've been challenged! — Boardly",
    description:
      "Someone challenged you to a game of chess on Boardly. Accept the challenge!",
    images: [{ url: "/api/og", width: 1200, height: 630, alt: "Boardly" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "You've been challenged! — Boardly",
    description:
      "Someone challenged you to a game of chess on Boardly. Accept the challenge!",
    images: ["/api/og"],
  },
};

export default function JoinTokenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
