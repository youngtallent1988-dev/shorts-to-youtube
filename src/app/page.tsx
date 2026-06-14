// 2) Update the gallery card itself (PreviewCard) to be square, dense, edge-to-edge

-  function PreviewCard({
-    video,
-    onWatch,
-    onRemix,
-  }: {
-    video: VideoCardItem;
-    onWatch: (video: VideoCardItem) => void;
-    onRemix: (video: VideoCardItem) => void;
-  }) {
+  function PreviewCard({
+    video,
+    onWatch,
+    onRemix,
+  }: {
+    video: VideoCardItem;
+    onWatch: (video: VideoCardItem) => void;
+    onRemix: (video: VideoCardItem) => void;
+  }) {

    const previewRef = useRef<HTMLVideoElement | null>(null);

    async function handleEnter() {
      const el = previewRef.current;
      if (!el) return;

      try {
        // Start from the beginning for a crisp hover preview.
        el.currentTime = 0;
        await el.play();
      } catch {
        // Autoplay can be blocked in some cases.
      }
    }

    function handleLeave() {
      const el = previewRef.current;
      if (!el) return;

      el.pause();
      el.currentTime = 0;
    }

    return (

      <motion.div
        key={video.title}
        variants={cardVariants}
        whileHover={
          shouldReduceMotion
            ? undefined
            : {
-                y: -8,
-                scale: 1.015,
+                y: -4,
+                scale: 1.03,
              }
        }
        whileTap={
          shouldReduceMotion
            ? undefined
            : {
                scale: 0.99,
              }
        }
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
-        className="group glow-card rounded-3xl"
+        className="group relative glow-card rounded-2xl aspect-square overflow-hidden border border-white/10 bg-black/40 shadow-[0_20px_70px_rgba(0,0,0,0.9)]"
      >

        <img
          src={video.image}
          alt={video.title}
-          className={`w-full h-72 object-cover transition duration-700 ease-out ${
+          className={`w-full h-full object-cover transition duration-700 ease-out ${
             video.preview
               ? "opacity-100 group-hover:opacity-0 group-hover:scale-[1.07] group-hover:brightness-110"
               : "group-hover:scale-[1.07] group-hover:brightness-110"
           }`}
        />

        {
          video.preview && (
            <video
              ref={previewRef}
              src={video.preview}
              poster={video.image}
              muted
              playsInline
              loop
              preload="metadata"
-              className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 group-hover:scale-[1.07] transition duration-700 ease-out"
+              className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 group-hover:scale-[1.07] transition duration-700 ease-out"
            />
          )
        }

        {/* Cinematic overlay (intensifies on hover) */}
-        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent opacity-80 group-hover:opacity-95 transition duration-500" />
+        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent opacity-90 group-hover:opacity-100 transition duration-500" />

        {/* Extra glow wash */}
-        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-500" style={{
-          background:
-            "radial-gradient(600px circle at 15% 15%, rgba(34,211,238,0.12), transparent 55%), radial-gradient(600px circle at 85% 25%, rgba(236,72,153,0.10), transparent 55%)",
-        }} />
+        <div
+          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-500"
+          style={{
+            background:
+              "radial-gradient(600px circle at 0% 0%, rgba(147,51,234,0.28), transparent 55%), radial-gradient(600px circle at 100% 100%, rgba(249,115,22,0.25), transparent 55%)",
+          }}
+        />

-        <div className="absolute bottom-0 left-0 right-0 p-5">
+        <div className="absolute bottom-0 left-0 right-0 p-4">

-          <div className="text-xl font-black">
+          <div className="text-sm md:text-base font-black">
             {video.title}
           </div>

-          <div className="flex gap-3 mt-3">
+          <div className="flex gap-2 mt-2">

            <button
              type="button"
              onClick={() => onWatch(video)}
-              className="glow-focus bg-white/95 hover:bg-white text-black px-4 py-2 rounded-xl font-bold text-sm shadow-[0_16px_55px_rgba(255,255,255,0.07)] transition"
+              className="glow-focus bg-white/95 hover:bg-white text-black px-3 py-1.5 rounded-full font-bold text-[11px] shadow-[0_12px_40px_rgba(255,255,255,0.08)] transition"
            >
              Watch
            </button>

            <button
              type="button"
              onClick={() => onRemix(video)}
-              className="glow-focus glow-pill px-4 py-2 rounded-xl text-sm"
+              className="glow-focus glow-pill px-3 py-1.5 rounded-full text-[11px]"
            >
              Remix
            </button>

          </div>

        </div>

      </motion.div>

    );
  }