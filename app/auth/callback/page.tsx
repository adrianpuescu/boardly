import { Suspense } from "react";
import { AuthCallbackClient } from "./AuthCallbackClient";

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50">
          <span className="text-sm text-gray-500">Loading…</span>
        </div>
      }
    >
      <AuthCallbackClient />
    </Suspense>
  );
}
