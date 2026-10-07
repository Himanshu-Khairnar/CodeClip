"use client";

import { useState, useRef, DragEvent, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  UploadCloud, CheckCircle2, ExternalLink, X, Info, Clock, History, Trash2,
  KeyRound, Loader2, Plus, ArrowRight,
} from "lucide-react";
import { FileIcon } from "@/components/file-icon";
import { Panel, Field } from "@/components/panel";
import { CopyRow } from "@/components/code-badge";
import { CopyButton } from "@/components/copy-button";
import { Segmented } from "@/components/segmented";
import { ConfirmButton } from "@/components/confirm-button";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/format";
import { compressImage, isCompressibleImage, COMPRESS_SKIP_UNDER } from "@/lib/compress";
import { MAX_TOTAL_SIZE, MAX_FILE_SIZE } from "@/lib/limits";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const MAX_TEXT_LENGTH = 500_000;
const MAX_TOTAL_MB = MAX_TOTAL_SIZE / (1024 * 1024);

const EXPIRY_OPTIONS = [
  { value: "1", label: "1 hour" },
  { value: "24", label: "24 hours" },
] as const;
type Expiry = (typeof EXPIRY_OPTIONS)[number]["value"];

const TABS = [
  { value: "create", label: "Create Clip", short: "Create", align: "max-sm:justify-start!", Icon: UploadCloud },
  { value: "access", label: "Access Clip", short: "Access", align: "max-sm:justify-center!", Icon: KeyRound },
  { value: "history", label: "History", short: "History", align: "max-sm:justify-end!", Icon: History },
] as const;

