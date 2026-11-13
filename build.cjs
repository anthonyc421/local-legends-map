#!/usr/bin/env node
/*
 * Local Legends Map – static build (Change Order #3, Phases A + B; CO4: Travel Diary share image; CO5A: 301 redirects for the 15 NY regions;
 * Oct 26, 2026: brand badge logo + favicon set; Nov 12, 2026: moved to GitHub + Cloudflare)
 *
 * Input:  src/index.html  (the single-file app exactly as built by the site-build chat)
 * Output: dist/           (committed to the repository; Cloudflare serves this folder as-is, with no build step)
 *
 * What it does, without changing the look:
 *  1. Splits inline CSS / JS / embedded photos into cached files (app.[hash].css, app.[hash].js, img/*.webp).
 *  2. Prerenders every route to a real page at its clean URL (/ny/buffalo-niagara/, /trails/.../),
 *     with its own title, description, canonical, Open Graph tags and JSON-LD.
 *  3. Adds a path router shim so the app boots on any clean URL, and turns #hash links into real links.
 *  4. Writes sitemap, robots.txt, llms.txt, 404.html, _headers, _redirects, favicons and a default share image.
 *
 * Brand assets live inside src/index.html so the single file stays the source of truth:
 *  - header logo:  <img class="brandlogo" src="data:image/webp;base64,…">  -> /img/brand-logo.[hash].webp
 *  - favicon:      <link rel="icon" href="data:image/png;base64,…"> in the head -> favicon.ico, PNG sizes, apple-touch-icon
 *
 * Re-run on a newer src/index.html at any time:  node build.cjs
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const sharp = require('sharp');
const { chromium } = require(process.env.PW_PATH || 'playwright');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src/index.html');
const DIST = path.join(ROOT, 'dist');
const SITE = 'https://locallegendsmap.com';
const CONFIG = {
  allowAICrawlers: true,
  noindexPaths: ['/admin/review/', '/404/'],
  social: { facebook: '', instagram: '' }, // fill in to add sameAs links
  /* CO5A (Nov 3, 2026): New York's 23 regions became areas inside 15 regions; old addresses move with a 301 */
  redirects: [["/ny/rochester/","/ny/rochester-genesee/"],["/ny/rochester/garbage-plate/","/ny/rochester-genesee/garbage-plate/"],["/ny/rochester/red-hots-and-white-hots/","/ny/rochester-genesee/red-hots-and-white-hots/"],["/ny/rochester/lake-ontario-apples/","/ny/rochester-genesee/lake-ontario-apples/"],["/ny/southern-tier-west/","/ny/chautauqua-allegheny/"],["/ny/southern-tier-west/cheese-curds/","/ny/chautauqua-allegheny/cheese-curds/"],["/ny/corning-elmira/","/ny/southern-tier/corning-elmira/"],["/ny/corning-elmira/calzone-served-open-face/","/ny/southern-tier/corning-elmira/calzone-served-open-face/"],["/ny/syracuse-central-ny/","/ny/central-new-york/"],["/ny/syracuse-central-ny/dinosaur-bar-b-que/","/ny/central-new-york/dinosaur-bar-b-que/"],["/ny/syracuse-central-ny/salt-potatoes/","/ny/central-new-york/salt-potatoes/"],["/ny/syracuse-central-ny/ribbon-candy/","/ny/central-new-york/ribbon-candy/"],["/ny/utica-mohawk-valley/","/ny/mohawk-valley/utica/"],["/ny/utica-mohawk-valley/chicken-riggies/","/ny/mohawk-valley/utica/chicken-riggies/"],["/ny/utica-mohawk-valley/utica-greens/","/ny/mohawk-valley/utica/utica-greens/"],["/ny/utica-mohawk-valley/tomato-pie/","/ny/mohawk-valley/utica/tomato-pie/"],["/ny/utica-mohawk-valley/upside-down-pizza/","/ny/mohawk-valley/utica/upside-down-pizza/"],["/ny/binghamton/","/ny/southern-tier/binghamton/"],["/ny/binghamton/spiedies/","/ny/southern-tier/binghamton/spiedies/"],["/ny/oneonta-otsego/","/ny/mohawk-valley/oneonta-otsego/"],["/ny/oneonta-otsego/brooks-chicken-bbq/","/ny/mohawk-valley/oneonta-otsego/brooks-chicken-bbq/"],["/ny/chenango-valley/","/ny/southern-tier/chenango-valley/"],["/ny/chenango-valley/greek-yogurt/","/ny/southern-tier/chenango-valley/greek-yogurt/"],["/ny/thousand-islands/","/ny/thousand-islands-seaway/thousand-islands/"],["/ny/thousand-islands/thousand-island-dressing/","/ny/thousand-islands-seaway/thousand-islands/thousand-island-dressing/"],["/ny/watertown/","/ny/thousand-islands-seaway/watertown/"],["/ny/watertown/sharp-cheddar/","/ny/thousand-islands-seaway/watertown/sharp-cheddar/"],["/ny/lewis-county/","/ny/thousand-islands-seaway/lewis-county/"],["/ny/lewis-county/croghan-bologna/","/ny/thousand-islands-seaway/lewis-county/croghan-bologna/"],["/ny/st-lawrence-valley/","/ny/thousand-islands-seaway/st-lawrence-valley/"],["/ny/st-lawrence-valley/pizza-rolls/","/ny/thousand-islands-seaway/st-lawrence-valley/pizza-rolls/"],["/ny/plattsburgh-champlain/","/ny/champlain-valley/"],["/ny/plattsburgh-champlain/michigans/","/ny/champlain-valley/michigans/"],["/ny/saratoga-lake-george/","/ny/capital-region/saratoga-lake-george/"],["/ny/saratoga-lake-george/saratoga-potato-chips/","/ny/capital-region/saratoga-lake-george/saratoga-potato-chips/"],["/ny/saratoga-lake-george/peppermint-pig/","/ny/capital-region/saratoga-lake-george/peppermint-pig/"],["/ny/washington-county/","/ny/capital-region/washington-county/"],["/ny/washington-county/pie-la-mode/","/ny/capital-region/washington-county/pie-la-mode/"],["/ny/capital-region/mozzarella-sticks-with-raspberry-sauce/","/ny/capital-region/albany/mozzarella-sticks-with-raspberry-sauce/"],["/ny/capital-region/lil-nippers/","/ny/capital-region/albany/lil-nippers/"],["/ny/mid-hudson-valley/","/ny/hudson-valley/"],["/ny/mid-hudson-valley/culinary-institute-of-america/","/ny/hudson-valley/culinary-institute-of-america/"],["/ny/mid-hudson-valley/apples-and-cider/","/ny/hudson-valley/apples-and-cider/"],["/ny/mid-hudson-valley/cider-doughnuts/","/ny/hudson-valley/cider-doughnuts/"],["/trails/italian/utica-mohawk-valley/utica-greens-and-riggies-crawl/","/trails/italian/mohawk-valley/utica-greens-and-riggies-crawl/"],["/trails/burgers/rochester/rochester-burger-crawl/","/trails/burgers/rochester-genesee/rochester-burger-crawl/"],["/trails/apples/rochester/apple-tasting-tour/","/trails/apples/rochester-genesee/apple-tasting-tour/"],["/trails/apples/mid-hudson-valley/hudson-valley-apple-picking-trail/","/trails/apples/hudson-valley/hudson-valley-apple-picking-trail/"],["/trails/apples/syracuse-central-ny/central-new-york-apple-trail/","/trails/apples/central-new-york/central-new-york-apple-trail/"]],
};

