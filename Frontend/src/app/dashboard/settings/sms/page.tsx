'use client';

/**
 * SMS Management Panel
 * 
 * Admin interface for:
 * - Viewing and editing SMS templates
 * - Toggling notifications on/off
 * - Viewing SMS logs
 * - Testing SMS sending
 * - Viewing statistics
 */

import { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Settings,
  History,
  BarChart3,
  Edit,
  Eye,
  Power,
  PowerOff,
  Search,
  RefreshCw,
  Send,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  Phone,
  ChevronRight,
  Loader2,
  Info,
  Copy,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/apiClient';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';

// =============================================================================
// TYPES
// =============================================================================

interface Template {
  id: string;
  slug: string;
  name: string;
  description?: string;
  content: string;
  category: string;
  is_active: boolean;
  available_variables: string[];
  created_at: string;
  updated_at: string;
}

interface SmsLog {
  id: string;
  recipient_phone: string;
  message_content: string;
  template_slug?: string;
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'disabled';
  provider?: string;
  error_message?: string;
  context?: any;
  queued_at: string;
  sent_at?: string;
  template?: { name: string };
}

interface Stats {
  total_sent: number;
  total_delivered: number;
  total_failed: number;
  delivery_rate: number;
  today_sent: number;
  today_failed: number;
  by_template?: Record<string, number>;
}

interface Settings {
  SMS_ENABLED: { value: string; description: string };
  SMS_PROVIDER: { value: string; description: string };
  SMS_SENDER_ID: { value: string; description: string };
  SMS_DAILY_LIMIT: { value: string; description: string };
}

// =============================================================================
// STATUS CONFIG
// =============================================================================

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  sent: { label: 'Sent', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  delivered: { label: 'Delivered', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700', icon: XCircle },
  disabled: { label: 'Disabled', color: 'bg-gray-100 text-gray-600', icon: PowerOff },
  invalid_number: { label: 'Invalid', color: 'bg-orange-100 text-orange-700', icon: AlertCircle },
};

const CATEGORY_CONFIG = {
  transactional: { label: 'Transactional', color: 'bg-blue-100 text-blue-700' },
  promotional: { label: 'Promotional', color: 'bg-purple-100 text-purple-700' },
  alert: { label: 'Alert', color: 'bg-red-100 text-red-700' },
  reminder: { label: 'Reminder', color: 'bg-yellow-100 text-yellow-700' },
  feedback: { label: 'Feedback', color: 'bg-green-100 text-green-700' },
};

// =============================================================================
// TEMPLATE EDIT MODAL
// =============================================================================

function TemplateEditModal({
  template,
  isOpen,
  onClose,
  onSave,
  isSaving,
}: {
  template: Template | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<Template>) => void;
  isSaving: boolean;
}) {
  const [content, setContent] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [preview, setPreview] = useState('');
  const [charCount, setCharCount] = useState(0);

  useEffect(() => {
    if (template && isOpen) {
      setContent(template.content);
      setName(template.name);
      setDescription(template.description || '');
      setPreview(template.content);
      setCharCount(template.content.length);
    }
  }, [template, isOpen]);

  const handleContentChange = (value: string) => {
    setContent(value);
    setCharCount(value.length);
    // Simple preview - remove variable syntax
    setPreview(value.replace(/\{\{(\w+)\}\}/g, '[$1]'));
  };

  if (!template) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="w-5 h-5 text-orange-500" />
            Edit Template: {template.slug}
          </DialogTitle>
          <DialogDescription>
            Modify the SMS template content. Use {`{{variable}}`} syntax for dynamic values.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="text-sm font-medium text-gray-700">Display Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium text-gray-700">Description</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="When is this SMS sent?"
              className="mt-1"
            />
          </div>

          {/* Available Variables */}
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2 text-blue-700 mb-2">
              <Info className="w-4 h-4" />
              <span className="text-sm font-medium">Available Variables</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {template.available_variables.map((v) => (
                <Badge 
                  key={v} 
                  variant="outline" 
                  className="bg-white cursor-pointer hover:bg-blue-100"
                  onClick={() => {
                    setContent(content + `{{${v}}}`);
                    handleContentChange(content + `{{${v}}}`);
                  }}
                >
                  {`{{${v}}}`}
                </Badge>
              ))}
            </div>
          </div>

          {/* Content */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-gray-700">Message Content</label>
              <span className={cn(
                'text-xs',
                charCount > 160 ? 'text-orange-600' : 'text-gray-500'
              )}>
                {charCount} characters ({Math.ceil(charCount / 160)} SMS)
              </span>
            </div>
            <Textarea
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              rows={5}
              className="font-mono text-sm"
            />
          </div>

          {/* Preview */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <label className="text-sm font-medium text-gray-700 mb-2 block">Preview</label>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{preview}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => onSave({ content, name, description })}
            disabled={isSaving || !content.trim()}
            className="bg-orange-500 hover:bg-orange-600"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Check className="w-4 h-4 mr-2" />
            )}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// TEST SMS MODAL
// =============================================================================

function TestSmsModal({
  isOpen,
  onClose,
  templates,
}: {
  isOpen: boolean;
  onClose: () => void;
  templates: Template[];
}) {
  const [phone, setPhone] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    if (!phone) {
      toast.error('Phone number is required');
      return;
    }

    setIsSending(true);
    try {
      await apiClient.post('/sms/test', {
        phone,
        template_slug: selectedTemplate && selectedTemplate !== '_custom' ? selectedTemplate : undefined,
        custom_message: !selectedTemplate || selectedTemplate === '_custom' ? customMessage : undefined,
        variables: {},
      });
      toast.success('Test SMS sent!');
      onClose();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to send');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-orange-500" />
            Send Test SMS
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Phone Number *</label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="9841234567"
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Template (optional)</label>
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select template or leave empty for custom" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_custom">Custom Message</SelectItem>
                {templates.filter(t => t.is_active).map((t) => (
                  <SelectItem key={t.slug} value={t.slug || `template-${t.id}`}>
                    {t.name} ({t.slug})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(!selectedTemplate || selectedTemplate === '_custom') && (
            <div>
              <label className="text-sm font-medium">Custom Message</label>
              <Textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Enter your test message..."
                rows={3}
                className="mt-1"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={isSending || !phone}
            className="bg-orange-500 hover:bg-orange-600"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function SmsManagementPage() {
  // State
  const [activeTab, setActiveTab] = useState('templates');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal states
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Filters
  const [templateSearch, setTemplateSearch] = useState('');
  const [logStatusFilter, setLogStatusFilter] = useState('');
  const [logPhoneFilter, setLogPhoneFilter] = useState('');

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const [templatesRes, logsRes, statsRes, settingsRes] = await Promise.all([
        apiClient.get('/sms/templates'),
        apiClient.get('/sms/logs', { params: { limit: 100 } }),
        apiClient.get('/sms/stats'),
        apiClient.get('/sms/settings'),
      ]);

      if (templatesRes.data.success) setTemplates(templatesRes.data.data);
      if (logsRes.data.success) setLogs(logsRes.data.data);
      if (statsRes.data.success) setStats(statsRes.data.data);
      if (settingsRes.data.success) setSettings(settingsRes.data.data.settings);

    } catch (error) {
      console.error('Failed to fetch SMS data:', error);
      toast.error('Failed to load SMS data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Toggle template
  const handleToggleTemplate = async (slug: string) => {
    try {
      await apiClient.patch(`/sms/templates/${slug}/toggle`);
      toast.success('Template status updated');
      fetchData();
    } catch (error) {
      toast.error('Failed to toggle template');
    }
  };

  // Save template
  const handleSaveTemplate = async (data: Partial<Template>) => {
    if (!editingTemplate) return;

    setIsSaving(true);
    try {
      await apiClient.patch(`/sms/templates/${editingTemplate.slug}`, data);
      toast.success('Template saved');
      setIsEditModalOpen(false);
      setEditingTemplate(null);
      fetchData();
    } catch (error) {
      toast.error('Failed to save template');
    } finally {
      setIsSaving(false);
    }
  };

  // Filter templates
  const filteredTemplates = templates.filter((t) => {
    if (!templateSearch) return true;
    const search = templateSearch.toLowerCase();
    return (
      t.slug.toLowerCase().includes(search) ||
      t.name.toLowerCase().includes(search)
    );
  });

  // Filter logs
  const filteredLogs = logs.filter((l) => {
    if (logStatusFilter && logStatusFilter !== '_all' && l.status !== logStatusFilter) return false;
    if (logPhoneFilter && !l.recipient_phone.includes(logPhoneFilter)) return false;
    return true;
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 rounded-xl" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const isEnabled = settings?.SMS_ENABLED?.value !== 'false';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SMS Notifications</h1>
          <p className="text-gray-500 text-sm">Manage templates, view logs, and configure settings</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={isEnabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
            {isEnabled ? 'SMS Enabled' : 'SMS Disabled'}
          </Badge>
          <Button onClick={() => setIsTestModalOpen(true)} variant="outline">
            <Send className="w-4 h-4 mr-2" />
            Test SMS
          </Button>
          <Button onClick={fetchData} variant="outline" size="icon">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.today_sent}</p>
                <p className="text-xs text-gray-500">Sent Today</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total_delivered}</p>
                <p className="text-xs text-gray-500">Delivered (30d)</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total_failed}</p>
                <p className="text-xs text-gray-500">Failed (30d)</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.delivery_rate}%</p>
                <p className="text-xs text-gray-500">Delivery Rate</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Power className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{templates.filter(t => t.is_active).length}</p>
                <p className="text-xs text-gray-500">Active Templates</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Logs
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* Templates Tab */}
        <TabsContent value="templates" className="mt-4">
          <div className="bg-white rounded-xl border">
            {/* Search */}
            <div className="p-4 border-b">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  placeholder="Search templates..."
                  className="pl-10"
                />
              </div>
            </div>

            {/* Table */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Template</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Variables</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTemplates.map((template) => {
                  const catConfig = CATEGORY_CONFIG[template.category as keyof typeof CATEGORY_CONFIG];
                  return (
                    <TableRow key={template.id}>
                      <TableCell>
                        <div>
                          <p className="font-mono text-sm font-medium">{template.slug}</p>
                          <p className="text-xs text-gray-500">{template.name}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={catConfig?.color}>
                          {catConfig?.label || template.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => handleToggleTemplate(template.slug)}
                          className={cn(
                            'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors',
                            template.is_active
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          )}
                        >
                          {template.is_active ? (
                            <>
                              <Power className="w-3 h-3" />
                              Active
                            </>
                          ) : (
                            <>
                              <PowerOff className="w-3 h-3" />
                              Disabled
                            </>
                          )}
                        </button>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {template.available_variables.slice(0, 3).map((v) => (
                            <Badge key={v} variant="secondary" className="text-[10px]">
                              {v}
                            </Badge>
                          ))}
                          {template.available_variables.length > 3 && (
                            <Badge variant="secondary" className="text-[10px]">
                              +{template.available_variables.length - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingTemplate(template);
                            setIsEditModalOpen(true);
                          }}
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs" className="mt-4">
          <div className="bg-white rounded-xl border">
            {/* Filters */}
            <div className="p-4 border-b flex items-center gap-4">
              <div className="relative flex-1 max-w-xs">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  value={logPhoneFilter}
                  onChange={(e) => setLogPhoneFilter(e.target.value)}
                  placeholder="Filter by phone..."
                  className="pl-10"
                />
              </div>
              <Select value={logStatusFilter} onValueChange={setLogStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All Status</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Table */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phone</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => {
                  const statusConfig = STATUS_CONFIG[log.status as keyof typeof STATUS_CONFIG];
                  const StatusIcon = statusConfig?.icon || AlertCircle;
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-sm">
                        {log.recipient_phone}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {log.template?.name || log.template_slug || 'Custom'}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <p className="text-sm text-gray-600 truncate">
                          {log.message_content}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusConfig?.color}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {statusConfig?.label || log.status}
                        </Badge>
                        {log.error_message && (
                          <p className="text-xs text-red-500 mt-1">
                            {log.error_message}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {formatDistanceToNow(new Date(log.queued_at), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredLogs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                      No SMS logs found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="mt-4">
          <div className="bg-white rounded-xl border p-6 space-y-6">
            <h3 className="text-lg font-semibold">SMS Configuration</h3>
            
            <div className="grid grid-cols-2 gap-6">
              {settings && Object.entries(settings).map(([key, setting]) => (
                <div key={key} className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">{key}</label>
                  <Input value={setting.value} disabled className="bg-gray-50" />
                  {setting.description && (
                    <p className="text-xs text-gray-500">{setting.description}</p>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-4 border-t">
              <p className="text-sm text-gray-500">
                <Info className="w-4 h-4 inline mr-1" />
                API keys and sensitive settings can only be changed via environment variables.
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Modal */}
      <TemplateEditModal
        template={editingTemplate}
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingTemplate(null);
        }}
        onSave={handleSaveTemplate}
        isSaving={isSaving}
      />

      {/* Test Modal */}
      <TestSmsModal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        templates={templates}
      />
    </div>
  );
}
