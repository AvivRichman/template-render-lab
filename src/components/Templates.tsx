import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Edit, 
  Trash2, 
  Download, 
  Plus,
  Image as ImageIcon,
  Calendar,
  Eye
} from "lucide-react";
import { useTemplates, Template } from "@/hooks/useTemplates";


interface TemplatesProps {
  onEditTemplate: (template: Template) => void;
}

export const Templates = ({ onEditTemplate }: TemplatesProps) => {
  const { templates, isLoading, deleteTemplate: removeTemplate } = useTemplates();

  const handleDeleteTemplate = async (id: string) => {
    await removeTemplate(id);
  };

  const exportTemplate = (template: Template) => {
    // Export as JSON for now
    const dataStr = JSON.stringify(template.scene_data, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${template.name}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Templates</h2>
          <p className="text-muted-foreground">
            Manage your saved templates ({templates.length}/7)
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Create New
        </Button>
      </div>

      {/* Usage Indicator */}
      <Card className="p-4 bg-[hsl(var(--editor-background))]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Free Plan Usage</span>
          <span className="text-sm text-muted-foreground">{templates.length}/7 templates</span>
        </div>
        <div className="w-full bg-[hsl(var(--editor-border))] rounded-full h-2">
          <div 
            className="bg-primary h-2 rounded-full transition-all duration-300"
            style={{ width: `${(templates.length / 7) * 100}%` }}
          />
        </div>
        {templates.length >= 7 && (
          <p className="text-sm text-destructive mt-2">
            You've reached your template limit. Delete some templates or upgrade to continue.
          </p>
        )}
      </Card>

      {/* Templates Grid */}
      {templates.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => (
            <Card key={template.id} className="overflow-hidden group hover:shadow-lg transition-shadow">
              {/* Preview */}
              <div className="aspect-video bg-[hsl(var(--editor-background))] border-b border-[hsl(var(--editor-border))] relative overflow-hidden">
                {template.thumbnail_url ? (
                  <img
                    src={template.thumbnail_url}
                    alt={template.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="h-12 w-12 text-muted-foreground" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <Button variant="secondary" size="sm">
                    <Eye className="h-4 w-4 mr-2" />
                    Preview
                  </Button>
                </div>
                <Badge 
                  variant="default"
                  className="absolute top-2 right-2"
                >
                  <ImageIcon className="h-3 w-3 mr-1" />
                  Template
                </Badge>
              </div>

              {/* Content */}
              <div className="p-4">
                <h3 className="font-semibold text-lg mb-2">{template.name}</h3>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>Created: {new Date(template.created_at).toLocaleDateString()}</p>
                  <p>Modified: {new Date(template.updated_at).toLocaleDateString()}</p>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-4">
                  <Button 
                    size="sm" 
                    onClick={() => onEditTemplate(template)}
                    className="flex-1"
                  >
                    <Edit className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => exportTemplate(template)}
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => handleDeleteTemplate(template.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-12 text-center">
          <div className="space-y-4">
            <ImageIcon className="h-16 w-16 mx-auto text-muted-foreground" />
            <div>
              <h3 className="text-lg font-medium">No templates yet</h3>
              <p className="text-muted-foreground">
                Create your first template by designing an image and saving it
              </p>
            </div>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Template
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};