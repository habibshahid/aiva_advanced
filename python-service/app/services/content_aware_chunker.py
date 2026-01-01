"""
AIVA Content-Aware Text Chunking
=================================
Mirrors the better-performing lumen-soft system.

Key features:
- Uses LangChain's RecursiveCharacterTextSplitter (proven, battle-tested)
- Content-type aware (docs, code, narrative, tabular, FAQ)
- Different chunk sizes per content type
- Hierarchical chunking support
- CLEAR LOGGING to verify it's working

Installation:
    pip install langchain langchain-text-splitters
"""

import re
import logging
from typing import List, Dict, Any, Optional, Tuple
from enum import Enum

logger = logging.getLogger(__name__)

# ============================================================
# VERIFICATION: Check if LangChain is available
# ============================================================
LANGCHAIN_AVAILABLE = False
LANGCHAIN_VERSION = "not installed"

try:
    from langchain.text_splitter import RecursiveCharacterTextSplitter, MarkdownHeaderTextSplitter
    LANGCHAIN_AVAILABLE = True
    try:
        import langchain
        LANGCHAIN_VERSION = getattr(langchain, '__version__', 'unknown')
    except:
        LANGCHAIN_VERSION = "installed (version unknown)"
    
    # Log success prominently
    print(f"✅ CONTENT-AWARE CHUNKING: LangChain loaded successfully (version: {LANGCHAIN_VERSION})")
    logger.info(f"✅ CONTENT-AWARE CHUNKING: LangChain loaded successfully (version: {LANGCHAIN_VERSION})")
    
except ImportError:
    try:
        from langchain_text_splitters import RecursiveCharacterTextSplitter, MarkdownHeaderTextSplitter
        LANGCHAIN_AVAILABLE = True
        LANGCHAIN_VERSION = "langchain-text-splitters"
        print(f"✅ CONTENT-AWARE CHUNKING: langchain-text-splitters loaded successfully")
        logger.info(f"✅ CONTENT-AWARE CHUNKING: langchain-text-splitters loaded successfully")
    except ImportError:
        LANGCHAIN_AVAILABLE = False
        print("⚠️  CONTENT-AWARE CHUNKING: LangChain NOT available - using fallback chunking")
        logger.warning("⚠️  CONTENT-AWARE CHUNKING: LangChain NOT available - using fallback chunking")


class ContentType(Enum):
    """Content types for specialized chunking."""
    DOCUMENTATION = "documentation"
    CODE = "code"
    NARRATIVE = "narrative"
    TABULAR = "tabular"
    FAQ = "faq"
    GENERAL = "general"


