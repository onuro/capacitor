'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2,
  Image as ImageIcon,
  Plus,
  RefreshCw,
  Trash2,
  Link,
  Upload,
  FileImage,
  FileVideo,
  FileAudio,
  File,
  ExternalLink,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { toast } from 'sonner';
import {
  listMedia,
  importMedia,
  importMediaFromUrl,
  deleteMedia,
  type WPMedia,
  type MediaImportOptions,
} from '@/lib/api/flux-wp-cli';
import type { BaseWpCliProps } from './types';

// Helper to get icon based on mime type
function getMediaIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return FileImage;
  if (mimeType.startsWith('video/')) return FileVideo;
  if (mimeType.startsWith('audio/')) return FileAudio;
  return File;
}

// Helper to format mime type for display
function formatMimeType(mimeType: string): string {
  const parts = mimeType.split('/');
  return parts[1]?.toUpperCase() || mimeType;
}

// Cache site URL to avoid repeated WP CLI calls
const siteUrlCache = new Map<string, string>();

export function MediaManager({ appName, nodeIp }: BaseWpCliProps) {
  const { zelidauth } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadType, setUploadType] = useState<'url' | 'file'>('url');
  const [urlInput, setUrlInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mediaOptions, setMediaOptions] = useState<MediaImportOptions>({
    title: '',
    alt: '',
    caption: '',
  });
  const [confirmDelete, setConfirmDelete] = useState<WPMedia | null>(null);

  // Prefetch site URL when component mounts (so uploads are fast)
  useEffect(() => {
    const cacheKey = `${appName}:${nodeIp}`;
    if (!zelidauth || !nodeIp || siteUrlCache.has(cacheKey)) return;

    const fetchSiteUrl = async () => {
      try {
        const res = await fetch('/api/flux/exec-socket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', zelidauth },
          body: JSON.stringify({
            nodeIp,
            appName,
            component: 'wp',
            cmd: 'wp option get siteurl --allow-root --skip-themes --skip-plugins && echo "FLUXDONE"',
          }),
        });
        const data = await res.json();
        if (data.status === 'success' && data.data) {
          const urlMatch = data.data.match(/https?:\/\/[^\s\n\r#$]+/);
          if (urlMatch) {
            siteUrlCache.set(cacheKey, urlMatch[0].trim());
            console.log('Prefetched siteUrl:', urlMatch[0].trim());
          }
        }
      } catch (err) {
        console.warn('Failed to prefetch siteUrl:', err);
      }
    };

    fetchSiteUrl();
  }, [zelidauth, nodeIp, appName]);

  // Query for media list
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['wp-media', appName, nodeIp],
    queryFn: async () => {
      if (!zelidauth) throw new Error('Not authenticated');
      const result = await listMedia(zelidauth, { appName, nodeIp });
      if (result.status === 'error') {
        throw new Error(result.message);
      }
      return result.data || [];
    },
    enabled: !!zelidauth && !!nodeIp,
    staleTime: 30000,
  });

  // Import from URL mutation
  const importUrlMutation = useMutation({
    mutationFn: async ({ url, options }: { url: string; options: MediaImportOptions }) => {
      if (!zelidauth) throw new Error('Not authenticated');
      const result = await importMediaFromUrl(zelidauth, { appName, nodeIp }, url, options);
      if (result.status === 'error') throw new Error(result.message);
      return result;
    },
    onSuccess: (result) => {
      toast.success(`Media imported successfully (ID: ${result.data})`);
      resetUploadForm();
      refetch();
    },
    onError: (error: Error) => toast.error(`Failed to import: ${error.message}`),
  });

  // Upload file mutation - upload directly to WordPress site via temp PHP endpoint
  const uploadFileMutation = useMutation({
    mutationFn: async ({ file, options }: { file: File; options: MediaImportOptions }) => {
      if (!zelidauth) throw new Error('Not authenticated');

      // Helper to run exec command
      const execCmd = async (cmd: string): Promise<string> => {
        const res = await fetch('/api/flux/exec-socket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', zelidauth },
          body: JSON.stringify({ nodeIp, appName, component: 'wp', cmd }),
        });
        const data = await res.json();
        if (data.status === 'error') throw new Error(data.message);
        return data.data || '';
      };

      const startTime = performance.now();
      console.log('=== Direct WordPress Upload ===');
      console.log('File:', file.name, 'Size:', file.size);

      const cacheKey = `${appName}:${nodeIp}`;
      let siteUrl = siteUrlCache.get(cacheKey) || '';

      // Step 1: Create PHP upload script (and get siteurl if not cached)
      const phpScript = `<?php require_once('wp-load.php');header('Access-Control-Allow-Origin:*');header('Content-Type:application/json');if(isset(\\$_FILES['file'])){\\$d=wp_upload_dir();\\$f=sanitize_file_name(\\$_FILES['file']['name']);\\$t=\\$d['path'].'/'.\\$f;if(move_uploaded_file(\\$_FILES['file']['tmp_name'],\\$t)){chmod(\\$t,0644);echo json_encode(['status'=>'success','path'=>\\$t]);}else{echo json_encode(['status'=>'error','message'=>'Move failed']);}}else{echo json_encode(['status'=>'error','message'=>'No file']);}`;

      if (siteUrl) {
        // Cached: just create PHP file (fast)
        await execCmd(`cd /var/www/html && echo "${phpScript}" > flux-upload.php && echo "FLUXDONE"`);
        console.log(`⏱️ Step 1 (setup - cached): ${((performance.now() - startTime) / 1000).toFixed(1)}s`);
      } else {
        // First time: get siteurl + create PHP file
        const setupResult = await execCmd(
          `cd /var/www/html && wp option get siteurl --allow-root --skip-themes --skip-plugins && echo "${phpScript}" > flux-upload.php && echo "FLUXDONE"`
        );
        console.log(`⏱️ Step 1 (setup - first): ${((performance.now() - startTime) / 1000).toFixed(1)}s`);
        console.log('Setup result:', setupResult);

        const urlMatch = setupResult.match(/https?:\/\/[^\s\n\r#$]+/);
        siteUrl = urlMatch ? urlMatch[0].trim() : '';

        if (siteUrl) {
          siteUrlCache.set(cacheKey, siteUrl);
          console.log('Cached siteUrl:', siteUrl);
        }
      }

      const step1Time = performance.now();

      if (!siteUrl) {
        throw new Error(`Could not get WordPress site URL`);
      }

      // Step 2: POST file directly to WordPress (fast HTTP, no exec)
      const formData = new FormData();
      formData.append('file', file);

      const uploadResponse = await fetch(`${siteUrl}/flux-upload.php`, {
        method: 'POST',
        body: formData,
      });
      const uploadResult = await uploadResponse.json();
      const step2Time = performance.now();
      console.log(`⏱️ Step 2 (HTTP upload): ${((step2Time - step1Time) / 1000).toFixed(1)}s`);
      console.log('Upload result:', uploadResult);

      if (uploadResult.status !== 'success') {
        throw new Error(uploadResult.message || 'Upload failed');
      }

      // Step 3: Import to WordPress AND cleanup in ONE exec call
      // FLUXDONE marker lets exec-socket finish immediately instead of waiting 10s
      const importCmd = `cd /var/www/html && wp media import '${uploadResult.path}' ${options.title ? `--title='${options.title}'` : ''} --porcelain --skip-copy --allow-root && rm -f flux-upload.php && echo "FLUXDONE"`;

      const importResult = await execCmd(importCmd);
      const step3Time = performance.now();
      console.log(`⏱️ Step 3 (WP import): ${((step3Time - step2Time) / 1000).toFixed(1)}s`);
      console.log(`⏱️ TOTAL: ${((step3Time - startTime) / 1000).toFixed(1)}s`);
      console.log('Import result:', importResult);

      // Extract attachment ID from output
      const idMatch = importResult.match(/\d+/);
      const attachmentId = idMatch ? idMatch[0] : '';

      if (!attachmentId) {
        throw new Error('Import failed - no attachment ID returned');
      }

      return { status: 'success', data: attachmentId };
    },
    onSuccess: (result) => {
      toast.success(`Media uploaded (ID: ${result.data})`);
      resetUploadForm();
      refetch();
    },
    onError: (error: Error) => toast.error(`Failed: ${error.message}`),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      if (!zelidauth) throw new Error('Not authenticated');
      const result = await deleteMedia(zelidauth, { appName, nodeIp }, attachmentId);
      if (result.status === 'error') throw new Error(result.message);
      return result;
    },
    onSuccess: () => {
      toast.success('Media deleted');
      setConfirmDelete(null);
      refetch();
    },
    onError: (error: Error) => toast.error(`Failed to delete: ${error.message}`),
  });

  const resetUploadForm = () => {
    setUploadDialogOpen(false);
    setUploadType('url');
    setUrlInput('');
    setSelectedFile(null);
    setMediaOptions({ title: '', alt: '', caption: '' });
  };

  const handleUpload = () => {
    if (uploadType === 'url' && urlInput.trim()) {
      importUrlMutation.mutate({ url: urlInput.trim(), options: mediaOptions });
    } else if (uploadType === 'file' && selectedFile) {
      uploadFileMutation.mutate({ file: selectedFile, options: mediaOptions });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // Auto-fill title from filename if not set
      if (!mediaOptions.title) {
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
        setMediaOptions((prev) => ({ ...prev, title: nameWithoutExt }));
      }
    }
  };

  const mediaItems = Array.isArray(data) ? data : [];
  const isAnyMutating =
    importUrlMutation.isPending || uploadFileMutation.isPending || deleteMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="size-5" />
            Media Library ({mediaItems.length})
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
            <Button size="sm" onClick={() => setUploadDialogOpen(true)}>
              <Plus className="size-4 mr-1" />
              Add Media
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : mediaItems.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No media found</p>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="grid gap-2 md:grid-cols-2">
              {mediaItems.map((media) => {
                const IconComponent = getMediaIcon(media.post_mime_type);
                return (
                  <div
                    key={media.ID}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="size-10 rounded bg-muted flex items-center justify-center shrink-0">
                        <IconComponent className="size-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {media.post_title || media.post_name}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          <Badge variant="secondary" className="text-xs">
                            {formatMimeType(media.post_mime_type)}
                          </Badge>
                          <span>ID: {media.ID}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1 ml-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        asChild
                        title="View"
                      >
                        <a href={media.guid} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="size-4" />
                        </a>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setConfirmDelete(media)}
                        disabled={isAnyMutating}
                        title="Delete"
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>

      {/* Add Media Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Media</DialogTitle>
            <DialogDescription>
              Import media from a URL or upload a file to the WordPress media library.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Upload Type Toggle */}
            <div className="flex gap-2">
              <Button
                variant={uploadType === 'url' ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setUploadType('url')}
              >
                <Link className="size-4 mr-2" />
                From URL
              </Button>
              <Button
                variant={uploadType === 'file' ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setUploadType('file')}
              >
                <Upload className="size-4 mr-2" />
                Upload File
              </Button>
            </div>

            {/* URL Input */}
            {uploadType === 'url' && (
              <div className="space-y-2">
                <Label htmlFor="media-url">Media URL</Label>
                <Input
                  id="media-url"
                  placeholder="https://example.com/image.jpg"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                />
              </div>
            )}

            {/* File Input */}
            {uploadType === 'file' && (
              <div className="space-y-2">
                <Label>Select File</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
                >
                  {selectedFile ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileImage className="size-5" />
                      <span className="text-sm font-medium">{selectedFile.name}</span>
                    </div>
                  ) : (
                    <div className="text-muted-foreground">
                      <Upload className="size-8 mx-auto mb-2" />
                      <p className="text-sm">Click to select a file</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Media Options */}
            <div className="space-y-3 pt-2 border-t">
              <div className="space-y-2">
                <Label htmlFor="media-title">Title (optional)</Label>
                <Input
                  id="media-title"
                  placeholder="Media title"
                  value={mediaOptions.title || ''}
                  onChange={(e) => setMediaOptions((prev) => ({ ...prev, title: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="media-alt">Alt Text (optional)</Label>
                <Input
                  id="media-alt"
                  placeholder="Alternative text for accessibility"
                  value={mediaOptions.alt || ''}
                  onChange={(e) => setMediaOptions((prev) => ({ ...prev, alt: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="media-caption">Caption (optional)</Label>
                <Input
                  id="media-caption"
                  placeholder="Media caption"
                  value={mediaOptions.caption || ''}
                  onChange={(e) =>
                    setMediaOptions((prev) => ({ ...prev, caption: e.target.value }))
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetUploadForm}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={
                (uploadType === 'url' && !urlInput.trim()) ||
                (uploadType === 'file' && !selectedFile) ||
                importUrlMutation.isPending ||
                uploadFileMutation.isPending
              }
            >
              {(importUrlMutation.isPending || uploadFileMutation.isPending) && (
                <Loader2 className="size-4 mr-2 animate-spin" />
              )}
              {uploadType === 'url' ? 'Import' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Media</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{confirmDelete?.post_title || confirmDelete?.post_name}&quot;?
              This will also remove the file from the server.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete && deleteMutation.mutate(confirmDelete.ID)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
