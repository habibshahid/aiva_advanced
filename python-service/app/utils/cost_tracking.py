"""
Cost Tracking Utility
Calculate costs for document processing and searches
"""

from typing import Dict, Any


class CostTracker:
    """Track and calculate costs"""
    
    def __init__(self):
        # OpenAI pricing (as of 2024)
        self.embedding_costs = {
            "text-embedding-3-small": 0.00002 / 1000,  # $0.00002 per 1K tokens
            "text-embedding-3-large": 0.00013 / 1000,  # $0.00013 per 1K tokens
            "text-embedding-ada-002": 0.0001 / 1000    # $0.0001 per 1K tokens
        }
        
        # Processing costs (internal)
        self.processing_costs = {
            "pdf_page": 0.0001,      # Per page
            "image_processing": 0.001, # Per image
            "base_processing": 0.001   # Base cost
        }
        
        # Profit margin
        self.profit_margin = 0.20  # 20%
    
    def calculate_document_processing_cost(self, result: Any) -> float:
        """
        Calculate cost for document processing
        """
        cost = 0.0
        
        # Base processing cost
        cost += self.processing_costs["base_processing"]
        
        # Page processing cost
        if hasattr(result, "processing_results"):
            pages = result.processing_results.total_pages
            cost += pages * self.processing_costs["pdf_page"]
            
            # Image processing cost
            images = result.processing_results.extracted_images
            cost += images * self.processing_costs["image_processing"]
        
        # Embedding cost
        if hasattr(result, "embeddings"):
            tokens = result.embeddings.total_tokens_embedded
            model = result.embeddings.embedding_model
            
            token_cost = self.embedding_costs.get(model, 0.00002 / 1000)
            cost += tokens * token_cost
        
        # Add profit margin
        cost_with_profit = cost * (1 + self.profit_margin)
        
        return round(cost_with_profit, 6)
    
    def calculate_search_cost(
        self,
        query_tokens: int,
        search_type: str = "text"
    ) -> float:
        """
        Calculate cost for search operation
        """
        cost = 0.0
        
        # Base search cost
        cost += 0.0005
        
        # Embedding cost for query
        if query_tokens > 0:
            model = "text-embedding-3-small"
            token_cost = self.embedding_costs.get(model, 0.00002 / 1000)
            cost += query_tokens * token_cost
        
        # Image search additional cost
        if search_type == "image" or search_type == "hybrid":
            cost += 0.001
        
        # Add profit margin
        cost_with_profit = cost * (1 + self.profit_margin)
        
        return round(cost_with_profit, 6)
    
    def calculate_embedding_cost(self, tokens: int, model: str) -> float:
        """
        Calculate cost for embedding generation
        """
        token_cost = self.embedding_costs.get(model, 0.00002 / 1000)
        cost = tokens * token_cost
        
        # Add profit margin
        cost_with_profit = cost * (1 + self.profit_margin)
        
        return round(cost_with_profit, 6)