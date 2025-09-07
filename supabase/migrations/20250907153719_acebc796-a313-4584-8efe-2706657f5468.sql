-- Create exports bucket for public image access
INSERT INTO storage.buckets (id, name, public) 
VALUES ('exports', 'exports', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Create policies for exports bucket
CREATE POLICY "Anyone can view exported images" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'exports');

CREATE POLICY "Users can upload their own exports" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'exports' AND auth.uid()::text = (storage.foldername(name))[1]);