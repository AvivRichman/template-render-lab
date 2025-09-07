import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Play, 
  Copy, 
  RefreshCw,
  Code,
  Zap,
  Download,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";

export const APIDemo = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [templateId, setTemplateId] = useState("template_123");
  const [textOverrides, setTextOverrides] = useState('{"title": "New Title", "subtitle": "Updated subtitle"}');
  const [response, setResponse] = useState<string>("");
  
  // Mock API usage
  const [apiUsage] = useState({
    current: 23,
    limit: 70,
    resetDate: "2024-02-01"
  });

  const executeAPICall = async () => {
    setIsLoading(true);
    
    // Simulate API call
    setTimeout(() => {
      const mockResponse = {
        success: true,
        image_url: "https://example.com/generated-image-123.png",
        template_id: templateId,
        generation_time: "1.2s",
        usage: {
          calls_remaining: apiUsage.limit - apiUsage.current - 1
        }
      };
      
      setResponse(JSON.stringify(mockResponse, null, 2));
      setIsLoading(false);
      toast("Image generated successfully!");
    }, 2000);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast("Copied to clipboard!");
  };

  const curlExample = `curl -X POST https://api.imageeditorpro.com/v1/generate \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "template_id": "${templateId}",
    "overrides": ${textOverrides}
  }'`;

  const jsExample = `const response = await fetch('https://api.imageeditorpro.com/v1/generate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    template_id: '${templateId}',
    overrides: ${textOverrides}
  })
});

const data = await response.json();
console.log(data.image_url);`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold mb-2">API Demo</h2>
        <p className="text-muted-foreground">
          Test the Image Editor Pro API to dynamically generate images from templates
        </p>
      </div>

      {/* Usage Stats */}
      <Card className="p-4 bg-[hsl(var(--editor-background))]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            <span className="font-medium">API Usage</span>
          </div>
          <Badge variant={apiUsage.current >= apiUsage.limit * 0.8 ? "destructive" : "default"}>
            {apiUsage.current}/{apiUsage.limit} calls
          </Badge>
        </div>
        <div className="w-full bg-[hsl(var(--editor-border))] rounded-full h-2 mb-2">
          <div 
            className="bg-primary h-2 rounded-full transition-all duration-300"
            style={{ width: `${(apiUsage.current / apiUsage.limit) * 100}%` }}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Resets on {new Date(apiUsage.resetDate).toLocaleDateString()}
        </p>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* API Tester */}
        <Card className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Play className="h-4 w-4" />
            API Tester
          </h3>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="api-key">API Key</Label>
              <Input
                id="api-key"
                type="password"
                placeholder="Enter your API key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
            
            <div>
              <Label htmlFor="template-id">Template ID</Label>
              <Input
                id="template-id"
                placeholder="template_123"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              />
            </div>
            
            <div>
              <Label htmlFor="overrides">Text Overrides (JSON)</Label>
              <Textarea
                id="overrides"
                rows={4}
                placeholder='{"title": "New Title"}'
                value={textOverrides}
                onChange={(e) => setTextOverrides(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            
            <Button 
              onClick={executeAPICall} 
              disabled={!apiKey || !templateId || isLoading}
              className="w-full"
            >
              {isLoading ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              {isLoading ? "Generating..." : "Generate Image"}
            </Button>
            
            {response && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <Label>Response</Label>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => copyToClipboard(response)}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </Button>
                </div>
                <pre className="bg-[hsl(var(--editor-background))] p-3 rounded-md text-sm overflow-auto max-h-40 border">
                  {response}
                </pre>
              </div>
            )}
          </div>
        </Card>

        {/* Code Examples */}
        <Card className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Code className="h-4 w-4" />
            Code Examples
          </h3>
          
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">cURL</Label>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => copyToClipboard(curlExample)}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copy
                </Button>
              </div>
              <pre className="bg-[hsl(var(--editor-background))] p-3 rounded-md text-xs overflow-auto border">
                {curlExample}
              </pre>
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">JavaScript</Label>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => copyToClipboard(jsExample)}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copy
                </Button>
              </div>
              <pre className="bg-[hsl(var(--editor-background))] p-3 rounded-md text-xs overflow-auto border">
                {jsExample}
              </pre>
            </div>
          </div>
        </Card>
      </div>

      {/* API Documentation Preview */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4">Quick Reference</h3>
        
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-sm mb-2">Authentication</h4>
            <p className="text-sm text-muted-foreground">
              Include your API key in the Authorization header: <code className="bg-[hsl(var(--editor-background))] px-1 py-0.5 rounded text-xs">Bearer YOUR_API_KEY</code>
            </p>
          </div>
          
          <Separator />
          
          <div>
            <h4 className="font-medium text-sm mb-2">Endpoints</h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="outline">POST</Badge>
                <code>/v1/generate</code> - Generate image from template
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">GET</Badge>
                <code>/v1/templates</code> - List your templates
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">GET</Badge>
                <code>/v1/usage</code> - Check API usage
              </div>
            </div>
          </div>
          
          <Separator />
          
          <div>
            <h4 className="font-medium text-sm mb-2">Rate Limits</h4>
            <div className="bg-amber-50 dark:bg-amber-950/10 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800 dark:text-amber-200">Free Plan Limits</p>
                  <p className="text-amber-700 dark:text-amber-300">70 API calls per month • 7 templates max • 7 uploads max</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};