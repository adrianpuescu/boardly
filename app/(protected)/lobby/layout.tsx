import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New Game — Boardly",
};

export default function LobbyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
