'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  formatFileSize,
  isTextFile,
  type FileInfo,
} from '@/lib/api/flux-files';
import { getAppSpecification, getAppLocations } from '@/lib/api/flux-apps';
import { useAuthStore } from '@/stores/auth';
import { toast } from 'sonner';
import {
  Folder,
  File,
  FileText,
  FileCode,
  Image,
  ChevronRight,
  Home,
  RefreshCw,
  Loader2,
  Eye,
  Edit3,
  Save,
  ArrowLeft,
  Server,
  X,
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
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
}

function getFileIcon(file: FileInfo) {
  if (file.isDirectory) return <Folder className="h-4 w-4 text-yellow-500" />;

  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const codeExts = ['js', 'ts', 'jsx', 'tsx', 'py', 'go', 'rs', 'java', 'c', 'cpp'];
  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'];

  if (codeExts.includes(ext)) return <FileCode className="h-4 w-4 text-blue-500" />;
  if (imageExts.includes(ext)) return <Image className="h-4 w-4 text-green-500" />;
  if (['txt', 'md', 'json', 'yaml', 'yml', 'xml'].includes(ext))
    return <FileText className="h-4 w-4 text-gray-500" />;

  return <File className="h-4 w-4 text-gray-400" />;
}

export function FileBrowser({ appName }: FileBrowserProps) {
  const [currentPath, setCurrentPath] = useState('/');
  const [editingFile, setEditingFile] = useState<FileInfo | null>(null);
  const [editContent, setEditContent] = useState<string>('');
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState<string>('');
  const [selectedNode, setSelectedNode] = useState<string>('');
  const [highlighter, setHighlighter] = useState<Highlighter | null>(null);
  const [highlightedHtml, setHighlightedHtml] = useState<string>('');
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

  // Fetch app locations to get node IPs
  const { data: locationsData, isLoading: locationsLoading } = useQuery({
    queryKey: ['appLocations', appName],
    queryFn: () => getAppLocations(appName),
    staleTime: 30000,
  });

  // For compose apps (version > 3), get component names from compose array
  // For legacy apps (version <= 3), use the app name as the single component
  const composeComponents = specData?.data?.compose?.map((c) => c.name) || [];
  const components = composeComponents.length > 0 ? composeComponents : [appName];
  const locations = locationsData?.data || [];

  // Sort locations by broadcastedAt (primary first)
  const sortedLocations = [...locations].sort((a, b) => {
    const timeA = new Date(a.broadcastedAt).getTime();
    const timeB = new Date(b.broadcastedAt).getTime();
    const timeDiff = timeA - timeB;
    if (Math.abs(timeDiff) <= 5000) {
      return a.ip < b.ip ? -1 : a.ip > b.ip ? 1 : 0;
    }
    return timeDiff;
  });

  // Auto-select first component and primary node if not set
  const activeComponent = selectedComponent || components[0] || '';
  const activeNode = selectedNode || sortedLocations[0]?.ip || '';

  // Fetch files
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['appFiles', appName, activeComponent, activeNode, currentPath],
    queryFn: () => listFiles(zelidauth!, appName, activeComponent, activeNode, currentPath),
    enabled: !!zelidauth && !!activeComponent && !!activeNode,
    staleTime: 30000,
  });

  const handleNavigate = (file: FileInfo) => {
    if (file.isDirectory) {
      const newPath = currentPath === '/'
        ? `/${file.name}`
        : `${currentPath}/${file.name}`;
      setCurrentPath(newPath);
    }
  };

  const handleBack = () => {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    setCurrentPath(parts.length === 0 ? '/' : `/${parts.join('/')}`);
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

  const pathParts = currentPath.split('/').filter(Boolean);
  const files = data?.data?.files || [];
  const isInitialLoading = specLoading || locationsLoading;

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
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
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
      <Card className='gap-0'>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Folder className="h-5 w-5" />
              File Browser
            </CardTitle>
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
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
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setCurrentPath('/')}
              >
                <Home className="h-4 w-4" />
              </Button>
              {pathParts.map((part, idx) => (
                <div key={idx} className="flex items-center">
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2"
                    onClick={() => {
                      const newPath = '/' + pathParts.slice(0, idx + 1).join('/');
                      setCurrentPath(newPath);
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

              <Select
                value={activeNode}
                onValueChange={(val) => {
                  setSelectedNode(val);
                  setCurrentPath('/');
                }}
              >
                <SelectTrigger className="w-[200px] h-9 text-xs">
                  <Server className="h-3 w-3 mr-1" />
                  <SelectValue placeholder="Select node" />
                </SelectTrigger>
                <SelectContent>
                  {sortedLocations.map((loc, idx) => (
                    <SelectItem key={loc.ip} value={loc.ip}>
                      {loc.ip} {idx === 0 ? '(primary)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>


          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
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
            <ScrollArea className="h-[calc(100vh-32rem)] relative">
              <div className="sticky top-0 h-8 bg-gradient-to-b from-card to-transparent z-10 pointer-events-none -mb-8"></div>
              <div className="space-y-1 pt-6">
                {files
                  .sort((a, b) => {
                    if (a.isDirectory && !b.isDirectory) return -1;
                    if (!a.isDirectory && b.isDirectory) return 1;
                    return a.name.localeCompare(b.name);
                  })
                  .map((file) => (
                    <div
                      key={file.name}
                      className={`flex items-center justify-between p-2 rounded-lg hover:bg-muted group select-none ${file.isDirectory ? 'cursor-pointer' : ''}`}
                      onClick={() => handleNavigate(file)}
                      onDoubleClick={() => {
                        if (file.isDirectory) {
                          handleNavigate(file);
                        } else if (isTextFile(file.name)) {
                          handleOpenFile(file, false);
                        }
                      }}
                    >
                      <button
                        className={`flex items-center gap-3 flex-1 text-left ${file.isDirectory ? 'cursor-pointer' : 'cursor-auto'}`}
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

                      {!file.isDirectory && isTextFile(file.name) && (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleOpenFile(file, true)}
                            title="View file"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleOpenFile(file, false)}
                            title="Edit file"
                          >
                            <Edit3 className="h-4 w-4" />
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
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {isViewOnly ? <Eye className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
              {editingFile?.name}
              {!isViewOnly && <span className="text-xs text-muted-foreground">(editing)</span>}
            </SheetTitle>
            <SheetDescription>
              {currentPath === '/' ? '/' : currentPath}/{editingFile?.name}
            </SheetDescription>
          </SheetHeader>

          {isLoadingFile || !highlighter ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
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

          <SheetFooter className="mt-auto pt-4 flex-row gap-2">
            <Button variant="outline" onClick={handleCloseEditor}>
              <X className="h-4 w-4 mr-2" />
              {isViewOnly ? 'Close' : 'Cancel'}
            </Button>
            {!isViewOnly && (
              <Button onClick={handleSaveFile} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
