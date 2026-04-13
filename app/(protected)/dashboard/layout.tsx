import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your Games — Boardly",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
