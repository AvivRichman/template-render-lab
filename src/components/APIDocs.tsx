import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Copy, 
  ExternalLink, 
  Code, 
  Zap, 
  Globe,
  CheckCircle,
  AlertCircle,
  Edit,
  Eye
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTemplates } from "@/hooks/useTemplates";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const APIDocs = () => {
  const { user } = useAuth();
  const { templates } = useTemplates();
  const [apiUsage, setApiUsage] = useState({ used: 0, limit: 70 });
  const [bearerToken, setBearerToken] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");

  const baseUrl = "https://nracebwmywbyuywhucwo.supabase.co/functions/v1";

  useEffect(() => {
    fetchApiUsage();
    fetchBearerToken();
  }, [user]);

  const fetchApiUsage = async () => {
    if (!user) return;
    
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const { count } = await supabase
      .from('api_usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('endpoint', 'render')
      .gte('called_at', startOfMonth.toISOString());

    setApiUsage({ used: count || 0, limit: 70 });
  };

  const fetchBearerToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      setBearerToken(session.access_token);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const getTemplateElements = (template: any) => {
    if (!template?.scene_data?.objects) return [];
    
    return template.scene_data.objects
      .filter((obj: any) => obj.type === 'text')
      .map((obj: any, index: number) => ({
        id: obj.id || 'unknown',
        name: obj.name || `text${index + 1}`,
        type: obj.type || 'text',
        text: obj.text || 'Sample text'
      }));
  };

  const getSelectedTemplateElements = () => {
    if (!selectedTemplate) return [];
    const template = templates.find(t => t.id === selectedTemplate);
    return template ? getTemplateElements(template) : [];
  };

  const generateDynamicParams = () => {
    const elements = getSelectedTemplateElements();
    if (elements.length === 0) {
      return {
        urlParams: 'text1=Hello%20World&text2=Sample%20Text',
        jsonParams: elements
      };
    }
    
    const urlParams = elements
      .map((el, idx) => `text${idx + 1}=${encodeURIComponent(`New ${el.name || 'Text'}`)}`)
      .join('&');
    
    return { urlParams, jsonParams: elements };
  };

  const { urlParams, jsonParams } = generateDynamicParams();

  const curlExample = selectedTemplate && jsonParams.length > 0 
    ? `curl -X POST "${baseUrl}/render?${urlParams}" \\
  -H "Authorization: Bearer ${bearerToken}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "templateId": "${selectedTemplate}"
  }'`
    : `curl -X POST "${baseUrl}/render" \\
  -H "Authorization: Bearer ${bearerToken}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "templateId": "${selectedTemplate || 'YOUR_TEMPLATE_ID'}",
    "text1": "Hello World",
    "text2": "Sample Text"
  }'`;

  const jsExample = selectedTemplate && jsonParams.length > 0
    ? `const response = await fetch('${baseUrl}/render?${urlParams}', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ${bearerToken}',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    templateId: '${selectedTemplate}'
  })
});

const data = await response.json();
console.log('Rendered image URL:', data.imageUrl);`
    : `const response = await fetch('${baseUrl}/render', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ${bearerToken}',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    templateId: '${selectedTemplate || 'YOUR_TEMPLATE_ID'}',
    text1: 'Hello World',
    text2: 'Sample Text'
  })
});

const data = await response.json();
console.log('Rendered image URL:', data.imageUrl);`;

  const jsonExample = selectedTemplate && jsonParams.length > 0
    ? `{
  "templateId": "${selectedTemplate}",${jsonParams.map((el, idx) => `
  "text${idx + 1}": "New ${el.name || 'Text'}"`).join(',')}
}`
    : `{
  "templateId": "${selectedTemplate || 'YOUR_TEMPLATE_ID'}",
  "text1": "Hello World",
  "text2": "Sample Text"
}`;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">API Documentation</h1>
        <p className="text-muted-foreground">
          Generate dynamic images by modifying your saved templates via HTTP API
        </p>
      </div>

      {/* API Status */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-green-500" />
            <span className="font-semibold">API Status</span>
            <Badge variant="outline" className="text-green-600 border-green-200">
              <CheckCircle className="h-3 w-3 mr-1" />
              Online
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            Base URL: <code className="bg-muted px-2 py-1 rounded text-xs">{baseUrl}</code>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Monthly Quota</span>
              <span className="text-sm text-muted-foreground">{apiUsage.used}/{apiUsage.limit}</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all duration-300 ${
                  apiUsage.used >= apiUsage.limit ? 'bg-destructive' : 'bg-primary'
                }`}
                style={{ width: `${(apiUsage.used / apiUsage.limit) * 100}%` }}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label className="text-sm font-medium">Bearer Token</Label>
            <div className="flex gap-2">
              <Input 
                type="password" 
                value={bearerToken} 
                readOnly 
                className="font-mono text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(bearerToken, "Bearer token")}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Templates</Label>
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background"
            >
              <option value="">Select a template...</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Templates & Elements */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Your Templates & Elements</h2>
        
        {templates.length > 0 ? (
          <div className="space-y-4">
            {templates.map((template) => {
              const elements = getTemplateElements(template);
              return (
                <div key={template.id} className="border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-medium">{template.name}</h3>
                      <code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                        {template.id}
                      </code>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline">
                        <Edit className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => setSelectedTemplate(template.id)}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        Use in API
                      </Button>
                    </div>
                  </div>
                  
                  {elements.length > 0 ? (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">Elements ({elements.length})</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {elements.map((element, idx) => (
                          <div key={idx} className="bg-muted rounded p-2 text-xs">
                            <div className="font-medium">
                              <Badge variant="secondary" className="text-xs mr-2">
                                {element.type}
                              </Badge>
                              {element.name}
                            </div>
                            <code className="text-muted-foreground">id: {element.id}</code>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No elements found in this template</p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No templates found. Create some templates first!</p>
          </div>
        )}
      </Card>

      {/* Code Examples */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Code Examples</h2>
        
        <Tabs defaultValue="curl" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="curl">cURL</TabsTrigger>
            <TabsTrigger value="javascript">JavaScript</TabsTrigger>
            <TabsTrigger value="json">JSON</TabsTrigger>
          </TabsList>
          
          <TabsContent value="curl" className="space-y-4">
            <div className="relative">
              <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
                <code>{curlExample}</code>
              </pre>
              <Button
                size="sm"
                variant="outline"
                className="absolute top-2 right-2"
                onClick={() => copyToClipboard(curlExample, "cURL example")}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="javascript" className="space-y-4">
            <div className="relative">
              <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
                <code>{jsExample}</code>
              </pre>
              <Button
                size="sm"
                variant="outline"
                className="absolute top-2 right-2"
                onClick={() => copyToClipboard(jsExample, "JavaScript example")}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="json" className="space-y-4">
            <div className="relative">
              <div className="mb-2">
                <p className="text-sm text-muted-foreground">Request Body (JSON format)</p>
              </div>
              <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
                <code>{jsonExample}</code>
              </pre>
              <Button
                size="sm"
                variant="outline"
                className="absolute top-8 right-2"
                onClick={() => copyToClipboard(jsonExample, "JSON example")}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </Card>

      {/* API Reference */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">API Reference</h2>
        
        <div className="space-y-6">
          <div>
            <h3 className="font-medium mb-2">Endpoint</h3>
            <code className="bg-muted px-3 py-2 rounded text-sm block">
              POST {baseUrl}/render
            </code>
          </div>

          <div>
            <h3 className="font-medium mb-2">Authentication</h3>
            <code className="bg-muted px-3 py-2 rounded text-sm block">
              Authorization: Bearer {bearerToken ? '••••••••' : '<your-token>'}
            </code>
          </div>

          <div>
            <h3 className="font-medium mb-2">Response Format</h3>
            <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
              <code>{`{
  "status": "ok",
  "imageUrl": "https://..../rendered-image.png",
  "renderId": "rnd_abc123"
}`}</code>
            </pre>
          </div>

          <div>
            <h3 className="font-medium mb-2">Error Codes</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="destructive">400</Badge>
                <span className="text-sm">Invalid request payload</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="destructive">401</Badge>
                <span className="text-sm">Invalid or missing authorization</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="destructive">404</Badge>
                <span className="text-sm">Template not found</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="destructive">429</Badge>
                <span className="text-sm">Monthly quota exceeded</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="destructive">500</Badge>
                <span className="text-sm">Internal server error</span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};