// Minimal static file server for the landing page.
// Serves the project root at http://localhost:3000 (per CLAUDE.md).
//   node serve.mjs            → serve + live-reload (browser auto-refreshes on save)
//   node serve.mjs --no-reload → serve only, no injected reload script
// Live-reload is also skipped per-request with ?noreload (used by screenshot tooling
// so the injected client/SSE connection never interferes with a screenshot).
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { watch } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = 3000;
const LIVE_RELOAD = !process.argv.includes("--no-reload");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

// --- Live-reload: SSE clients + a watcher over the project root. ---
const sseClients = new Set();
const RELOAD_PATH = "/__livereload";
// Tiny client injected into HTML responses; reconnects automatically if the
// server restarts, and reloads the page on a "reload" event.
const RELOAD_SNIPPET = `<script>
(()=>{try{const s=new EventSource("${RELOAD_PATH}");
s.addEventListener("reload",()=>location.reload());
}catch(e){}})();
</script>`;

function broadcastReload() {
  for (const res of sseClients) {
    try { res.write("event: reload\ndata: 1\n\n"); } catch { /* dropped below */ }
  }
}

if (LIVE_RELOAD) {
  // Editors fire several fs events per save → debounce into one reload.
  let timer = null;
  const WATCH_EXT = new Set([".html", ".js", ".mjs", ".css", ".json", ".svg"]);
  try {
    watch(ROOT, { recursive: true }, (_evt, filename) => {
      if (filename && !WATCH_EXT.has(extname(filename.toString()))) return;
      clearTimeout(timer);
      timer = setTimeout(broadcastReload, 80);
    });
  } catch (err) {
    console.warn(`live-reload watcher disabled: ${err.message}`);
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost`);

    // SSE channel the injected client subscribes to.
    if (LIVE_RELOAD && url.pathname === RELOAD_PATH) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("retry: 1000\n\n");
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }

    let urlPath = decodeURIComponent(url.pathname);
    if (urlPath === "/" || urlPath.endsWith("/")) urlPath += "index.html";

    // Prevent path traversal.
    const filePath = normalize(join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end("Forbidden");
      return;
    }

    const info = await stat(filePath);
    if (!info.isFile()) {
      res.writeHead(404).end("Not found");
      return;
    }

    const ext = extname(filePath);
    const contentType = MIME[ext] || "application/octet-stream";

    // Inject the reload snippet into HTML — unless disabled globally (--no-reload)
    // or per-request (?noreload, used by the screenshot tooling).
    if (LIVE_RELOAD && ext === ".html" && !url.searchParams.has("noreload")) {
      let html = await readFile(filePath, "utf8");
      html = html.includes("</body>")
        ? html.replace("</body>", `${RELOAD_SNIPPET}</body>`)
        : html + RELOAD_SNIPPET;
      res.writeHead(200, { "Content-Type": contentType });
      res.end(html);
      return;
    }

    const data = await readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`Serving ${ROOT} at http://localhost:${PORT}`);
  console.log(LIVE_RELOAD
    ? "Live-reload ON — page auto-refreshes on save (disable: --no-reload or ?noreload)"
    : "Live-reload OFF (--no-reload)");
});
