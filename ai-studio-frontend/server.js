// Thin wrapper so hosting platforms (like Railway) can run
// `node server.js` from the project root. The actual Next.js
// standalone server entrypoint lives in `.next/standalone/server.js`
// after `next build` completes.

require("./.next/standalone/server.js");
