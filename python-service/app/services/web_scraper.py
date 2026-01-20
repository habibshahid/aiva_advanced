"""
Web Scraper Service (Complete Improved Version)

Key features:
- Stable identity per crawl (single UA + headers + cookie jar)
- robots.txt compliance + crawl-delay (polite pacing)
- Backoff & retries for 403 / 429 / 503
- Sends Referer when following in-site links
- Broader bot-protection detection (Wordfence/Sucuri/Cloudflare)
- WordPress-aware: prefers REST (/wp-json/wp/v2/posts) and RSS (/feed/)
- Sitemap fallback if homepage is blocked (uses robots.txt Sitemap or /sitemap.xml)
- Early Playwright escalation when the root page is blocked
- Domain normalization + optional allowed-host expansion from sitemap URLs

Public API:
- scrape_url(url, max_depth=2, max_pages=20, allowed_domains=None) -> dict
- scrape_sitemap(sitemap_url) -> list[str]
- test_url_accessibility(url) -> dict
"""

import re
import json
import logging
import asyncio
import random
from typing import List, Dict, Any, Set, Optional, Tuple
from urllib.parse import urljoin, urlparse

import aiohttp
from aiohttp import ClientTimeout
from bs4 import BeautifulSoup

# Optional, keep if your app expects it; otherwise safe to remove
try:
    from app.config import settings  # noqa: F401
except Exception:
    pass

logger = logging.getLogger(__name__)

# -------------------------
# Optional Playwright
# -------------------------
PLAYWRIGHT_AVAILABLE = False
try:
    from playwright.async_api import async_playwright  # type: ignore
    PLAYWRIGHT_AVAILABLE = True
    logger.info("✅ Playwright available for bot-protected sites")
except ImportError:
    logger.info("ℹ️ Playwright not installed - bot-protected sites may fail")


