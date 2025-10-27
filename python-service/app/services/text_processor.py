"""
Text Processor Service
Clean, chunk, and analyze text
"""

import re
import logging
from typing import Dict, Any, List
import uuid

from app.config import settings
from app.utils.roman_urdu import RomanUrduDetector
from app.utils.chunking import TextChunker

logger = logging.getLogger(__name__)


class TextProcessor:
    """Process and analyze text"""
    
    def __init__(self):
        self.roman_urdu_detector = RomanUrduDetector()
        self.chunker = TextChunker(
            chunk_size=settings.DEFAULT_CHUNK_SIZE,
            chunk_overlap=settings.DEFAULT_CHUNK_OVERLAP
        )
    
    async def process_text(
        self,
        text: str,
        document_id: str,
        kb_id: str,
        metadata: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Process text: clean, chunk, analyze
        """
        # Clean text
        cleaned_text = self._clean_text(text)
        
        # Detect languages
        languages = self._detect_languages(cleaned_text)
        has_roman_urdu = self.roman_urdu_detector.detect(cleaned_text)
        
        # Extract FAQs if present
        faqs = self._extract_faqs(cleaned_text)
        
        # Create chunks
        chunks = self.chunker.chunk_text(cleaned_text)
        
        # Build chunk objects
        chunk_objects = []
        chunks_by_type = {"text": 0, "faq": 0, "table": 0}
        
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
                    "char_count": len(chunk_text)
                }
            }
            chunk_objects.append(chunk_obj)
        
        return {
            "chunks": chunk_objects,
            "languages": languages,
            "has_roman_urdu": has_roman_urdu,
            "faqs": len(faqs),
            "chunks_by_type": chunks_by_type
        }
    
    def _clean_text(self, text: str) -> str:
        """Clean and normalize text"""
        if not text:
            return ""
        
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text)
        
        # Remove special characters but keep Roman Urdu
        # Don't be too aggressive with cleaning
        
        # Remove null bytes
        text = text.replace('\x00', '')
        
        # Normalize line breaks
        text = text.replace('\r\n', '\n').replace('\r', '\n')
        
        return text.strip()
    
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
        """Classify chunk type"""
        # Simple classification
        if 'Q:' in chunk and 'A:' in chunk:
            return 'faq'
        elif '|' in chunk and chunk.count('|') > 3:
            return 'table'
        else:
            return 'text'