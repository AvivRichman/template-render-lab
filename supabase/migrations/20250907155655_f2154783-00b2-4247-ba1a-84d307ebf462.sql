-- Create exports bucket for rendered images
INSERT INTO storage.buckets (id, name, public)
VALUES ('exports', 'exports', true)
ON CONFLICT (id) DO NOTHING;

-- Create policies for exports bucket
CREATE POLICY "Users can view their own renders" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'exports' AND auth.uid()::text = (storage.foldername(name))[2]);

CREATE POLICY "Users can upload their own renders" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'exports' AND auth.uid()::text = (storage.foldername(name))[2]);