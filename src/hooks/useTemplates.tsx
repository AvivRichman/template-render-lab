import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface Template {
  id: string;
  name: string;
  scene_data: any;
  thumbnail_url?: string;
  original_image_url?: string;
  edited_image_url?: string;
  created_at: string;
  updated_at: string;
  user_id: string;
}

export const useTemplates = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  const fetchTemplates = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast.error('Failed to load templates');
    } finally {
      setIsLoading(false);
    }
  };

  const saveTemplate = async (name: string, sceneData: any, editedImageUrl: string, originalImageUrl?: string) => {
    if (!user) {
      toast.error('You must be logged in to save templates');
      return null;
    }

    try {
      // Upload the edited image to Supabase storage
      const editedImageBlob = await fetch(editedImageUrl).then(r => r.blob());
      const editedImagePath = `templates/${user.id}/${Date.now()}-edited.png`;
      
      const { error: uploadError } = await supabase.storage
        .from('exports')
        .upload(editedImagePath, editedImageBlob, {
          contentType: 'image/png',
          cacheControl: '3600'
        });

      if (uploadError) throw uploadError;

      const editedImagePublicUrl = `https://nracebwmywbyuywhucwo.supabase.co/storage/v1/object/public/exports/${editedImagePath}`;

      let originalImagePublicUrl = originalImageUrl;
      if (originalImageUrl && originalImageUrl.startsWith('data:')) {
        // Upload original image if it's a data URL
        const originalImageBlob = await fetch(originalImageUrl).then(r => r.blob());
        const originalImagePath = `templates/${user.id}/${Date.now()}-original.png`;
        
        const { error: originalUploadError } = await supabase.storage
          .from('exports')
          .upload(originalImagePath, originalImageBlob, {
            contentType: 'image/png',
            cacheControl: '3600'
          });

        if (!originalUploadError) {
          originalImagePublicUrl = `https://nracebwmywbyuywhucwo.supabase.co/storage/v1/object/public/exports/${originalImagePath}`;
        }
      }

      const { data, error } = await supabase
        .from('templates')
        .insert({
          name,
          scene_data: sceneData,
          thumbnail_url: editedImageUrl.substring(0, 1000), // Keep as data URL for quick preview
          original_image_url: originalImagePublicUrl,
          edited_image_url: editedImagePublicUrl,
          user_id: user.id
        })
        .select()
        .single();

      if (error) throw error;

      setTemplates(prev => [data, ...prev]);
      toast.success('Template saved successfully');
      return data;
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error('Failed to save template');
      return null;
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      const { error } = await supabase
        .from('templates')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setTemplates(prev => prev.filter(t => t.id !== id));
      toast.success('Template deleted successfully');
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error('Failed to delete template');
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [user]);

  return {
    templates,
    isLoading,
    saveTemplate,
    deleteTemplate,
    refreshTemplates: fetchTemplates
  };
};