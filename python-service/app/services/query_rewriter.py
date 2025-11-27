"""
Query Rewriter Service for AIVA RAG
====================================
File: python-service/app/services/query_rewriter.py

This service rewrites user queries using conversation context
to improve retrieval accuracy for multi-turn conversations.

Features:
- Resolves pronouns and references
- Expands ambiguous queries
- Uses conversation history for context

Author: AIVA Team
Version: 1.0.0
"""

import logging
import re
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


class QueryRewriter:
    """
    Query rewriting service using LLM for context-aware query improvement.
    
    This helps with:
    - Pronoun resolution: "What about it?" -> "What is the return policy?"
    - Context expansion: "price?" -> "What is the price of the iPhone 15?"
    - Ambiguity resolution: "the other one" -> "the blue variant"
    
    Usage:
        rewriter = QueryRewriter()
        rewritten = await rewriter.rewrite(
            query="How much is it?",
            conversation_history=[
                {"role": "user", "content": "Tell me about iPhone 15"},
                {"role": "assistant", "content": "iPhone 15 is Apple's latest..."}
            ]
        )
        # Returns: "How much does the iPhone 15 cost?"
    """
    
    def __init__(self, model: str = "gpt-4o-mini"):
        """
        Initialize query rewriter.
        
        Args:
            model: OpenAI model to use
        """
        self.model = model
        self._client = None
        logger.info(f"QueryRewriter initialized with model: {model}")
    
    @property
    def client(self):
        """Lazy load OpenAI client"""
        if self._client is None:
            from openai import OpenAI
            from app.config import settings
            self._client = OpenAI(api_key=settings.OPENAI_API_KEY)
        return self._client
    
    async def rewrite(
        self,
        query: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        max_history_turns: int = 5
    ) -> str:
        """
        Rewrite query using conversation context.
        
        Args:
            query: Current user query
            conversation_history: List of previous messages with 'role' and 'content'
            max_history_turns: Maximum conversation turns to consider
            
        Returns:
            Rewritten query (or original if no rewrite needed)
        """
        # Quick checks - skip rewriting for simple queries
        if self._is_standalone_query(query):
            logger.debug(f"Query is standalone, no rewrite needed: {query[:50]}")
            return query
        
        if not conversation_history:
            logger.debug("No conversation history, returning original query")
            return query
        
        # Limit history
        recent_history = conversation_history[-max_history_turns * 2:]  # 2 messages per turn
        
        if not recent_history:
            return query
        
        try:
            rewritten = await self._rewrite_with_llm(query, recent_history)
            
            if rewritten and rewritten != query:
                logger.info(f"Query rewritten: '{query[:30]}...' -> '{rewritten[:50]}...'")
                return rewritten
            
            return query
            
        except Exception as e:
            logger.error(f"Query rewrite error: {e}")
            return query
    
    def _is_standalone_query(self, query: str) -> bool:
        """
        Check if query is likely standalone (doesn't need context).
        
        Returns True for queries that are self-contained.
        """
        query_lower = query.lower().strip()
        
        # Very short queries likely need context
        if len(query_lower.split()) <= 2:
            # But some short queries are fine
            if any(query_lower.startswith(w) for w in ['what is', 'who is', 'where is', 'define']):
                return True
            return False
        
        # Queries with pronouns likely need context
        pronouns = ['it', 'this', 'that', 'they', 'them', 'these', 'those', 'he', 'she', 'his', 'her']
        for pronoun in pronouns:
            if re.search(rf'\b{pronoun}\b', query_lower):
                return False
        
        # References to previous conversation
        references = ['the same', 'the other', 'another', 'above', 'previous', 'mentioned', 'earlier']
        for ref in references:
            if ref in query_lower:
                return False
        
        # Questions that imply continuation
        continuation_phrases = ['what about', 'how about', 'and the', 'also', 'more about']
        for phrase in continuation_phrases:
            if phrase in query_lower:
                return False
        
        # Query with specific nouns is likely standalone
        return True
    
    async def _rewrite_with_llm(
        self,
        query: str,
        history: List[Dict[str, str]]
    ) -> str:
        """
        Use LLM to rewrite query with context.
        """
        # Build context string
        context_parts = []
        for msg in history[-6:]:  # Last 3 turns
            role = msg.get("role", "user")
            content = msg.get("content", "")[:500]  # Truncate long messages
            context_parts.append(f"{role.upper()}: {content}")
        
        context_str = "\n".join(context_parts)
        
        prompt = f"""Given the conversation context below, rewrite the user's latest query to be a complete, standalone question that includes all necessary context.

CONVERSATION CONTEXT:
{context_str}

LATEST QUERY: {query}

RULES:
1. If the query references something from the conversation (like "it", "that", "the product"), replace the reference with the actual subject
2. If the query is already standalone and clear, return it unchanged
3. Keep the rewritten query concise and natural
4. Only return the rewritten query, nothing else
5. Do not add information that wasn't in the original query or context

REWRITTEN QUERY:"""

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=150,
            temperature=0
        )
        
        rewritten = response.choices[0].message.content.strip()
        
        # Clean up response
        rewritten = rewritten.strip('"\'')
        
        # Validate - should not be too different from original length
        if len(rewritten) > len(query) * 3:
            logger.warning("Rewritten query too long, using original")
            return query
        
        return rewritten
    
    async def generate_query_variations(
        self,
        query: str,
        num_variations: int = 3
    ) -> List[str]:
        """
        Generate alternative phrasings of the query using LLM.
        
        Useful for expanding search coverage.
        
        Args:
            query: Original query
            num_variations: Number of variations to generate
            
        Returns:
            List of query variations (including original)
        """
        prompt = f"""Generate {num_variations} alternative ways to phrase this search query.
Each variation should:
- Mean the same thing as the original
- Use different words where possible
- Be a complete, natural question

Original query: {query}

Return ONLY the variations, one per line, numbered 1-{num_variations}:"""

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=200,
                temperature=0.7
            )
            
            content = response.choices[0].message.content.strip()
            
            # Parse variations
            variations = [query]  # Always include original
            for line in content.split('\n'):
                line = line.strip()
                # Remove numbering
                line = re.sub(r'^\d+[\.\)]\s*', '', line)
                if line and line != query and len(line) < 200:
                    variations.append(line)
            
            return variations[:num_variations + 1]
            
        except Exception as e:
            logger.error(f"Query variation generation error: {e}")
            return [query]


