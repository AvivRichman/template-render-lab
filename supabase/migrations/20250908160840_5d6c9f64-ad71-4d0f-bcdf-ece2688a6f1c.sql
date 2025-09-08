-- Create storage policies for the exports bucket to allow users to upload template images

-- Policy to allow users to upload files to their own folder in exports bucket
CREATE POLICY "Users can upload their own template images"
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'exports' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy to allow users to view their own uploaded files
CREATE POLICY "Users can view their own template images"
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'exports' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy to allow users to update their own files
CREATE POLICY "Users can update their own template images"
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'exports' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy to allow users to delete their own files
CREATE POLICY "Users can delete their own template images"
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'exports' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);