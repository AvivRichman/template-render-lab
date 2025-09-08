import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Copy, 
  Code, 
  Key,
  Server,
  FileText,
  Zap,
  ExternalLink,
  AlertCircle,
  CheckCircle
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useTemplates } from "@/hooks/useTemplates";
import { supabase } from "@/integrations/supabase/client";

export default function APIDocs() {
  const { user } = useAuth();
  const { templates } = useTemplates();
  const [apiKey, setApiKey] = useState<string>("");

  const baseUrl = "https://nracebwmywbyuywhucwo.supabase.co/functions/v1";

  useEffect(() => {
    if (user) {
      // Get user's access token for API calls
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.access_token) {
          setApiKey(session.access_token);
        }
      });
    }
  }, [user]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast("Copied to clipboard!");
  };

  const generateCurlExample = (templateId: string, textElements: any[]) => {
    const overrides = textElements.reduce((acc, element) => {
      acc[element.id] = `Updated ${element.text}`;
      return acc;
    }, {} as Record<string, string>);

    return `curl -X POST ${baseUrl}/api-generate \\
  -H "Authorization: Bearer ${apiKey || 'YOUR_API_TOKEN'}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "template_id": "${templateId}",
    "overrides": ${JSON.stringify(overrides, null, 4)}
  }'`;
  };

  const generateJSExample = (templateId: string, textElements: any[]) => {
    const overrides = textElements.reduce((acc, element) => {
      acc[element.id] = `Updated ${element.text}`;
      return acc;
    }, {} as Record<string, string>);

    return `const response = await fetch('${baseUrl}/api-generate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ${apiKey || 'YOUR_API_TOKEN'}',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    template_id: '${templateId}',
    overrides: ${JSON.stringify(overrides, null, 4)}
  })
});

const data = await response.json();
console.log('Generated image URL:', data.image_url);`;
  };

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Please sign in to access the API documentation and get your authentication token.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">API Documentation</h1>
        <p className="text-muted-foreground">
          Generate images from your templates programmatically using our REST API
        </p>
      </div>

      {/* Quick Start */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-5 w-5" />
          <h2 className="text-xl font-semibold">Quick Start</h2>
        </div>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-medium mb-2 flex items-center gap-2">
              <Server className="h-4 w-4" />
              Base URL
            </h3>
            <div className="flex items-center gap-2">
              <code className="bg-muted px-2 py-1 rounded text-sm flex-1">{baseUrl}</code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(baseUrl)}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <div>
            <h3 className="font-medium mb-2 flex items-center gap-2">
              <Key className="h-4 w-4" />
              Your API Token
            </h3>
            <div className="flex items-center gap-2">
              <code className="bg-muted px-2 py-1 rounded text-sm flex-1 font-mono">
                {apiKey ? `${apiKey.substring(0, 20)}...` : 'Loading...'}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(apiKey)}
                disabled={!apiKey}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              This token expires with your session. Get a fresh one by signing in again.
            </p>
          </div>
        </div>
      </Card>

      {/* API Endpoints */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">API Endpoints</h2>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <Badge>POST</Badge>
              <code>/api-generate</code>
              <span className="text-sm text-muted-foreground">Generate image from template</span>
            </div>
            <Badge variant="secondary">Primary</Badge>
          </div>
          
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <Badge variant="outline">GET</Badge>
              <code>/api-templates</code>
              <span className="text-sm text-muted-foreground">List your templates with element IDs</span>
            </div>
          </div>
          
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <Badge variant="outline">GET</Badge>
              <code>/api-usage</code>
              <span className="text-sm text-muted-foreground">Check your API usage stats</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Your Templates */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="h-5 w-5" />
          <h2 className="text-xl font-semibold">Your Templates</h2>
        </div>

        {templates.length === 0 ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              You don't have any templates yet. Create a template in the editor first.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            {templates.map((template) => {
              const textElements = template.scene_data?.objects?.filter(
                (obj: any) => obj.type === 'i-text' || obj.type === 'text'
              ).map((obj: any, index: number) => ({
                id: obj.id || `text_${index + 1}`,
                text: obj.text || 'Text element',
                type: obj.type
              })) || [];

              return (
                <Card key={template.id} className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-medium">{template.name}</h3>
                      <p className="text-sm text-muted-foreground">ID: {template.id}</p>
                    </div>
                    <Badge variant="outline">{textElements.length} text elements</Badge>
                  </div>

                  {textElements.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium mb-2">Editable Text Elements:</h4>
                      <div className="grid gap-2">
                        {textElements.map((element) => (
                          <div key={element.id} className="flex items-center gap-2 text-sm">
                            <code className="bg-muted px-2 py-1 rounded">{element.id}</code>
                            <span className="text-muted-foreground">→</span>
                            <span>"{element.text}"</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <Tabs defaultValue="curl" className="w-full">
                    <TabsList>
                      <TabsTrigger value="curl">cURL</TabsTrigger>
                      <TabsTrigger value="javascript">JavaScript</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="curl" className="mt-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">cURL Example</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(generateCurlExample(template.id, textElements))}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copy
                        </Button>
                      </div>
                      <pre className="bg-muted p-3 rounded text-xs overflow-auto">
                        {generateCurlExample(template.id, textElements)}
                      </pre>
                    </TabsContent>
                    
                    <TabsContent value="javascript" className="mt-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">JavaScript Example</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(generateJSExample(template.id, textElements))}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copy
                        </Button>
                      </div>
                      <pre className="bg-muted p-3 rounded text-xs overflow-auto">
                        {generateJSExample(template.id, textElements)}
                      </pre>
                    </TabsContent>
                  </Tabs>
                </Card>
              );
            })}
          </div>
        )}
      </Card>

      {/* Response Format */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Response Format</h2>
        
        <div className="space-y-4">
          <div>
            <h3 className="font-medium mb-2 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Success Response
            </h3>
            <pre className="bg-muted p-3 rounded text-sm overflow-auto">
{`{
  "success": true,
  "image_url": "https://nracebwmywbyuywhucwo.supabase.co/storage/v1/object/public/api-renders/generated-image.png",
  "template_id": "12345678-1234-5678-9012-123456789012",
  "generation_time": "1.2s",
  "usage": {
    "calls_remaining": "Check /api-usage endpoint"
  }
}`}
            </pre>
          </div>

          <div>
            <h3 className="font-medium mb-2 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              Error Response
            </h3>
            <pre className="bg-muted p-3 rounded text-sm overflow-auto">
{`{
  "error": "Template not found or access denied"
}`}
            </pre>
          </div>
        </div>
      </Card>

      {/* Rate Limits */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Rate Limits & Usage</h2>
        
        <Alert className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Free Plan Limits:</strong> 70 API calls per month • Resets on the 1st of each month
          </AlertDescription>
        </Alert>

        <div className="space-y-2 text-sm">
          <p><strong>401 Unauthorized:</strong> Invalid or missing API token</p>
          <p><strong>404 Not Found:</strong> Template doesn't exist or you don't have access</p>
          <p><strong>429 Too Many Requests:</strong> Rate limit exceeded</p>
          <p><strong>500 Internal Server Error:</strong> Something went wrong on our end</p>
        </div>
      </Card>
    </div>
  );
}