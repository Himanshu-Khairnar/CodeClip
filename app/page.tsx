"use client";

import { useState, useRef, DragEvent, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import {
  UploadCloud, CheckCircle2, Copy, ExternalLink, X, Plus, Info, Clock, Lock, History, Trash2,
  FileText, FileCode, FileArchive, Image as ImageIcon, Video, Music, File
} from "lucide-react";
import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const MAX_TEXT_LENGTH = 500_000;
const MAX_TOTAL_SIZE = 30 * 1024 * 1024;

const EXPIRY_OPTIONS = [
  { value: "1", label: "1 hour" },
  { value: "24", label: "24 hours" },
];

interface HistoryItem {
  code: string;
  url: string;
  textSnippet: string;
  fileCount: number;
  createdAt: number;
}

const HISTORY_KEY = "codeclip-history";

function loadHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

function saveHistoryItem(item: HistoryItem) {
  const history = loadHistory().filter((h) => h.code !== item.code);
  history.unshift(item);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 20)));
  } catch {
    // storage full — ignore
  }
}

export default function Home() {
  const [text, setText] = useState("");
  const [isOneTimeView, setIsOneTimeView] = useState(false);
  const [expiry, setExpiry] = useState("24");
  const [password, setPassword] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const [code, setCode] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");

  const [history, setHistory] = useState<HistoryItem[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const handleAccess = (e: React.FormEvent) => {
    e.preventDefault();
    if (accessCode.trim().length > 0) {
      router.push(`/clip/${accessCode.trim().toUpperCase()}`);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    // Support dropping folders via DataTransferItem
    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const collected: File[] = [];
      const pending: Promise<void>[] = [];
      for (let i = 0; i < items.length; i++) {
        const entry = (items[i] as unknown as { webkitGetAsEntry?: () => FileSystemEntry }).webkitGetAsEntry?.();
        if (entry) {
          pending.push(traverseEntry(entry, collected));
        }
      }
      if (pending.length > 0) {
        await Promise.all(pending);
        if (collected.length > 0) {
          handleFiles(collected);
          return;
        }
      }
    }
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const traverseEntry = async (entry: any, out: File[]): Promise<void> => {
    if (entry.isFile) {
      await new Promise<void>((resolve) => {
        entry.file((file: File) => { out.push(file); resolve(); }, () => resolve());
      });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      await new Promise<void>((resolve) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reader.readEntries(async (entries: any[]) => {
          for (const child of entries) await traverseEntry(child, out);
          resolve();
        }, () => resolve());
      });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
    }
    e.target.value = "";
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
    }
    if (e.target) e.target.value = "";
  };

  const handleFiles = (newFiles: File[]) => {
    const currentTotalSize = files.reduce((sum, f) => sum + f.size, 0);
    const newTotalSize = newFiles.reduce((sum, f) => sum + f.size, 0);

    if (currentTotalSize + newTotalSize > MAX_TOTAL_SIZE) {
      toast.error("Total file size cannot exceed 30MB");
      return;
    }
    setFiles((prev) => [...prev, ...newFiles]);
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleUpload = () => {
    if (!text.trim() && files.length === 0) {
      toast.error("Please add some text or files to upload.");
      return;
    }

    setUploading(true);
    setProgress(0);

    const formData = new FormData();
    formData.append("text", text);
    formData.append("isOneTimeView", String(isOneTimeView));
    formData.append("expiry", expiry);
    if (password.trim()) formData.append("password", password);

    for (const file of files) {
      formData.append("files", file);
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/clip/create");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
      }
    };

    xhr.onload = async () => {
      let message = "Something went wrong during upload.";
      let data: { code?: string; message?: string } | null = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        const t = xhr.responseText;
        if (t.toLowerCase().includes("too large") || t.toLowerCase().includes("entity")) {
          message = "File too large. Vercel limits uploads to 4.5MB on the free plan.";
        }
      }

      if (xhr.status >= 200 && xhr.status < 300 && data?.code) {
        setProgress(100);
        const generatedCode = data.code;
        setCode(generatedCode);

        const clipUrl = `${window.location.origin}/clip/${generatedCode}`;
        const qrDataUrl = await QRCode.toDataURL(clipUrl, { width: 250, margin: 2 });
        setQrCodeUrl(qrDataUrl);

        saveHistoryItem({
          code: generatedCode,
          url: clipUrl,
          textSnippet: text.trim().slice(0, 80),
          fileCount: files.length,
          createdAt: Date.now(),
        });
        setHistory(loadHistory());

        toast.success("Clipboard created successfully!");
      } else {
        if (data && "message" in data && typeof data.message === "string") {
          message = data.message;
        }
        toast.error(message);
      }
      setUploading(false);
      setProgress(0);
    };

    xhr.onerror = () => {
      toast.error("Network error during upload.");
      setUploading(false);
      setProgress(0);
    };

    xhr.send(formData);
  };

  const copyToClipboard = (textToCopy: string) => {
    navigator.clipboard.writeText(textToCopy);
    toast.success("Copied to clipboard!");
  };

  const handleCloseClip = async () => {
    if (!code) return;
    try {
      await fetch(`/api/clip/${code}`, { method: "DELETE" });
      toast.info("Clip has been closed and deleted.");
    } catch (e) {
      console.error(e);
    } finally {
      setCode("");
      setFiles([]);
      setText("");
      setHistory(loadHistory().filter((h) => h.code !== code));
    }
  };

  const removeFromHistory = (code: string) => {
    const next = loadHistory().filter((h) => h.code !== code);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
    setHistory(next);
  };

  const clipUrl = code ? `${typeof window !== "undefined" ? window.location.origin : ""}/clip/${code}` : "";

  const getFileIcon = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext)) return <ImageIcon className="w-4 h-4 text-primary shrink-0" />;
    if (["mp4", "webm", "mov", "avi"].includes(ext)) return <Video className="w-4 h-4 text-primary shrink-0" />;
    if (["mp3", "wav", "ogg", "m4a"].includes(ext)) return <Music className="w-4 h-4 text-primary shrink-0" />;
    if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return <FileArchive className="w-4 h-4 text-primary shrink-0" />;
    if (["js", "jsx", "ts", "tsx", "html", "css", "json", "py", "java", "cpp", "c", "cs", "php", "rb", "go", "rs", "sh", "sql", "yaml"].includes(ext)) return <FileCode className="w-4 h-4 text-primary shrink-0" />;
    if (["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf", "csv", "md"].includes(ext)) return <FileText className="w-4 h-4 text-primary shrink-0" />;
    return <File className="w-4 h-4 text-muted-foreground shrink-0" />;
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-start sm:justify-center px-3 py-4 sm:p-4 pb-6 sm:pb-4">
      <div className="w-full max-w-lg lg:max-w-xl">
        <Tabs defaultValue="create" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4 sm:mb-6 h-10 sm:h-11 p-1">
            <TabsTrigger value="create" className="text-xs sm:text-sm px-1 sm:px-3">Create Clip</TabsTrigger>
            <TabsTrigger value="access" className="text-xs sm:text-sm px-1 sm:px-3">Access Clip</TabsTrigger>
            <TabsTrigger value="history" className="text-xs sm:text-sm px-1 sm:px-3">History</TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="mt-0">
            {code ? (
              <Card className="border-border shadow-md animate-in fade-in zoom-in duration-300 rounded-xl overflow-hidden">
                {/* Success header */}
                <div className="flex flex-col items-center gap-2 py-4 px-6 text-center border-b border-border bg-muted/20">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center border border-primary/20">
                    <CheckCircle2 className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold tracking-tight">Clip Created!</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Share the code or scan the QR</p>
                  </div>
                </div>

                <CardContent className="p-4 space-y-3">
                  {/* Access code */}
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Access Code</Label>
                    <div className="flex items-center gap-2 bg-muted rounded-lg border border-border px-2.5 sm:px-3 py-2">
                      <span className="flex-1 text-xl sm:text-2xl font-mono tracking-[0.2em] sm:tracking-[0.3em] font-bold text-center break-all">{code}</span>
                      <Button variant="ghost" size="icon" onClick={() => copyToClipboard(code)} className="h-8 w-8 shrink-0">
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Direct link */}
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Direct Link</Label>
                    <div className="flex items-center gap-2 bg-muted rounded-lg border border-border px-2.5 sm:px-3 py-1.5">
                      <span className="flex-1 text-[11px] sm:text-xs text-muted-foreground truncate font-mono min-w-0">{clipUrl}</span>
                      <Button variant="ghost" size="icon" onClick={() => copyToClipboard(clipUrl)} className="h-7 w-7 shrink-0">
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* QR + info - stacks on mobile */}
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch pt-0.5">
                    {qrCodeUrl && (
                      <div className="p-2 bg-white rounded-lg border border-border shadow-sm shrink-0 self-center sm:self-auto">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qrCodeUrl} alt="QR Code" className="w-32 h-32 sm:w-28 sm:h-28" />
                      </div>
                    )}
                    <div className="flex flex-col flex-1 gap-2 justify-between min-w-0">
                      <div className="rounded-lg bg-muted/40 border border-border p-2.5 flex items-center gap-2.5">
                        <Info className="w-4 h-4 text-primary shrink-0" />
                        <p className="text-xs text-muted-foreground leading-snug">
                          Expires in {EXPIRY_OPTIONS.find((o) => o.value === expiry)?.label}
                          {isOneTimeView ? " · one-time view" : ""}
                          {password ? " · password protected" : ""}
                        </p>
                      </div>
                      <Button className="w-full h-10 sm:h-9 text-sm" onClick={() => router.push(`/clip/${code}`)}>
                        <ExternalLink className="w-4 h-4 mr-2" /> View Clip
                      </Button>
                    </div>
                  </div>

                </CardContent>

                <CardFooter className="border-t bg-muted/20 px-4 py-3 flex gap-3">
                  <Button variant="outline" className="flex-1 h-9" onClick={() => { setCode(""); setFiles([]); setText(""); }}>
                    New Clip
                  </Button>
                  <Button variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10 h-9" onClick={handleCloseClip}>
                    Delete
                  </Button>
                </CardFooter>
              </Card>
            ) : (
              <Card className="border-border shadow-md animate-in fade-in slide-in-from-bottom-4 rounded-xl">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xl">Send File</CardTitle>
                  <CardDescription className="text-sm">Paste text or upload files (up to 30MB total).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="text" className="text-sm">Text Content</Label>
                    <Textarea
                      id="text"
                      placeholder="Paste your text here..."
                      className="h-40 w-full resize-y font-mono text-sm"
                      value={text}
                      maxLength={MAX_TEXT_LENGTH}
                      onChange={(e) => setText(e.target.value)}
                    />
                    <p className="text-[11px] text-muted-foreground text-right">{text.length.toLocaleString('en-US')} / {MAX_TEXT_LENGTH.toLocaleString('en-US')} chars</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm">Files</Label>
                    <div
                      className={`border border-dashed rounded-md transition-colors h-40 overflow-hidden flex flex-col ${isDragging ? "border-primary bg-primary/5" : files.length > 0 ? "border-border bg-card" : "border-muted-foreground/40 hover:border-primary/60 cursor-pointer"}`}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => { if (files.length === 0) fileInputRef.current?.click(); }}
                    >
                         {files.length === 0 ? (
                          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-4 text-center">
                            <UploadCloud className="w-8 h-8 text-muted-foreground" />
                            <p className="font-medium text-sm">Click or drag files &amp; folders here</p>
                            <p className="text-xs text-muted-foreground">Any file type up to 30MB</p>
                            <div className="flex gap-2 mt-2">
                              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                                <Plus className="w-3 h-3 mr-1" /> Files
                              </Button>
                              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}>
                                <FileArchive className="w-3 h-3 mr-1" /> Folder
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2 shrink-0 gap-2">
                              <span className="text-xs font-medium text-muted-foreground truncate">Selected Files ({files.length}) · {(files.reduce((s,f)=>s+f.size,0)/1024/1024).toFixed(2)} MB</span>
                              <div className="flex gap-1 shrink-0">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs gap-1"
                                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                                >
                                  <Plus className="w-3.5 h-3.5" /> Files
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs gap-1 hidden sm:inline-flex"
                                  onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}
                                >
                                  <FileArchive className="w-3.5 h-3.5" /> Folder
                                </Button>
                              </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
                              {files.map((file, i) => {
                                const formattedSize = file.size > 1024 * 1024
                                  ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
                                  : `${(file.size / 1024).toFixed(1)} KB`;

                                return (
                                  <div key={i} className="flex items-center justify-between bg-muted/40 px-2.5 py-1.5 rounded-md text-sm border border-border">
                                    <div className="flex items-center gap-2.5 overflow-hidden">
                                      {getFileIcon(file.name)}
                                      <span className="truncate font-medium text-xs">{file.name}</span>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0 ml-2">
                                      <span className="text-xs text-muted-foreground">{formattedSize}</span>
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                                        className="text-muted-foreground hover:text-destructive transition-colors p-0.5 rounded"
                                        title="Remove file"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          ref={fileInputRef}
                          onChange={handleFileSelect}
                        />
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          ref={folderInputRef}
                          onChange={handleFolderSelect}
                          {...({ webkitdirectory: "", directory: "" } as unknown as React.InputHTMLAttributes<HTMLInputElement>)}
                        />
                      </div>
                    </div>

                  {/* Expiry selector */}
                  <div className="space-y-2">
                    <Label className="text-sm flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-muted-foreground" /> Expires in
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      {EXPIRY_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setExpiry(opt.value)}
                          className={`h-9 rounded-md border text-sm font-medium transition-colors ${expiry === opt.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:border-primary/50"}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Password (optional) */}
                  <div className="space-y-2">
                    <Label htmlFor="clip-password" className="text-sm flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-muted-foreground" /> Password (optional)
                    </Label>
                    <Input
                      id="clip-password"
                      type="password"
                      placeholder="Protect this clip with a password"
                      className="h-10 rounded-md"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      maxLength={64}
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/30 p-3 border border-border rounded-md">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="oneTime"
                        className="w-4 h-4 rounded border-input text-primary focus:ring-primary accent-primary shrink-0"
                        checked={isOneTimeView}
                        onChange={(e) => setIsOneTimeView(e.target.checked)}
                      />
                      <Label htmlFor="oneTime" className="cursor-pointer text-xs sm:text-sm leading-tight">Auto-delete after first view</Label>
                    </div>
                    <Button
                      onClick={handleUpload}
                      disabled={uploading}
                      className="h-11 sm:h-10 text-sm font-medium rounded-md shadow-sm w-full sm:w-auto shrink-0"
                    >
                      {uploading ? "Creating..." : "Create Clipboard"}
                    </Button>
                  </div>

                  {uploading && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span>Uploading...</span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="access" className="mt-0">
            <Card className="border-border shadow-sm animate-in fade-in rounded-xl w-full">
              <CardHeader className="pb-1 pt-4">
                <CardTitle className="text-base">Access Clip</CardTitle>
                <CardDescription className="text-xs">Enter the 6-character code to open shared content.</CardDescription>
              </CardHeader>
              <form onSubmit={handleAccess}>
                <CardContent className="space-y-2">
                  <div className="space-y-1">
                    <Label htmlFor="code" className="text-xs">Access Code</Label>
                    <Input
                      id="code"
                      placeholder="A1B2C3"
                      className="text-center text-xl tracking-[0.4em] uppercase font-mono rounded-md border-2 border-border focus-visible:border-primary h-12 shadow-sm"
                      maxLength={6}
                      value={accessCode}
                      onChange={(e) => setAccessCode(e.target.value)}
                      required
                    />
                  </div>
                </CardContent>
                <CardFooter className="pt-2">
                  <Button type="submit" className="w-full h-10 rounded-md shadow-sm" disabled={!accessCode.trim()}>
                    Access Now
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-0">
            <Card className="border-border shadow-sm animate-in fade-in rounded-xl w-full">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="w-4 h-4" /> Recent Clips
                </CardTitle>
                <CardDescription className="text-xs">Clips you created on this device (stored locally).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No clips created yet on this device.</p>
                ) : (
                  history.map((item) => (
                    <div key={item.code} className="flex items-center gap-2 sm:gap-3 bg-muted/40 border border-border rounded-md px-3 py-2.5">
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => router.push(`/clip/${item.code}`)}>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-mono font-bold text-sm tracking-widest text-primary shrink-0">{item.code}</span>
                          <span className="text-[11px] text-muted-foreground break-all">
                            {new Date(item.createdAt).toLocaleString('en-US')}
                          </span>
                        </div>
                        {item.textSnippet && <p className="text-xs text-muted-foreground truncate mt-0.5 pr-1">{item.textSnippet}</p>}
                        {item.fileCount > 0 && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">{item.fileCount} file(s)</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" onClick={() => copyToClipboard(item.code)} title="Copy code" className="h-8 w-8">
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => removeFromHistory(item.code)} title="Remove from history" className="text-destructive hover:text-destructive h-8 w-8">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}