class WebScraper:
    """Scrape and extract content from websites (polite + WP-aware)."""

    def __init__(self):
        # Crawl controls
        self.max_depth = 2
        self.max_pages = 20
        self.timeout = 30

        # Dynamic per-crawl stable headers (set in scrape_url)
        self._stable_headers: Optional[Dict[str, str]] = None

        # Domains we should auto-escalate to Playwright
        self._playwright_domains: Set[str] = set()

        # User-agents pool (choose ONE per crawl)
        self.user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'AIVA-Bot/1.0 (+https://intellicon.io/bot; aiva@intellicon.io)'
        ]

    # =========================
    # Public API
    # =========================

    async def scrape_url(
        self,
        url: str,
        max_depth: int = 2,
        max_pages: int = 20,
        allowed_domains: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Scrape a URL and optionally crawl linked pages.

        Strategy:
        1) Use WordPress REST/RSS when available to fetch posts safely.
        2) Crawl politely (robots.txt + crawl-delay) with stable identity.
        3) If we get 0 pages (e.g., homepage blocked), fall back to sitemap discovery.
        4) If root page is blocked, escalate to Playwright immediately (if available).
        """
        self.max_depth = max_depth
        self.max_pages = max_pages

        parsed_root = urlparse(url)
        base_host = self._norm_host(parsed_root.netloc)

        if allowed_domains is None:
            allowed_domains = [base_host]
        allowed_hosts: Set[str] = {self._norm_host(h) for h in allowed_domains}

        # Stable identity for the WHOLE crawl (one UA, consistent headers)
        stable_ua = random.choice(self.user_agents)
        self._stable_headers = {
            'User-Agent': stable_ua,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            # Slightly richer, browser-like headers
            "DNT": "1",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-User": "?1",
            "Sec-Fetch-Dest": "document",
            "sec-ch-ua": '"Chromium";v="120", "Not=A?Brand";v="24"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
        }

        # If this domain is already flagged for Playwright, escalate early
        if base_host in self._playwright_domains and PLAYWRIGHT_AVAILABLE:
            logger.info(f"🎭 Using Playwright for {base_host}")
            return await self._scrape_with_playwright(url, max_depth, max_pages, allowed_hosts)

        visited: Set[str] = set()
        to_visit: List[Tuple[str, int, Optional[str]]] = [(url, 0, None)]  # (url, depth, referer)
        pages: List[Dict[str, Any]] = []
        max_depth_reached = 0

        async with aiohttp.ClientSession(headers=self._stable_headers, timeout=ClientTimeout(total=90)) as session:
            # robots.txt & crawl-delay
            robots = await self._fetch_robots(session, url)
            crawl_delay = max(robots.get("crawl_delay", 3.0), 3.0)  # polite default minimum

            # WordPress-friendly discovery (REST/RSS)
            wp_avail = await self._discover_wp_endpoints(session, f"{parsed_root.scheme}://{parsed_root.netloc}")
            if wp_avail.get("rest_posts"):
                logger.info("🧩 Using WordPress REST API to fetch posts")
                wp_pages = await self._fetch_wp_posts_via_rest(session, wp_avail["rest_posts"])
                if wp_pages:
                    pages.extend(wp_pages[: self.max_pages])
                    if len(pages) >= self.max_pages:
                        return self._result(url, pages)

            elif wp_avail.get("rss_feed"):
                logger.info("🧩 Using WordPress RSS feed to fetch posts")
                rss_pages = await self._fetch_rss_feed(session, wp_avail["rss_feed"])
                if rss_pages:
                    pages.extend(rss_pages[: self.max_pages])
                    if len(pages) >= self.max_pages:
                        return self._result(url, pages)

            # Normal polite crawl
            while to_visit and len(pages) < self.max_pages:
                current_url, depth, referer = to_visit.pop(0)
                max_depth_reached = max(max_depth_reached, depth)

                if current_url in visited or depth > self.max_depth:
                    continue

                if self._is_disallowed(current_url, robots):
                    logger.info(f"Skipping disallowed by robots.txt: {current_url}")
                    continue

                logger.info(f"Scraping: {current_url} (depth: {depth})")
                page_data = await self._scrape_single_page(session, current_url, referer)

                # If the very first page (root) is blocked, escalate to Playwright immediately
                if page_data is None and depth == 0:
                    domain = self._norm_host(urlparse(current_url).netloc)
                    if PLAYWRIGHT_AVAILABLE:
                        self._playwright_domains.add(domain)
                        logger.info(f"🎭 Root blocked; escalating to Playwright for {domain}")
                        return await self._scrape_with_playwright(url, max_depth, max_pages, allowed_hosts)

                if page_data is None:
                    # Mark domain as potentially needing Playwright next time and keep going
                    domain = self._norm_host(urlparse(current_url).netloc)
                    self._playwright_domains.add(domain)
                    await asyncio.sleep(random.uniform(crawl_delay + 1.0, crawl_delay + 3.0))
                    continue

                pages.append({**page_data, 'url': current_url, 'depth': depth})
                visited.add(current_url)

                # Queue links if not at max depth
                if depth < self.max_depth:
                    links = self._extract_links(page_data['html'], current_url, allowed_hosts)
                    for link in links:
                        if link not in visited and link not in [u for (u, _, __) in to_visit]:
                            to_visit.append((link, depth + 1, current_url))

                # Polite pacing
                await asyncio.sleep(random.uniform(crawl_delay, crawl_delay + 2.5))

            # ---------- Sitemap fallback if no pages scraped ----------
            if not pages:
                try:
                    # Try robots.txt Sitemap first
                    robots_sitemap = await self._get_sitemap_from_robots(session, url)
                    sitemap_urls: List[str] = []
                    if robots_sitemap:
                        sitemap_urls = await self.scrape_sitemap(robots_sitemap)

                    # Fallback to common path if needed
                    if not sitemap_urls:
                        parsed = urlparse(url)
                        sitemap_urls = await self.scrape_sitemap(f"{parsed.scheme}://{parsed.netloc}/sitemap.xml")

                    # Expand allowed hosts with any discovered sitemap hostnames (e.g., docs subdomain)
                    for su in sitemap_urls:
                        self._add_allowed_host_from_url(su, allowed_hosts)

                    # Take a small batch and try scraping those directly
                    batch = sitemap_urls[: min(10, self.max_pages)]
                    for u in batch:
                        if self._host_allowed(urlparse(u).netloc, allowed_hosts) and not self._is_disallowed(u, robots):
                            pd = await self._scrape_single_page(session, u, referer=None)
                            if pd:
                                pages.append({**pd, 'url': u, 'depth': 1})
                            if len(pages) >= self.max_pages:
                                break
                            await asyncio.sleep(random.uniform(crawl_delay, crawl_delay + 1.5))
                except Exception as e:
                    logger.warning(f"Sitemap fallback failed: {e}")

        return self._result(url, pages, max_depth_reached)

    async def scrape_sitemap(self, sitemap_url: str) -> List[str]:
        """Parse a sitemap (or sitemap index) and return URLs."""
        urls: List[str] = []
        async with aiohttp.ClientSession(headers=self._stable_headers or {}) as session:
            try:
                async with session.get(sitemap_url, timeout=self.timeout) as response:
                    if not (200 <= response.status < 300):
                        logger.error(f"Failed to fetch sitemap: {response.status}")
                        return urls
                    xml_content = await response.text()
                    soup = BeautifulSoup(xml_content, 'xml')

                    # If sitemap index: collect <sitemap><loc> then expand
                    sitemap_locs = [loc.text.strip() for loc in soup.find_all('loc')]
                    if soup.find('sitemapindex'):
                        # Expand first few child sitemaps to stay polite
                        child_maps = sitemap_locs[:8]
                        for sm in child_maps:
                            urls.extend(await self._fetch_single_sitemap(session, sm))
                        # de-dup preserve order
                        urls = list(dict.fromkeys(urls))
                    else:
                        # Normal sitemap
                        urls.extend([u for u in sitemap_locs if u])
                        urls = list(dict.fromkeys(urls))

                    logger.info(f"Extracted {len(urls)} URLs from sitemap(s)")
            except Exception as e:
                logger.error(f"Error parsing sitemap: {e}")
        return urls

    async def test_url_accessibility(self, url: str) -> Dict[str, Any]:
        """Test if a URL is accessible and whether it likely needs Playwright."""
        result = {
            'url': url,
            'accessible': False,
            'status_code': None,
            'content_type': None,
            'error': None,
            'needs_playwright': False,
        }

        headers = (self._stable_headers or {
            'User-Agent': random.choice(self.user_agents),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        })

        async with aiohttp.ClientSession(headers=headers) as session:
            try:
                async with session.get(url, timeout=10, allow_redirects=True) as response:
                    result['status_code'] = response.status
                    result['content_type'] = response.headers.get('Content-Type')

                    if 200 <= response.status < 300:
                        html = await response.text()
                        if self._is_bot_protection(html):
                            result['needs_playwright'] = True
                            result['accessible'] = PLAYWRIGHT_AVAILABLE
                            result['error'] = 'Bot protection detected'
                        else:
                            result['accessible'] = True
                    else:
                        result['accessible'] = False
            except asyncio.TimeoutError:
                result['error'] = 'Connection timed out'
            except Exception as e:
                result['error'] = str(e)
        return result

    # =========================
    # Internal HTTP fetch
    # =========================

    async def _scrape_single_page(
        self,
        session: aiohttp.ClientSession,
        url: str,
        referer: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Scrape a single page using HTTP with backoff/retries and Referer."""
        headers = dict(self._stable_headers or {})
        if referer:
            headers["Referer"] = referer

        for attempt in range(4):  # 1 try + 3 retries
            try:
                async with session.get(url, headers=headers, timeout=self.timeout, allow_redirects=True) as response:
                    status = response.status

                    if status in (429, 503) or status == 403:
                        wait = (2 ** attempt) + random.uniform(0.0, 1.5)
                        logger.warning(f"{status} for {url}; backing off {wait:.1f}s (attempt {attempt+1}/4)")
                        await asyncio.sleep(wait)
                        continue

                    if not (200 <= status < 300):
                        logger.warning(f"Non-2xx status for {url}: {status}")
                        return None

                    content_type = response.headers.get('Content-Type', '')
                    if 'text/html' not in content_type:
                        logger.info(f"Skipping non-HTML content: {content_type}")
                        return None

                    html = await response.text()

                    if self._is_bot_protection(html):
                        logger.warning(f"🤖 Bot protection detected for {url}")
                        domain = self._norm_host(urlparse(url).netloc)
                        self._playwright_domains.add(domain)
                        return None

                    soup = BeautifulSoup(html, 'lxml')
                    extracted = self._extract_content(soup)

                    if len(extracted['text'].strip()) < 50:
                        logger.warning(f"Very little content from {url} ({len(extracted['text'])} chars)")

                    canonical = self._canonical_url(soup, url)

                    return {
                        'html': html,
                        'title': extracted['title'],
                        'text': extracted['text'],
                        'metadata': {**extracted['metadata'], 'canonical': canonical},
                    }

            except asyncio.TimeoutError:
                logger.error(f"Timeout scraping {url} (attempt {attempt+1}/4)")
            except Exception as e:
                logger.error(f"Error scraping {url} (attempt {attempt+1}/4): {e}")

        return None

    # =========================
    # WordPress helpers
    # =========================

    async def _discover_wp_endpoints(self, session: aiohttp.ClientSession, root: str) -> Dict[str, str]:
        """Probe common WP endpoints: RSS feed and REST posts."""
        candidates = {
            "rss_feed": urljoin(root, "/feed/"),
            "rest_root": urljoin(root, "/wp-json/"),
            "rest_posts": urljoin(root, "/wp-json/wp/v2/posts?per_page=10&_embed=1"),
        }
        available: Dict[str, str] = {}
        for key, endpoint in candidates.items():
            try:
                async with session.get(endpoint, timeout=10) as r:
                    if 200 <= r.status < 300:
                        available[key] = endpoint
            except Exception:
                pass
        return available

    async def _fetch_wp_posts_via_rest(self, session: aiohttp.ClientSession, posts_url: str) -> List[Dict[str, Any]]:
        """Fetch recent posts via WP REST API and map to page-like objects."""
        pages: List[Dict[str, Any]] = []
        try:
            async with session.get(posts_url, timeout=15) as r:
                if not (200 <= r.status < 300):
                    return pages
                data = await r.text()
                try:
                    posts = json.loads(data)
                except json.JSONDecodeError:
                    return pages

                for p in posts:
                    title = self._strip_html(p.get("title", {}).get("rendered", "") or "")
                    text = self._strip_html(p.get("content", {}).get("rendered", "") or "")
                    link = p.get("link") or ""
                    pages.append({
                        'html': p.get("content", {}).get("rendered", "") or "",
                        'title': title,
                        'text': self._clean_text(text),
                        'metadata': {'source': 'wp-rest', 'id': p.get("id"), 'author': p.get("author")},
                        'url': link,
                        'depth': 0,
                    })
                    if len(pages) >= self.max_pages:
                        break
        except Exception as e:
            logger.warning(f"WP REST fetch failed: {e}")
        return pages

    async def _fetch_rss_feed(self, session: aiohttp.ClientSession, feed_url: str) -> List[Dict[str, Any]]:
        """Fetch posts via RSS/Atom feed and map to page-like objects."""
        pages: List[Dict[str, Any]] = []
        try:
            async with session.get(feed_url, timeout=15) as r:
                if not (200 <= r.status < 300):
                    return pages
                xml = await r.text()
                soup = BeautifulSoup(xml, 'xml')

                # RSS 2.0
                for item in soup.find_all('item'):
                    title = (item.find_text('title') or '').strip()
                    link = (item.find_text('link') or '').strip()
                    desc = (item.find_text('description') or '').strip()
                    content = (item.find('content:encoded').text if item.find('content:encoded') else desc) or ''
                    pages.append({
                        'html': content,
                        'title': self._strip_html(title),
                        'text': self._clean_text(self._strip_html(content)),
                        'metadata': {'source': 'rss'},
                        'url': link,
                        'depth': 0,
                    })
                    if len(pages) >= self.max_pages:
                        return pages

                # Atom fallback
                for entry in soup.find_all('entry'):
                    title = (entry.find_text('title') or '').strip()
                    link_tag = entry.find('link')
                    link = link_tag.get('href') if link_tag else ''
                    content_tag = entry.find('content') or entry.find('summary')
                    content = content_tag.text if content_tag else ''
                    pages.append({
                        'html': content,
                        'title': self._strip_html(title),
                        'text': self._clean_text(self._strip_html(content)),
                        'metadata': {'source': 'atom'},
                        'url': link,
                        'depth': 0,
                    })
                    if len(pages) >= self.max_pages:
                        return pages

        except Exception as e:
            logger.warning(f"RSS/Atom fetch failed: {e}")

        return pages

    # =========================
    # Playwright fallback
    # =========================

    async def _scrape_with_playwright(
        self,
        url: str,
        max_depth: int,
        max_pages: int,
        allowed_hosts: Set[str],
    ) -> Dict[str, Any]:
        """Scrape using Playwright - for bot-protected sites."""
        if not PLAYWRIGHT_AVAILABLE:
            logger.error("Playwright not available")
            return self._result(url, [])

        visited: Set[str] = set()
        to_visit: List[Tuple[str, int, Optional[str]]] = [(url, 0, None)]
        pages: List[Dict[str, Any]] = []
        max_depth_reached = 0

        logger.info(f"🎭 Starting Playwright crawl: {url}")

        stable_ua = (self._stable_headers or {}).get('User-Agent', random.choice(self.user_agents))

        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(
                    headless=True,
                    args=['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
                )
                context = await browser.new_context(
                    viewport={'width': 1366, 'height': 768},
                    user_agent=stable_ua,
                    java_script_enabled=True,
                    timezone_id="America/New_York",  # adjust if you prefer
                    locale="en-US",
                )
                # Stealth
                await context.add_init_script('Object.defineProperty(navigator, "webdriver", {get: () => undefined});')

                page = await context.new_page()

                # Small first-party cookie to look “lived in”
                try:
                    parsed = urlparse(url)
                    await context.add_cookies([{
                        "name": "_pref", "value": "1",
                        "domain": parsed.netloc, "path": "/",
                    }])
                except Exception:
                    pass

                while to_visit and len(pages) < max_pages:
                    current_url, depth, referer = to_visit.pop(0)
                    max_depth_reached = max(max_depth_reached, depth)

                    if current_url in visited or depth > max_depth:
                        continue

                    logger.info(f"🎭 Scraping: {current_url} (depth: {depth})")
                    try:
                        await page.goto(current_url, referer=referer, wait_until='domcontentloaded', timeout=45000)
                        await page.wait_for_timeout(random.randint(3500, 9000))
                        try:
                            await page.wait_for_load_state('networkidle', timeout=10000)
                        except Exception:
                            pass

                        # Lazy-load scroll
                        await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
                        await page.wait_for_timeout(random.randint(1200, 2500))

                        html = await page.content()
                        title = await page.title()

                        if self._is_bot_protection(html):
                            logger.warning("🎭 Protection page; waiting and retrying once")
                            await page.wait_for_timeout(8000)
                            html = await page.content()
                            if self._is_bot_protection(html):
                                logger.error(f"🎭 Could not bypass security for {current_url}")
                                await asyncio.sleep(random.uniform(4, 7))
                                continue

                        soup = BeautifulSoup(html, 'lxml')
                        extracted = self._extract_content(soup)

                        if len(extracted['text'].strip()) > 50:
                            pages.append({
                                'html': html,
                                'title': title or extracted['title'],
                                'text': extracted['text'],
                                'metadata': extracted['metadata'],
                                'url': current_url,
                                'depth': depth,
                            })
                            visited.add(current_url)

                            if depth < max_depth:
                                links = self._extract_links(html, current_url, allowed_hosts)
                                for link in links:
                                    if link not in visited and link not in [u for (u, _, __) in to_visit]:
                                        to_visit.append((link, depth + 1, current_url))

                        await asyncio.sleep(random.uniform(4.0, 9.0))

                    except Exception as e:
                        logger.error(f"🎭 Error: {e}")
                        await asyncio.sleep(random.uniform(3.0, 6.0))
                        continue

                await browser.close()
        except Exception as e:
            logger.error(f"🎭 Playwright error: {e}")

        logger.info(f"🎭 Crawl complete: {len(pages)} pages")
        return self._result(url, pages, max_depth_reached)

    # =========================
    # robots.txt & sitemaps
    # =========================

    async def _fetch_robots(self, session: aiohttp.ClientSession, base_url: str) -> Dict[str, Any]:
        """Fetch robots.txt and parse disallow + crawl-delay (very light parser)."""
        parsed = urlparse(base_url)
        robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
        rules = {"disallow": set(), "crawl_delay": 5.0}
        try:
            async with session.get(robots_url, timeout=10) as r:
                if 200 <= r.status < 300:
                    txt = await r.text()
                    ua = "*"
                    for line in txt.splitlines():
                        s = line.strip()
                        if not s or s.startswith("#"):
                            continue
                        low = s.lower()
                        if low.startswith("user-agent:"):
                            ua = s.split(":", 1)[1].strip()
                        elif ua in ("*", (self._stable_headers or {}).get("User-Agent", "")):
                            if low.startswith("disallow:"):
                                path = s.split(":", 1)[1].strip()
                                if path:
                                    rules["disallow"].add(path)
                            elif low.startswith("crawl-delay:"):
                                try:
                                    rules["crawl_delay"] = float(s.split(":", 1)[1].strip())
                                except Exception:
                                    pass
        except Exception:
            pass
        return rules

    def _is_disallowed(self, url: str, rules: Dict[str, Any]) -> bool:
        parsed = urlparse(url)
        path = parsed.path or "/"
        return any(path.startswith(d) for d in rules.get("disallow", set()))

    async def _get_sitemap_from_robots(self, session: aiohttp.ClientSession, base_url: str) -> Optional[str]:
        """Read robots.txt and return first Sitemap URL if present."""
        try:
            parsed = urlparse(base_url)
            robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
            async with session.get(robots_url, timeout=10) as r:
                if 200 <= r.status < 300:
                    txt = await r.text()
                    m = re.search(r'(?i)sitemap:\s*(\S+)', txt)
                    if m:
                        return m.group(1).strip()
        except Exception:
            pass
        return None

    async def _fetch_single_sitemap(self, session: aiohttp.ClientSession, sitemap_url: str) -> List[str]:
        """Fetch a single sitemap file and return its <loc> URLs."""
        urls: List[str] = []
        try:
            async with session.get(sitemap_url, timeout=self.timeout) as response:
                if not (200 <= response.status < 300):
                    return urls
                xml_content = await response.text()
                soup = BeautifulSoup(xml_content, 'xml')
                urls.extend([loc.text.strip() for loc in soup.find_all('loc') if loc.text])
        except Exception:
            pass
        return urls

    # =========================
    # Parsing & helpers
    # =========================

    def _extract_content(self, soup: BeautifulSoup) -> Dict[str, Any]:
        """Extract meaningful content from HTML."""
        for element in soup(['script', 'style', 'nav', 'footer', 'header', 'aside', 'iframe', 'noscript']):
            element.decompose()

        # Title
        title = ''
        if soup.title and soup.title.string:
            title = soup.title.string
        elif soup.find('h1'):
            title = soup.find('h1').get_text()

        # Main content
        main_content = soup.find('main') or soup.find('article') or soup.find('body')
        text = (main_content.get_text(separator='\n', strip=True) if main_content else soup.get_text(separator='\n', strip=True))
        text = self._clean_text(text)

        # Metadata (incl. OpenGraph)
        metadata: Dict[str, Any] = {}
        meta_desc = soup.find('meta', attrs={'name': 'description'})
        if meta_desc and meta_desc.get('content'):
            metadata['description'] = meta_desc.get('content')

        meta_keywords = soup.find('meta', attrs={'name': 'keywords'})
        if meta_keywords and meta_keywords.get('content'):
            metadata['keywords'] = meta_keywords.get('content')

        meta_author = soup.find('meta', attrs={'name': 'author'})
        if meta_author and meta_author.get('content'):
            metadata['author'] = meta_author.get('content')

        og_title = soup.find('meta', property='og:title')
        if og_title and og_title.get('content'):
            metadata['og_title'] = og_title.get('content')

        og_desc = soup.find('meta', property='og:description')
        if og_desc and og_desc.get('content'):
            metadata['og_description'] = og_desc.get('content')

        return {'title': title, 'text': text, 'metadata': metadata}

    def _clean_text(self, text: str) -> str:
        """Clean extracted text while preserving structure."""
        text = re.sub(r'[^\S\n]+', ' ', text)          # collapse spaces (not newlines)
        text = re.sub(r'\n\s*\n\s*\n+', '\n\n', text)  # 3+ blank lines -> 2
        text = re.sub(r'\n +\n', '\n\n', text)
        return text.strip()

    def _strip_html(self, html: str) -> str:
        s = BeautifulSoup(html or "", 'lxml')
        for e in s(['script', 'style']):
            e.decompose()
        return s.get_text(separator=' ', strip=True)

    def _canonical_url(self, soup: BeautifulSoup, fallback: str) -> str:
        link = soup.find('link', rel=lambda v: v and 'canonical' in v)
        href = link.get('href') if link else None
        if href:
            try:
                return urljoin(fallback, href)
            except Exception:
                pass
        return fallback

    def _norm_host(self, host: str) -> str:
        return (host or '').lower().lstrip('www.')

    def _host_allowed(self, host: str, allowed_hosts: Set[str]) -> bool:
        h = self._norm_host(host)
        return h in allowed_hosts or any(h.endswith("." + ah) for ah in allowed_hosts)

    def _add_allowed_host_from_url(self, u: str, allowed_hosts: Set[str]) -> None:
        try:
            h = self._norm_host(urlparse(u).netloc)
            if h:
                allowed_hosts.add(h)
        except Exception:
            pass

    def _is_bot_protection(self, html: str) -> bool:
        """Detect common bot/captcha/security walls (Wordfence/Sucuri/Cloudflare)."""
        h = (html or "").lower()
        indicators = [
            "wordfence", "wfconfig", "wfwaf", "waf_block", "blocked because",
            "sucuri firewall", "access denied", "access was denied",
            "cloudflare", "ray id", "attention required! | cloudflare",
            "bot protection", "ddos protection",
            "/captcha/", "recaptcha", "please verify you are a human",
            "just a moment", "checking your browser before accessing",
            "please enable cookies", "enable javascript to continue",
        ]
        if any(ind in h for ind in indicators):
            return True

        # Small-page heuristics as additional signal
        if len(h) < 1200:
            if 'meta http-equiv="refresh"' in h:
                return True
            if 'captcha' in h or 'sgcaptcha' in h:
                return True
        if len(h) < 3000:
            small_indicators = [
                'checking your browser', 'please wait while we verify',
                'ddos protection', 'just a moment',
            ]
            if any(si in h for si in small_indicators):
                return True
        return False

    def _extract_links(
        self,
        html: str,
        base_url: str,
        allowed_hosts: Set[str],
    ) -> List[str]:
        """Extract and filter links from HTML (skip noisy WP paths/params and binaries)."""
        soup = BeautifulSoup(html or "", 'lxml')
        links: List[str] = []

        bad_paths = ("/wp-admin", "/wp-login.php", "/xmlrpc.php")
        bad_params = ("replytocom", "add-to-cart", "wc-ajax", "et_fb", "utm_", "fbclid", "gclid")

        for a_tag in soup.find_all('a', href=True):
            href = a_tag['href']

            if not href or href.startswith('#'):
                continue

            absolute_url = urljoin(base_url, href)
            parsed = urlparse(absolute_url)

            if parsed.scheme not in ('http', 'https'):
                continue

            if not self._host_allowed(parsed.netloc, allowed_hosts):
                continue

            if any(parsed.path.lower().endswith(ext) for ext in (
                '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
                '.zip', '.exe', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
                '.mp3', '.mp4', '.avi', '.mov',
            )):
                continue

            if any(parsed.path.startswith(p) for p in bad_paths):
                continue

            if any(k in (parsed.query or '') for k in bad_params):
                continue

            # Remove fragment; keep query (useful for pagination)
            clean_url = parsed.scheme + '://' + parsed.netloc + parsed.path
            if parsed.query:
                clean_url += '?' + parsed.query

            links.append(clean_url)

        # Remove duplicates (preserve order)
        return list(dict.fromkeys(links))

    # =========================
    # Result construction
    # =========================

    def _result(self, base_url: str, pages: List[Dict[str, Any]], max_depth_reached: Optional[int] = None) -> Dict[str, Any]:
        return {
            'total_pages': len(pages),
            'pages': pages,
            'base_url': base_url,
            'max_depth_reached': max_depth_reached if max_depth_reached is not None
                else (max((p.get('depth') or 0) for p in pages) if pages else 0),
        }
