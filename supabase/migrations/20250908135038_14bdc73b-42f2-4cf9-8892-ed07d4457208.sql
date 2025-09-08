-- Create storage bucket for API rendered images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('api-renders', 'api-renders', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for the api-renders bucket
CREATE POLICY "Allow authenticated users to upload rendered images" 
ON storage.objects 
FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'api-renders');

CREATE POLICY "Allow public read access to rendered images" 
ON storage.objects 
FOR SELECT 
TO public 
USING (bucket_id = 'api-renders');