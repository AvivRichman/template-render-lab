import { useState, useEffect, useRef } from "react";
import { Canvas as FabricCanvas, FabricText, Rect, Circle, Line, FabricImage } from "fabric";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { 
  Type, 
  Square, 
  Circle as CircleIcon, 
  Minus, 
  Download,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Save
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { useTemplates } from "@/hooks/useTemplates";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

interface ImageEditorProps {
  uploadedImage?: string;
  templateData?: any;
  onTemplateSaved?: () => void;
}

export const ImageEditor = ({ uploadedImage, templateData, onTemplateSaved }: ImageEditorProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);
  const [selectedObject, setSelectedObject] = useState<any>(null);
  const [activeTool, setActiveTool] = useState<"select" | "text" | "rectangle" | "circle" | "line">("select");
  const [templateName, setTemplateName] = useState("");
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [originalImageUrl, setOriginalImageUrl] = useState<string>("");
  
  const { saveTemplate } = useTemplates();
  
  // Text properties
  const [textContent, setTextContent] = useState("Sample Text");
  const [fontSize, setFontSize] = useState([24]);
  const [textColor, setTextColor] = useState("#000000");
  const [fontFamily, setFontFamily] = useState("Arial");
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [textAlign, setTextAlign] = useState<"left" | "center" | "right">("left");

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new FabricCanvas(canvasRef.current, {
      width: 800,
      height: 600,
      backgroundColor: "#ffffff",
    });

    // Handle object selection
    canvas.on('selection:created', (e) => {
      const obj = e.selected?.[0];
      if (obj) {
        setSelectedObject(obj);
        if (obj instanceof FabricText) {
          setTextContent(obj.text || "");
          setFontSize([obj.fontSize || 24]);
          setTextColor(obj.fill as string || "#000000");
          setFontFamily(obj.fontFamily || "Arial");
          setIsBold(obj.fontWeight === 'bold');
          setIsItalic(obj.fontStyle === 'italic');
          setIsUnderline(obj.underline || false);
          setTextAlign(obj.textAlign as any || "left");
        }
      }
    });

    canvas.on('selection:updated', (e) => {
      const obj = e.selected?.[0];
      if (obj) {
        setSelectedObject(obj);
      }
    });

    canvas.on('selection:cleared', () => {
      setSelectedObject(null);
    });

    setFabricCanvas(canvas);

    // Load template data if provided
    if (templateData) {
      canvas.loadFromJSON(templateData, () => {
        canvas.renderAll();
      });
    }
    // Load uploaded image if provided
    else if (uploadedImage) {
      setOriginalImageUrl(uploadedImage);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const fabricImage = new FabricImage(img, {
          left: 100,
          top: 100,
          scaleX: 0.5,
          scaleY: 0.5,
        });
        canvas.add(fabricImage);
        canvas.renderAll();
      };
      img.src = uploadedImage;
    }

    return () => {
      canvas.dispose();
    };
  }, [uploadedImage, templateData]);

  const addText = () => {
    if (!fabricCanvas) return;
    
    const text = new FabricText(textContent, {
      left: 100,
      top: 100,
      fontSize: fontSize[0],
      fill: textColor,
      fontFamily: fontFamily,
      fontWeight: isBold ? 'bold' : 'normal',
      fontStyle: isItalic ? 'italic' : 'normal',
      underline: isUnderline,
      textAlign: textAlign,
    });
    
    fabricCanvas.add(text);
    fabricCanvas.setActiveObject(text);
    fabricCanvas.renderAll();
    toast("Text added to canvas");
  };

  const addShape = (type: "rectangle" | "circle" | "line") => {
    if (!fabricCanvas) return;
    
    let shape;
    
    switch (type) {
      case "rectangle":
        shape = new Rect({
          left: 100,
          top: 100,
          width: 100,
          height: 100,
          fill: textColor,
          stroke: "#000000",
          strokeWidth: 2,
        });
        break;
      case "circle":
        shape = new Circle({
          left: 100,
          top: 100,
          radius: 50,
          fill: textColor,
          stroke: "#000000",
          strokeWidth: 2,
        });
        break;
      case "line":
        shape = new Line([50, 50, 200, 50], {
          stroke: textColor,
          strokeWidth: 2,
        });
        break;
    }
    
    if (shape) {
      fabricCanvas.add(shape);
      fabricCanvas.setActiveObject(shape);
      fabricCanvas.renderAll();
      toast(`${type} added to canvas`);
    }
  };

  const updateSelectedText = () => {
    if (!selectedObject || !(selectedObject instanceof FabricText)) return;
    
    selectedObject.set({
      text: textContent,
      fontSize: fontSize[0],
      fill: textColor,
      fontFamily: fontFamily,
      fontWeight: isBold ? 'bold' : 'normal',
      fontStyle: isItalic ? 'italic' : 'normal',
      underline: isUnderline,
      textAlign: textAlign,
    });
    
    fabricCanvas?.renderAll();
  };

  const exportImage = () => {
    if (!fabricCanvas) return;
    
    const dataURL = fabricCanvas.toDataURL({
      format: 'png',
      quality: 1,
      multiplier: 1,
    });
    
    const link = document.createElement('a');
    link.download = 'edited-image.png';
    link.href = dataURL;
    link.click();
    
    toast("Image exported successfully!");
  };

  const clearCanvas = () => {
    if (!fabricCanvas) return;
    fabricCanvas.clear();
    fabricCanvas.backgroundColor = "#ffffff";
    fabricCanvas.renderAll();
    toast("Canvas cleared");
  };

  const uploadImageToStorage = async (dataURL: string, filename: string): Promise<string | null> => {
    try {
      // Convert data URL to blob
      const response = await fetch(dataURL);
      const blob = await response.blob();
      
      // Get current user for folder structure
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      // Upload to Supabase storage with user ID folder structure
      const filePath = `${user.id}/${Date.now()}-${filename}`;
      const { data, error } = await supabase.storage
        .from('exports')
        .upload(filePath, blob, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        console.error('Upload error:', error);
        return null;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('exports')
        .getPublicUrl(data.path);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      return null;
    }
  };

  const handleSaveTemplate = async () => {
    if (!fabricCanvas || !templateName.trim()) {
      toast.error("Please enter a template name");
      return;
    }

    toast("Saving template...");

    try {
      const sceneData = fabricCanvas.toJSON();
      
      // Generate thumbnail (smaller version)
      const thumbnailDataURL = fabricCanvas.toDataURL({
        format: 'png',
        quality: 0.8,
        multiplier: 0.3
      });

      // Generate full edited image
      const editedImageDataURL = fabricCanvas.toDataURL({
        format: 'png',
        quality: 1,
        multiplier: 1
      });

      // Prepare upload promises
      const uploadPromises = [
        uploadImageToStorage(thumbnailDataURL, `${templateName}-thumbnail.png`),
        uploadImageToStorage(editedImageDataURL, `${templateName}-edited.png`)
      ];

      // If original image is a data URL (from file upload), upload it too
      let originalImageStorageUrl = originalImageUrl;
      if (originalImageUrl && originalImageUrl.startsWith('data:')) {
        uploadPromises.push(uploadImageToStorage(originalImageUrl, `${templateName}-original.png`));
      }

      // Upload all images
      const uploadResults = await Promise.all(uploadPromises);
      const [thumbnailUrl, editedImageUrl] = uploadResults;
      
      // If we uploaded the original image, use the storage URL
      if (originalImageUrl && originalImageUrl.startsWith('data:')) {
        originalImageStorageUrl = uploadResults[2];
      }

      if (!thumbnailUrl || !editedImageUrl) {
        toast.error("Failed to upload images");
        return;
      }

      // If original image upload failed when it was a data URL, show error
      if (originalImageUrl && originalImageUrl.startsWith('data:') && !originalImageStorageUrl) {
        toast.error("Failed to upload original image");
        return;
      }

      // Save template with all image URLs
      const savedTemplate = await saveTemplate(
        templateName, 
        sceneData, 
        thumbnailUrl,
        originalImageStorageUrl,
        editedImageUrl
      );
      
      if (savedTemplate) {
        setTemplateName("");
        setSaveDialogOpen(false);
        onTemplateSaved?.();
        toast.success("Template saved successfully!");
      }
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error("Failed to save template");
    }
  };

  useEffect(() => {
    updateSelectedText();
  }, [textContent, fontSize, textColor, fontFamily, isBold, isItalic, isUnderline, textAlign]);

  return (
    <div className="flex h-full gap-4">
      {/* Canvas Area */}
      <div className="flex-1 bg-[hsl(var(--editor-background))] p-6 rounded-lg">
        <div className="bg-[hsl(var(--editor-canvas))] border-2 border-[hsl(var(--editor-border))] rounded-lg p-4 inline-block">
          <canvas ref={canvasRef} className="max-w-full" />
        </div>
      </div>
      
      {/* Controls Panel */}
      <Card className="w-80 p-6 space-y-6 bg-card">
        {/* Tools */}
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">Tools</h3>
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant={activeTool === "text" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTool("text")}
              className="h-10"
            >
              <Type className="h-4 w-4" />
            </Button>
            <Button
              variant={activeTool === "rectangle" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setActiveTool("rectangle");
                addShape("rectangle");
              }}
              className="h-10"
            >
              <Square className="h-4 w-4" />
            </Button>
            <Button
              variant={activeTool === "circle" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setActiveTool("circle");
                addShape("circle");
              }}
              className="h-10"
            >
              <CircleIcon className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setActiveTool("line");
              addShape("line");
            }}
            className="w-full"
          >
            <Minus className="h-4 w-4 mr-2" />
            Line
          </Button>
        </div>

        <Separator />

        {/* Text Controls */}
        <div className="space-y-4">
          <h3 className="font-semibold text-sm">Text Controls</h3>
          
          <div className="space-y-2">
            <Label htmlFor="text-content" className="text-xs">Text</Label>
            <Input
              id="text-content"
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Font Size: {fontSize[0]}px</Label>
            <Slider
              value={fontSize}
              onValueChange={setFontSize}
              max={72}
              min={8}
              step={1}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="text-color" className="text-xs">Color</Label>
            <div className="flex gap-2">
              <Input
                id="text-color"
                type="color"
                value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
                className="w-12 h-8 p-1 border rounded"
              />
              <Input
                value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
                className="flex-1 h-8 text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Font Family</Label>
            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              className="w-full h-8 px-2 text-sm border border-border rounded-md bg-background"
            >
              <option value="Arial">Arial</option>
              <option value="Georgia">Georgia</option>
              <option value="Times New Roman">Times New Roman</option>
              <option value="Helvetica">Helvetica</option>
              <option value="Courier New">Courier New</option>
            </select>
          </div>

          {/* Text Style Buttons */}
          <div className="flex gap-1">
            <Button
              variant={isBold ? "default" : "outline"}
              size="sm"
              onClick={() => setIsBold(!isBold)}
              className="h-8 w-8 p-0"
            >
              <Bold className="h-3 w-3" />
            </Button>
            <Button
              variant={isItalic ? "default" : "outline"}
              size="sm"
              onClick={() => setIsItalic(!isItalic)}
              className="h-8 w-8 p-0"
            >
              <Italic className="h-3 w-3" />
            </Button>
            <Button
              variant={isUnderline ? "default" : "outline"}
              size="sm"
              onClick={() => setIsUnderline(!isUnderline)}
              className="h-8 w-8 p-0"
            >
              <Underline className="h-3 w-3" />
            </Button>
          </div>

          {/* Text Alignment */}
          <div className="flex gap-1">
            <Button
              variant={textAlign === "left" ? "default" : "outline"}
              size="sm"
              onClick={() => setTextAlign("left")}
              className="h-8 w-8 p-0"
            >
              <AlignLeft className="h-3 w-3" />
            </Button>
            <Button
              variant={textAlign === "center" ? "default" : "outline"}
              size="sm"
              onClick={() => setTextAlign("center")}
              className="h-8 w-8 p-0"
            >
              <AlignCenter className="h-3 w-3" />
            </Button>
            <Button
              variant={textAlign === "right" ? "default" : "outline"}
              size="sm"
              onClick={() => setTextAlign("right")}
              className="h-8 w-8 p-0"
            >
              <AlignRight className="h-3 w-3" />
            </Button>
          </div>

          <Button onClick={addText} className="w-full" size="sm">
            Add Text
          </Button>
        </div>

        <Separator />

        {/* Export Controls */}
        <div className="space-y-2">
          <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full" size="sm">
                <Save className="h-4 w-4 mr-2" />
                Save as Template
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Save Template</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="template-name">Template Name</Label>
                  <Input
                    id="template-name"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Enter template name..."
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSaveTemplate} className="flex-1">
                    Save Template
                  </Button>
                  <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          
          <Button onClick={exportImage} variant="outline" className="w-full" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export Image
          </Button>
          <Button onClick={clearCanvas} variant="outline" className="w-full" size="sm">
            Clear Canvas
          </Button>
        </div>
      </Card>
    </div>
  );
};