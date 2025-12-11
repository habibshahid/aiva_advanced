"""
Table Processor Service - Vision-Based Extraction
Converts PDF pages to images and uses GPT-4o vision to extract table data accurately.

This approach preserves table structure that text extraction loses.
"""

import logging
import asyncio
import base64
import io
import re
import json
from typing import Dict, Any, List, Optional, Tuple
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


class TableProcessor:
    """Process tables from PDFs using vision-based extraction for accuracy"""
    
    def __init__(self):
        from app.config import settings
        
        self.client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self.model = getattr(settings, 'TABLE_PROCESSING_MODEL', 'gpt-4o-mini')
        self.vision_model = getattr(settings, 'TABLE_VISION_MODEL', 'gpt-4o')  # Vision requires gpt-4o
        self.enabled = getattr(settings, 'ENABLE_TABLE_PROCESSING', True)
        self.max_tables_per_doc = getattr(settings, 'MAX_TABLES_PER_DOC', 100)
        self.decompose_tables = getattr(settings, 'DECOMPOSE_TABLES', True)
        self.use_vision = getattr(settings, 'USE_VISION_FOR_TABLES', True)
        
        logger.info(f"TableProcessor initialized - enabled: {self.enabled}, vision: {self.use_vision}, model: {self.vision_model}")
    
    async def extract_tables_from_pdf(
        self,
        pdf_content: bytes,
        document_name: str = "Document"
    ) -> List[Dict[str, Any]]:
        """
        Extract tables from PDF using vision-based approach.
        Converts pages to images and uses GPT-4o to understand table structure.
        """
        if not self.enabled:
            return []
        
        if self.use_vision:
            return await self._extract_tables_vision(pdf_content, document_name)
        else:
            return await self._extract_tables_pdfplumber(pdf_content, document_name)
    
    async def _extract_tables_vision(
        self,
        pdf_content: bytes,
        document_name: str
    ) -> List[Dict[str, Any]]:
        """
        Vision-based table extraction using GPT-4o.
        More accurate but slightly more expensive.
        """
        try:
            import fitz  # PyMuPDF for PDF to image conversion
        except ImportError:
            logger.error("PyMuPDF not installed - required for vision-based extraction")
            return await self._extract_tables_pdfplumber(pdf_content, document_name)
        
        tables = []
        
        try:
            pdf_doc = fitz.open(stream=pdf_content, filetype="pdf")
            
            for page_num in range(pdf_doc.page_count):
                page = pdf_doc[page_num]
                
                # Convert page to image
                # Use higher resolution for better accuracy
                mat = fitz.Matrix(2.0, 2.0)  # 2x zoom for clarity
                pix = page.get_pixmap(matrix=mat)
                img_bytes = pix.tobytes("png")
                
                # Convert to base64
                img_base64 = base64.b64encode(img_bytes).decode('utf-8')
                
                logger.info(f"Processing page {page_num + 1} with vision model...")
                
                # Extract tables using vision
                page_tables = await self._extract_tables_from_image(
                    img_base64,
                    page_num + 1,
                    document_name
                )
                
                if page_tables:
                    tables.extend(page_tables)
                    logger.info(f"Page {page_num + 1}: Extracted {len(page_tables)} tables via vision")
                
                if len(tables) >= self.max_tables_per_doc:
                    logger.warning(f"Reached max tables limit ({self.max_tables_per_doc})")
                    break
            
            pdf_doc.close()
            logger.info(f"Vision extraction complete: {len(tables)} tables from {document_name}")
            
        except Exception as e:
            logger.error(f"Vision-based extraction failed: {e}")
            # Fallback to pdfplumber
            return await self._extract_tables_pdfplumber(pdf_content, document_name)
        
        return tables
    
    async def _extract_tables_from_image(
        self,
        img_base64: str,
        page_num: int,
        document_name: str
    ) -> List[Dict[str, Any]]:
        """
        Use GPT-4o vision to extract tables from a page image.
        Returns structured table data.
        """
        try:
            response = await self.client.chat.completions.create(
                model=self.vision_model,
                messages=[
                    {
                        "role": "system",
                        "content": """You are a data extraction specialist. Extract ALL tables from the image.

For each table found, return a JSON object with:
1. "headers": Array of column header names (merge multi-line headers into single strings)
2. "rows": Array of row objects, each with "row_header" (first column) and "values" (array of values for each column)

CRITICAL RULES:
- Read column headers carefully - they may span multiple lines (e.g., "Budget Estimate 2024-25")
- Preserve exact numbers including decimals and formatting
- Include ALL rows, don't skip any
- Match each value to its correct column header
- If a cell is empty or has "-", use null

Return ONLY valid JSON array, no explanation."""
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": f"Extract all tables from this page of '{document_name}'. Return as JSON array."
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/png;base64,{img_base64}",
                                    "detail": "high"
                                }
                            }
                        ]
                    }
                ],
                temperature=0.1,
                max_tokens=4096
            )
            
            result_text = response.choices[0].message.content.strip()
            
            # Clean up response (remove markdown code blocks if present)
            if result_text.startswith("```"):
                result_text = re.sub(r'^```json?\n?', '', result_text)
                result_text = re.sub(r'\n?```$', '', result_text)
            
            # Parse JSON
            try:
                extracted_tables = json.loads(result_text)
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse vision response as JSON: {e}")
                logger.debug(f"Response was: {result_text[:500]}")
                return []
            
            # Ensure it's a list
            if isinstance(extracted_tables, dict):
                extracted_tables = [extracted_tables]
            
            # Convert to our standard format
            tables = []
            for table_idx, table_data in enumerate(extracted_tables):
                if not isinstance(table_data, dict):
                    continue
                
                headers = table_data.get("headers", [])
                rows = table_data.get("rows", [])
                
                if not headers or not rows:
                    continue
                
                # Convert rows to our format
                data_rows = []
                for row in rows:
                    if isinstance(row, dict):
                        row_header = row.get("row_header", "")
                        values = row.get("values", [])
                        data_row = [row_header] + [str(v) if v is not None else "" for v in values]
                    elif isinstance(row, list):
                        data_row = [str(v) if v is not None else "" for v in row]
                    else:
                        continue
                    data_rows.append(data_row)
                
                # Generate markdown
                markdown = self._table_to_markdown(headers, data_rows)
                
                tables.append({
                    "page": page_num,
                    "table_index": table_idx + 1,
                    "headers": headers,
                    "data_rows": data_rows,
                    "markdown": markdown,
                    "row_count": len(data_rows),
                    "col_count": len(headers),
                    "document_name": document_name,
                    "extraction_method": "vision"
                })
            
            return tables
            
        except Exception as e:
            logger.error(f"Vision extraction failed for page {page_num}: {e}")
            return []
    
    async def _extract_tables_pdfplumber(
        self,
        pdf_content: bytes,
        document_name: str
    ) -> List[Dict[str, Any]]:
        """
        Fallback: Extract tables using pdfplumber (text-based).
        Less accurate but cheaper.
        """
        tables = []
        
        try:
            import pdfplumber
            import io
            
            with pdfplumber.open(io.BytesIO(pdf_content)) as pdf:
                for page_num, page in enumerate(pdf.pages):
                    page_tables = page.extract_tables()
                    
                    if page_tables:
                        for table_idx, table_data in enumerate(page_tables):
                            if not table_data or len(table_data) < 2:
                                continue
                            
                            # Simple extraction - first row as headers
                            headers = [str(h).strip() if h else f"Col_{i}" for i, h in enumerate(table_data[0])]
                            data_rows = [[str(c).strip() if c else "" for c in row] for row in table_data[1:]]
                            
                            markdown = self._table_to_markdown(headers, data_rows)
                            
                            tables.append({
                                "page": page_num + 1,
                                "table_index": table_idx + 1,
                                "headers": headers,
                                "data_rows": data_rows,
                                "markdown": markdown,
                                "row_count": len(data_rows),
                                "col_count": len(headers),
                                "document_name": document_name,
                                "extraction_method": "pdfplumber"
                            })
            
            logger.info(f"pdfplumber extraction: {len(tables)} tables")
            
        except Exception as e:
            logger.error(f"pdfplumber extraction failed: {e}")
        
        return tables
    
    def _table_to_markdown(self, headers: List[str], data_rows: List[List]) -> str:
        """Convert table to markdown format"""
        if not headers:
            return ""
        
        lines = []
        
        # Header row
        header_line = "| " + " | ".join(str(h) for h in headers) + " |"
        lines.append(header_line)
        
        # Separator
        separator = "| " + " | ".join("---" for _ in headers) + " |"
        lines.append(separator)
        
        # Data rows
        for row in data_rows:
            row_data = list(row) + [""] * (len(headers) - len(row))
            row_data = row_data[:len(headers)]
            row_line = "| " + " | ".join(str(cell) if cell else "" for cell in row_data) + " |"
            lines.append(row_line)
        
        return "\n".join(lines)
    
    async def table_to_natural_language(
        self,
        table: Dict[str, Any],
        document_context: str = ""
    ) -> str:
        """
        Convert a table to natural language description using GPT.
        """
        if not self.enabled:
            return table.get("markdown", "")
        
        try:
            prompt = self._build_conversion_prompt(table, document_context)
            
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": """You are a data analyst converting tables to searchable natural language.

