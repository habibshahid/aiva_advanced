"""
Product Search Service
Semantic search for Shopify products using embeddings
"""

import json
import logging
import re
from typing import List, Dict, Any, Optional
import numpy as np
import redis
import mysql.connector

from app.config import settings
from app.services.embeddings import EmbeddingService

logger = logging.getLogger(__name__)


class ProductSearchService:
    """Search products using vector similarity"""
    
    def __init__(self, kb_id: str = None):
        self.kb_id = kb_id  # ← ADD THIS
        self._shop_domain_cache = None  # ← ADD THIS
        self.redis_client = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            password=settings.REDIS_PASSWORD,
            db=settings.REDIS_DB,
            decode_responses=True
        )
        self.embedding_service = EmbeddingService()
        self.prefix = "vector:"
    
    def _get_mysql_connection(self):
        """Get MySQL connection"""
        return mysql.connector.connect(
            host=settings.DB_HOST,
            port=settings.DB_PORT,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD,
            database=settings.DB_NAME
        )
    
    async def search_products(
        self,
        kb_id: str,
        query_embedding: np.ndarray,
        top_k: int = 5,
        filters: Dict[str, Any] = None
    ) -> List[Dict[str, Any]]:
        """
        Search products by semantic similarity
        
        Args:
            kb_id: Knowledge base ID
            query_embedding: Query embedding vector
            top_k: Number of results to return
            filters: Optional filters (price range, vendor, etc.)
            
        Returns:
            List of product results with similarity scores
        """
        try:
            self.kb_id = kb_id
            
            # Get all product vectors for this KB
            pattern = f"{self.prefix}{kb_id}:product:*"
            product_keys = self.redis_client.keys(pattern)
            
            if not product_keys:
                logger.info(f"No product vectors found for KB {kb_id}")
                return []
            
            logger.info(f"Searching {len(product_keys)} products in KB {kb_id}")
            
            # Calculate similarities
            similarities = []
            
            for key in product_keys:
                try:
                    product_data = json.loads(self.redis_client.get(key))
                    stored_embedding = np.array(product_data["embedding"])
                    
                    # Cosine similarity
                    similarity = self._cosine_similarity(query_embedding, stored_embedding)
                    
                    similarities.append({
                        "product_id": product_data["product_id"],
                        "shopify_product_id": product_data.get("shopify_product_id"),
                        "title": product_data["title"],
                        "description": product_data.get("description"),
                        "price": product_data.get("price"),
                        "compare_at_price": product_data.get("compare_at_price"),
                        "vendor": product_data.get("vendor"),
                        "product_type": product_data.get("product_type"),
                        "tags": product_data.get("tags", []),
                        # NEW: Include purchase URL and inventory from vector
                        "handle": product_data.get("handle"),
                        "shop_domain": product_data.get("shop_domain"),
                        "purchase_url": product_data.get("purchase_url"),
                        "total_inventory": product_data.get("total_inventory", 0),
                        "in_stock": product_data.get("in_stock", False),
                        "variants": product_data.get("variants", []),
                        "available_variants": product_data.get("available_variants", ""),
                        "score": float(similarity)
                    })
                    
                except Exception as e:
                    logger.error(f"Error processing product {key}: {e}")
                    continue
            
            # Apply filters if provided
            if filters:
                similarities = self._apply_filters(similarities, filters)
            
            # Sort by similarity and get top K
            similarities.sort(key=lambda x: x["score"], reverse=True)
            top_results = similarities[:top_k]
            
            # Enrich with full product data from MySQL
            enriched_results = await self._enrich_products(top_results)
            
            logger.info(f"Found {len(enriched_results)} matching products")
            return enriched_results
            
        except Exception as e:
            logger.error(f"Error searching products: {e}")
            return []
    
    def _cosine_similarity(self, vec1: np.ndarray, vec2: np.ndarray) -> float:
        """Calculate cosine similarity"""
        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return dot_product / (norm1 * norm2)
    
    def _apply_filters(
        self,
        results: List[Dict[str, Any]],
        filters: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Apply filters to results"""
        filtered = results
        
        # Price range filter
        if "min_price" in filters:
            filtered = [r for r in filtered if float(r.get("price", 0)) >= float(filters["min_price"])]
        
        if "max_price" in filters:
            filtered = [r for r in filtered if float(r.get("price", 0)) <= float(filters["max_price"])]
        
        # Vendor filter
        if "vendor" in filters:
            filtered = [r for r in filtered if r.get("vendor") == filters["vendor"]]
        
        # Product type filter
        if "product_type" in filters:
            filtered = [r for r in filtered if r.get("product_type") == filters["product_type"]]
        
        if filters.get("in_stock_only", False):
            filtered = [r for r in filtered if r.get("total_inventory", 0) > 0]
        
        # NEW: Has variants filter
        if filters.get("has_variants", False):
            filtered = [r for r in filtered if len(r.get("variants", [])) > 0]
            
        return filtered
    
    def _get_shop_domain(self) -> Optional[str]:
        """
        Get Shopify store domain for this knowledge base
        
        Returns:
            Shop domain or None
        """
        # Return cached value if available
        if self._shop_domain_cache is not None:
            return self._shop_domain_cache
        
        try:
            conn = self._get_mysql_connection()
            cursor = conn.cursor(dictionary=True)
            
            try:
                cursor.execute(
                    "SELECT shop_domain FROM yovo_tbl_aiva_shopify_stores WHERE kb_id = %s LIMIT 1",
                    (self.kb_id,)
                )
                
                result = cursor.fetchone()
                
                if result and result.get('shop_domain'):
                    self._shop_domain_cache = result['shop_domain']
                    logger.info(f"Found shop domain for KB {self.kb_id}: {self._shop_domain_cache}")
                    return self._shop_domain_cache
                
                logger.warning(f"No shop domain found for KB {self.kb_id}")
                return None
                
            finally:
                cursor.close()
                conn.close()
                
        except Exception as e:
            logger.error(f"Error fetching shop domain: {e}")
            return None
    
    def _generate_purchase_url(self, product: Dict[str, Any], shop_domain: Optional[str]) -> Optional[str]:
        """
        Generate Shopify purchase URL for a product
        
        Args:
            product: Product dict with name and metadata
            shop_domain: Shop domain (e.g., 'your-store.myshopify.com')
            
        Returns:
            Purchase URL or None
        """
        if not shop_domain:
            return None
        
        # Try to get product_handle from metadata
        metadata = product.get('metadata', {})
        product_handle = metadata.get('product_handle')
        
        if product_handle:
            return f"https://{shop_domain}/products/{product_handle}"
        
        # Generate handle from product name
        product_name = product.get('title')
        if product_name:
            # Convert to Shopify-style handle
            handle = product_name.lower()
            handle = re.sub(r'[^a-z0-9\s-]', '', handle)  # Remove special chars
            handle = re.sub(r'\s+', '-', handle)           # Replace spaces with hyphens
            handle = re.sub(r'-+', '-', handle)            # Remove multiple hyphens
            handle = handle.strip('-')                     # Remove leading/trailing hyphens
            
            if handle:
                return f"https://{shop_domain}/products/{handle}"
        
        return None
        
    async def _enrich_products(
        self,
        results: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Enrich results with full product data from database"""
        if not results:
            return []
        
        conn = self._get_mysql_connection()
        cursor = conn.cursor(dictionary=True)
        
        try:
            enriched = []
            shop_domain = self._get_shop_domain()
            
            for result in results:
                product_id = result["product_id"]
                
                # Query full product data with variants
                cursor.execute("""
                    SELECT p.*, s.shop_domain,
                           JSON_UNQUOTE(JSON_EXTRACT(p.shopify_metadata, '$.handle')) as product_handle
                    FROM yovo_tbl_aiva_products p
                    LEFT JOIN yovo_tbl_aiva_shopify_stores s ON p.shopify_store_id = s.id
                    WHERE p.id = %s
                """, (product_id,))
                
                db_product = cursor.fetchone()
                
                if not db_product:
                    continue
                
                # Get variants from database for complete inventory picture
                cursor.execute("""
                    SELECT 
                        shopify_variant_id as variant_id,
                        title,
                        sku,
                        price,
                        compare_at_price,
                        inventory_quantity,
                        option1,
                        option2,
                        option3,
                        available
                    FROM yovo_tbl_aiva_product_variants
                    WHERE product_id = %s
                    ORDER BY price ASC
                """, (product_id,))
                
                variants = cursor.fetchall()
                
                # Build variants list with availability
                variants_list = []
                available_sizes = []
                out_of_stock_sizes = []
                
                for v in variants:
                    variant_data = {
                        "variant_id": v["variant_id"],
                        "title": v["title"],
                        "sku": v["sku"],
                        "price": float(v["price"]) if v["price"] else None,
                        "compare_at_price": float(v["compare_at_price"]) if v["compare_at_price"] else None,
                        "inventory_quantity": v["inventory_quantity"] or 0,
                        "available": (v["inventory_quantity"] or 0) > 0,
                        "option1": v["option1"],
                        "option2": v["option2"],
                        "option3": v["option3"]
                    }
                    variants_list.append(variant_data)
                    
                    variant_name = v["title"] if v["title"] and v["title"] != "Default Title" else None
                    if variant_name:
                        if variant_data["available"]:
                            available_sizes.append(variant_name)
                        else:
                            out_of_stock_sizes.append(variant_name)
                
                # Use handle from vector data or DB
                handle = result.get("handle") or db_product.get("product_handle")
                product_shop_domain = result.get("shop_domain") or db_product.get("shop_domain") or shop_domain
                
                # Generate purchase URL - prioritize from vector, then generate
                purchase_url = result.get("purchase_url")
                if not purchase_url and handle and product_shop_domain:
                    purchase_url = f"https://{product_shop_domain}/products/{handle}"
                
                # Get image URL
                cursor.execute("""
                    SELECT JSON_UNQUOTE(JSON_EXTRACT(i.metadata, '$.shopify_image_src')) as image_url
                    FROM yovo_tbl_aiva_product_images pi
                    JOIN yovo_tbl_aiva_images i ON pi.image_id = i.id
                    WHERE pi.product_id = %s
                    ORDER BY pi.position ASC
                    LIMIT 1
                """, (product_id,))
                
                image_result = cursor.fetchone()
                image_url = image_result["image_url"] if image_result else None
                
                total_inventory = db_product["total_inventory"] or 0
                
                enriched.append({
                    "product_id": product_id,
                    "shopify_product_id": db_product["shopify_product_id"],
                    "name": db_product["title"],
                    "title": db_product["title"],
                    "description": db_product["description"],
                    "price": float(db_product["price"] or 0),
                    "compare_at_price": float(db_product["compare_at_price"] or 0) if db_product["compare_at_price"] else None,
                    "image_url": image_url,
                    "vendor": db_product["vendor"],
                    "product_type": db_product["product_type"],
                    "tags": json.loads(db_product["tags"]) if db_product["tags"] else [],
                    "status": db_product["status"],
                    "score": result["score"],
                    "similarity_score": result["score"],
                    
                    # Critical: Purchase URL
                    "handle": handle,
                    "shop_domain": product_shop_domain,
                    "purchase_url": purchase_url,
                    "url": f"/shopify/products/{product_id}",
                    
                    # Critical: Inventory & Variants
                    "total_inventory": total_inventory,
                    "availability": "in_stock" if total_inventory > 0 else "out_of_stock",
                    "in_stock": total_inventory > 0,
                    "variants": variants_list,
                    "variants_count": len(variants_list),
                    "available_sizes": available_sizes,
                    "out_of_stock_sizes": out_of_stock_sizes,
                    
                    # Metadata for LLM context
                    "metadata": {
                        "vendor": db_product["vendor"],
                        "product_type": db_product["product_type"],
                        "tags": json.loads(db_product["tags"]) if db_product["tags"] else [],
                        "shopify_product_id": db_product["shopify_product_id"],
                        "total_inventory": total_inventory,
                        "available_sizes": available_sizes,
                        "out_of_stock_sizes": out_of_stock_sizes,
                        "handle": handle,
                        "purchase_url": purchase_url
                    },
                    "match_reason": f"Semantic similarity: {result['score']:.2%}",
                    "scoring_details": {
                        "semantic_score": result["score"],
                        "match_type": "semantic",
                        "matched_on": ["title", "description", "attributes"]
                    }
                })
            
            return enriched
            
        finally:
            cursor.close()
            conn.close()


# Create singleton instance
product_search_service = ProductSearchService()