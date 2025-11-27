"""
Text Processor Service - CONTENT-AWARE VERSION
- Uses LangChain RecursiveCharacterTextSplitter
- Content-type aware chunking (docs, code, narrative, FAQ)
- Preserves markdown formatting
- Intelligent chunking that respects structure

DEPLOYMENT:
    1. Copy content_aware_chunker.py to python-service/app/utils/
    2. Replace python-service/app/services/text_processor.py with this file
    3. pip install langchain langchain-text-splitters --break-system-packages
    4. pm2 restart python-service
"""

import re
import logging
from typing import Dict, Any, List
import uuid

from app.config import settings
from app.utils.roman_urdu import RomanUrduDetector

# Import the new content-aware chunker
try:
    from app.utils.content_aware_chunker import get_content_aware_chunker, ContentType
    CONTENT_AWARE_AVAILABLE = True
    print("✅ TEXT PROCESSOR: Content-aware chunker loaded successfully!")
except ImportError as e:
    CONTENT_AWARE_AVAILABLE = False
    print(f"⚠️  TEXT PROCESSOR: Content-aware chunker NOT available ({e}), using fallback")
    # Fallback to old chunker
    from app.utils.chunking import TextChunker

logger = logging.getLogger(__name__)


class TextProcessor:
    """Process and analyze text with content-aware chunking"""
    
    def __init__(self):
        self.roman_urdu_detector = RomanUrduDetector()
        
        # Use content-aware chunker if available
        if CONTENT_AWARE_AVAILABLE:
            self.chunker = get_content_aware_chunker(
                default_chunk_size=settings.DEFAULT_CHUNK_SIZE,
                default_chunk_overlap=settings.DEFAULT_CHUNK_OVERLAP
            )
            self.use_content_aware = True
            logger.info("✅ TextProcessor using CONTENT-AWARE chunker")
        else:
            # Fallback to basic chunker
            self.chunker = TextChunker(
                chunk_size=settings.DEFAULT_CHUNK_SIZE,
                chunk_overlap=settings.DEFAULT_CHUNK_OVERLAP
            )
            self.use_content_aware = False
            logger.warning("⚠️ TextProcessor using BASIC chunker (fallback)")
    
    async def process_text(
        self,
        text: str,
        document_id: str,
        kb_id: str,
        metadata: Dict[str, Any],
        preserve_formatting: bool = True
    ) -> Dict[str, Any]:
        """
        Process text: clean, chunk, analyze
        
        Args:
            text: Input text (may contain markdown)
            document_id: Document ID
            kb_id: Knowledge base ID
            metadata: Document metadata
            preserve_formatting: If True, preserve markdown formatting
        """
        # Clean text (but preserve markdown if requested)
        if preserve_formatting:
            cleaned_text = self._clean_text_preserve_markdown(text)
        else:
            cleaned_text = self._clean_text(text)
        
        # Detect languages
        languages = self._detect_languages(cleaned_text)
        has_roman_urdu = self.roman_urdu_detector.detect(cleaned_text)
        
        # Extract FAQs if present
        faqs = self._extract_faqs(cleaned_text)
        
        # Get file type from metadata for better content detection
        file_type = metadata.get("file_type") or metadata.get("file_extension") or metadata.get("content_type", "")
        
        # Map content types to extensions
        if "pdf" in file_type.lower():
            file_ext = ".pdf"
        elif "word" in file_type.lower() or "docx" in file_type.lower():
            file_ext = ".docx"
        elif "markdown" in file_type.lower():
            file_ext = ".md"
        else:
            file_ext = None
        
        # Create chunks using content-aware or basic chunker
        if self.use_content_aware:
            # Use new content-aware chunking
            chunk_results = self.chunker.chunk_text(
                text=cleaned_text,
                file_type=file_ext,
                preserve_structure=preserve_formatting
            )
            
            # Map new chunk types to DB ENUM values
            # The database ONLY allows: 'text','faq','table','heading','code','image'
            # So we map all new types to these allowed values
            CHUNK_TYPE_MAP = {
                "instructions": "text",     # steps/instructions -> text (most common)
                "heading": "heading",       # allowed
                "faq": "faq",               # allowed
                "table": "table",           # allowed
                "code": "code",             # allowed
                "list": "text",             # bullet lists -> text
                "text": "text",             # allowed
            }
            
            # Build chunk objects from results
            chunk_objects = []
            chunks_by_type = {"text": 0, "faq": 0, "table": 0, "heading": 0, "code": 0}
            
            for chunk_result in chunk_results:
                raw_chunk_type = chunk_result["metadata"].get("chunk_type", "text")
                # Map to DB-compatible ENUM type
                chunk_type = CHUNK_TYPE_MAP.get(raw_chunk_type, "text")
                chunks_by_type[chunk_type] = chunks_by_type.get(chunk_type, 0) + 1
                
                # Store original type in metadata for search boosting later
                chunk_result["metadata"]["original_chunk_type"] = raw_chunk_type
                
                chunk_obj = {
                    "chunk_id": str(uuid.uuid4()),
                    "document_id": document_id,
                    "kb_id": kb_id,
                    "chunk_index": chunk_result["chunk_index"],
                    "content": chunk_result["content"],
                    "chunk_type": chunk_type,
                    "content_type": chunk_result.get("content_type", "general"),
                    "metadata": {
                        **metadata,
                        **chunk_result["metadata"],
                        "has_markdown": self._has_markdown_syntax(chunk_result["content"])
                    }
                }
                chunk_objects.append(chunk_obj)
            
            # Log summary
            detected_content_type = chunk_results[0]["content_type"] if chunk_results else "general"
            logger.info(
                f"✅ Content-aware chunking: {len(chunk_objects)} chunks, "
                f"type={detected_content_type}, distribution={chunks_by_type}"
            )
            
        else:
            # Fallback to basic chunking
            if preserve_formatting:
                chunks = self.chunker.chunk_markdown(cleaned_text)
            else:
                chunks = self.chunker.chunk_text(cleaned_text)
            
            # Build chunk objects
            chunk_objects = []
            chunks_by_type = {"text": 0, "faq": 0, "table": 0, "heading": 0}
            
            for idx, chunk_text in enumerate(chunks):
                chunk_type = self._classify_chunk(chunk_text)
                chunks_by_type[chunk_type] = chunks_by_type.get(chunk_type, 0) + 1
                
                chunk_obj = {
                    "chunk_id": str(uuid.uuid4()),
                    "document_id": document_id,
                    "kb_id": kb_id,
                    "chunk_index": idx,
                    "content": chunk_text,
                    "chunk_type": chunk_type,
                    "metadata": {
                        **metadata,
                        "word_count": len(chunk_text.split()),
                        "char_count": len(chunk_text),
                        "has_markdown": self._has_markdown_syntax(chunk_text)
                    }
                }
                chunk_objects.append(chunk_obj)
            
            logger.info(f"Basic chunking: {len(chunk_objects)} chunks")
        
        return {
            "chunks": chunk_objects,
            "languages": languages,
            "has_roman_urdu": has_roman_urdu,
            "faqs": len(faqs),  # Return COUNT, not the list (model expects int)
            "faq_items": faqs,   # Keep the actual list separately if needed
            "chunks_by_type": chunks_by_type,  # document_processor expects this at top level
            "stats": {
                "total_chunks": len(chunk_objects),
                "chunks_by_type": chunks_by_type,
                "chunker_type": "content_aware" if self.use_content_aware else "basic"
            }
        }
    
    def _clean_text(self, text: str) -> str:
        """Clean and normalize text (removes formatting)"""
        if not text:
            return ""
        
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text)
        
        # Remove null bytes
        text = text.replace('\x00', '')
        
        # Normalize line breaks
        text = text.replace('\r\n', '\n').replace('\r', '\n')
        
        return text.strip()
    
    def _clean_text_preserve_markdown(self, text: str) -> str:
        """
        Clean text while preserving markdown formatting
        """
        if not text:
            return ""
        
        # Remove null bytes
        text = text.replace('\x00', '')
        
        # Normalize line breaks
        text = text.replace('\r\n', '\n').replace('\r', '\n')
        
        # Remove excessive blank lines (more than 2)
        text = re.sub(r'\n{4,}', '\n\n\n', text)
        
        # Clean up spaces around markdown syntax
        # But preserve markdown structure (headers, lists, code blocks)
        
        # Remove trailing whitespace from lines
        lines = text.split('\n')
        lines = [line.rstrip() for line in lines]
        text = '\n'.join(lines)
        
        return text.strip()
    
    def _has_markdown_syntax(self, text: str) -> bool:
        """Check if text contains markdown syntax"""
        markdown_patterns = [
            r'^#+\s',  # Headers
            r'\*\*.*?\*\*',  # Bold
            r'\*.*?\*',  # Italic
            r'`.*?`',  # Code
            r'^\s*[-*+]\s',  # Lists
            r'^\s*\d+\.\s',  # Numbered lists
            r'\|.*\|',  # Tables
            r'\[.*?\]\(.*?\)',  # Links
        ]
        
        for pattern in markdown_patterns:
            if re.search(pattern, text, re.MULTILINE):
                return True
        
        return False
    
    def _detect_languages(self, text: str) -> List[str]:
        """Detect languages in text"""
        languages = []
        
        # Simple detection
        if re.search(r'[a-zA-Z]', text):
            languages.append('en')
        
        # Arabic/Urdu script
        if re.search(r'[\u0600-\u06FF]', text):
            languages.append('ur')
        
        return languages if languages else ['unknown']
    
    def _extract_faqs(self, text: str) -> List[Dict[str, str]]:
        """Extract FAQ-style Q&A pairs"""
        faqs = []
        
        # Simple FAQ pattern matching
        # Q: ... A: ...
        pattern = r'Q:\s*(.+?)\s*A:\s*(.+?)(?=Q:|$)'
        matches = re.findall(pattern, text, re.DOTALL | re.IGNORECASE)
        
        for question, answer in matches:
            faqs.append({
                "question": question.strip(),
                "answer": answer.strip()
            })
        
        return faqs
    
    def _classify_chunk(self, chunk: str) -> str:
        """Classify chunk type (fallback for basic chunker)"""
        # Check for headings (markdown or page markers)
        if re.match(r'^#+\s', chunk) or re.match(r'^\[Page \d+\]', chunk) or re.match(r'^## (Page|Slide|Sheet)', chunk):
            return 'heading'
        
        # FAQ
        if 'Q:' in chunk and 'A:' in chunk:
            return 'faq'
        
        # Table (markdown or pipe-separated)
        if '|' in chunk and chunk.count('|') > 3:
            return 'table'
        
        # Default
        return 'text'