const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 10);
const escAttr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
function writeFile(rel, data) {
  const p = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
}
/* ICO file that wraps PNG images (supported by every current browser) */
function pngsToIco(list) {
  const head = Buffer.alloc(6 + 16 * list.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(list.length, 4);
  let off = head.length;
  list.forEach(({ size, buf }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e); head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(buf.length, e + 8); head.writeUInt32LE(off, e + 12);
    off += buf.length;
  });
  return Buffer.concat([head, ...list.map(x => x.buf)]);
}

/* ---------- 1. split the source ---------- */
const src = fs.readFileSync(SRC, 'utf8');
const styleM = src.match(/<style>([\s\S]*?)<\/style>/);
const scriptM = src.match(/<script>([\s\S]*?)<\/script>\s*$/);
if (!styleM || !scriptM) throw new Error('Could not find the <style> or final <script> block in src/index.html');
let headPart = src.slice(0, styleM.index);
let bodyPart = src.slice(styleM.index + styleM[0].length, scriptM.index);
let css = styleM[1];
let js = scriptM[1];

/* brand assets embedded in the source */
const iconRe = /<link rel="icon" href="data:image\/png;base64,([A-Za-z0-9+/=]+)">\s*/;
const iconM = headPart.match(iconRe);
const iconBuf = iconM ? Buffer.from(iconM[1], 'base64') : null;
headPart = headPart.replace(iconRe, '');
const logoRe = /(<img class="brandlogo" src=")data:image\/webp;base64,([A-Za-z0-9+/=]+)(")/;
const logoM = bodyPart.match(logoRe);
const logoBuf = logoM ? Buffer.from(logoM[2], 'base64') : null;

