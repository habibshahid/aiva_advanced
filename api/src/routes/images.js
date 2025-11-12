/**
 * Image Serving Route
 * Serves extracted PDF images with thumbnail support
 * 
 * Place this file at: /etc/aiva-oai/api/src/routes/images.js
 * 
 * Add to your api/src/index.js:
 * const imageRoutes = require('./routes/images');
 * app.use('/api/images', imageRoutes);
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp'); // npm install sharp
const { verifyToken, verifyApiKey } = require('../middleware/auth');
const db = require('../config/database');

// Middleware that accepts either JWT token OR API key
const authenticate = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (apiKey) {
    return verifyApiKey(req, res, next);
  } else {
    return verifyToken(req, res, next);
  }
};

/**
 * GET /api/images/:kbId/:imageFilename
 * Serve an image from storage
 * 
 * Query params:
 * - size: 'full' | 'thumbnail' | 'medium' (default: 'full')
 * - format: 'original' | 'jpeg' | 'png' | 'webp' (default: 'original')
 */
router.get('/:kbId/:imageFilename', authenticate, async (req, res) => {
  try {
    const { kbId, imageFilename } = req.params;
    const size = req.query.size || 'full';
    const format = req.query.format || 'original';
    
    // Construct image path
    const storagePath = process.env.STORAGE_PATH || '/etc/aiva-oai/storage';
    const imagePath = path.join(storagePath, 'images', kbId, imageFilename);
    
    // Verify image exists
    try {
      await fs.access(imagePath);
    } catch (error) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    // Get image metadata from database to verify access
    const [images] = await db.query(
      'SELECT i.*, k.tenant_id FROM yovo_tbl_aiva_images i JOIN yovo_tbl_aiva_knowledge_bases k ON i.kb_id = k.id WHERE i.storage_url = ?',
      [imagePath]
    );
    
    if (images.length === 0) {
      return res.status(404).json({ error: 'Image not found in database' });
    }
    
    const imageRecord = images[0];
    
    // Verify user has access to this KB
    if (imageRecord.tenant_id !== req.user.tenant_id && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Process image based on size parameter
    let imageBuffer;
    let contentType = 'image/jpeg';
    
    if (size === 'thumbnail') {
      // Generate thumbnail (200x200)
      const image = sharp(imagePath);
      imageBuffer = await image
        .resize(200, 200, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      contentType = 'image/jpeg';
      
    } else if (size === 'medium') {
      // Generate medium size (800x800)
      const image = sharp(imagePath);
      imageBuffer = await image
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      contentType = 'image/jpeg';
      
    } else {
      // Full size - apply format if requested
      if (format === 'original') {
        imageBuffer = await fs.readFile(imagePath);
        // Detect content type from file extension
        const ext = path.extname(imageFilename).toLowerCase();
        contentType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      } else {
        // Convert to requested format
        const image = sharp(imagePath);
        
        if (format === 'jpeg') {
          imageBuffer = await image.jpeg({ quality: 90 }).toBuffer();
          contentType = 'image/jpeg';
        } else if (format === 'png') {
          imageBuffer = await image.png().toBuffer();
          contentType = 'image/png';
        } else if (format === 'webp') {
          imageBuffer = await image.webp({ quality: 90 }).toBuffer();
          contentType = 'image/webp';
        } else {
          imageBuffer = await fs.readFile(imagePath);
        }
      }
    }
    
    // Set caching headers (cache for 1 hour)
    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
      'Content-Disposition': `inline; filename="${imageFilename}"`
    });
    
    res.send(imageBuffer);
    
  } catch (error) {
    console.error('Image serve error:', error);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

/**
 * GET /api/images/:kbId/:imageId/metadata
 * Get image metadata
 */
router.get('/:kbId/:imageId/metadata', authenticate, async (req, res) => {
  try {
    const { kbId, imageId } = req.params;
    
    const [images] = await db.query(
      `SELECT 
        i.*,
        d.original_filename as document_name,
        k.name as kb_name
      FROM yovo_tbl_aiva_images i
      LEFT JOIN yovo_tbl_aiva_documents d ON JSON_EXTRACT(i.metadata, '$.document_id') = d.id
      JOIN yovo_tbl_aiva_knowledge_bases k ON i.kb_id = k.id
      WHERE i.id = ? AND i.kb_id = ?`,
      [imageId, kbId]
    );
    
    if (images.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    const image = images[0];
    
    // Verify access
    if (image.tenant_id !== req.user.tenant_id && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Parse metadata
    const metadata = typeof image.metadata === 'string' ? JSON.parse(image.metadata) : image.metadata;
    
    res.json({
      id: image.id,
      kb_id: image.kb_id,
      kb_name: image.kb_name,
      filename: image.filename,
      document_name: image.document_name,
      image_type: image.image_type,
      width: image.width,
      height: image.height,
      description: image.description,
      page_number: metadata.page_number,
      image_index: metadata.image_index,
      url: `${process.env.MANAGEMENT_API_URL || 'http://localhost:62001'}/api/images/${kbId}/${path.basename(image.storage_url)}`,
      thumbnail_url: `${process.env.MANAGEMENT_API_URL || 'http://localhost:62001'}/api/images/${kbId}/${path.basename(image.storage_url)}?size=thumbnail`,
      created_at: image.created_at
    });
    
  } catch (error) {
    console.error('Get image metadata error:', error);
    res.status(500).json({ error: 'Failed to get image metadata' });
  }
});

/**
 * DELETE /api/images/:kbId/:imageId
 * Delete an image
 */
router.delete('/:kbId/:imageId', authenticate, async (req, res) => {
  try {
    const { kbId, imageId } = req.params;
    
    // Get image details
    const [images] = await db.query(
      'SELECT i.*, k.tenant_id FROM yovo_tbl_aiva_images i JOIN yovo_tbl_aiva_knowledge_bases k ON i.kb_id = k.id WHERE i.id = ? AND i.kb_id = ?',
      [imageId, kbId]
    );
    
    if (images.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    const image = images[0];
    
    // Verify access
    if (image.tenant_id !== req.user.tenant_id && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Delete from storage
    try {
      await fs.unlink(image.storage_url);
    } catch (error) {
      console.error('Error deleting file:', error);
    }
    
    // Delete from database
    await db.query('DELETE FROM yovo_tbl_aiva_images WHERE id = ?', [imageId]);
    
    // Delete from Redis vector store
    const redis = require('../config/redis');
    const vectorKey = `image:${kbId}:${imageId}`;
    await redis.del(vectorKey);
    
    res.json({ success: true, message: 'Image deleted' });
    
  } catch (error) {
    console.error('Delete image error:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

/**
 * GET /api/images/:kbId
 * List all images in a knowledge base
 */
router.get('/:kbId', authenticate, async (req, res) => {
  try {
    const { kbId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    // Verify access to KB
    const [kbs] = await db.query(
      'SELECT tenant_id FROM yovo_tbl_aiva_knowledge_bases WHERE id = ?',
      [kbId]
    );
    
    if (kbs.length === 0) {
      return res.status(404).json({ error: 'Knowledge base not found' });
    }
    
    if (kbs[0].tenant_id !== req.user.tenant_id && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get images
    const [images] = await db.query(
      `SELECT 
        i.id,
        i.filename,
        i.width,
        i.height,
        i.image_type,
        i.description,
        i.metadata,
        i.created_at,
        d.original_filename as document_name
      FROM yovo_tbl_aiva_images i
      LEFT JOIN yovo_tbl_aiva_documents d ON JSON_EXTRACT(i.metadata, '$.document_id') = d.id
      WHERE i.kb_id = ?
      ORDER BY i.created_at DESC
      LIMIT ? OFFSET ?`,
      [kbId, limit, offset]
    );
    
    // Get total count
    const [countResult] = await db.query(
      'SELECT COUNT(*) as total FROM yovo_tbl_aiva_images WHERE kb_id = ?',
      [kbId]
    );
    
    const total = countResult[0].total;
    
    // Format results
    const formattedImages = images.map(img => {
      const metadata = typeof img.metadata === 'string' ? JSON.parse(img.metadata) : img.metadata;
      const filename = path.basename(img.filename || '');
      
      return {
        id: img.id,
        filename: img.filename,
        document_name: img.document_name,
        width: img.width,
        height: img.height,
        image_type: img.image_type,
        description: img.description,
        page_number: metadata.page_number,
        url: `${process.env.MANAGEMENT_API_URL || 'http://localhost:62001'}/api/images/${kbId}/${filename}`,
        thumbnail_url: `${process.env.MANAGEMENT_API_URL || 'http://localhost:62001'}/api/images/${kbId}/${filename}?size=thumbnail`,
        created_at: img.created_at
      };
    });
    
    res.json({
      images: formattedImages,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('List images error:', error);
    res.status(500).json({ error: 'Failed to list images' });
  }
});

module.exports = router;
