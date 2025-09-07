import { useState } from "react";
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
import { toast } from "sonner";

interface Template {
  id: string;
  name: string;
  preview: string;
  created: string;
  lastModified: string;
  type: "image" | "text-only";
}

// Mock data - in real app this would come from Supabase
const mockTemplates: Template[] = [
  {
    id: "1",
    name: "Social Media Post",
    preview: "/placeholder.svg",
    created: "2024-01-15",
    lastModified: "2024-01-20",
    type: "image"
  },
  {
    id: "2", 
    name: "Marketing Banner",
    preview: "/placeholder.svg",
    created: "2024-01-10",
    lastModified: "2024-01-18",
    type: "text-only"
  },
  {
    id: "3",
    name: "Product Showcase",
    preview: "/placeholder.svg", 
    created: "2024-01-05",
    lastModified: "2024-01-15",
    type: "image"
  }
];

interface TemplatesProps {
  onEditTemplate: (template: Template) => void;
}

export const Templates = ({ onEditTemplate }: TemplatesProps) => {
  const [templates, setTemplates] = useState<Template[]>(mockTemplates);

  const deleteTemplate = (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
    toast("Template deleted successfully");
  };

  const duplicateTemplate = (template: Template) => {
    const newTemplate = {
      ...template,
      id: Date.now().toString(),
      name: `${template.name} (Copy)`,
      created: new Date().toISOString().split('T')[0],
      lastModified: new Date().toISOString().split('T')[0]
    };
    setTemplates(prev => [newTemplate, ...prev]);
    toast("Template duplicated successfully");
  };

  const exportTemplate = (template: Template) => {
    // In real app, this would export the actual template data
    toast("Template exported successfully");
  };

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
                <img
                  src={template.preview}
                  alt={template.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <Button variant="secondary" size="sm">
                    <Eye className="h-4 w-4 mr-2" />
                    Preview
                  </Button>
                </div>
                <Badge 
                  variant={template.type === "image" ? "default" : "secondary"}
                  className="absolute top-2 right-2"
                >
                  {template.type === "image" ? (
                    <ImageIcon className="h-3 w-3 mr-1" />
                  ) : (
                    <Calendar className="h-3 w-3 mr-1" />
                  )}
                  {template.type === "image" ? "Image" : "Text Only"}
                </Badge>
              </div>

              {/* Content */}
              <div className="p-4">
                <h3 className="font-semibold text-lg mb-2">{template.name}</h3>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>Created: {new Date(template.created).toLocaleDateString()}</p>
                  <p>Modified: {new Date(template.lastModified).toLocaleDateString()}</p>
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
                    variant="outline" 
                    size="sm"
                    onClick={() => duplicateTemplate(template)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => deleteTemplate(template.id)}
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