/* embedded photos -> files */
const photoRe = /^const PHOTO_DATA=(\{.*\});?\s*$/m;
const photoM = js.match(photoRe);
const photos = photoM ? JSON.parse(photoM[1]) : {};

/* router shim: boot on clean paths; turn #routes into real links */
const SHIM_PLACEHOLDER = '/*__ROUTES__*/';
const shim = `
/* ===== CO3 path router (generated by build.cjs) ===== */
const P2H=${SHIM_PLACEHOLDER};
const H2P={};Object.keys(P2H).forEach(p=>{H2P["#"+P2H[p]]=p;});
function routeKey(){if(location.hash&&location.hash.length>1)return location.hash.slice(1);
  let p=location.pathname.replace(/index\\.html$/,"");if(!p.endsWith("/"))p+="/";
  return P2H[p]||(p==="/"?"home":"__404");}
function realLinks(root){(root||document).querySelectorAll('a[href^="#"]').forEach(a=>{const p=H2P[a.getAttribute("href")];if(p)a.setAttribute("href",p);});}
(function(){let t;const mo=new MutationObserver(()=>{clearTimeout(t);t=setTimeout(()=>realLinks(document),0);});
  document.addEventListener("DOMContentLoaded",()=>realLinks(document));
  mo.observe(document.documentElement,{childList:true,subtree:true});})();
/* ===== end CO3 path router ===== */
`;
function patchJs(code, photoUrls) {
  // photos
  if (photoM) code = code.replace(photoRe, 'const PHOTO_DATA=' + JSON.stringify(photoUrls) + ';');
  // router: derive the key from the clean path when there is no hash
  const before = 'const h=(location.hash||"#home").slice(1)||"home";';
  if (!code.includes(before)) throw new Error('Router line not found; the source changed. Update build.cjs.');
  code = code.replace(before, 'const h=routeKey();');
  const titleLine = 'document.title=page.title==="HOME"?"The Local Legends Map":page.title+" · The Local Legends Map";';
  if (!code.includes(titleLine)) throw new Error('Title line not found; update build.cjs.');
  code = code.replace(titleLine, 'if(window.__booted||!document.querySelector(\'link[rel="canonical"]\'))' + titleLine + 'window.__booted=1;');
  const searchLine = 'location.hash=hit[2]!=null?dishHref(hit[1],hit[2]):`#r-${hit[1]}`;';
  if (code.includes(searchLine)) code = code.replace(searchLine, '{const _h=hit[2]!=null?dishHref(hit[1],hit[2]):`#r-${hit[1]}`;if(H2P[_h])location.href=H2P[_h];else location.hash=_h;}');
  return shim + code;
}