class ContentAwareChunker:
    """
    Content-aware text chunking that adapts to content type.
    Mirrors the lumen-soft system's document processor.
    """
    
    # Default chunk configurations by content type
    DEFAULT_CONFIGS = {
        ContentType.DOCUMENTATION: {
            "chunk_size": 800,
            "chunk_overlap": 400,
            "separators": ["\n## ", "\n### ", "\n#### ", "\n\n", "\n", ". ", " ", ""]
        },
        ContentType.CODE: {
            "chunk_size": 700,
            "chunk_overlap": 350,
            "separators": ["\n```", "\n## ", "\n### ", "\n\n", "\n", ". ", " ", ""]
        },
        ContentType.NARRATIVE: {
            "chunk_size": 1500,
            "chunk_overlap": 300,
            "separators": ["\n\n\n", "\n\n", "\n", ". ", " ", ""]
        },
        ContentType.TABULAR: {
            "chunk_size": 600,
            "chunk_overlap": 200,
            "separators": ["\n\n", "\n", ". ", " ", ""]
        },
        ContentType.FAQ: {
            "chunk_size": 500,
            "chunk_overlap": 100,
            "separators": ["\n\n\n", "\n\n", "\nQuestion:", "\nQ:", "\nAnswer:", "\nA:", "\n", ". ", " ", ""]
        },
        ContentType.GENERAL: {
            "chunk_size": 500,
            "chunk_overlap": 50,
            "separators": ["\n\n", "\n", ". ", " ", ""]
        }
    }
    
    def __init__(
        self,
        default_chunk_size: int = 500,
        default_chunk_overlap: int = 50,
        custom_configs: Optional[Dict[ContentType, Dict]] = None
    ):
        self.default_chunk_size = default_chunk_size
        self.default_chunk_overlap = default_chunk_overlap
        
        # Merge custom configs with defaults
        self.configs = self.DEFAULT_CONFIGS.copy()
        if custom_configs:
            for content_type, config in custom_configs.items():
                if content_type in self.configs:
                    self.configs[content_type].update(config)
                else:
                    self.configs[content_type] = config
        
        # Initialize splitters
        self._init_splitters()
        
        # ============================================================
        # VERIFICATION LOG: Print initialization status
        # ============================================================
        init_msg = (
            f"\n"
            f"╔══════════════════════════════════════════════════════════════╗\n"
            f"║  CONTENT-AWARE CHUNKER INITIALIZED                           ║\n"
            f"╠══════════════════════════════════════════════════════════════╣\n"
            f"║  LangChain Available: {'YES ✅' if LANGCHAIN_AVAILABLE else 'NO ❌ (using fallback)':40}║\n"
            f"║  LangChain Version:   {LANGCHAIN_VERSION:40}║\n"
            f"║  Default Chunk Size:  {str(default_chunk_size):40}║\n"
            f"║  Default Overlap:     {str(default_chunk_overlap):40}║\n"
            f"╚══════════════════════════════════════════════════════════════╝\n"
        )
        print(init_msg)
        logger.info(init_msg)
    
    def _init_splitters(self):
        """Initialize text splitters for each content type."""
        self.splitters: Dict[ContentType, Any] = {}
        
        if LANGCHAIN_AVAILABLE:
            for content_type, config in self.configs.items():
                self.splitters[content_type] = RecursiveCharacterTextSplitter(
                    chunk_size=config["chunk_size"],
                    chunk_overlap=config["chunk_overlap"],
                    separators=config["separators"],
                    length_function=len
                )
            
            # Also create markdown header splitter
            self.markdown_header_splitter = MarkdownHeaderTextSplitter(
                headers_to_split_on=[
                    ("#", "header_1"),
                    ("##", "header_2"),
                    ("###", "header_3"),
                    ("####", "header_4"),
                ]
            )
        else:
            self.markdown_header_splitter = None
    
    def get_status(self) -> Dict[str, Any]:
        """
        Get the status of the chunker for verification.
        Call this to check if content-aware chunking is working.
        """
        return {
            "chunker_type": "ContentAwareChunker",
            "langchain_available": LANGCHAIN_AVAILABLE,
            "langchain_version": LANGCHAIN_VERSION,
            "content_types_supported": [ct.value for ct in ContentType],
            "configs": {
                ct.value: {
                    "chunk_size": cfg["chunk_size"],
                    "chunk_overlap": cfg["chunk_overlap"]
                }
                for ct, cfg in self.configs.items()
            },
            "status": "ACTIVE ✅" if LANGCHAIN_AVAILABLE else "FALLBACK MODE ⚠️"
        }
    
    def detect_content_type(self, text: str, file_type: Optional[str] = None) -> ContentType:
        """Detect the content type based on text analysis and file type hint."""
        # Use file type as primary hint
        if file_type:
            file_type = file_type.lower()
            if file_type in ['.csv', '.xlsx', '.xls', '.tsv']:
                return ContentType.TABULAR
            elif file_type in ['.py', '.js', '.java', '.c', '.cpp', '.ts', '.go', '.rs']:
                return ContentType.CODE
            elif file_type in ['.md', '.rst', '.adoc']:
                return ContentType.DOCUMENTATION
        
        # Check for FAQ patterns
        if self._is_faq_content(text):
            return ContentType.FAQ
        
        # Content analysis
        lines = text.splitlines()
        
        # Count indicators
        code_block_count = text.count("```")
        markdown_heading_count = sum(1 for line in lines if line.strip().startswith("#"))
        list_count = sum(1 for line in lines if line.lstrip().startswith(("- ", "* ", "1. ", "2. ", "3. ")))
        table_indicators = text.count("\n|") + text.count("\t\t")
        
        # Check for code patterns
        code_patterns = [
            r'def\s+\w+\s*\(',
            r'function\s+\w+\s*\(',
            r'class\s+\w+',
            r'import\s+\w+',
            r'const\s+\w+\s*=',
            r'let\s+\w+\s*=',
        ]
        code_matches = sum(1 for pattern in code_patterns if re.search(pattern, text))
        
        # Calculate scores
        code_score = code_block_count * 2 + code_matches
        docs_score = markdown_heading_count + list_count
        table_score = table_indicators
        
        # Check for narrative style
        sentences = text.split(".")
        paragraphs = text.split("\n\n")
        avg_sentence_length = sum(len(s) for s in sentences) / max(1, len(sentences))
        avg_paragraph_length = sum(len(p) for p in paragraphs) / max(1, len(paragraphs))
        
        # Decision logic
        if code_score > 5:
            return ContentType.CODE
        elif table_score > 5:
            return ContentType.TABULAR
        elif docs_score > 3 and (markdown_heading_count > 2 or list_count > 5):
            return ContentType.DOCUMENTATION
        elif avg_paragraph_length > 300 and avg_sentence_length > 20:
            return ContentType.NARRATIVE
        else:
            return ContentType.GENERAL
    
    def _is_faq_content(self, text: str) -> bool:
        """Check if text appears to be FAQ content."""
        text_lower = text.lower()
        faq_markers = ["question:", "answer:", "q:", "a:", "faq", "frequently asked"]
        marker_count = sum(1 for marker in faq_markers if marker in text_lower)
        qa_pattern = r'(?:^|\n)\s*(?:Q:|Question:|\d+[\.\)]\s*(?:Q:|Question:))'
        qa_matches = len(re.findall(qa_pattern, text, re.IGNORECASE))
        return marker_count >= 2 or qa_matches >= 3
    
    def chunk_text(
        self,
        text: str,
        content_type: Optional[ContentType] = None,
        file_type: Optional[str] = None,
        preserve_structure: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Chunk text based on content type.
        """
        if not text or not text.strip():
            return []
        
        # Detect content type if not provided
        if content_type is None:
            content_type = self.detect_content_type(text, file_type)
        
        # Get config for this content type
        config = self.configs.get(content_type, self.configs[ContentType.GENERAL])
        
        # ============================================================
        # VERIFICATION LOG: Print chunking info
        # ============================================================
        chunk_start_msg = (
            f"\n📄 CONTENT-AWARE CHUNKING STARTED\n"
            f"   ├── Content Type: {content_type.value}\n"
            f"   ├── File Type Hint: {file_type or 'none'}\n"
            f"   ├── Chunk Size: {config['chunk_size']} chars\n"
            f"   ├── Chunk Overlap: {config['chunk_overlap']} chars\n"
            f"   ├── Text Length: {len(text)} chars\n"
            f"   └── Using LangChain: {'YES ✅' if LANGCHAIN_AVAILABLE else 'NO (fallback) ⚠️'}"
        )
        print(chunk_start_msg)
        logger.info(chunk_start_msg)
        
        # Get appropriate splitter
        if LANGCHAIN_AVAILABLE:
            chunks = self._chunk_with_langchain(text, content_type, preserve_structure)
        else:
            chunks = self._chunk_fallback(text, content_type)
        
        # Build chunk objects with metadata
        chunk_objects = []
        chunk_type_counts = {}
        
        for idx, chunk_text in enumerate(chunks):
            chunk_type = self._classify_chunk_type(chunk_text)
            chunk_type_counts[chunk_type] = chunk_type_counts.get(chunk_type, 0) + 1
            
            chunk_obj = {
                "chunk_index": idx,
                "content": chunk_text,
                "content_type": content_type.value,
                "metadata": {
                    "char_count": len(chunk_text),
                    "word_count": len(chunk_text.split()),
                    "has_code": "```" in chunk_text or self._has_code_patterns(chunk_text),
                    "has_list": bool(re.search(r'^\s*[-*\d]+[\.\)]\s', chunk_text, re.MULTILINE)),
                    "has_table": "|" in chunk_text and chunk_text.count("|") > 3,
                    "has_heading": bool(re.match(r'^#+\s', chunk_text, re.MULTILINE)),
                    "has_steps": bool(re.search(r'^\s*\d+[\.\)]\s', chunk_text, re.MULTILINE)),
                    "chunk_type": chunk_type,
                    # ADD marker so you can verify in database
                    "chunker_version": "content_aware_v1",
                    "langchain_used": LANGCHAIN_AVAILABLE
                }
            }
            chunk_objects.append(chunk_obj)
        
        # ============================================================
        # VERIFICATION LOG: Print chunking results
        # ============================================================
        chunk_end_msg = (
            f"\n✅ CONTENT-AWARE CHUNKING COMPLETE\n"
            f"   ├── Total Chunks: {len(chunk_objects)}\n"
            f"   ├── Chunk Types: {chunk_type_counts}\n"
            f"   ├── Avg Chunk Size: {sum(c['metadata']['char_count'] for c in chunk_objects) // max(len(chunk_objects), 1)} chars\n"
            f"   └── Chunker Version: content_aware_v1 (LangChain={'YES' if LANGCHAIN_AVAILABLE else 'NO'})"
        )
        print(chunk_end_msg)
        logger.info(chunk_end_msg)
        
        return chunk_objects
    
    def _chunk_with_langchain(
        self,
        text: str,
        content_type: ContentType,
        preserve_structure: bool
    ) -> List[str]:
        """Chunk using LangChain splitters."""
        # Pre-process to protect semantic boundaries
        text = self._preprocess_for_semantic_boundaries(text)

        splitter = self.splitters.get(content_type, self.splitters[ContentType.GENERAL])
            
        # For documentation with markdown, use header splitting first
        if preserve_structure and content_type == ContentType.DOCUMENTATION and self.markdown_header_splitter:
            try:
                header_splits = self.markdown_header_splitter.split_text(text)
                
                all_chunks = []
                for split in header_splits:
                    header_context = ""
                    if hasattr(split, 'metadata') and split.metadata:
                        headers = [f"{k}: {v}" for k, v in split.metadata.items() if v]
                        if headers:
                            header_context = " > ".join(headers) + "\n\n"
                    
                    content = split.page_content if hasattr(split, 'page_content') else str(split)
                    augmented_content = header_context + content
                    
                    if len(augmented_content) > splitter._chunk_size:
                        section_chunks = splitter.split_text(augmented_content)
                        all_chunks.extend(section_chunks)
                    else:
                        all_chunks.append(augmented_content)
                
                return all_chunks
            except Exception as e:
                logger.warning(f"Markdown header splitting failed: {e}, using standard splitting")
        
        return splitter.split_text(text)
    
    def _chunk_fallback(self, text: str, content_type: ContentType) -> List[str]:
        """Fallback chunking without LangChain."""
        config = self.configs.get(content_type, self.configs[ContentType.GENERAL])
        chunk_size = config["chunk_size"]
        chunk_overlap = config["chunk_overlap"]
        separators = config["separators"]
        
        chunks = []
        
        for separator in separators:
            if separator in text:
                parts = text.split(separator)
                break
        else:
            parts = [text]
        
        current_chunk = ""
        
        for part in parts:
            part = part.strip()
            if not part:
                continue
            
            if len(current_chunk) + len(part) > chunk_size:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                    overlap_text = current_chunk[-chunk_overlap:] if len(current_chunk) > chunk_overlap else ""
                    current_chunk = overlap_text + " " + part
                else:
                    for i in range(0, len(part), chunk_size - chunk_overlap):
                        chunk = part[i:i + chunk_size]
                        if chunk.strip():
                            chunks.append(chunk.strip())
                    current_chunk = ""
            else:
                current_chunk = (current_chunk + " " + part).strip()
        
        if current_chunk.strip():
            chunks.append(current_chunk.strip())
        
        return chunks
    
    def _has_code_patterns(self, text: str) -> bool:
        """Check if text contains code patterns."""
        code_patterns = [
            r'def\s+\w+\s*\(',
            r'function\s+\w+',
            r'class\s+\w+',
            r'import\s+\w+',
            r'from\s+\w+\s+import',
            r'const\s+\w+\s*=',
        ]
        return any(re.search(pattern, text) for pattern in code_patterns)
    
    def _classify_chunk_type(self, chunk: str) -> str:
        """Classify the primary type of a chunk."""
        if re.search(r'^\s*\d+[\.\)]\s+\w+', chunk, re.MULTILINE):
            return "instructions"
        if re.match(r'^#+\s', chunk) or re.match(r'^\[Page \d+\]', chunk):
            return "heading"
        if re.search(r'(?:^|\n)\s*(?:Q:|Question:|A:|Answer:)', chunk, re.IGNORECASE):
            return "faq"
        if "|" in chunk and chunk.count("|") > 3:
            return "table"
        if "```" in chunk or self._has_code_patterns(chunk):
            return "code"
        if re.search(r'^\s*[-*]\s+\w+', chunk, re.MULTILINE):
            return "list"
        return "text"
    
    def chunk_for_faq(self, text: str) -> List[Dict[str, Any]]:
        """Special chunking for FAQ content that keeps Q&A pairs together."""
        chunks = []
        
        qa_pattern = r'(?:Q(?:uestion)?[:.]?\s*)(.*?)(?:A(?:nswer)?[:.]?\s*)(.*?)(?=(?:Q(?:uestion)?[:.]?\s)|$)'
        matches = re.findall(qa_pattern, text, re.DOTALL | re.IGNORECASE)
        
        if matches:
            for idx, (question, answer) in enumerate(matches):
                question = question.strip()
                answer = answer.strip()
                
                if question and answer:
                    chunk_text = f"Q: {question}\n\nA: {answer}"
                    chunks.append({
                        "chunk_index": idx,
                        "content": chunk_text,
                        "content_type": ContentType.FAQ.value,
                        "metadata": {
                            "question": question,
                            "answer": answer[:200],
                            "chunk_type": "faq",
                            "char_count": len(chunk_text),
                            "word_count": len(chunk_text.split()),
                            "chunker_version": "content_aware_v1",
                            "langchain_used": LANGCHAIN_AVAILABLE
                        }
                    })
        
        if not chunks:
            return self.chunk_text(text, ContentType.FAQ)
        
        return chunks
    
    def create_hierarchical_chunks(
        self,
        text: str,
        content_type: Optional[ContentType] = None
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Create parent and child chunks for hierarchical representation."""
        if content_type is None:
            content_type = self.detect_content_type(text)
        
        config = self.configs.get(content_type, self.configs[ContentType.GENERAL])
        
        parent_chunks = self.chunk_text(text, content_type)
        
        child_config = {
            "chunk_size": config["chunk_size"] // 3,
            "chunk_overlap": config["chunk_overlap"] // 2,
            "separators": config["separators"]
        }
        
        child_chunks = []
        for parent_idx, parent in enumerate(parent_chunks):
            if LANGCHAIN_AVAILABLE:
                child_splitter = RecursiveCharacterTextSplitter(
                    chunk_size=child_config["chunk_size"],
                    chunk_overlap=child_config["chunk_overlap"],
                    separators=child_config["separators"]
                )
                children = child_splitter.split_text(parent["content"])
            else:
                children = self._chunk_fallback(parent["content"], ContentType.GENERAL)
            
            for child_idx, child_text in enumerate(children):
                child_chunks.append({
                    "chunk_index": len(child_chunks),
                    "parent_index": parent_idx,
                    "content": child_text,
                    "content_type": content_type.value,
                    "metadata": {
                        "is_child": True,
                        "parent_chunk_index": parent_idx,
                        "char_count": len(child_text),
                        "word_count": len(child_text.split()),
                        "chunker_version": "content_aware_v1",
                        "langchain_used": LANGCHAIN_AVAILABLE
                    }
                })
        
        return {
            "parent_chunks": parent_chunks,
            "child_chunks": child_chunks
        }

    def _preprocess_for_semantic_boundaries(self, text: str) -> str:
        """
        Add special markers before chunking to prevent splitting mid-list or mid-section.
        This is a generic approach that works for any content.
        """
        lines = text.split('\n')
        processed_lines = []
        in_list = False
        list_start_idx = -1
        
        for i, line in enumerate(lines):
            stripped = line.strip()
            
            # Detect list items (bullet or numbered)
            is_list_item = bool(re.match(r'^[\*\-•]\s+|^\d+[\.\)]\s+|^[a-z][\.\)]\s+', stripped, re.IGNORECASE))
            
            # Detect section headers (markdown style)
            is_header = stripped.startswith('#') or (stripped and stripped == stripped.upper() and len(stripped) > 3 and not is_list_item)
            
            if is_header and not in_list:
                # Add double newline before headers to ensure they become split points
                processed_lines.append('\n\n' + line)
            elif is_list_item:
                if not in_list:
                    in_list = True
                    list_start_idx = len(processed_lines)
                processed_lines.append(line)
            else:
                if in_list and stripped == '':
                    # End of list - don't add extra break yet
                    in_list = False
                processed_lines.append(line)
        
        return '\n'.join(processed_lines)

# Singleton instance
_content_aware_chunker: Optional[ContentAwareChunker] = None


def get_content_aware_chunker(
    default_chunk_size: int = 500,
    default_chunk_overlap: int = 50
) -> ContentAwareChunker:
    """Get or create the content-aware chunker singleton."""
    global _content_aware_chunker
    
    if _content_aware_chunker is None:
        _content_aware_chunker = ContentAwareChunker(
            default_chunk_size=default_chunk_size,
            default_chunk_overlap=default_chunk_overlap
        )
    
    return _content_aware_chunker


def get_chunker_status() -> Dict[str, Any]:
    """
    Get chunker status for verification.
    
    Usage in API endpoint:
        from app.utils.content_aware_chunker import get_chunker_status
        return get_chunker_status()
    """
    chunker = get_content_aware_chunker()
    return chunker.get_status()