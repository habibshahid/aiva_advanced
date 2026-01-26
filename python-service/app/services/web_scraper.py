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

# At the top of the file, add:
try:
    from playwright_stealth import stealth_async
    STEALTH_AVAILABLE = True
except ImportError:
    STEALTH_AVAILABLE = False
    logger.info("ℹ️ playwright-stealth not installed - using basic stealth")

FIRECRAWL_AVAILABLE = False
try:
    from firecrawl import Firecrawl
    FIRECRAWL_AVAILABLE = True
except ImportError:
    logger.info("ℹ️ Firecrawl not installed - pip install firecrawl-py")

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
        
        self._firecrawl_client = None
        self._firecrawl_domains: Set[str] = set()

        # User-agents pool (choose ONE per crawl)
        self.user_agents = [
            # Chrome on Windows (most common)
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            # Chrome on Mac
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            # Chrome on Linux
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            # Firefox on Windows
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
            # Firefox on Mac
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0',
            # Edge on Windows (Chromium-based)
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
        ]
        #self.user_agents = [
        #    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        #    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/133.0',
        #    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        #    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        #    'AIVA-Bot/1.0 (+https://intellicon.io/bot; aiva@intellicon.io)'
        #]

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
        
        # Determine browser type from UA to set matching sec-ch-ua
        is_firefox = 'Firefox' in stable_ua
        is_edge = 'Edg/' in stable_ua
        
        if is_firefox:
            # Firefox doesn't send sec-ch-ua headers
            sec_ch_ua = None
        elif is_edge:
            sec_ch_ua = '"Chromium";v="131", "Microsoft Edge";v="131", "Not-A.Brand";v="99"'
        else:
            sec_ch_ua = '"Chromium";v="131", "Google Chrome";v="131", "Not-A.Brand";v="99"'
        
        self._stable_headers = {
            'User-Agent': stable_ua,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'DNT': '1',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-User': '?1',
            'Sec-Fetch-Dest': 'document',
        }
        
        # Add sec-ch-ua headers only for Chrome/Edge (Firefox doesn't send them)
        if sec_ch_ua:
            self._stable_headers['sec-ch-ua'] = sec_ch_ua
            self._stable_headers['sec-ch-ua-mobile'] = '?0'
            self._stable_headers['sec-ch-ua-platform'] = '"Windows"' if 'Windows' in stable_ua else '"macOS"' if 'Macintosh' in stable_ua else '"Linux"'

        # If this domain needs Firecrawl (captcha-protected), use it directly
        if base_host in self._firecrawl_domains and FIRECRAWL_AVAILABLE:
            logger.info(f"🔥 Using Firecrawl for known captcha-protected domain: {base_host}")
            return await self._scrape_with_firecrawl(url, max_depth, max_pages)

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
        sitemap_headers = self._stable_headers or {
            'User-Agent': random.choice(self.user_agents),
            'Accept': 'application/xml,text/xml,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
        }
        async with aiohttp.ClientSession(headers=sitemap_headers) as session:
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

        # Always use full browser-like headers to avoid being blocked
        stable_ua = random.choice(self.user_agents)
        headers = self._stable_headers or {
            'User-Agent': stable_ua,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'DNT': '1',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-User': '?1',
            'Sec-Fetch-Dest': 'document',
            'sec-ch-ua': '"Chromium";v="131", "Google Chrome";v="131", "Not-A.Brand";v="99"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
        }

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
                
        # Check if Firecrawl might help
        if result.get('needs_playwright') and FIRECRAWL_AVAILABLE:
            result['needs_firecrawl'] = True
            result['firecrawl_available'] = True
        else:
            result['needs_firecrawl'] = False
            result['firecrawl_available'] = FIRECRAWL_AVAILABLE
            
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
        
        # Determine if Chrome-based UA for sec-ch-ua headers
        is_chrome = 'Chrome' in stable_ua and 'Firefox' not in stable_ua
        
        # Build extra headers for Playwright
        extra_headers = {
            'Accept-Language': 'en-US,en;q=0.9',
            'DNT': '1',
        }
        if is_chrome:
            extra_headers['sec-ch-ua'] = '"Chromium";v="131", "Google Chrome";v="131", "Not-A.Brand";v="99"'
            extra_headers['sec-ch-ua-mobile'] = '?0'
            extra_headers['sec-ch-ua-platform'] = '"Windows"'

        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(
                    headless=True,
                    args=[
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-blink-features=AutomationControlled',
                        '--disable-infobars',
                        '--disable-dev-shm-usage',
                        '--disable-gpu',
                        '--window-size=1366,768',
                        '--start-maximized',
                        '--disable-extensions',
                        '--disable-plugins',
                        '--disable-web-security',
                        '--ignore-certificate-errors',
                        '--no-first-run',
                        '--no-default-browser-check',
                        '--disable-background-networking',
                        '--disable-sync',
                        '--disable-translate',
                        '--hide-scrollbars',
                        '--metrics-recording-only',
                        '--mute-audio',
                        '--no-zygote',
                    ]
                )
                context = await browser.new_context(
                    viewport={'width': 1366, 'height': 768},
                    user_agent=stable_ua,
                    java_script_enabled=True,
                    timezone_id="America/New_York",
                    locale="en-US",
                    extra_http_headers=extra_headers,  # <-- ADD THIS
                )
                # Stealth
                stealth_js = """
                // Webdriver
                Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
                
                // Chrome runtime
                window.chrome = {
                    runtime: {},
                    loadTimes: function() {},
                    csi: function() {},
                    app: {}
                };
                
                // Permissions
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ?
                        Promise.resolve({ state: Notification.permission }) :
                        originalQuery(parameters)
                );
                
                // Plugins
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [1, 2, 3, 4, 5]
                });
                
                // Languages
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['en-US', 'en']
                });
                
                // Platform
                Object.defineProperty(navigator, 'platform', {
                    get: () => 'Win32'
                });
                
                // Hardware concurrency
                Object.defineProperty(navigator, 'hardwareConcurrency', {
                    get: () => 8
                });
                
                // Device memory
                Object.defineProperty(navigator, 'deviceMemory', {
                    get: () => 8
                });
                
                // WebGL Vendor
                const getParameter = WebGLRenderingContext.prototype.getParameter;
                WebGLRenderingContext.prototype.getParameter = function(parameter) {
                    if (parameter === 37445) return 'Intel Inc.';
                    if (parameter === 37446) return 'Intel Iris OpenGL Engine';
                    return getParameter.call(this, parameter);
                };
                
                // Console.debug override
                console.debug = () => {};
                """
                await context.add_init_script(stealth_js)

                page = await context.new_page()
                
                if STEALTH_AVAILABLE:
                    await stealth_async(page)

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
                        await page.goto(current_url, referer=referer, wait_until='networkidle', timeout=60000)
                        await page.wait_for_timeout(random.randint(3500, 9000))
                        try:
                            await page.wait_for_load_state('networkidle', timeout=10000)
                        except Exception:
                            pass

                        # Lazy-load scroll
                        await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
                        await page.wait_for_timeout(random.randint(1200, 2500))

                        # Retry content retrieval if page is still navigating
                        html = None
                        for attempt in range(3):
                            try:
                                # Wait for any pending navigation to finish
                                try:
                                    await page.wait_for_load_state('load', timeout=5000)
                                except Exception:
                                    pass
                                html = await page.content()
                                break
                            except Exception as content_err:
                                if 'navigating' in str(content_err).lower() and attempt < 2:
                                    logger.warning(f"🎭 Page still navigating, retry {attempt + 1}/3")
                                    await page.wait_for_timeout(3000)
                                else:
                                    raise content_err

                        if html is None:
                            raise Exception("Failed to get page content after retries")

                        title = await page.title()

                        if self._is_bot_protection(html):
                            logger.warning("🎭 Protection page detected; attempting to wait for challenge")
                            
                            # Try multiple times with increasing waits
                            challenge_passed = False
                            for challenge_attempt in range(3):
                                wait_time = 10.0 + (challenge_attempt * 5.0)  # 10s, 15s, 20s
                                logger.info(f"🎭 Waiting {wait_time}s for challenge (attempt {challenge_attempt + 1}/3)")
                                await page.wait_for_timeout(int(wait_time * 1000))
                                
                                html = await page.content()
                                if not self._is_bot_protection(html):
                                    challenge_passed = True
                                    logger.info("🎭 Challenge passed!")
                                    break
                            
                            if not challenge_passed:
                                logger.error(f"🎭 Could not bypass security for {current_url}")
                                
                                # Mark domain as needing Firecrawl
                                domain = self._norm_host(urlparse(current_url).netloc)
                                self._firecrawl_domains.add(domain)
                                
                                # If this is the root URL and Firecrawl is available, use it
                                if depth == 0 and FIRECRAWL_AVAILABLE:
                                    logger.info(f"🔥 Escalating to Firecrawl for {domain}")
                                    await browser.close()
                                    return await self._scrape_with_firecrawl(url, max_depth, max_pages)
                                
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

    async def _scrape_with_playwright_visible(
        self,
        url: str,
        max_depth: int = 1,
        max_pages: int = 5,
        allowed_hosts: Set[str] = None,
    ) -> Dict[str, Any]:
        """
        Last resort: Use visible browser (non-headless) for heavily protected sites.
        Note: Requires DISPLAY environment variable on Linux.
        """
        if not PLAYWRIGHT_AVAILABLE:
            logger.error("Playwright not available")
            return self._result(url, [])
            
        pages: List[Dict[str, Any]] = []
        
        logger.info(f"🎭 Starting VISIBLE Playwright crawl (last resort): {url}")
        
        stable_ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        
        try:
            async with async_playwright() as p:
                # Launch in visible mode
                browser = await p.chromium.launch(
                    headless=False,  # VISIBLE
                    args=[
                        '--no-sandbox',
                        '--disable-blink-features=AutomationControlled',
                        '--start-maximized',
                    ]
                )
                
                context = await browser.new_context(
                    viewport={'width': 1366, 'height': 768},
                    user_agent=stable_ua,
                    java_script_enabled=True,
                )
                
                # Stealth
                await context.add_init_script('Object.defineProperty(navigator, "webdriver", {get: () => undefined});')
                
                page = await context.new_page()
                
                logger.info(f"🎭 Navigating to {url} in visible browser...")
                await page.goto(url, wait_until='networkidle', timeout=60000)
                
                # Wait longer for manual challenge solving if needed
                logger.info("🎭 Waiting 30s for any challenges to complete...")
                await page.wait_for_timeout(30000)
                
                html = await page.content()
                title = await page.title()
                
                if not self._is_bot_protection(html):
                    soup = BeautifulSoup(html, 'lxml')
                    extracted = self._extract_content(soup)
                    
                    if len(extracted['text'].strip()) > 50:
                        pages.append({
                            'html': html,
                            'title': title or extracted['title'],
                            'text': extracted['text'],
                            'metadata': extracted['metadata'],
                            'url': url,
                            'depth': 0,
                        })
                
                await browser.close()
                
        except Exception as e:
            logger.error(f"🎭 Visible Playwright error: {e}")
        
        return self._result(url, pages)
        
    # =========================
    # Firecrawl fallback (for captcha-protected sites)
    # =========================

    def _get_firecrawl_client(self):
        """Get or create Firecrawl client"""
        if self._firecrawl_client is None:
            try:
                from app.config import settings
                if hasattr(settings, 'FIRECRAWL_API_KEY') and settings.FIRECRAWL_API_KEY:
                    from firecrawl import Firecrawl
                    self._firecrawl_client = Firecrawl(api_key=settings.FIRECRAWL_API_KEY)
                    logger.info("✅ Firecrawl client initialized")
                else:
                    logger.warning("⚠️ FIRECRAWL_API_KEY not configured")
            except Exception as e:
                logger.warning(f"Failed to initialize Firecrawl: {e}")
        return self._firecrawl_client
        
    async def _scrape_with_firecrawl(
        self,
        url: str,
        max_depth: int,
        max_pages: int,
    ) -> Dict[str, Any]:
        """
        Scrape using Firecrawl API - handles captchas and bot protection.
        This is the final fallback when HTTP and Playwright both fail.
        """
        client = self._get_firecrawl_client()
        if not client:
            logger.error("🔥 Firecrawl not available (no API key or not installed)")
            return self._result(url, [])

        pages: List[Dict[str, Any]] = []
        
        try:
            logger.info(f"🔥 Starting Firecrawl crawl: {url} (max_pages={max_pages})")
            
            # Use Firecrawl V2 crawl method
            crawl_result = client.crawl(
                url,
                limit=max_pages,
                scrape_options={
                    'formats': ['markdown', 'html'],
                },
                poll_interval=5
            )
            
            # Process results - V2 returns data directly
            if crawl_result and crawl_result.get('data'):
                for item in crawl_result['data']:
                    markdown = item.get('markdown', '')
                    html = item.get('html', '')
                    metadata = item.get('metadata', {})
                    page_url = metadata.get('sourceURL', url)
                    title = metadata.get('title', '')
                    
                    if markdown and len(markdown.strip()) > 50:
                        pages.append({
                            'html': html or markdown,
                            'title': title,
                            'text': markdown,
                            'metadata': {
                                'source': 'firecrawl',
                                'description': metadata.get('description', ''),
                                'language': metadata.get('language', 'en'),
                            },
                            'url': page_url,
                            'depth': 0,
                        })
                
                logger.info(f"🔥 Firecrawl complete: {len(pages)} pages scraped")
            else:
                logger.warning(f"🔥 Firecrawl returned no data for {url}")
                
        except Exception as e:
            logger.error(f"🔥 Firecrawl error: {e}")
        
        return self._result(url, pages)

    async def _scrape_single_with_firecrawl(self, url: str) -> Optional[Dict[str, Any]]:
        """Scrape a single URL with Firecrawl"""
        client = self._get_firecrawl_client()
        if not client:
            return None
            
        try:
            logger.info(f"🔥 Firecrawl single page: {url}")
            
            # Use Firecrawl V2 scrape method
            result = client.scrape(url, formats=['markdown', 'html'])
            
            if result and result.get('markdown'):
                metadata = result.get('metadata', {})
                return {
                    'html': result.get('html', result['markdown']),
                    'title': metadata.get('title', ''),
                    'text': result['markdown'],
                    'metadata': {
                        'source': 'firecrawl',
                        'description': metadata.get('description', ''),
                    },
                }
        except Exception as e:
            logger.error(f"🔥 Firecrawl single page error: {e}")
        
        return None
        
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
