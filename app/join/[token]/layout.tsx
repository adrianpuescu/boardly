import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "You've been challenged! — Boardly",
  description:
    "Someone challenged you to a game of chess on Boardly. Accept the challenge!",
  openGraph: {
    title: "You've been challenged! — Boardly",
    description:
      "Someone challenged you to a game of chess on Boardly. Accept the challenge!",
  },
  twitter: {
    title: "You've been challenged! — Boardly",
    description:
      "Someone challenged you to a game of chess on Boardly. Accept the challenge!",
  },
};

export default function JoinTokenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
