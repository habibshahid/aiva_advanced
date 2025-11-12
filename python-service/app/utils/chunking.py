"""
Text Chunking Utility - ENHANCED VERSION
- Intelligent text splitting for embeddings
- Markdown-aware chunking that preserves structure
"""

import re
from typing import List


class TextChunker:
    """Split text into semantic chunks with markdown support"""
    
    def __init__(self, chunk_size: int = 500, chunk_overlap: int = 50):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
    
    def chunk_text(self, text: str) -> List[str]:
        """
        Split text into chunks with overlap (original method)
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
    
    def chunk_markdown(self, text: str) -> List[str]:
        """
        Split markdown text while preserving structure
        Respects headers, code blocks, tables, and lists
        """
        if not text:
            return []
        
        chunks = []
        current_chunk = []
        current_size = 0
        
        # Split by major sections (headers or page markers)
        sections = self._split_by_markdown_sections(text)
        
        for section in sections:
            section_words = section.split()
            section_size = len(section_words)
            
            # If section is small enough, add it
            if section_size <= self.chunk_size:
                # Check if adding this section would exceed chunk size
                if current_size + section_size > self.chunk_size and current_chunk:
                    # Save current chunk
                    chunks.append('\n\n'.join(current_chunk))
                    current_chunk = []
                    current_size = 0
                
                current_chunk.append(section)
                current_size += section_size
            
            else:
                # Section is too large, needs to be split
                # First, save any accumulated chunks
                if current_chunk:
                    chunks.append('\n\n'.join(current_chunk))
                    current_chunk = []
                    current_size = 0
                
                # Split large section
                section_chunks = self._split_large_section(section)
                chunks.extend(section_chunks)
        
        # Add remaining chunk
        if current_chunk:
            chunks.append('\n\n'.join(current_chunk))
        
        return chunks
    
    def _split_by_markdown_sections(self, text: str) -> List[str]:
        """
        Split markdown by major sections (headers, page markers)
        """
        # Pattern to match markdown headers (# to ###) or page/slide markers
        section_pattern = r'(^#+\s.+$|^## (?:Page|Slide|Sheet)\s+\d+$|^---$)'
        
        # Split while keeping the delimiter
        parts = re.split(f'({section_pattern})', text, flags=re.MULTILINE)
        
        sections = []
        current_section = []
        
        for part in parts:
            part = part.strip()
            if not part:
                continue
            
            # Check if this is a section header
            if re.match(section_pattern, part, re.MULTILINE):
                # Start new section
                if current_section:
                    sections.append('\n'.join(current_section))
                current_section = [part]
            else:
                current_section.append(part)
        
        # Add last section
        if current_section:
            sections.append('\n'.join(current_section))
        
        return sections
    
    def _split_large_section(self, section: str) -> List[str]:
        """
        Split a large section into smaller chunks while preserving markdown
        """
        chunks = []
        
        # Check if section contains a code block - keep intact if possible
        if '```' in section:
            # Try to split around code blocks
            parts = re.split(r'(```[\s\S]*?```)', section)
            current_chunk = []
            current_size = 0
            
            for part in parts:
                part_size = len(part.split())
                
                if part_size <= self.chunk_size:
                    if current_size + part_size > self.chunk_size and current_chunk:
                        chunks.append('\n\n'.join(current_chunk))
                        current_chunk = []
                        current_size = 0
                    
                    current_chunk.append(part)
                    current_size += part_size
                else:
                    # Even code block is too large, split it
                    if current_chunk:
                        chunks.append('\n\n'.join(current_chunk))
                        current_chunk = []
                        current_size = 0
                    
                    # Use basic splitting for very large parts
                    sub_chunks = self._split_paragraph(part)
                    chunks.extend(sub_chunks)
            
            if current_chunk:
                chunks.append('\n\n'.join(current_chunk))
        
        else:
            # No code blocks, split by paragraphs
            paragraphs = section.split('\n\n')
            current_chunk = []
            current_size = 0
            
            for para in paragraphs:
                para_size = len(para.split())
                
                if para_size <= self.chunk_size:
                    if current_size + para_size > self.chunk_size and current_chunk:
                        chunks.append('\n\n'.join(current_chunk))
                        current_chunk = []
                        current_size = 0
                    
                    current_chunk.append(para)
                    current_size += para_size
                else:
                    # Paragraph too large, split it
                    if current_chunk:
                        chunks.append('\n\n'.join(current_chunk))
                        current_chunk = []
                        current_size = 0
                    
                    para_chunks = self._split_paragraph(para)
                    chunks.extend(para_chunks)
            
            if current_chunk:
                chunks.append('\n\n'.join(current_chunk))
        
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