/* ---------- local server for prerendering ---------- */
function serve(dir) {
  return new Promise(res => {
    const srv = http.createServer((req, resp) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      let f = path.join(dir, p);
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
      if (!fs.existsSync(f)) f = path.join(dir, 'index.html');
      const ext = path.extname(f);
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
      resp.writeHead(200, { 'content-type': (types[ext] || 'application/octet-stream') + '; charset=utf-8' });
      fs.createReadStream(f).pipe(resp);
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}

(async () => {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  /* photos -> webp */
  const photoUrls = {};
  for (const [name, dataUri] of Object.entries(photos)) {
    const buf = Buffer.from(dataUri.split(',')[1], 'base64');
    const out = await sharp(buf).resize({ width: 1100, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
    const file = `img/${name.replace(/\.\w+$/, '')}.${hash(out)}.webp`;
    writeFile(file, out);
    photoUrls[name] = '/' + file;
  }

  /* brand: header logo file (2x the 64px display height) and a 512px PNG for schema/press */
  let orgLogo = SITE + '/favicon-32.png';
  if (logoBuf) {
    const hdr = await sharp(logoBuf).resize({ height: 140 }).webp({ quality: 86, alphaQuality: 90 }).toBuffer();
    const file = `img/brand-logo.${hash(hdr)}.webp`;
    writeFile(file, hdr);
    const meta = await sharp(hdr).metadata();
    bodyPart = bodyPart.replace(logoRe, `$1/${file}$3`).replace(/(<img class="brandlogo" src="[^"]+") width="\d+" height="\d+"/, `$1 width="${meta.width}" height="${meta.height}"`);
    writeFile('brand/logo-512.png', await sharp(logoBuf).resize({ width: 512 }).png({ compressionLevel: 9 }).toBuffer());
    orgLogo = SITE + '/brand/logo-512.png';
  }

  /* favicons from the embedded icon */
  if (iconBuf) {
    const png = n => sharp(iconBuf).resize(n, n).png({ compressionLevel: 9 }).toBuffer();
    const p16 = await png(16), p32 = await png(32), p48 = await png(48);
    writeFile('favicon-16.png', p16);
    writeFile('favicon-32.png', p32);
    writeFile('favicon.ico', pngsToIco([{ size: 16, buf: p16 }, { size: 32, buf: p32 }, { size: 48, buf: p48 }]));
    writeFile('icon-192.png', await png(192));
    writeFile('icon-512.png', await sharp(iconBuf).resize(512, 512).png({ compressionLevel: 9 }).toBuffer());
    // iOS fills transparency with black, so the touch icon sits on cream
    writeFile('apple-touch-icon.png', await sharp({ create: { width: 180, height: 180, channels: 4, background: '#F3EBD5' } })
      .composite([{ input: await sharp(iconBuf).resize(164, 164).toBuffer(), left: 8, top: 8 }]).png().toBuffer());
    writeFile('site.webmanifest', JSON.stringify({ name: 'The Local Legends Map', short_name: 'Local Legends', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }], theme_color: '#0B5C38', background_color: '#FFF8EC', display: 'browser' }));
  }

  /* default share image (1200x630) */
  const heroBuf = photos['albany-1-hero.jpg'] ? Buffer.from(photos['albany-1-hero.jpg'].split(',')[1], 'base64') : null;
  /* CO4: Travel Diary share image (hero gradient, Oswald-style condensed headline) + brand badge */
  const ogOverlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <defs><linearGradient id="g" x1="0.42" y1="0" x2="0.58" y2="1"><stop offset="0" stop-color="#0B7568"/><stop offset=".38" stop-color="#138A57"/><stop offset=".62" stop-color="#9BBF2A"/><stop offset=".8" stop-color="#F1C50E"/><stop offset="1" stop-color="#F0A01A"/></linearGradient></defs>
    <rect width="1200" height="630" fill="url(#g)" opacity="${heroBuf ? 0.9 : 1}"/>
    <text x="70" y="150" font-family="Oswald, 'Arial Narrow', Arial, sans-serif" font-size="26" font-weight="600" letter-spacing="6" fill="#FFFFFF">THE LOCAL LEGENDS MAP</text>
    <rect x="70" y="172" width="90" height="8" fill="#ED7912"/>
    <text x="66" y="300" font-family="Oswald, 'Arial Narrow', Arial, sans-serif" font-size="104" font-weight="700" fill="#FFFFFF">EAT LIKE YOU</text>
    <text x="66" y="404" font-family="Oswald, 'Arial Narrow', Arial, sans-serif" font-size="104" font-weight="700" fill="#FFFFFF">LIVE THERE.</text>
    <text x="70" y="580" font-family="Oswald, 'Arial Narrow', Arial, sans-serif" font-size="30" font-weight="700" letter-spacing="3" fill="#111111">LOCALLEGENDSMAP.COM · VOTED BY LOCALS</text></svg>`);
  const ogLayers = [{ input: ogOverlay }];
  if (logoBuf) ogLayers.push({ input: await sharp(logoBuf).resize({ height: 340 }).toBuffer(), left: 820, top: 60 });
  const ogBase = sharp({ create: { width: 1200, height: 630, channels: 3, background: '#107B4C' } });
  writeFile('og/default.jpg', await ogBase.composite(ogLayers).jpeg({ quality: 82 }).toBuffer());

  /* temporary dev build (hash routing) for prerendering */
  const devJs = patchJs(js, photoUrls).replace(SHIM_PLACEHOLDER, '{}');
  const devDir = path.join(ROOT, '.prerender');
  fs.rmSync(devDir, { recursive: true, force: true });
  fs.mkdirSync(devDir, { recursive: true });
  fs.cpSync(path.join(DIST, 'img'), path.join(devDir, 'img'), { recursive: true });
  fs.writeFileSync(path.join(devDir, 'index.html'), headPart + `<style>${css}</style>` + bodyPart + `<script>${devJs}</script>`);

  /* ---------- 2. prerender every route ---------- */
  const srv = await serve(devDir);
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base + '#home', { waitUntil: 'networkidle' });

  const routeRe = /^#[a-z][a-z0-9-]*$/; // any #route; pages that render the not-found view are skipped
  const queue = ['#home'], seen = new Set(queue), pages = [];
  while (queue.length) {
    const h = queue.shift();
    await page.evaluate(h2 => { location.hash = h2; }, h);
    await page.waitForTimeout(120);
    const snap = await page.evaluate((hh) => {
      const app = document.querySelector('#app');
      const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
      const firstP = [...app.querySelectorAll('.pagehead p, p')].map(p => txt(p)).find(t => t.length > 40) || '';
      return {
        path: (document.querySelector('#urlchip').textContent || '').replace('locallegendsmap.com', ''),
        title: document.title,
        h1: txt(app.querySelector('h1')),
        desc: firstP,
        app: app.innerHTML,
        ticker: (document.querySelector('#ticker') || {}).innerHTML || '',
        dd: (document.querySelector('#ddpanel') || {}).innerHTML || '',
        isHome: document.body.classList.contains('is-home'),
        links: [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href')),
        seo: (() => {
          let m;
          try {
            if ((m = hh.match(/^#r-([a-z]+)$/))) {
              const r = REGIONS.find(x => x.id === m[1]);
              if (r) return { title: `${r.name}: Local Legendary Foods`, desc: `The local legendary foods of ${r.name}: ${r.dishes.map(d => d.n).join(', ')}. Their stories, where to find them, plus trails and food festivals, voted by locals.` };
            }
            if ((m = hh.match(/^#d-([a-z]+)-(\d+)$/))) {
              const r = REGIONS.find(x => x.id === m[1]); const d = r && r.dishes[+m[2]];
              if (d) return { title: `${d.n} in ${r.name}`, desc: d.d };
            }
          } catch (e) {}
          return null;
        })(),
      };
    }, h);
    if (!snap.path) throw new Error('No path for ' + h);
    if (snap.path === '/404/') continue; // in-page anchors and unknown routes
    pages.push({ hash: h, ...snap });
    for (const l of snap.links) if (routeRe.test(l) && !seen.has(l)) { seen.add(l); queue.push(l); }
  }
  await page.evaluate(() => { location.hash = '#__missing'; });
  await page.waitForTimeout(120);
  const nf = await page.evaluate(() => ({ app: document.querySelector('#app').innerHTML, title: document.title }));
  await browser.close();
  srv.close();
  fs.rmSync(devDir, { recursive: true, force: true });
  if (errors.length) console.warn('Page errors during prerender:\n' + [...new Set(errors)].join('\n'));

  /* dedupe by path (some hashes share a path) */
  const byPath = new Map();
  for (const p of pages) if (!byPath.has(p.path)) byPath.set(p.path, p);
  const P2H = {};
  for (const [p, v] of byPath) P2H[p] = v.hash.slice(1);
  const H2P = {};
  for (const p of pages) H2P[p.hash] = p.path;

  /* ---------- 3. final assets ---------- */
  const finalJs = patchJs(js, photoUrls).replace(SHIM_PLACEHOLDER, JSON.stringify(P2H));
  const jsFile = `app.${hash(finalJs)}.js`;
  const cssFile = `app.${hash(css)}.css`;
  writeFile(jsFile, finalJs);
  writeFile(cssFile, css);

  const toReal = html => html.replace(/href="(#[a-z0-9-]+)"/g, (m, h) => (H2P[h] ? `href="${H2P[h]}"` : m));
  const clip = (s, n) => (s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n - 1)).replace(/[,;:·\s]+$/, '') + '…');

  // head without its <title> (we write our own)
  const headClean = headPart.replace(/<title>[\s\S]*?<\/title>\s*/, '')
    .replace('<link rel="preconnect" href="https://fonts.googleapis.com">',
      '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>');

  const iconLinks = iconBuf
    ? `<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">
<link rel="icon" href="/favicon-16.png" type="image/png" sizes="16x16">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#0B5C38">`
    : '';

  function crumbs(p, title) {
    const parts = p.split('/').filter(Boolean);
    const items = [{ name: 'Home', url: SITE + '/' }];
    let acc = '';
    parts.forEach((seg, i) => {
      acc += '/' + seg;
      const hit = byPath.get(acc + '/');
      const name = i === parts.length - 1 ? title : hit ? hit.title.replace(/ · The Local Legends Map$/, '') : seg.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      items.push({ name, url: SITE + acc + '/' });
    });
    return items;
  }

  function pageHtml(pg, opts = {}) {
    const isHome = pg.path === '/';
    const shortTitle = (pg.seo && pg.seo.title) || (pg.title === 'The Local Legends Map' ? '' : pg.title.replace(/ · The Local Legends Map$/, ''));
    const fullTitle = isHome ? 'The Local Legends Map · Eat like you live there' : `${shortTitle} · The Local Legends Map`;
    const desc = clip((pg.seo && pg.seo.desc) || pg.desc || 'Regional food for travelers and the curious: the dishes a place is known for, where locals get them, trails, crawls and food festivals.', 158);
    const url = SITE + pg.path;
    const ld = [];
    if (isHome) {
      ld.push({ '@context': 'https://schema.org', '@type': 'WebSite', name: 'The Local Legends Map', url: SITE + '/', potentialAction: undefined });
      const org = { '@context': 'https://schema.org', '@type': 'Organization', name: 'The Local Legends Map', url: SITE + '/', logo: orgLogo };
      const same = [CONFIG.social.facebook, CONFIG.social.instagram].filter(Boolean);
      if (same.length) org.sameAs = same;
      ld.push(org);
    } else {
      ld.push({ '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        itemListElement: crumbs(pg.path, shortTitle).map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })) });
    }
    const noindex = opts.noindex || CONFIG.noindexPaths.includes(pg.path) || /data-noindex/.test(pg.app || '');
    let body = bodyPart
      .replace('<main id="app" tabindex="-1"></main>', `<main id="app" tabindex="-1">${toReal(pg.app)}</main>`)
      .replace(/(<div class="ticker" id="ticker"[^>]*>)(<\/div>)/, `$1${toReal(pg.ticker)}$2`)
      .replace(/(<code id="urlchip"[^>]*>)[^<]*(<\/code>)/, `$1locallegendsmap.com${pg.path}$2`);
    if (pg.dd) body = body.replace(/(id="ddpanel"[^>]*>)(<\/div>)/, `$1${toReal(pg.dd)}$2`);
    body = toReal(body);
    if (pg.isHome) body = body.replace(/^(\s*)/, '$1');
    return `<!doctype html>
<html lang="en">
<head>
${headClean.trim()}
<title>${escAttr(fullTitle)}</title>
<meta name="description" content="${escAttr(desc)}">
<link rel="canonical" href="${url}">
${noindex ? '<meta name="robots" content="noindex">\n' : ''}${iconLinks}
<meta property="og:site_name" content="The Local Legends Map">
<meta property="og:type" content="website">
<meta property="og:title" content="${escAttr(isHome ? 'The Local Legends Map' : shortTitle)}">
<meta property="og:description" content="${escAttr(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/og/default.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/${cssFile}">
${ld.map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n')}
</head>
<body${pg.isHome ? ' class="is-home"' : ''}>
${body.trim()}
<script src="/${jsFile}"></script>
</body>
</html>
`;
  }

  for (const [p, pg] of byPath) {
    if (p === '/404/') continue;
    writeFile(p === '/' ? 'index.html' : path.join(p, 'index.html'), pageHtml(pg));
  }
  writeFile('404.html', pageHtml({ path: '/404/', title: nf.title, desc: "That page isn't on the map.", app: nf.app, ticker: pages[0].ticker, dd: pages[0].dd }, { noindex: true }));

  /* ---------- 4. crawl files ---------- */
  const today = new Date().toISOString().slice(0, 10);
  const isNoindex = p => CONFIG.noindexPaths.includes(p) || /data-noindex/.test((byPath.get(p) || {}).app || '');
  const indexable = [...byPath.keys()].filter(p => !isNoindex(p));
  const urlset = list => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${list.map(p => `  <url><loc>${SITE}${p}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`;
  const groups = { ny: indexable.filter(p => p.startsWith('/ny/')), site: indexable.filter(p => !p.startsWith('/ny/')) };
  for (const [g, list] of Object.entries(groups)) writeFile(`sitemaps/${g}.xml`, urlset(list));
  writeFile('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Object.keys(groups).map(g => `  <sitemap><loc>${SITE}/sitemaps/${g}.xml</loc><lastmod>${today}</lastmod></sitemap>`).join('\n')}\n</sitemapindex>\n`);

  const aiBots = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended', 'CCBot', 'Applebot-Extended'];
  writeFile('robots.txt', [
    'User-agent: *', 'Allow: /', 'Disallow: /admin/', '',
    ...aiBots.flatMap(b => [`User-agent: ${b}`, CONFIG.allowAICrawlers ? 'Allow: /' : 'Disallow: /', 'Disallow: /admin/', '']),
    `Sitemap: ${SITE}/sitemap.xml`, '',
  ].join('\n'));

  const sec = (label, filter) => {
    const items = [...byPath.values()].filter(v => filter(v.path) && !isNoindex(v.path));
    return items.length ? `## ${label}\n${items.map(v => `- [${v.title.replace(/ · The Local Legends Map$/, '').replace(/^The Local Legends Map$/, 'Home')}](${SITE}${v.path})`).join('\n')}\n` : '';
  };
  writeFile('llms.txt', `# The Local Legends Map

> Regional food for travelers and the curious. The dishes a place is known for, where locals get them, trails, crawls and road trips, food festivals and regional food news. Starting with New York State and growing to all 50 states. Tagline: "Eat like you live there."

How to cite: "Voted by locals on Local Legends Map" with a link to the page. Rankings come from member votes; paid placements are always labeled "Featured" and never change a vote order. This is a beta with some sample data.

${sec('New York regions and dishes', p => p.startsWith('/ny/'))}
${sec('Trails, crawls and road trips', p => p.startsWith('/trails/'))}
${sec('Features, events and news', p => !p.startsWith('/ny/') && !p.startsWith('/trails/') && p !== '/')}`);

  if (CONFIG.redirects && CONFIG.redirects.length) writeFile('_redirects', CONFIG.redirects.map(([from, to]) => `${from} ${to} 301`).join('\n') + '\n');

  writeFile('_headers', `/app.*
  Cache-Control: public, max-age=31536000, immutable
/img/*
  Cache-Control: public, max-age=31536000, immutable
/og/*
  Cache-Control: public, max-age=86400
/brand/*
  Cache-Control: public, max-age=86400
/favicon*
  Cache-Control: public, max-age=86400
/apple-touch-icon.png
  Cache-Control: public, max-age=86400
/icon-*
  Cache-Control: public, max-age=86400
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
`);

  const report = {
    pages: byPath.size, routesVisited: pages.length,
    srcBytes: Buffer.byteLength(src), homeHtmlBytes: fs.statSync(path.join(DIST, 'index.html')).size,
    jsBytes: Buffer.byteLength(finalJs), cssBytes: Buffer.byteLength(css),
    brand: { logo: !!logoBuf, favicon: !!iconBuf },
    pageErrors: [...new Set(errors)],
  };
  fs.writeFileSync(path.join(ROOT, 'build-report.json'), JSON.stringify({ ...report, paths: [...byPath.keys()] }, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