CRITICAL RULES:
- Preserve EVERY number exactly as shown
- Include units (millions, PKR, USD, %, etc.) 
- State the EXACT column header for each value (e.g., "Budget Estimate 2025-26")
- Include year-over-year comparisons when multiple years shown
- DO NOT skip any data
- Format: "[Row Name] for [Column Header] was [Value]" """
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.1,
                max_tokens=3000
            )
            
            description = response.choices[0].message.content.strip()
            page_ref = f"(Page {table['page']}, Table {table['table_index']})"
            
            return f"{description}\n\n{page_ref}"
            
        except Exception as e:
            logger.error(f"Error converting table to natural language: {e}")
            return f"Table from Page {table['page']}:\n{table.get('markdown', '')}"
    
    def _build_conversion_prompt(self, table: Dict[str, Any], document_context: str) -> str:
        """Build the prompt for table conversion"""
        prompt_parts = []
        
        if document_context:
            prompt_parts.append(f"Document: {document_context}")
        
        prompt_parts.append(f"Page: {table['page']}")
        prompt_parts.append(f"\nColumn Headers: {table['headers']}")
        prompt_parts.append(f"\nTable ({table['row_count']} rows, {table['col_count']} columns):")
        prompt_parts.append(table['markdown'])
        
        prompt_parts.append("""

