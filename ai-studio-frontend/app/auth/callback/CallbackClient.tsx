"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { API_BASE } from "../../../lib/apiBase";

export default function CallbackClient() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState("Signing you in...");

  useEffect(() => {
    const token = params.get("token");

    async function run() {
      if (!token) {
        setStatus("Missing token");
        return;
      }

      try {
        const r = await fetch(`${API_BASE}/auth/consume`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token }),
        });

        const data = await r.json();

        if (!r.ok) {
          setStatus((data as any)?.error || "Sign-in failed");
          return;
        }

        // Success: redirect to home
        router.replace("/");
      } catch {
        setStatus("Sign-in failed");
      }
    }

    void run();
  }, [params, router]);

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-8">
      <div className="max-w-md w-full rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="text-xl font-black">AI Studio</div>
        <div className="text-white/70 mt-2">{status}</div>
        <div className="text-white/40 text-sm mt-4">
          You can close this tab if you are redirected automatically.
        </div>
      </div>
    </div>
  );
}