class RuleBasedQueryEnhancer:
    """
    Rule-based query enhancement without LLM.
    
    Faster and cheaper than LLM-based rewriting.
    Good for simple enhancements.
    """
    
    def __init__(self):
        # Common abbreviation expansions
        self.abbreviations = {
            "hrs": "hours",
            "hr": "hour",
            "mins": "minutes",
            "min": "minute",
            "appt": "appointment",
            "appts": "appointments",
            "info": "information",
            "pls": "please",
            "asap": "as soon as possible",
            "fyi": "for your information",
            "dob": "date of birth",
            "addr": "address",
            "tel": "telephone",
            "amt": "amount",
            "qty": "quantity",
            "approx": "approximately",
        }
        
        # Question word completions
        self.question_completions = {
            "price": "what is the price of",
            "cost": "what is the cost of",
            "hours": "what are the hours of",
            "timing": "what are the timings for",
            "location": "what is the location of",
            "address": "what is the address of",
            "phone": "what is the phone number for",
            "email": "what is the email for",
        }
        
        logger.info("RuleBasedQueryEnhancer initialized")
    
    def enhance(self, query: str) -> str:
        """
        Enhance query with rule-based improvements.
        
        Args:
            query: Original query
            
        Returns:
            Enhanced query
        """
        enhanced = query.lower().strip()
        
        # Expand abbreviations
        words = enhanced.split()
        enhanced_words = [
            self.abbreviations.get(w, w) for w in words
        ]
        enhanced = ' '.join(enhanced_words)
        
        # Complete single-word queries
        if len(enhanced.split()) == 1 and enhanced in self.question_completions:
            enhanced = self.question_completions[enhanced]
        
        # Add question mark if it looks like a question but doesn't have one
        question_starters = ['what', 'where', 'when', 'who', 'how', 'why', 'which', 'can', 'is', 'are', 'do', 'does']
        if any(enhanced.startswith(q) for q in question_starters) and not enhanced.endswith('?'):
            enhanced = enhanced + '?'
        
        return enhanced


# Singleton instances
_query_rewriter = None
_rule_enhancer = None

def get_query_rewriter(model: str = None) -> QueryRewriter:
    """Get singleton QueryRewriter instance."""
    global _query_rewriter
    if _query_rewriter is None:
        from app.config import settings
        model = model or getattr(settings, 'QUERY_REWRITER_MODEL', 'gpt-4o-mini')
        _query_rewriter = QueryRewriter(model=model)
    return _query_rewriter

def get_rule_enhancer() -> RuleBasedQueryEnhancer:
    """Get singleton RuleBasedQueryEnhancer instance."""
    global _rule_enhancer
    if _rule_enhancer is None:
        _rule_enhancer = RuleBasedQueryEnhancer()
    return _rule_enhancer
