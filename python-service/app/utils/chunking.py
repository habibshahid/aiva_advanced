"""
Text Chunking Utility
Intelligent text splitting for embeddings
"""

import re
from typing import List


class TextChunker:
    """Split text into semantic chunks"""
    
    def __init__(self, chunk_size: int = 500, chunk_overlap: int = 50):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
    
    def chunk_text(self, text: str) -> List[str]:
        """
        Split text into chunks with overlap
        """
        if not text:
            return []
        
        # First try to split by paragraphs
        paragraphs = self._split_by_paragraphs(text)
        
        # Then chunk each paragraph if needed
        chunks = []
        for para in paragraphs:
            if len(para.split()) <= self.chunk_size:
                chunks.append(para)
            else:
                # Split long paragraph into smaller chunks
                para_chunks = self._split_paragraph(para)
                chunks.extend(para_chunks)
        
        return chunks
    
    def _split_by_paragraphs(self, text: str) -> List[str]:
        """Split text by paragraphs"""
        # Split by double newlines or section markers
        paragraphs = re.split(r'\n\s*\n|\[Page \d+\]|\[Slide \d+\]|\[Sheet:', text)
        
        # Clean and filter
        cleaned = []
        for para in paragraphs:
            para = para.strip()
            if para and len(para.split()) > 5:  # Minimum 5 words
                cleaned.append(para)
        
        return cleaned
    
    def _split_paragraph(self, paragraph: str) -> List[str]:
        """Split long paragraph into chunks"""
        words = paragraph.split()
        chunks = []
        
        start = 0
        while start < len(words):
            end = start + self.chunk_size
            chunk_words = words[start:end]
            
            # Try to end at sentence boundary
            chunk_text = ' '.join(chunk_words)
            
            # Look for sentence ending
            sentences = re.split(r'[.!?]+\s+', chunk_text)
            if len(sentences) > 1:
                # Keep complete sentences
                complete_sentences = sentences[:-1]
                chunk_text = '. '.join(complete_sentences) + '.'
            
            chunks.append(chunk_text)
            
            # Move start position (with overlap)
            start = end - self.chunk_overlap
        
        return chunks
    
    def chunk_by_sentences(self, text: str, max_sentences: int = 5) -> List[str]:
        """
        Chunk text by sentences
        """
        # Split into sentences
        sentences = re.split(r'[.!?]+\s+', text)
        sentences = [s.strip() for s in sentences if s.strip()]
        
        chunks = []
        for i in range(0, len(sentences), max_sentences):
            chunk_sentences = sentences[i:i + max_sentences]
            chunk = '. '.join(chunk_sentences) + '.'
            chunks.append(chunk)
        
        return chunks
    
    def chunk_by_tokens(self, text: str, max_tokens: int = 500) -> List[str]:
        """
        Chunk text by approximate token count
        (Rough estimate: 1 token ≈ 0.75 words)
        """
        max_words = int(max_tokens * 0.75)
        words = text.split()
        
        chunks = []
        start = 0
        
        while start < len(words):
            end = start + max_words
            chunk_words = words[start:end]
            chunk = ' '.join(chunk_words)
            chunks.append(chunk)
            start = end
        
        return chunks