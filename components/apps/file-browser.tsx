'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  listFiles,
  downloadFile,
  saveFile,
  deleteFile,
  formatFileSize,
  isTextFile,
  type FileInfo,
} from '@/lib/api/flux-files';
import { getAppSpecification } from '@/lib/api/flux-apps';
import { formatNodeAddress } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { useNodeSelection } from '@/hooks/use-node-selection';
import { useResolvedNode } from '@/components/apps/node-picker';
import { toast } from 'sonner';
import {
  Folder,
  File,
  FileText,
  FileCode,
  FileCode2,
  FileTerminal,
  Image,
  ChevronRight,
  Home,
  RefreshCw,
  Loader2,
  Eye,
  Edit3,
  Save,
  ArrowLeft,
  X,
  Trash2,
  Square,
  CheckSquare,
  MinusSquare,
} from 'lucide-react';
import {
  createHighlighter,
  type Highlighter,
  type BundledLanguage,
} from 'shiki';
import dynamic from 'next/dynamic';

// Lazy load Monaco editor - only loads when editing files
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-[#1e1e1e]">
      <Loader2 className="size-8 animate-spin text-primary" />
    </div>
  ),
});

// Map file extensions to shiki language identifiers
const extensionToLanguage: Record<string, BundledLanguage> = {
  // JavaScript/TypeScript
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  // Python
  py: 'python',
  // Go
  go: 'go',
  // Systems languages
  rs: 'rust',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  // Data formats
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  html: 'html',
  htm: 'html',
  svg: 'xml',
  // Styles
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  // Docs
  md: 'markdown',
  mdx: 'mdx',
  // Shell/scripts
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  // Web languages
  php: 'php',
  rb: 'ruby',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  // Config files
  dockerfile: 'dockerfile',
  conf: 'nginx',
  nginx: 'nginx',
  ini: 'ini',
  toml: 'toml',
  env: 'dotenv',
  // Makefile
  makefile: 'makefile',
};

function getLanguageFromFilename(filename: string): BundledLanguage {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const basename = filename.toLowerCase();

  // Handle special filenames
  if (basename === 'dockerfile') return 'dockerfile';
  if (basename === 'makefile') return 'makefile';
  if (basename === '.env' || basename.startsWith('.env.')) return 'dotenv';

  return extensionToLanguage[ext] || 'plaintext';
}

// Monaco uses slightly different language IDs
function getMonacoLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const basename = filename.toLowerCase();

  // Special filenames
  if (basename === 'dockerfile') return 'dockerfile';
  if (basename === 'makefile') return 'makefile';
  if (basename === '.env' || basename.startsWith('.env.')) return 'ini';

  const monacoLangMap: Record<string, string> = {
    js: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    go: 'go',
    rs: 'rust',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    html: 'html',
    htm: 'html',
    svg: 'xml',
    css: 'css',
    scss: 'scss',
    sass: 'scss',
    less: 'less',
    md: 'markdown',
    mdx: 'markdown',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    php: 'php',
    rb: 'ruby',
    sql: 'sql',
    graphql: 'graphql',
    gql: 'graphql',
    dockerfile: 'dockerfile',
    conf: 'ini',
    nginx: 'ini',
    ini: 'ini',
    toml: 'ini',
    env: 'ini',
    makefile: 'makefile',
  };

  return monacoLangMap[ext] || 'plaintext';
}

// Singleton highlighter instance
let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['one-dark-pro'],
      langs: [
        'javascript', 'typescript', 'jsx', 'tsx', 'python', 'go', 'rust', 'java',
        'c', 'cpp', 'csharp', 'json', 'yaml', 'xml', 'html', 'css', 'scss', 'sass',
        'less', 'markdown', 'mdx', 'bash', 'php', 'ruby', 'sql', 'graphql',
        'dockerfile', 'nginx', 'ini', 'toml', 'makefile', 'plaintext', 'dotenv',
      ],
    });
  }
  return highlighterPromise;
}


interface FileBrowserProps {
  appName: string;
  selectedNode: string;
}

