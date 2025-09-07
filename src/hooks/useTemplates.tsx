import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface Template {
  id: string;
  name: string;
  scene_data: any;
  thumbnail_url?: string;
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

  const saveTemplate = async (name: string, sceneData: any, thumbnailUrl?: string) => {
    if (!user) {
      toast.error('You must be logged in to save templates');
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('templates')
        .insert({
          name,
          scene_data: sceneData,
          thumbnail_url: thumbnailUrl,
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