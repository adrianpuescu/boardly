import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Game — Boardly",
};

export default function GameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
