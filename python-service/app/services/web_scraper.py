"""
Web Scraper Service
Extract content from websites and URLs
"""

import re
import logging
import asyncio
from typing import List, Dict, Any, Set, Optional
from urllib.parse import urljoin, urlparse
import aiohttp
from bs4 import BeautifulSoup
import random

from app.config import settings

logger = logging.getLogger(__name__)


class WebScraper:
    """Scrape and extract content from websites"""
    
    def __init__(self):
        self.max_depth = 3
        self.max_pages = 50
        self.timeout = 30
        
        # User agents for rotation
        self.user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        ]
    
    async def scrape_url(
        self,
        url: str,
        max_depth: int = 2,
        max_pages: int = 20,
        allowed_domains: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Scrape a URL and optionally crawl linked pages
        """
        self.max_depth = max_depth
        self.max_pages = max_pages
        
        # Parse base domain
        parsed = urlparse(url)
        base_domain = parsed.netloc
        
        if allowed_domains is None:
            allowed_domains = [base_domain]
        
        # Track visited URLs
        visited: Set[str] = set()
        to_visit: List[tuple] = [(url, 0)]  # (url, depth)
        pages: List[Dict[str, Any]] = []
        
        async with aiohttp.ClientSession() as session:
            while to_visit and len(pages) < self.max_pages:
                current_url, depth = to_visit.pop(0)
                
                if current_url in visited:
                    continue
                
                if depth > self.max_depth:
                    continue
                
                logger.info(f"Scraping: {current_url} (depth: {depth})")
                
                try:
                    page_data = await self._scrape_single_page(session, current_url)
                    
                    if page_data:
                        pages.append({
                            **page_data,
                            'url': current_url,
                            'depth': depth
                        })
                        visited.add(current_url)
                        
                        # Extract and queue links if not at max depth
                        if depth < self.max_depth:
                            links = self._extract_links(
                                page_data['html'],
                                current_url,
                                allowed_domains
                            )
                            
                            for link in links:
                                if link not in visited and link not in [u for u, d in to_visit]:
                                    to_visit.append((link, depth + 1))
                    
                    # Delay between requests
                    await asyncio.sleep(random.uniform(1, 3))
                    
                except Exception as e:
                    logger.error(f"Error scraping {current_url}: {e}")
                    continue
        
        return {
            'total_pages': len(pages),
            'pages': pages,
            'base_url': url,
            'max_depth_reached': max(p['depth'] for p in pages) if pages else 0
        }
    
    async def _scrape_single_page(
        self,
        session: aiohttp.ClientSession,
        url: str
    ) -> Optional[Dict[str, Any]]:
        """
        Scrape a single page
        """
        headers = {
            'User-Agent': random.choice(self.user_agents),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        }
        
        try:
            async with session.get(url, headers=headers, timeout=self.timeout) as response:
                if response.status != 200:
                    logger.warning(f"Non-200 status for {url}: {response.status}")
                    return None
                
                content_type = response.headers.get('Content-Type', '')
                
                # Only process HTML
                if 'text/html' not in content_type:
                    logger.info(f"Skipping non-HTML content: {content_type}")
                    return None
                
                html = await response.text()
                
                # Parse HTML
                soup = BeautifulSoup(html, 'lxml')
                
                # Extract content
                extracted = self._extract_content(soup)
                
                return {
                    'html': html,
                    'title': extracted['title'],
                    'text': extracted['text'],
                    'metadata': extracted['metadata']
                }
                
        except asyncio.TimeoutError:
            logger.error(f"Timeout scraping {url}")
            return None
        except Exception as e:
            logger.error(f"Error scraping {url}: {e}")
            return None
    
    def _extract_content(self, soup: BeautifulSoup) -> Dict[str, Any]:
        """
        Extract meaningful content from HTML
        """
        # Remove unwanted elements
        for element in soup(['script', 'style', 'nav', 'footer', 'header', 'aside', 'iframe']):
            element.decompose()
        
        # Extract title
        title = ''
        if soup.title:
            title = soup.title.string
        elif soup.find('h1'):
            title = soup.find('h1').get_text()
        
        # Extract main content
        main_content = soup.find('main') or soup.find('article') or soup.find('body')
        
        if main_content:
            text = main_content.get_text(separator='\n', strip=True)
        else:
            text = soup.get_text(separator='\n', strip=True)
        
        # Clean text
        text = self._clean_text(text)
        
        # Extract metadata
        metadata = {}
        
        # Meta description
        meta_desc = soup.find('meta', attrs={'name': 'description'})
        if meta_desc and meta_desc.get('content'):
            metadata['description'] = meta_desc.get('content')
        
        # Meta keywords
        meta_keywords = soup.find('meta', attrs={'name': 'keywords'})
        if meta_keywords and meta_keywords.get('content'):
            metadata['keywords'] = meta_keywords.get('content')
        
        # Author
        meta_author = soup.find('meta', attrs={'name': 'author'})
        if meta_author and meta_author.get('content'):
            metadata['author'] = meta_author.get('content')
        
        # OpenGraph data
        og_title = soup.find('meta', property='og:title')
        if og_title:
            metadata['og_title'] = og_title.get('content')
        
        og_desc = soup.find('meta', property='og:description')
        if og_desc:
            metadata['og_description'] = og_desc.get('content')
        
        return {
            'title': title,
            'text': text,
            'metadata': metadata
        }
    
    def _clean_text(self, text: str) -> str:
        """Clean extracted text"""
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text)
        
        # Remove excessive newlines
        text = re.sub(r'\n\s*\n\s*\n+', '\n\n', text)
        
        # Remove common noise
        text = re.sub(r'(Cookie|Cookies|Privacy Policy|Terms of Service)(\s+\|?\s+)+', '', text)
        
        return text.strip()
    
    def _extract_links(
        self,
        html: str,
        base_url: str,
        allowed_domains: List[str]
    ) -> List[str]:
        """
        Extract and filter links from HTML
        """
        soup = BeautifulSoup(html, 'lxml')
        links = []
        
        for a_tag in soup.find_all('a', href=True):
            href = a_tag['href']
            
            # Make absolute URL
            absolute_url = urljoin(base_url, href)
            
            # Parse URL
            parsed = urlparse(absolute_url)
            
            # Filter links
            # Skip anchors, mailto, tel, javascript
            if parsed.scheme not in ['http', 'https']:
                continue
            
            # Check if domain is allowed
            if parsed.netloc not in allowed_domains:
                continue
            
            # Skip common files
            if any(absolute_url.lower().endswith(ext) for ext in [
                '.pdf', '.jpg', '.png', '.gif', '.zip', '.exe', 
                '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'
            ]):
                continue
            
            # Remove fragment
            clean_url = parsed.scheme + '://' + parsed.netloc + parsed.path
            if parsed.query:
                clean_url += '?' + parsed.query
            
            links.append(clean_url)
        
        # Remove duplicates
        return list(set(links))
    
    async def scrape_sitemap(self, sitemap_url: str) -> List[str]:
        """
        Parse sitemap.xml and extract URLs
        """
        urls = []
        
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(sitemap_url, timeout=self.timeout) as response:
                    if response.status != 200:
                        logger.error(f"Failed to fetch sitemap: {response.status}")
                        return urls
                    
                    xml_content = await response.text()
                    soup = BeautifulSoup(xml_content, 'xml')
                    
                    # Extract URLs from <loc> tags
                    for loc in soup.find_all('loc'):
                        url = loc.text.strip()
                        if url:
                            urls.append(url)
                    
                    logger.info(f"Extracted {len(urls)} URLs from sitemap")
                    
            except Exception as e:
                logger.error(f"Error parsing sitemap: {e}")
        
        return urls
    
    async def test_url_accessibility(self, url: str) -> Dict[str, Any]:
        """
        Test if a URL is accessible
        """
        result = {
            'url': url,
            'accessible': False,
            'status_code': None,
            'content_type': None,
            'error': None
        }
        
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(url, timeout=10) as response:
                    result['accessible'] = response.status == 200
                    result['status_code'] = response.status
                    result['content_type'] = response.headers.get('Content-Type')
            except Exception as e:
                result['error'] = str(e)
        
        return result