function getFileIcon(file: FileInfo) {
  if (file.isDirectory) return <Folder className="size-4 text-yellow-500" />;

  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const codeExts = ['js', 'ts', 'jsx', 'tsx', 'py', 'go', 'rs', 'java', 'c', 'cpp'];
  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'];

  if (ext === 'conf') return <FileTerminal className="size-4 text-purple-800" />;
  if (ext === 'php') return <FileCode2 className="size-4 text-purple-800" />;
  if (codeExts.includes(ext)) return <FileCode className="size-4 text-blue-500" />;
  if (imageExts.includes(ext)) return <Image className="size-4 text-green-500" />;
  if (['txt', 'md', 'json', 'yaml', 'yml', 'xml'].includes(ext))
    return <FileText className="size-4 text-gray-500" />;

  return <File className="size-4 text-gray-400" />;
}

export function FileBrowser({ appName, selectedNode }: FileBrowserProps) {
  const [currentPath, setCurrentPath] = useState('/');
  const [editingFile, setEditingFile] = useState<FileInfo | null>(null);
  const [editContent, setEditContent] = useState<string>('');
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState<string>('');
  const [highlighter, setHighlighter] = useState<Highlighter | null>(null);

  // Use unified node selection hook for locations
  const { sortedLocations, isLoading: nodesLoading } = useNodeSelection({ appName, autoSelectMaster: false });

  // Resolve "auto" to actual node
  const { resolvedNode } = useResolvedNode(appName, selectedNode);

  // Build fallback list: resolved node first, then others
  const allNodeIps = sortedLocations.map((l) => formatNodeAddress(l));
  const nodeIpsForQuery = resolvedNode
    ? [resolvedNode, ...allNodeIps.filter(ip => ip !== resolvedNode)]
    : allNodeIps;
  const [highlightedHtml, setHighlightedHtml] = useState<string>('');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<{
    done: number;
    total: number;
    failed: string[];
  } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { zelidauth } = useAuthStore();
  const queryClient = useQueryClient();

  // Load shiki highlighter on mount
  useEffect(() => {
    getHighlighter().then(setHighlighter);
  }, []);

  // Update highlighted HTML when content or file changes
  useEffect(() => {
    if (highlighter && editContent && editingFile) {
      const lang = getLanguageFromFilename(editingFile.name);
      try {
        const html = highlighter.codeToHtml(editContent, {
          lang,
          theme: 'one-dark-pro',
        });
        setHighlightedHtml(html);
      } catch {
        // Fallback to plaintext if language not supported
        const html = highlighter.codeToHtml(editContent, {
          lang: 'plaintext',
          theme: 'one-dark-pro',
        });
        setHighlightedHtml(html);
      }
    }
  }, [highlighter, editContent, editingFile]);

  // Fetch app specification to get component names
  const { data: specData, isLoading: specLoading } = useQuery({
    queryKey: ['appSpec', appName],
    queryFn: () => getAppSpecification(appName),
    staleTime: 60000,
  });

  // For compose apps (version > 3), get component names from compose array
  // For legacy apps (version <= 3), use the app name as the single component
  const composeComponents = specData?.data?.compose?.map((c) => c.name) || [];
  const components = composeComponents.length > 0 ? composeComponents : [appName];

  // Auto-select first component if not set
  const activeComponent = selectedComponent || components[0] || '';
  // For single-file operations (download/save/delete), use the selected node
  const activeNode = resolvedNode || nodeIpsForQuery[0] || '';

  // Fetch files - pass all node IPs for fallback
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['appFiles', appName, activeComponent, selectedNode, currentPath],
    queryFn: () => listFiles(zelidauth!, appName, activeComponent, nodeIpsForQuery, currentPath),
    enabled: !!zelidauth && !!activeComponent && nodeIpsForQuery.length > 0,
    staleTime: 30000,
  });

  const handleNavigate = (file: FileInfo) => {
    if (file.isDirectory) {
      const newPath = currentPath === '/'
        ? `/${file.name}`
        : `${currentPath}/${file.name}`;
      setCurrentPath(newPath);
      setSelectedItems(new Set()); // Clear selection on navigation
    }
  };

  const handleBack = () => {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    setCurrentPath(parts.length === 0 ? '/' : `/${parts.join('/')}`);
    setSelectedItems(new Set()); // Clear selection on navigation
  };

  const handleOpenFile = async (file: FileInfo, viewOnly: boolean = false) => {
    if (!isTextFile(file.name)) {
      toast.error('Cannot open this file type');
      return;
    }
    if (!zelidauth) {
      toast.error('Authentication required');
      return;
    }

    setIsLoadingFile(true);
    setEditingFile(file);
    setIsViewOnly(viewOnly);
    setEditContent('');

    try {
      const filePath = currentPath === '/'
        ? `/${file.name}`
        : `${currentPath}/${file.name}`;

      const response = await downloadFile(
        zelidauth,
        appName,
        activeComponent,
        activeNode,
        filePath
      );

      if (response.status === 'success' && response.data !== undefined) {
        setEditContent(response.data);
      } else {
        toast.error(response.message || 'Failed to load file');
        setEditingFile(null);
      }
    } catch (error) {
      toast.error('Failed to load file');
      setEditingFile(null);
    } finally {
      setIsLoadingFile(false);
    }
  };

  const handleSaveFile = async () => {
    if (!editingFile || !zelidauth) return;

    setIsSaving(true);
    try {
      const filePath = currentPath === '/'
        ? `/${editingFile.name}`
        : `${currentPath}/${editingFile.name}`;

      const response = await saveFile(
        zelidauth,
        appName,
        activeComponent,
        activeNode,
        filePath,
        editContent
      );

      if (response.status === 'success') {
        toast.success('File saved successfully');
        setEditingFile(null);
        refetch(); // Refresh file list
      } else {
        toast.error(response.message || 'Failed to save file');
      }
    } catch (error) {
      toast.error('Failed to save file');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCloseEditor = () => {
    setEditingFile(null);
    setEditContent('');
    setIsViewOnly(false);
  };

  // Selection handlers
  const toggleSelection = (fileName: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(fileName)) {
        next.delete(fileName);
      } else {
        next.add(fileName);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === files.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(files.map(f => f.name)));
    }
  };

  const clearSelection = () => {
    setSelectedItems(new Set());
  };

  // Delete handlers
  const deleteInBatches = async (items: string[], concurrency = 5) => {
    const results = { success: 0, failed: [] as string[] };

    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      const responses = await Promise.allSettled(
        batch.map(name => {
          const filePath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
          return deleteFile(zelidauth!, appName, activeComponent, activeNode, filePath);
        })
      );

      responses.forEach((res, idx) => {
        if (res.status === 'fulfilled' && res.value.status === 'success') {
          results.success++;
        } else {
          results.failed.push(batch[idx]);
        }
      });

      setDeleteProgress({ done: i + batch.length, total: items.length, failed: results.failed });
    }

    return results;
  };

  const handleBulkDelete = async () => {
    if (!zelidauth || selectedItems.size === 0) return;

    setShowDeleteConfirm(false);
    setIsDeleting(true);
    setDeleteProgress({ done: 0, total: selectedItems.size, failed: [] });

    try {
      const items = Array.from(selectedItems);
      const results = await deleteInBatches(items);

      if (results.failed.length === 0) {
        toast.success(`Deleted ${results.success} item${results.success > 1 ? 's' : ''}`);
      } else {
        toast.warning(`Deleted ${results.success}, failed ${results.failed.length}`);
      }

      setSelectedItems(new Set());
      refetch();
    } catch (error) {
      toast.error('Delete operation failed');
    } finally {
      setIsDeleting(false);
      setDeleteProgress(null);
    }
  };

  const pathParts = currentPath.split('/').filter(Boolean);
  const files = data?.data?.files || [];
  const isInitialLoading = specLoading || nodesLoading;

  if (!zelidauth) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Please connect your wallet to browse files.
        </CardContent>
      </Card>
    );
  }

  if (isInitialLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="size-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (components.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No components found for this app.
        </CardContent>
      </Card>
    );
  }

  if (sortedLocations.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No running instances found. The app must be running to browse files.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className='gap-0 flex-1'>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Folder className="size-5" />
              File Browser
            </CardTitle>
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <div className='flex items-center justify-between'>
            <div className="flex items-center gap-1 text-sm mt-2">
              {currentPath !== '/' && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleBack}
                >
                  <ArrowLeft className="size-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setCurrentPath('/');
                  setSelectedItems(new Set());
                }}
              >
                <Home className="size-4" />
              </Button>
              {pathParts.map((part, idx) => (
                <div key={idx} className="flex items-center">
                  <ChevronRight className="size-4 text-muted-foreground" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2"
                    onClick={() => {
                      const newPath = '/' + pathParts.slice(0, idx + 1).join('/');
                      setCurrentPath(newPath);
                      setSelectedItems(new Set());
                    }}
                  >
                    {part}
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {components.length > 1 && (
                <Select
                  value={activeComponent}
                  onValueChange={(val) => {
                    setSelectedComponent(val);
                    setCurrentPath('/');
                    setSelectedItems(new Set());
                  }}
                >
                  <SelectTrigger className="w-[180px] h-9 text-xs">
                    <SelectValue placeholder="Select component" />
                  </SelectTrigger>
                  <SelectContent>
                    {components.map((comp) => (
                      <SelectItem key={comp} value={comp}>
                        {comp}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Bulk Action Bar */}
          {files.length > 0 && (
            <div className="flex items-center justify-between h-16 border-b">
              <div className="flex items-center gap-2 pl-2">
                <button
                  onClick={toggleSelectAll}
                  className="p-1 flex items-center gap-3"
                  disabled={isDeleting}
                >
                  {selectedItems.size === 0 ? (
                    <Square className="size-4 text-muted-foreground" />
                  ) : selectedItems.size === files.length ? (
                    <CheckSquare className="size-4 text-primary" />
                  ) : (
                    <MinusSquare className="size-4 text-primary" />
                  )}
                  <span className="text-sm text-muted-foreground">
                    {selectedItems.size > 0 ? `${selectedItems.size} selected` : 'Select all'}
                  </span>
                </button>
              </div>
              {selectedItems.size > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearSelection}
                    disabled={isDeleting}
                  >
                    Clear
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isDeleting}
                  >
                    {isDeleting && deleteProgress ? (
                      <>
                        <Loader2 className="size-4 mr-2 animate-spin" />
                        {deleteProgress.done}/{deleteProgress.total}
                      </>
                    ) : (
                      <>
                        <Trash2 className="size-4 mr-2" />
                        Delete
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : isError || data?.status === 'error' ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Failed to load files.</p>
              <p className="text-xs mt-1">
                {data?.message || (error instanceof Error ? error.message : 'Make sure the app is running and you have access.')}
              </p>
              {data?.message?.includes('volume not found') && (
                <p className="text-xs mt-2 text-yellow-600">
                  This app may not have persistent storage configured.
                </p>
              )}
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              This directory is empty.
            </div>
          ) : (
            <ScrollArea className="min-h-[440px] h-[calc(100vh-32rem)] relative">
              <div className="sticky top-0 h-8 bg-gradient-to-b from-card to-transparent z-10 pointer-events-none -mb-8"></div>
              <div className="space-y-1 pt-4">
                {files
                  .sort((a, b) => {
                    if (a.isDirectory && !b.isDirectory) return -1;
                    if (!a.isDirectory && b.isDirectory) return 1;
                    return a.name.localeCompare(b.name);
                  })
                  .map((file) => (
                    <div
                      key={file.name}
                      className={`flex items-center justify-between p-2 rounded-lg hover:bg-muted group select-none ${selectedItems.has(file.name) ? 'bg-muted/50' : ''} ${file.isDirectory ? 'cursor-pointer' : ''}`}
                      onClick={() => handleNavigate(file)}
                      onDoubleClick={() => {
                        if (file.isDirectory) {
                          handleNavigate(file);
                        } else if (isTextFile(file.name)) {
                          handleOpenFile(file, false);
                        }
                      }}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelection(file.name);
                          }}
                          className="p-1 hover:bg-muted rounded shrink-0"
                          disabled={isDeleting}
                        >
                          {selectedItems.has(file.name) ? (
                            <CheckSquare className="size-4 text-primary" />
                          ) : (
                            <Square className="size-4 text-muted-foreground" />
                          )}
                        </button>
                        <button
                          className={`flex items-center gap-3 flex-1 text-left min-w-0 ${file.isDirectory ? 'cursor-pointer' : 'cursor-auto'}`}
                          onClick={() => handleNavigate(file)}
                        >
                          {getFileIcon(file)}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">
                              {file.name}
                            </p>
                            {!file.isDirectory && (
                              <p className="text-xs text-muted-foreground">
                                {formatFileSize(file.size)}
                              </p>
                            )}
                          </div>
                        </button>
                      </div>

                      {!file.isDirectory && isTextFile(file.name) && (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleOpenFile(file, true)}
                            title="View file"
                          >
                            <Eye className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleOpenFile(file, false)}
                            title="Edit file"
                          >
                            <Edit3 className="size-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!editingFile} onOpenChange={handleCloseEditor}>
        <SheetContent side="left" className="w-full !max-w-[1200px] flex flex-col">
          <SheetHeader className='pb-0'>
            <SheetTitle className="flex items-center gap-2">
              {isViewOnly ? <Eye className="size-4" /> : <Edit3 className="size-4" />}
              {editingFile?.name}
              {!isViewOnly && <span className="text-xs text-muted-foreground">(editing)</span>}
            </SheetTitle>
            <SheetDescription>
              {currentPath === '/' ? '/' : currentPath}/{editingFile?.name}
            </SheetDescription>
          </SheetHeader>

          {isLoadingFile || !highlighter ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : isViewOnly ? (
            <ScrollArea className="flex-1 border">
              <div
                className="shiki-wrapper"
                style={{ fontSize: '0.75rem' }}
                dangerouslySetInnerHTML={{ __html: highlightedHtml }}
              />
              <style jsx global>{`
                .shiki-wrapper pre {
                  margin: 0;
                  padding: 1rem;
                  background: transparent !important;
                  overflow-x: auto;
                }
                .shiki-wrapper code {
                  counter-reset: line;
                }
                .shiki-wrapper .line {
                  display: flex;
                }
                .shiki-wrapper .line::before {
                  counter-increment: line;
                  content: counter(line);
                  min-width: 2.5em;
                  padding-right: 1em;
                  color: #636d83;
                  text-align: right;
                  user-select: none;
                }
              `}</style>
            </ScrollArea>
          ) : (
            <div className="flex-1 border overflow-hidden">
              <MonacoEditor
                height="100%"
                language={editingFile ? getMonacoLanguage(editingFile.name) : 'plaintext'}
                value={editContent}
                onChange={(value) => setEditContent(value || '')}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  automaticLayout: true,
                  bracketPairColorization: { enabled: true },
                  matchBrackets: 'always',
                  autoClosingBrackets: 'always',
                  autoClosingQuotes: 'always',
                  formatOnPaste: true,
                  tabSize: 2,
                }}
              />
            </div>
          )}

          <SheetFooter className="mt-auto pt-0 flex-row gap-2">
            <Button variant="outline" onClick={handleCloseEditor}>
              <X className="size-4 mr-2" />
              {isViewOnly ? 'Close' : 'Cancel'}
            </Button>
            {!isViewOnly && (
              <Button onClick={handleSaveFile} disabled={isSaving} className='flex-1'>
                {isSaving ? (
                  <Loader2 className="size-4 mr-2 animate-spin" />
                ) : (
                  <Save className="size-4 mr-2" />
                )}
                Save
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete {selectedItems.size} item{selectedItems.size > 1 ? 's' : ''}?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. The following will be permanently deleted:
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-32 overflow-y-auto text-sm text-muted-foreground">
            {Array.from(selectedItems).slice(0, 10).map(name => (
              <div key={name} className="truncate">• {name}</div>
            ))}
            {selectedItems.size > 10 && (
              <div className="text-xs mt-1">...and {selectedItems.size - 10} more</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete}>
              <Trash2 className="size-4 mr-2" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
