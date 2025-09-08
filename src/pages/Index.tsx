import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Upload as UploadIcon, 
  Edit3, 
  FolderOpen, 
  Zap, 
  Globe,
  Sparkles,
  LogOut,
  User
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ImageEditor } from "@/components/ImageEditor";
import { UploadArea } from "@/components/UploadArea";
import { Templates } from "@/components/Templates";
import { APIDemo } from "@/components/APIDemo";
import { useTemplates } from "@/hooks/useTemplates";

const Index = () => {
  const [activeTab, setActiveTab] = useState("upload");
  const [uploadedImage, setUploadedImage] = useState<string>("");
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const { user, isLoading, signOut } = useAuth();
  const { templates, refreshTemplates } = useTemplates();
  const navigate = useNavigate();
  
  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/auth");
    }
  }, [user, isLoading, navigate]);

  const handleImageUpload = (imageUrl: string) => {
    setUploadedImage(imageUrl);
    setActiveTab("editor");
  };

  const handleEditTemplate = (template: any) => {
    setSelectedTemplate(template.scene_data);
    setUploadedImage(""); // Clear uploaded image when loading template
    setActiveTab("editor");
  };

  const handleTemplateSaved = () => {
    refreshTemplates();
    setActiveTab("templates");
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to auth
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Image Editor Pro</h1>
                <p className="text-sm text-muted-foreground">Create, edit, and save reusable image templates with ease</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline">Free Plan</Badge>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                {user.email}
              </div>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 lg:w-fit lg:grid-cols-4">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <UploadIcon className="h-4 w-4" />
              Upload
            </TabsTrigger>
            <TabsTrigger value="editor" className="flex items-center gap-2">
              <Edit3 className="h-4 w-4" />
              Editor
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              Templates ({templates.length})
            </TabsTrigger>
            <TabsTrigger value="api" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              API Demo
            </TabsTrigger>
          </TabsList>

          <div className="mt-6">
            <TabsContent value="upload" className="space-y-6">
              <UploadArea onImageUpload={handleImageUpload} />
            </TabsContent>

            <TabsContent value="editor" className="space-y-6">
              <div className="h-[calc(100vh-200px)]">
                <ImageEditor 
                  uploadedImage={uploadedImage} 
                  templateData={selectedTemplate}
                  onTemplateSaved={handleTemplateSaved}
                />
              </div>
            </TabsContent>

            <TabsContent value="templates" className="space-y-6">
              <Templates onEditTemplate={handleEditTemplate} />
            </TabsContent>

            <TabsContent value="api" className="space-y-6">
              <APIDemo />
            </TabsContent>
          </div>
        </Tabs>
      </main>

    </div>
  );
};

export default Index;