Convert this table to natural language. For EACH row:
1. State the row name (first column)
2. State the value for EACH column with its EXACT header name
3. Include any trends or changes between years

Output clear, searchable sentences.""")
        
        return "\n".join(prompt_parts)
    
    def decompose_table_to_chunks(
        self,
        table: Dict[str, Any],
        document_name: str = ""
    ) -> List[Dict[str, str]]:
        """
        Decompose table into row-level chunks for precise retrieval.
        Each cell becomes a searchable chunk with full context.
        """
        chunks = []
        headers = table.get("headers", [])
        data_rows = table.get("data_rows", [])
        page = table.get("page", 1)
        
        if not headers or not data_rows:
            return chunks
        
        for row_idx, row in enumerate(data_rows):
            if not row or all(not cell for cell in row):
                continue
            
            # First column is typically the row header
            row_header = str(row[0]).strip() if row and row[0] else f"Row {row_idx + 1}"
            
            # Skip if row header looks like garbage or is too short
            if len(row_header) < 2:
                continue
            
            # Create chunk for each data cell (skip first column - it's the row header)
            for col_idx in range(1, len(headers)):
                if col_idx < len(row):
                    col_header = str(headers[col_idx]).strip() if col_idx < len(headers) else f"Column {col_idx}"
                    value = str(row[col_idx]).strip() if row[col_idx] else ""
                    
                    # Skip empty values or placeholder values
                    if not value or value in ["-", "—", "N/A", "n/a", "None", ""]:
                        continue
                    
                    # Create natural language chunk
                    chunk_content = f"{document_name}: {row_header} for {col_header} was {value}"
                    
                    chunks.append({
                        "content": chunk_content,
                        "type": "table",
                        "metadata": {
                            "page": page,
                            "row_header": row_header,
                            "col_header": col_header,
                            "value": value,
                            "source": "table_decomposition"
                        }
                    })
        
        return chunks
    
    async def process_document_tables(
        self,
        pdf_content: bytes,
        document_name: str = "Document",
        document_context: str = ""
    ) -> Dict[str, Any]:
        """
        Main method: Extract and process all tables from a PDF.
        """
        if not self.enabled:
            return {
                "table_descriptions": [],
                "table_chunks": [],
                "tables_found": 0,
                "processing_stats": {}
            }
        
        # Step 1: Extract tables (using vision or pdfplumber)
        tables = await self.extract_tables_from_pdf(pdf_content, document_name)
        
        if not tables:
            return {
                "table_descriptions": [],
                "table_chunks": [],
                "tables_found": 0,
                "processing_stats": {}
            }
        
        logger.info(f"Processing {len(tables)} tables from {document_name}")
        
        # Step 2: Convert tables to natural language and decompose
        table_descriptions = []
        table_chunks = []
        total_input_tokens = 0
        total_output_tokens = 0
        
        for table in tables:
            try:
                # Convert to natural language description
                description = await self.table_to_natural_language(
                    table,
                    document_context or document_name
                )
                
                table_descriptions.append({
                    "content": description,
                    "page": table["page"],
                    "table_index": table["table_index"],
                    "type": "table_description"
                })
                
                # Decompose into row-level chunks
                if self.decompose_tables:
                    row_chunks = self.decompose_table_to_chunks(table, document_name)
                    table_chunks.extend(row_chunks)
                    logger.info(f"Table {table['page']}-{table['table_index']}: {len(row_chunks)} row chunks created")
                
                # Estimate tokens
                total_input_tokens += len(table["markdown"]) // 4
                total_output_tokens += len(description) // 4
                
            except Exception as e:
                logger.error(f"Error processing table on page {table['page']}: {e}")
                table_descriptions.append({
                    "content": f"Table from Page {table['page']}:\n{table['markdown']}",
                    "page": table["page"],
                    "table_index": table["table_index"],
                    "type": "table_markdown"
                })
        
        # Calculate cost estimate
        # Vision: ~$0.003 per page, Text generation: GPT-4o-mini pricing
        vision_cost = len(set(t["page"] for t in tables)) * 0.003  # Per unique page
        input_cost = (total_input_tokens / 1_000_000) * 0.15
        output_cost = (total_output_tokens / 1_000_000) * 0.60
        total_cost = vision_cost + input_cost + output_cost
        
        processing_stats = {
            "tables_processed": len(tables),
            "descriptions_generated": len(table_descriptions),
            "row_chunks_created": len(table_chunks),
            "extraction_method": tables[0].get("extraction_method", "unknown") if tables else "none",
            "estimated_input_tokens": total_input_tokens,
            "estimated_output_tokens": total_output_tokens,
            "estimated_cost_usd": round(total_cost, 6),
            "model": self.vision_model if self.use_vision else self.model
        }
        
        logger.info(f"Table processing complete: {processing_stats}")
        
        return {
            "table_descriptions": table_descriptions,
            "table_chunks": table_chunks,
            "tables_found": len(tables),
            "processing_stats": processing_stats
        }


# Singleton instance
_table_processor = None


def get_table_processor() -> TableProcessor:
    """Get or create the singleton TableProcessor instance"""
    global _table_processor
    if _table_processor is None:
        _table_processor = TableProcessor()
    return _table_processor