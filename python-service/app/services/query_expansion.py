"""
AIVA RAG Enhancement: Query Expansion Service (FIXED)
======================================================
Rule-based query expansion for better retrieval.

FIXES:
- No duplicate words in variations
- No typos in output
- Smarter synonym replacement
- Validation of all outputs
"""

import re
import logging
from typing import List, Set, Dict, Optional

logger = logging.getLogger(__name__)


class QueryExpansionService:
    """
    Expands queries with synonyms, translations, and variations.
    All rule-based - no LLM calls needed.
    """
    
    def __init__(self):
        # Roman Urdu to English translations (common phrases)
        self.roman_urdu_translations: Dict[str, List[str]] = {
            # Questions
            "kya hai": ["what is", "what are"],
            "kaise": ["how to", "how"],
            "kab": ["when"],
            "kahan": ["where"],
            "kyun": ["why"],
            "kitna": ["how much", "how many"],
            "kitne": ["how much", "how many"],
            "kaun": ["who"],
            
            # Common phrases
            "mujhe batao": ["tell me", "explain"],
            "kaise kare": ["how to do", "how to"],
            "kaise karein": ["how to do", "how to"],
            "kya karna hai": ["what to do"],
            "kaise hota hai": ["how does it work"],
            
            # Common words
            "fee": ["fee", "fees", "cost", "price", "charges"],
            "paisa": ["money", "payment", "amount"],
            "waqt": ["time", "timing"],
            "jagah": ["place", "location"],
            "cheez": ["thing", "item"],
            "kaam": ["work", "task", "job"],
            "madad": ["help", "assistance"],
        }
        
        # English term variations (synonyms)
        self.term_variations: Dict[str, List[str]] = {
            # Cost related
            "fee": ["cost", "price", "charges"],
            "fees": ["costs", "prices", "charges"],
            "cost": ["fee", "price", "expense"],
            "price": ["cost", "fee", "rate"],
            "charges": ["fees", "costs"],
            "payment": ["pay", "amount"],
            
            # Action words
            "create": ["make", "generate", "add", "new"],
            "make": ["create", "generate", "build"],
            "add": ["create", "insert", "new"],
            "delete": ["remove", "cancel"],
            "remove": ["delete", "cancel"],
            "update": ["edit", "modify", "change"],
            "edit": ["update", "modify", "change"],
            "view": ["see", "show", "display", "check"],
            "show": ["view", "display", "list"],
            "find": ["search", "locate", "look for"],
            "search": ["find", "look for", "locate"],
            "get": ["retrieve", "fetch", "obtain"],
            
            # Business terms
            "order": ["purchase", "request"],
            "purchase": ["buy", "order", "procurement"],
            "invoice": ["bill", "receipt"],
            "customer": ["client", "buyer"],
            "supplier": ["vendor", "provider"],
            "product": ["item", "goods"],
            "inventory": ["stock", "items"],
            "stock": ["inventory", "goods"],
            "report": ["statement", "summary"],
            
            # Process words
            "process": ["procedure", "steps", "method", "way"],
            "procedure": ["process", "steps", "method"],
            "steps": ["process", "procedure", "instructions"],
            "method": ["way", "process", "approach"],
            "way": ["method", "how", "process"],
            
            # Question words
            "how": ["way to", "steps to", "process to"],
        }
        
        # Stop words to ignore
        self.stop_words = {
            "a", "an", "the", "is", "are", "was", "were", "be", "been",
            "to", "of", "in", "for", "on", "with", "at", "by", "from",
            "do", "does", "did", "can", "could", "would", "should",
            "i", "me", "my", "we", "our", "you", "your", "it", "its",
            "this", "that", "these", "those", "what", "which", "who",
            "will", "shall", "may", "might", "must", "need", "have", "has"
        }
        
        logger.info("QueryExpansionService initialized")
    
    def expand(self, query: str, max_variations: int = 5) -> List[str]:
        """
        Generate query variations for improved retrieval.
        
        Args:
            query: The original query string
            max_variations: Maximum number of variations to return
            
        Returns:
            List of query variations (always includes original first)
        """
        if not query or not query.strip():
            return [query] if query else []
        
        variations: Set[str] = set()
        
        # Normalize query
        original = query.strip()
        normalized = self._normalize_query(original)
        
        # Always include normalized version
        variations.add(normalized)
        
        # 1. Check for Roman Urdu phrases and translate
        for urdu_phrase, english_translations in self.roman_urdu_translations.items():
            if urdu_phrase in normalized:
                for translation in english_translations[:2]:  # Limit translations
                    # Replace the phrase
                    replaced = normalized.replace(urdu_phrase, translation)
                    if self._is_valid_variation(replaced):
                        variations.add(replaced.strip())
        
        # 2. Add synonym variations (one word at a time)
        tokens = normalized.split()
        for i, token in enumerate(tokens):
            clean_token = re.sub(r'[^\w]', '', token.lower())
            
            if clean_token in self.term_variations:
                # Only use first 2 synonyms to avoid explosion
                for synonym in self.term_variations[clean_token][:2]:
                    new_tokens = tokens.copy()
                    new_tokens[i] = synonym
                    new_query = ' '.join(new_tokens)
                    if self._is_valid_variation(new_query):
                        variations.add(new_query)
        
        # 3. Generate a simplified "keyword" version
        keywords = self._extract_keywords(normalized)
        if keywords and len(keywords) >= 2:
            keyword_query = ' '.join(keywords)
            if self._is_valid_variation(keyword_query) and keyword_query != normalized:
                variations.add(keyword_query)
        
        # Convert to list and ensure original is first
        result = list(variations)
        
        # Remove original if present, then add at front
        if original in result:
            result.remove(original)
        if normalized in result and normalized != original:
            result.remove(normalized)
        
        # Put original first, then normalized (if different), then others
        final = [original]
        if normalized != original:
            final.append(normalized)
        
        # Add other variations (up to max)
        for v in result:
            if len(final) >= max_variations:
                break
            if v not in final:
                final.append(v)
        
        logger.info(f"Query expansion: '{original[:50]}' -> {len(final)} variations")
        if len(final) > 1:
            logger.debug(f"Variations: {final}")
        
        return final
    
    def _normalize_query(self, query: str) -> str:
        """Normalize query: lowercase, clean punctuation, remove extra spaces."""
        # Convert to lowercase
        query = query.lower()
        
        # Remove question marks and extra punctuation (keep basic ones)
        query = re.sub(r'[?!]+', '', query)
        
        # Remove extra whitespace
        query = re.sub(r'\s+', ' ', query)
        
        return query.strip()
    
    def _extract_keywords(self, query: str) -> List[str]:
        """Extract meaningful keywords from query."""
        tokens = query.split()
        keywords = []
        
        for token in tokens:
            # Clean the token
            clean = re.sub(r'[^\w]', '', token.lower())
            
            # Skip stop words and very short words
            if clean and clean not in self.stop_words and len(clean) > 2:
                keywords.append(clean)
        
        return keywords
    
    def _is_valid_variation(self, query: str) -> bool:
        """
        Validate that a query variation is valid.
        Checks for duplicates, minimum length, etc.
        """
        if not query or len(query.strip()) < 3:
            return False
        
        # Check for duplicate consecutive words
        words = query.lower().split()
        for i in range(len(words) - 1):
            if words[i] == words[i + 1]:
                return False
        
        # Check minimum word count
        if len(words) < 2:
            return False
        
        return True
    
    def get_search_terms(self, query: str) -> List[str]:
        """
        Get expanded search terms for BM25/keyword search.
        Returns individual terms plus synonyms.
        """
        terms: Set[str] = set()
        
        normalized = self._normalize_query(query)
        tokens = normalized.split()
        
        for token in tokens:
            clean = re.sub(r'[^\w]', '', token.lower())
            if clean and clean not in self.stop_words and len(clean) > 2:
                terms.add(clean)
                
                # Add synonyms
                if clean in self.term_variations:
                    for synonym in self.term_variations[clean][:2]:
                        terms.add(synonym)
        
        return list(terms)


# Singleton instance
_query_expansion_service: Optional[QueryExpansionService] = None


def get_query_expansion_service() -> QueryExpansionService:
    """Get or create the query expansion service singleton."""
    global _query_expansion_service
    
    if _query_expansion_service is None:
        _query_expansion_service = QueryExpansionService()
    
    return _query_expansion_service