"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function CallbackClient() {

  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState("Signing you in...");
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "https://sailorai.app";

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
          body: JSON.stringify({
            token,
          }),
        });

        const data = await r.json();

        if (!r.ok) {
          setStatus(data?.error || "Sign-in failed");
          return;
        }

        router.replace("/");

      } catch {

        setStatus("Sign-in failed");

      }

    }

    run();

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
