-- Create storage bucket for API renders
INSERT INTO storage.buckets (id, name, public) 
VALUES ('api-renders', 'api-renders', true);

-- Create policies for API renders storage
CREATE POLICY "Users can view their own API renders" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'api-renders' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "API can upload renders" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'api-renders');