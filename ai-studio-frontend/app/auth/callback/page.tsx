import { Suspense } from "react";

import CallbackClient from "./CallbackClient";

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black text-white flex items-center justify-center p-8">
          <div className="max-w-md w-full rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="text-xl font-black">AI Studio</div>
            <div className="text-white/70 mt-2">Signing you in...</div>
          </div>
        </div>
      }
    >
      <CallbackClient />
    </Suspense>
  );
}
