import { redirect } from "next/navigation";
import type React from "react";
import { getCurrentUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser({ id: true });

  if (!user) {
    redirect("/login");
  }

  return children;
}
