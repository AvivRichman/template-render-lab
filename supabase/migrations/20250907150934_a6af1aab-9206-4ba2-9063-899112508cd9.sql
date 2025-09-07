-- Create storage bucket for API renders
INSERT INTO storage.buckets (id, name, public) VALUES ('api-renders', 'api-renders', true);

-- Create storage policies for API renders
CREATE POLICY "Users can view their own API renders" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'api-renders' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Edge functions can create API renders" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'api-renders');