-- Add createdBy column to sources table for permission model
-- NULL = global/admin source, userId = user-created source

ALTER TABLE sources 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- All existing sources are admin/global sources (createdBy = NULL)
-- No update needed - NULL is the default
