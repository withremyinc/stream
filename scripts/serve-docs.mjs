/**
 * Dev server: builds docs, serves them, and live-reloads on changes.
 * Uses only Node built-ins (no extra deps).
 *
 * Run via: node scripts/serve-docs.mjs
 */

import { createServer } from "http";
import { watch } from "fs";
import { readFile, stat } from "fs/promises";
import { join, extname } from "path";
import { execSync } from "child_process";

const PORT = 4949;
const DOCS_DIR = "docs";
const WATCH_DIRS = ["scripts", "src"];

// ── SSE clients for live reload ──
let clients = [];

function sendReload() {
  for (const res of clients) {
    res.write("data: reload\n\n");
  }
}

// ── Build ──
function build() {
  try {
    execSync("node scripts/build-docs.mjs", { stdio: "inherit" });
    return true;
  } catch {
    console.error("Build failed");
    return false;
  }
}

// ── Inject livereload snippet ──
const RELOAD_SCRIPT = `
<script>
(function() {
  var es = new EventSource("/__reload");
  es.onmessage = function(e) {
    if (e.data === "reload") location.reload();
  };
})();
</script>
`;

// ── HTTP server ──
const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
};

const server = createServer(async (req, res) => {
  // SSE endpoint for live reload
  if (req.url === "/__reload") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("data: connected\n\n");
    clients.push(res);
    req.on("close", () => {
      clients = clients.filter((c) => c !== res);
    });
    return;
  }

  // Serve static files from docs/
  let url = req.url === "/" ? "/index.html" : req.url;
  const filePath = join(DOCS_DIR, url);

  try {
    await stat(filePath);
    let content = await readFile(filePath);
    const ext = extname(filePath);
    const mime = MIME[ext] || "application/octet-stream";

    // Inject livereload into HTML
    if (ext === ".html") {
      content = content
        .toString()
        .replace("</body>", RELOAD_SCRIPT + "</body>");
    }

    res.writeHead(200, { "Content-Type": mime });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

// ── Watch & rebuild ──
let debounce = null;
function onChange() {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    console.log("\n♻  Rebuilding...");
    if (build()) {
      sendReload();
    }
  }, 150);
}

// Initial build
build();

// Watch source dirs
for (const dir of WATCH_DIRS) {
  try {
    watch(dir, { recursive: true }, onChange);
  } catch {
    // dir might not exist
  }
}

server.listen(PORT, () => {
  console.log(`\n  📄 Docs server running at http://localhost:${PORT}\n     Watching ${WATCH_DIRS.join(", ")} for changes\n`);
});
