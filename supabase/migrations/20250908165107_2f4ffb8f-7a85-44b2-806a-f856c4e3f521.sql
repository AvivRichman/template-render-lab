-- Create api-renders storage bucket for generated images
INSERT INTO storage.buckets (id, name, public) VALUES ('api-renders', 'api-renders', true);

-- Create RLS policies for api-renders bucket
CREATE POLICY "Generated images are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'api-renders');

CREATE POLICY "System can upload generated images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'api-renders');