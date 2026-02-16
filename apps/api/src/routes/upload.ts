/**
 * Upload Routes - Handle file uploads to IPFS
 */

import { Hono } from 'hono';
import { pinFile } from '../services/storage/ipfs';

const upload = new Hono();

/**
 * POST /api/upload/image
 * Upload an image to IPFS and return the CID
 */
upload.post('/image', async (c) => {
  try {
    const contentType = c.req.header('content-type') || '';
    
    // Handle multipart/form-data
    if (contentType.includes('multipart/form-data')) {
      const formData = await c.req.formData();
      const file = formData.get('file') as File | null;
      
      if (!file) {
        return c.json({ success: false, error: 'No file provided' }, 400);
      }
      
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
      if (!allowedTypes.includes(file.type)) {
        return c.json({ 
          success: false, 
          error: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP, SVG' 
        }, 400);
      }
      
      // Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        return c.json({ 
          success: false, 
          error: 'File too large. Maximum size: 5MB' 
        }, 400);
      }
      
      // Convert to buffer and upload
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await pinFile(buffer, file.name, {
        type: 'access-pass-image',
        contentType: file.type,
      });
      
      return c.json({
        success: true,
        data: {
          cid: result.cid,
          size: result.size,
          url: `https://ipfs.io/ipfs/${result.cid}`,
        },
      });
    }
    
    return c.json({ success: false, error: 'Content-Type must be multipart/form-data' }, 400);
  } catch (error) {
    console.error('Upload error:', error);
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Upload failed' 
    }, 500);
  }
});

export default upload;