const TAB_TRIGGER_CLASS =
  "flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-[11px] font-medium text-muted-foreground transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.97] hover:bg-muted hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm sm:h-11 sm:w-full sm:flex-none sm:justify-start sm:gap-2 sm:px-3 sm:text-sm";

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
  const [expiry, setExpiry] = useState<Expiry>("24");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState("");

  const [code, setCode] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");

  const [history, setHistory] = useState<HistoryItem[]>([]);

  const [shakeKey, setShakeKey] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Stable per-File keys so removing a row doesn't re-animate its siblings.
  const fileIds = useRef(new WeakMap<File, string>());
  const fileKey = (f: File) => {
    let id = fileIds.current.get(f);
    if (!id) {
      id = Math.random().toString(36).slice(2);
      fileIds.current.set(f, id);
    }
    return id;
  };

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const openClip = (value: string) => {
    if (value.length === 4) router.push(`/clip/${value}`);
  };

  const handleAccess = (e: React.FormEvent) => {
    e.preventDefault();
    openClip(accessCode);
  };

  const handleAccessChange = (raw: string) => {
    const next = raw.replace(/\D/g, "").slice(0, 4);
    setAccessCode(next);
    // Behave like an OTP field: jump straight in once all 4 digits are in.
    if (next.length === 4 && accessCode.length < 4) openClip(next);
  };

  // Paste files/screenshots anywhere on the create panel.
  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = Array.from(e.clipboardData.files);
    if (pasted.length === 0) return;
    e.preventDefault();
    const named = pasted.map((f) =>
      f.name && f.name !== "image.png"
        ? f
        : new File([f], `pasted-${Date.now()}.${f.type.split("/")[1] || "png"}`, { type: f.type })
    );
    handleFiles(named);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    // Ignore leave events fired when moving between the zone's own children.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
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

  const handleFiles = (newFiles: File[]) => {
    const oversized = newFiles.find((f) => f.size > MAX_FILE_SIZE);
    if (oversized) {
      toast.error(`"${oversized.name}" exceeds the ${MAX_FILE_SIZE / (1024 * 1024)}MB per-file limit`);
      return;
    }
    const currentTotalSize = files.reduce((sum, f) => sum + f.size, 0);
    const newTotalSize = newFiles.reduce((sum, f) => sum + f.size, 0);

    if (currentTotalSize + newTotalSize > MAX_TOTAL_SIZE) {
      toast.error(`Total file size cannot exceed ${MAX_TOTAL_MB}MB`);
      return;
    }
    setFiles((prev) => [...prev, ...newFiles]);
  };

  const removeFile = (file: File) => {
    setFiles((prev) => prev.filter((f) => f !== file));
  };

  /** Upload bytes straight to Cloudinary (bypasses the Vercel function limit). */
  const uploadFileDirect = (
    uploadUrl: string,
    fields: Record<string, string>,
    file: File,
    onProgress: (fraction: number) => void
  ): Promise<{ secure_url: string; public_id: string; resource_type: string }> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", uploadUrl);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      };
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && data?.secure_url) {
            resolve(data);
          } else {
            const message: string = data?.error?.message || "File upload failed.";
            reject(
              new Error(
                /too large|maximum is|file size/i.test(message)
                  ? `"${file.name}" exceeds the ${MAX_FILE_SIZE / (1024 * 1024)}MB per-file limit.`
                  : message
              )
            );
          }
        } catch {
          reject(new Error("File upload failed."));
        }
      };
      xhr.onerror = () => reject(new Error("Network error during upload."));
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.append(k, v);
      fd.append("file", file);
      xhr.send(fd);
    });
  };

  /** Legacy path: small payloads proxied through our own API. */
  const createViaServer = (formData: FormData): Promise<string> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/clip/create");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
        }
      };
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && data?.code) {
            resolve(data.code as string);
          } else {
            reject(new Error(typeof data?.message === "string" ? data.message : "Something went wrong during upload."));
          }
        } catch {
          const t = xhr.responseText || "";
          if (t.toLowerCase().includes("too large") || t.toLowerCase().includes("entity")) {
            reject(new Error("File too large for server upload. Please try again — large files upload directly."));
          } else {
            reject(new Error("Something went wrong during upload."));
          }
        }
      };
      xhr.onerror = () => reject(new Error("Network error during upload."));
      xhr.send(formData);
    });
  };

  const finishCreate = async (generatedCode: string) => {
    setProgress(100);
    setCode(generatedCode);

    const clipUrl = `${window.location.origin}/clip/${generatedCode}`;
    // Lazy-load the QR generator so it isn't part of the initial bundle.
    const { default: QRCode } = await import("qrcode");
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
  };

  const handleUpload = async () => {
    if (!text.trim() && files.length === 0) {
      toast.error("Please add some text or files to upload.");
      setShakeKey((k) => k + 1);
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      // Phase 1 — compress large images in the browser (0–15%).
      setUploadStatus(files.length > 0 ? "Compressing images…" : "Creating clip…");
      const prepared: File[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (isCompressibleImage(f.name) && f.size > COMPRESS_SKIP_UNDER) {
          prepared.push(await compressImage(f));
        } else {
          prepared.push(f);
        }
        if (files.length > 0) {
          setProgress(Math.round(((i + 1) / files.length) * 15));
        }
      }

      // Phase 2 — upload each file straight to Cloudinary (15–90%).
      // Bytes never pass through our Vercel function, so its serverless
      // body limit doesn't apply.
      const uploaded: {
        filename: string;
        path: string;
        size: number;
        key: string;
        resourceType: string;
      }[] = [];

      for (let i = 0; i < prepared.length; i++) {
        const f = prepared[i];
        setUploadStatus(`Uploading file ${i + 1} of ${prepared.length}…`);

        const signRes = await fetch("/api/clip/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: f.name, size: f.size }),
        });
        if (!signRes.ok) {
          throw new Error("Could not prepare upload. Please try again.");
        }
        const sign = await signRes.json();

        try {
          const result = await uploadFileDirect(
            sign.uploadUrl,
            {
              api_key: sign.apiKey,
              timestamp: String(sign.timestamp),
              signature: sign.signature,
              folder: sign.folder,
              public_id: sign.publicId,
            },
            f,
            (frac) => {
              const base = 15 + (i / prepared.length) * 75;
              setProgress(Math.min(90, Math.round(base + frac * (75 / prepared.length))));
            }
          );
          uploaded.push({
            filename: f.name,
            path: result.secure_url,
            size: f.size,
            key: result.public_id,
            resourceType: result.resource_type || sign.resourceType,
          });
        } catch (directErr) {
          // Fallback: tiny total payloads can still go through our own API.
          const totalSize = prepared.reduce((s, x) => s + x.size, 0);
          if (totalSize > 4 * 1024 * 1024 || prepared.length > 1) throw directErr;
          setUploadStatus("Retrying via server…");
          const formData = new FormData();
          formData.append("text", text);
          formData.append("expiry", expiry);
          for (const file of prepared) formData.append("files", file);
          const code = await createViaServer(formData);
          await finishCreate(code);
          return;
        }
      }

      // Phase 3 — create the clip record (small JSON, no file bytes).
      setUploadStatus("Creating clip…");
      setProgress(92);
      const res = await fetch("/api/clip/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          expiry,
          files: uploaded,
        }),
      });
      let data: { code?: string; message?: string } | null = null;
      try {
        data = await res.json();
      } catch {
        // non-JSON response
      }
      if (!res.ok || !data?.code) {
        throw new Error(data?.message || "Something went wrong during upload.");
      }
      await finishCreate(data.code);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong during upload.");
    } finally {
      setUploading(false);
      setProgress(0);
      setUploadStatus("");
    }
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
      const next = loadHistory().filter((h) => h.code !== code);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      setHistory(next);
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

  return (
    <div className="flex-1 w-full min-w-0 overflow-x-clip px-3 py-4 sm:px-6 sm:py-6">
      <div className="w-full max-w-3xl mx-auto min-w-0">
        <Tabs defaultValue="create" orientation="vertical" className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-start">
          <TabsList className="flex h-auto! w-full shrink-0 flex-row max-sm:flex-row! gap-1 rounded-xl border border-border bg-card p-1.5 sm:w-44 sm:flex-col">
            {TABS.map(({ value, label, short, align, Icon }) => (
              <TabsTrigger key={value} value={value} className={`${TAB_TRIGGER_CLASS} ${align}`}>
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline truncate">{label}</span>
                <span className="sm:hidden truncate">{short}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="min-w-0 flex-1">

          <TabsContent value="create" className="mt-0 animate-rise">
            {code ? (
              <Card className="border-border shadow-md animate-in fade-in zoom-in duration-300 rounded-xl overflow-hidden">
                {/* Success header */}
                <div className="flex flex-col items-center gap-2 py-4 px-6 text-center border-b border-border bg-muted/20">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center border border-primary/20 animate-pop">
                    <CheckCircle2 className="w-6 h-6 text-primary" />
                  </div>
                  <div className="animate-rise [animation-delay:80ms]">
                    <h2 className="text-lg font-bold tracking-tight">Clip Created!</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Share the code or scan the QR</p>
                  </div>
                </div>

                <CardContent className="p-4 space-y-3 [&>*]:animate-rise [&>*:nth-child(2)]:[animation-delay:60ms] [&>*:nth-child(3)]:[animation-delay:120ms]">
                  {/* Access code */}
                  <Field label="Access Code" labelClassName="text-[11px] uppercase tracking-wider text-muted-foreground">
                    <CopyRow
                      value={code}
                      truncate={false}
                      valueClassName="text-center text-xl font-bold tracking-[0.2em] text-foreground sm:text-2xl sm:tracking-[0.3em]"
                      className="py-2"
                      buttonClassName="h-8 w-8"
                    />
                  </Field>

                  {/* Direct link */}
                  <Field label="Direct Link" labelClassName="text-[11px] uppercase tracking-wider text-muted-foreground">
                    <CopyRow value={clipUrl} valueClassName="text-[11px] text-muted-foreground sm:text-xs" />
                  </Field>

                  {/* QR + info - stacks on mobile */}
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch pt-0.5">
                    {qrCodeUrl && (
                      <div className="p-2 bg-white rounded-lg border border-border shadow-sm shrink-0 self-center sm:self-auto animate-pop [animation-delay:160ms]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qrCodeUrl} alt="QR Code" className="w-32 h-32 sm:w-28 sm:h-28" />
                      </div>
                    )}
                    <div className="flex flex-col flex-1 gap-2 justify-between min-w-0">
                      <div className="rounded-lg bg-muted/40 border border-border p-2.5 flex items-center gap-2.5">
                        <Info className="w-4 h-4 text-primary shrink-0" />
                        <p className="text-xs text-muted-foreground leading-snug">
                          Expires in {EXPIRY_OPTIONS.find((o) => o.value === expiry)?.label}
                        </p>
                      </div>
                      <Button className="group w-full h-10 sm:h-9 text-sm" onClick={() => router.push(`/clip/${code}`)}>
                        <ExternalLink className="w-4 h-4 mr-2 transition-transform duration-200 ease-out group-hover:-translate-y-px group-hover:translate-x-px" /> View Clip
                      </Button>
                    </div>
                  </div>

                </CardContent>

                <CardFooter className="border-t bg-muted/20 px-4 py-3 flex flex-col-reverse min-[400px]:flex-row gap-2 min-[400px]:gap-3">
                  <Button variant="outline" className="flex-1 h-10 min-[400px]:h-9" onClick={() => { setCode(""); setFiles([]); setText(""); }}>
                    New Clip
                  </Button>
                  <ConfirmButton
                    size="default"
                    onConfirm={handleCloseClip}
                    confirmLabel="Delete for everyone?"
                    className="h-10 min-[400px]:h-9 min-[400px]:w-auto w-full"
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </ConfirmButton>
                </CardFooter>
              </Card>
            ) : (
              <Panel
                title="Send File"
                description={`Paste text or upload files (max ${MAX_FILE_SIZE / (1024 * 1024)}MB per file, up to ${MAX_TOTAL_MB}MB total).`}
                className="shadow-md animate-in fade-in slide-in-from-bottom-4"
              >
                <div className="space-y-3" onPaste={handlePaste}>
                  <Field label="Text Content" htmlFor="text" labelClassName="text-sm">
                    <Textarea
                      id="text"
                      placeholder="Paste your text here..."
                      className="h-20 w-full resize-y font-mono text-sm"
                      value={text}
                      maxLength={MAX_TEXT_LENGTH}
                      onChange={(e) => setText(e.target.value)}
                    />
                    <p className="text-[11px] text-muted-foreground text-right">{text.length.toLocaleString('en-US')} / {MAX_TEXT_LENGTH.toLocaleString('en-US')} chars</p>
                  </Field>

                  <Field label="Files" labelClassName="text-sm">
                    <div
                      role={files.length === 0 ? "button" : undefined}
                      tabIndex={files.length === 0 ? 0 : undefined}
                      aria-label={files.length === 0 ? "Choose files to upload" : undefined}
                      className={cn(
                        "relative border border-dashed rounded-md h-40 overflow-hidden flex flex-col outline-none transition-[border-color,background-color,transform] duration-200 ease-out focus-visible:ring-[3px] focus-visible:ring-ring/50",
                        isDragging
                          ? "border-primary bg-primary/5 scale-[1.01]"
                          : files.length > 0
                            ? "border-border bg-card"
                            : "group/drop border-muted-foreground/40 hover:border-primary/60 hover:bg-primary/[0.02] cursor-pointer"
                      )}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => { if (files.length === 0) fileInputRef.current?.click(); }}
                      onKeyDown={(e) => {
                        if (files.length === 0 && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          fileInputRef.current?.click();
                        }
                      }}
                    >
                         {files.length === 0 ? (
                          <div className="flex flex-1 flex-col items-center justify-center gap-1 p-3 text-center">
                            <UploadCloud
                              className={cn(
                                "w-6 h-6 text-muted-foreground transition-[transform,color] duration-200 ease-out group-hover/drop:-translate-y-0.5 group-hover/drop:text-primary",
                                isDragging && "-translate-y-1 text-primary"
                              )}
                            />
                            <p className="font-medium text-[13px]">{isDragging ? "Drop to add" : "Click, drag, or paste files here"}</p>
                            <p className="text-[11px] text-muted-foreground">Max {MAX_FILE_SIZE / (1024 * 1024)}MB per file · {MAX_TOTAL_MB}MB total · photos auto-compress</p>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-1.5 shrink-0">
                              <span className="text-xs font-medium text-muted-foreground truncate tabular-nums">{files.length} file{files.length > 1 ? "s" : ""} · {formatBytes(files.reduce((s, f) => s + f.size, 0))}</span>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button type="button" variant="ghost" size="xs" onClick={() => setFiles([])} className="text-muted-foreground hover:text-destructive">
                                  Clear
                                </Button>
                                <Button type="button" variant="outline" size="xs" onClick={() => fileInputRef.current?.click()}>
                                  <Plus /> Add more
                                </Button>
                              </div>
                            </div>
                            <div className="flex-1 min-h-0 overflow-y-auto p-1.5 space-y-1.5">
                              {files.map((file, i) => (
                                <div key={fileKey(file)} className="flex items-center justify-between bg-muted/40 px-2.5 py-1.5 rounded-md text-sm border border-border transition-colors duration-150 hover:bg-muted/70 animate-rise" style={{ animationDelay: `${Math.min(i * 30, 180)}ms` }}>
                                  <div className="flex items-center gap-2.5 overflow-hidden">
                                    <FileIcon filename={file.name} />
                                    <span className="truncate font-medium text-xs">{file.name}</span>
                                  </div>
                                  <div className="flex items-center gap-3 shrink-0 ml-2">
                                    <span className="text-xs text-muted-foreground tabular-nums">{formatBytes(file.size)}</span>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); removeFile(file); }}
                                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-[color,background-color,transform] duration-150 ease-out active:scale-90 p-0.5 rounded"
                                      title="Remove file"
                                      aria-label={`Remove ${file.name}`}
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                        {isDragging && files.length > 0 && (
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-[1px] animate-fade">
                            <p className="flex items-center gap-2 text-[13px] font-medium text-primary">
                              <UploadCloud className="w-5 h-5" /> Drop to add
                            </p>
                          </div>
                        )}
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          ref={fileInputRef}
                          onChange={handleFileSelect}
                        />
                      </div>
                  </Field>

                  {/* Expiry selector */}
                  <Field
                    label={
                      <>
                        <Clock className="w-4 h-4 text-muted-foreground" /> Expires in
                      </>
                    }
                    labelClassName="flex items-center gap-1.5 text-sm"
                  >
                    <Segmented
                      ariaLabel="Expiry"
                      options={EXPIRY_OPTIONS}
                      value={expiry}
                      onChange={setExpiry}
                      itemClassName="h-8"
                    />
                  </Field>

                  <Button
                    key={shakeKey}
                    onClick={handleUpload}
                    disabled={uploading}
                    className={cn("group h-9 text-[13px] font-medium rounded-md shadow-sm w-full", shakeKey > 0 && "animate-shake")}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Creating…
                      </>
                    ) : (
                      <>
                        Create Clipboard
                        <ArrowRight className="w-4 h-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
                      </>
                    )}
                  </Button>

                  {uploading && (
                    <div className="space-y-1.5 animate-rise">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span key={uploadStatus} className="animate-fade">{uploadStatus || "Uploading..."}</span>
                        <span className="tabular-nums">{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-1.5" />
                    </div>
                  )}
                </div>
              </Panel>
            )}
          </TabsContent>

          <TabsContent value="access" className="mt-0 animate-rise">
            <Panel
              title="Access Clip"
              description="Enter the 4-digit code to open shared content."
              className="animate-in fade-in"
            >
              <form onSubmit={handleAccess} className="space-y-3">
                <Field label="Access Code" htmlFor="code">
                  <Input
                    id="code"
                    inputMode="numeric"
                    placeholder="0000"
                    className="text-center text-xl tracking-[0.3em] indent-[0.3em] min-[400px]:tracking-[0.4em] min-[400px]:indent-[0.4em] font-mono rounded-md border-2 border-border focus-visible:border-primary h-12 shadow-sm max-w-full"
                    maxLength={4}
                    value={accessCode}
                    onChange={(e) => handleAccessChange(e.target.value)}
                    autoComplete="one-time-code"
                    required
                  />
                  <div className="flex justify-center gap-1.5 pt-1" aria-hidden>
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className={cn(
                          "h-1 w-6 rounded-full transition-[background-color,transform] duration-200 ease-out",
                          i < accessCode.length ? "bg-primary scale-x-100" : "bg-border scale-x-75"
                        )}
                      />
                    ))}
                  </div>
                </Field>
                <Button type="submit" className="group w-full h-10 rounded-md shadow-sm" disabled={accessCode.length !== 4}>
                  Access Now
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
                </Button>
              </form>
            </Panel>
          </TabsContent>

          <TabsContent value="history" className="mt-0 animate-rise">
            <Panel
              title="Recent Clips"
              icon={<History className="w-4 h-4" />}
              description="Clips you created on this device (stored locally)."
              contentClassName="space-y-2"
              className="animate-in fade-in"
            >
                {history.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-center animate-fade">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <History className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">No clips created yet on this device.</p>
                  </div>
                ) : (
                  history.map((item, idx) => (
                    <div key={item.code} className="flex items-center gap-2 sm:gap-3 bg-muted/40 border border-border rounded-md px-3 py-2.5 transition-[background-color,border-color] duration-150 hover:bg-muted/70 hover:border-primary/30 animate-rise" style={{ animationDelay: `${Math.min(idx * 40, 200)}ms` }}>
                      <button type="button" className="flex-1 min-w-0 cursor-pointer text-left rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50" onClick={() => router.push(`/clip/${item.code}`)}>
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
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <CopyButton value={item.code} successMessage="Code copied!" title="Copy code" className="h-8 w-8" />
                        <Button variant="ghost" size="icon" onClick={() => removeFromHistory(item.code)} title="Remove from history" className="text-destructive hover:text-destructive h-8 w-8">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
            </Panel>
          </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}