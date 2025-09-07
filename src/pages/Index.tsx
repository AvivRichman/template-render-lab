import { useState } from "react";
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
  Sparkles
} from "lucide-react";
import { ImageEditor } from "@/components/ImageEditor";
import { UploadArea } from "@/components/UploadArea";
import { Templates } from "@/components/Templates";
import { APIDemo } from "@/components/APIDemo";

const Index = () => {
  const [activeTab, setActiveTab] = useState("upload");
  const [uploadedImage, setUploadedImage] = useState<string>("");
  
  const handleImageUpload = (imageUrl: string) => {
    setUploadedImage(imageUrl);
    setActiveTab("editor");
  };

  const handleEditTemplate = (template: any) => {
    // In real app, load template data into editor
    setActiveTab("editor");
  };

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
              <Button variant="outline" size="sm">
                <Globe className="h-4 w-4 mr-2" />
                HTTP API
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
              Templates (0)
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
                <ImageEditor uploadedImage={uploadedImage} />
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

      {/* Authentication Notice */}
      <div className="fixed bottom-4 right-4 max-w-sm">
        <Card className="p-4 bg-blue-50 dark:bg-blue-950/10 border-blue-200 dark:border-blue-800">
          <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
            Ready for Backend Features?
          </h4>
          <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
            Connect Supabase to enable user accounts, template storage, and API functionality.
          </p>
          <Button size="sm" className="w-full">
            Connect Supabase
          </Button>
        </Card>
      </div>
    </div>
  );
};

export default Index;
