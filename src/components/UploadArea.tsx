import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

interface UploadAreaProps {
  onImageUpload: (imageUrl: string) => void;
}

export const UploadArea = ({ onImageUpload }: UploadAreaProps) => {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    // Filter for image files and check size (15MB limit)
    const validFiles = acceptedFiles.filter(file => {
      const isImage = file.type.startsWith('image/');
      const isValidSize = file.size <= 15 * 1024 * 1024; // 15MB
      const isValidType = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type);
      
      if (!isImage || !isValidType) {
        toast.error(`${file.name} is not a supported image format`);
        return false;
      }
      
      if (!isValidSize) {
        toast.error(`${file.name} is too large. Maximum size is 15MB`);
        return false;
      }
      
      return true;
    });

    if (validFiles.length > 0) {
      setUploadedFiles(prev => [...prev, ...validFiles]);
      
      // Create previews
      validFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          setPreviews(prev => [...prev, result]);
          onImageUpload(result);
        };
        reader.readAsDataURL(file);
      });
      
      toast.success(`${validFiles.length} image(s) uploaded successfully`);
    }
  }, [onImageUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp']
    },
    multiple: true
  });

  const removeImage = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
    toast("Image removed");
  };

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <Card className="p-8">
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors
            ${isDragActive 
              ? 'border-primary bg-primary/5' 
              : 'border-[hsl(var(--editor-border))] hover:border-primary hover:bg-[hsl(var(--editor-hover))]'
            }`}
        >
          <input {...getInputProps()} />
          <div className="space-y-4">
            <div className="flex justify-center">
              <Upload className="h-12 w-12 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-medium mb-2">Upload an image</h3>
              <p className="text-muted-foreground">
                Drag and drop an image here, or click to select
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Supports PNG, JPG, WebP (max 15MB)
              </p>
            </div>
            <Button variant="outline" className="mt-4">
              Choose File
            </Button>
          </div>
        </div>
      </Card>

      {/* Getting Started Guide */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4">Getting Started</h3>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">
              1
            </div>
            <div>
              <h4 className="font-medium">Upload an Image</h4>
              <p className="text-sm text-muted-foreground">
                Start by uploading an image or skip this step to work with text only
              </p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">
              2
            </div>
            <div>
              <h4 className="font-medium">Add and Edit Text</h4>
              <p className="text-sm text-muted-foreground">
                Use the editor to add text overlays, customize fonts, colors, and positioning
              </p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">
              3
            </div>
            <div>
              <h4 className="font-medium">Save as Template</h4>
              <p className="text-sm text-muted-foreground">
                Save your design as a reusable template for future projects
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Uploaded Images Preview */}
      {previews.length > 0 && (
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Uploaded Images</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {previews.map((preview, index) => (
              <div key={index} className="relative group">
                <div className="aspect-square bg-[hsl(var(--editor-background))] rounded-lg overflow-hidden border border-[hsl(var(--editor-border))]">
                  <img
                    src={preview}
                    alt={`Upload ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => removeImage(index)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                >
                  ×
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onImageUpload(preview)}
                  className="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity h-6 text-xs"
                >
                  <ImageIcon className="h-3 w-3 mr-1" />
                  Edit
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};