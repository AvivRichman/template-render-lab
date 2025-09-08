import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Play, 
  Copy, 
  RefreshCw,
  Code,
  Zap,
  Eye,
  AlertCircle,
  Key,
  Database,
  TestTube
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface Template {
  id: string;
  name: string;
  elements: Array<{
    id: string;
    type: string;
    content?: string;
    editable_key: string;
    properties: any;
  }>;
  thumbnail_url?: string;
}

interface ApiUsage {
  current_month: {
    total_calls: number;
    limit: number;
    remaining: number;
    by_endpoint: Record<string, number>;
  };
  reset_date: string;
  plan: string;
}

export const APIDemo = () => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [apiUsage, setApiUsage] = useState<ApiUsage | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [textOverrides, setTextOverrides] = useState('{"title": "New Title", "subtitle": "Updated subtitle"}');
  const [response, setResponse] = useState<string>("");
  const [userToken, setUserToken] = useState<string>("");

  const baseUrl = `https://nracebwmywbyuywhucwo.supabase.co/functions/v1`;

  useEffect(() => {
    if (user) {
      fetchUserToken();
      fetchTemplates();
      fetchApiUsage();
    }
  }, [user]);

  const fetchUserToken = async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      setUserToken(data.session.access_token);
    }
  };

  const fetchTemplates = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) return;

      const response = await fetch(`${baseUrl}/api-templates`, {
        headers: {
          'Authorization': `Bearer ${data.session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        setTemplates(result.templates || []);
        if (result.templates?.length > 0) {
          setSelectedTemplate(result.templates[0]);
        }
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  const fetchApiUsage = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) return;

      const response = await fetch(`${baseUrl}/api-usage`, {
        headers: {
          'Authorization': `Bearer ${data.session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        setApiUsage(result.usage);
      }
    } catch (error) {
      console.error('Error fetching API usage:', error);
    }
  };

  const executeAPICall = async () => {
    if (!selectedTemplate || !userToken) return;
    
    setIsLoading(true);
    
    try {
      const overrides = JSON.parse(textOverrides);
      
      const response = await fetch(`${baseUrl}/api-generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          template_id: selectedTemplate.id,
          overrides
        })
      });

      const result = await response.json();
      setResponse(JSON.stringify(result, null, 2));
      
      if (result.success) {
        toast.success("Image generated successfully!");
        // Refresh API usage
        await fetchApiUsage();
      } else {
        toast.error(result.error || "Failed to generate image");
      }
    } catch (error) {
      toast.error("Error making API call");
      setResponse(JSON.stringify({ error: error.message }, null, 2));
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast("Copied to clipboard!");
  };

  // Generate code examples based on selected template
  const generateCurlExample = () => {
    if (!selectedTemplate) return '';
    
    return `curl -X POST ${baseUrl}/api-generate \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "template_id": "${selectedTemplate.id}",
    "overrides": ${textOverrides}
  }'`;
  };

  const generateJsExample = () => {
    if (!selectedTemplate) return '';
    
    return `const response = await fetch('${baseUrl}/api-generate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    template_id: '${selectedTemplate.id}',
    overrides: ${textOverrides}
  })
});

const data = await response.json();
console.log(data.image_url);`;
  };

  const generatePythonExample = () => {
    if (!selectedTemplate) return '';
    
    return `import requests
import json

url = "${baseUrl}/api-generate"
headers = {
    "Authorization": "Bearer YOUR_TOKEN",
    "Content-Type": "application/json"
}
data = {
    "template_id": "${selectedTemplate.id}",
    "overrides": ${textOverrides}
}

response = requests.post(url, headers=headers, json=data)
result = response.json()
print(result["image_url"])`;
  };

  if (!user) {
    return (
      <Card className="p-8 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Authentication Required</h3>
        <p className="text-muted-foreground">Please log in to access the API documentation and testing tools.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold mb-2">API Documentation & Testing</h2>
        <p className="text-muted-foreground">
          Complete HTTP API for generating images from your templates programmatically
        </p>
      </div>

      {/* API Usage Stats */}
      {apiUsage && (
        <Card className="p-4 bg-[hsl(var(--editor-background))]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              <span className="font-medium">API Usage</span>
            </div>
            <Badge variant={apiUsage.current_month.remaining <= 10 ? "destructive" : "default"}>
              {apiUsage.current_month.total_calls}/{apiUsage.current_month.limit} calls
            </Badge>
          </div>
          <div className="w-full bg-[hsl(var(--editor-border))] rounded-full h-2 mb-2">
            <div 
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${(apiUsage.current_month.total_calls / apiUsage.current_month.limit) * 100}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {apiUsage.current_month.remaining} calls remaining • Resets on {new Date(apiUsage.reset_date).toLocaleDateString()}
          </p>
        </Card>
      )}

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
          <TabsTrigger value="templates">Your Templates</TabsTrigger>
          <TabsTrigger value="testing">Live Testing</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Authentication */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Key className="h-4 w-4" />
              Authentication
            </h3>
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Base URL</Label>
                <div className="mt-1 p-3 bg-[hsl(var(--editor-background))] rounded-md font-mono text-sm border">
                  {baseUrl}
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">Your Bearer Token</Label>
                <div className="mt-1 p-3 bg-[hsl(var(--editor-background))] rounded-md font-mono text-sm border flex items-center justify-between">
                  <span className="truncate mr-2">{userToken || 'Loading...'}</span>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => copyToClipboard(userToken)}
                    disabled={!userToken}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Include this token in the Authorization header: <code>Bearer YOUR_TOKEN</code>
                </p>
              </div>
            </div>
          </Card>

          {/* Quick Start */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Quick Start</h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">1</div>
                <div>
                  <h4 className="font-medium">Get Your Templates</h4>
                  <p className="text-sm text-muted-foreground">List all your templates and their editable elements</p>
                  <code className="text-xs bg-[hsl(var(--editor-background))] px-2 py-1 rounded">GET /api-templates</code>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">2</div>
                <div>
                  <h4 className="font-medium">Generate Images</h4>
                  <p className="text-sm text-muted-foreground">Send modifications and get back rendered image URLs</p>
                  <code className="text-xs bg-[hsl(var(--editor-background))] px-2 py-1 rounded">POST /api-generate</code>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">3</div>
                <div>
                  <h4 className="font-medium">Monitor Usage</h4>
                  <p className="text-sm text-muted-foreground">Track your API calls and remaining quota</p>
                  <code className="text-xs bg-[hsl(var(--editor-background))] px-2 py-1 rounded">GET /api-usage</code>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="endpoints" className="space-y-6">
          {/* Endpoints Documentation */}
          <div className="grid gap-6">
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Badge variant="outline">GET</Badge>
                <code className="text-sm">/api-templates</code>
              </div>
              <p className="text-sm text-muted-foreground mb-4">Get all your templates with their editable elements</p>
              <div className="space-y-3">
                <div>
                  <h5 className="text-sm font-medium mb-2">Response Example:</h5>
                  <pre className="bg-[hsl(var(--editor-background))] p-3 rounded-md text-xs overflow-auto border">
{`{
  "success": true,
  "templates": [
    {
      "id": "template_123",
      "name": "Business Card",
      "elements": [
        {
          "id": "text_0",
          "type": "text",
          "content": "John Doe",
          "editable_key": "name"
        }
      ]
    }
  ]
}`}
                  </pre>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Badge>POST</Badge>
                <code className="text-sm">/api-generate</code>
              </div>
              <p className="text-sm text-muted-foreground mb-4">Generate image from template with modifications</p>
              <div className="space-y-3">
                <div>
                  <h5 className="text-sm font-medium mb-2">Request Body:</h5>
                  <pre className="bg-[hsl(var(--editor-background))] p-3 rounded-md text-xs overflow-auto border">
{`{
  "template_id": "template_123",
  "overrides": {
    "name": "Jane Smith",
    "title": "Senior Developer"
  }
}`}
                  </pre>
                </div>
                <div>
                  <h5 className="text-sm font-medium mb-2">Response Example:</h5>
                  <pre className="bg-[hsl(var(--editor-background))] p-3 rounded-md text-xs overflow-auto border">
{`{
  "success": true,
  "image_url": "https://...generated-image.png",
  "template_id": "template_123",
  "generation_time": "1.2s"
}`}
                  </pre>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Badge variant="outline">GET</Badge>
                <code className="text-sm">/api-usage</code>
              </div>
              <p className="text-sm text-muted-foreground mb-4">Check your current API usage and limits</p>
              <div className="space-y-3">
                <div>
                  <h5 className="text-sm font-medium mb-2">Response Example:</h5>
                  <pre className="bg-[hsl(var(--editor-background))] p-3 rounded-md text-xs overflow-auto border">
{`{
  "success": true,
  "usage": {
    "current_month": {
      "total_calls": 23,
      "limit": 70,
      "remaining": 47
    },
    "reset_date": "2024-02-01"
  }
}`}
                  </pre>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="templates" className="space-y-6">
          {/* User Templates */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Database className="h-4 w-4" />
              Your Templates ({templates.length})
            </h3>
            
            {templates.length === 0 ? (
              <div className="text-center py-8">
                <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">No templates found. Create some templates in the Editor first.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {templates.map((template) => (
                  <div key={template.id} className="border border-[hsl(var(--editor-border))] rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-medium">{template.name}</h4>
                        <code className="text-xs text-muted-foreground">ID: {template.id}</code>
                      </div>
                      {template.thumbnail_url && (
                        <img src={template.thumbnail_url} alt={template.name} className="w-16 h-16 object-cover rounded" />
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Editable Elements:</Label>
                      {template.elements.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No editable elements found</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {template.elements.map((element) => (
                            <div key={element.id} className="bg-[hsl(var(--editor-background))] p-2 rounded text-xs">
                              <div className="flex items-center justify-between mb-1">
                                <Badge variant="outline" className="text-xs h-4">
                                  {element.type}
                                </Badge>
                                <code className="text-muted-foreground">{element.editable_key}</code>
                              </div>
                              {element.content && (
                                <p className="text-muted-foreground truncate">"{element.content}"</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="testing" className="space-y-6">
          {/* Live API Tester */}
          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <TestTube className="h-4 w-4" />
                Live API Tester
              </h3>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="template-select">Select Template</Label>
                  <select
                    id="template-select"
                    value={selectedTemplate?.id || ''}
                    onChange={(e) => {
                      const template = templates.find(t => t.id === e.target.value);
                      setSelectedTemplate(template || null);
                    }}
                    className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background"
                  >
                    <option value="">Choose a template...</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} ({template.elements.length} elements)
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <Label htmlFor="overrides">Overrides (JSON)</Label>
                  <Textarea
                    id="overrides"
                    rows={6}
                    placeholder='{"key": "value"}'
                    value={textOverrides}
                    onChange={(e) => setTextOverrides(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>
                
                <Button 
                  onClick={executeAPICall} 
                  disabled={!selectedTemplate || isLoading}
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
              
              <Tabs defaultValue="curl" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="curl">cURL</TabsTrigger>
                  <TabsTrigger value="js">JavaScript</TabsTrigger>
                  <TabsTrigger value="python">Python</TabsTrigger>
                </TabsList>
                
                <TabsContent value="curl" className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm">cURL Command</Label>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => copyToClipboard(generateCurlExample())}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy
                    </Button>
                  </div>
                  <pre className="bg-[hsl(var(--editor-background))] p-3 rounded-md text-xs overflow-auto border">
                    {generateCurlExample()}
                  </pre>
                </TabsContent>
                
                <TabsContent value="js" className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm">JavaScript (Fetch)</Label>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => copyToClipboard(generateJsExample())}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy
                    </Button>
                  </div>
                  <pre className="bg-[hsl(var(--editor-background))] p-3 rounded-md text-xs overflow-auto border">
                    {generateJsExample()}
                  </pre>
                </TabsContent>
                
                <TabsContent value="python" className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm">Python (Requests)</Label>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => copyToClipboard(generatePythonExample())}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy
                    </Button>
                  </div>
                  <pre className="bg-[hsl(var(--editor-background))] p-3 rounded-md text-xs overflow-auto border">
                    {generatePythonExample()}
                  </pre>
                </TabsContent>
              </Tabs>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};