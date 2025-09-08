-- Add columns for original and edited images to templates table
ALTER TABLE public.templates 
ADD COLUMN IF NOT EXISTS original_image_url TEXT,
ADD COLUMN IF NOT EXISTS edited_image_url TEXT;

-- Update existing records to use thumbnail_url as edited_image_url
UPDATE public.templates 
SET edited_image_url = thumbnail_url 
WHERE thumbnail_url IS NOT NULL AND edited_image_url IS NULL;