"use client";

import { useState, useEffect, use, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Download, AlertTriangle, ArrowLeft, FileArchive, FileCode,
  Eye, EyeOff, Loader2, CalendarDays, Clock, Trash2, Pencil, BarChart3, Maximize2,
} from "lucide-react";
import { FileIcon } from "@/components/file-icon";
import { CodeBadge } from "@/components/code-badge";
import { CopyButton } from "@/components/copy-button";
import { Segmented } from "@/components/segmented";
import { ConfirmButton } from "@/components/confirm-button";
import { CodeView, languageForFilename } from "@/components/code-view";
import { Lightbox } from "@/components/lightbox";
import { Textarea } from "@/components/ui/textarea";
import { ownerHeaders, removeHistoryItem } from "@/lib/history";
import { MAX_TEXT_LENGTH } from "@/lib/limits";
import { formatBytes } from "@/lib/format";
import { isPdf, isPreviewable, isTextPreview } from "@/lib/file-types";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { format } from "date-fns";
import dynamic from "next/dynamic";

// Split the markdown renderer (and its highlighter) out of the initial
// viewer bundle — it's only needed when a clip actually contains text.
const Markdown = dynamic(() => import("@/components/markdown"), {
  ssr: false,
  loading: () => <p className="text-sm text-muted-foreground py-4">Loading preview…</p>,
});

interface ClipFile {
    filename: string;
    path: string;
    size: number;
    key?: string;
    resourceType?: string;
}

interface ClipData {
    code: string;
    text?: string;
    files: ClipFile[];
    createdAt?: string;
    expiresAt?: string;
    isOwner?: boolean;
    views?: number;
    lastViewedAt?: string | null;
}

/** How often an open clip checks for changes made on another device. */
const LIVE_POLL_MS = 5000;

const sameFiles = (a: ClipFile[], b: ClipFile[]) =>
    a.length === b.length && a.every((f, i) => f.key === b[i].key && f.path === b[i].path);

type TextView = "preview" | "code" | "raw";
const TEXT_VIEWS = [
    { value: "preview", label: "Preview" },
    { value: "code", label: "Code" },
    { value: "raw", label: "Raw" },
] as const;

export default function ClipPage({ params }: { params: Promise<{ code: string }> }) {
    const unwrappedParams = use(params);
    const code = unwrappedParams.code;

    const [data, setData] = useState<ClipData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [downloadingMap, setDownloadingMap] = useState<Record<string, boolean>>({});
    const [downloadingAll, setDownloadingAll] = useState(false);
    const [previewFileIndex, setPreviewFileIndex] = useState<number | null>(null);
    const [textView, setTextView] = useState<TextView>("preview");
    const [textFilePreviews, setTextFilePreviews] = useState<Record<string, string>>({});

    const [timeLeft, setTimeLeft] = useState<{ d: number; h: number; m: number; s: number } | null>(null);
    const [deletingFile, setDeletingFile] = useState<string | null>(null);

    // Owner editing
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    const [saving, setSaving] = useState(false);

    const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
    const router = useRouter();

    /** Owner token, sent with every clip request. */
    const authHeaders = useCallback(() => ownerHeaders(code), [code]);

    // Live updates: `dataRef` lets the poller diff without re-subscribing, and
    // `mutationRef` bumps on local edits so an in-flight poll can't undo them.
    const dataRef = useRef<ClipData | null>(null);
    const mutationRef = useRef(0);
    const pollingRef = useRef(false);
    useEffect(() => {
        dataRef.current = data;
    }, [data]);

    const fetchClip = useCallback(async () => {
        try {
            const res = await fetch(`/api/clip/${code}`, { headers: authHeaders(), cache: "no-store" });
            const resData = await res.json().catch(() => ({}));

            if (!res.ok) {
                setError(resData.message || "Clip not found or expired.");
                // Clip is gone on the server (deleted/expired) — drop it
                // from this device's local history so it doesn't linger.
                if (res.status === 404 || res.status === 410) removeHistoryItem(code);
                return;
            }

            setData(resData);
        } catch (err) {
            console.error(err);
            setError("Clip not found or expired.");
        } finally {
            setLoading(false);
        }
    }, [code, authHeaders]);

    const refreshClip = useCallback(async () => {
        if (pollingRef.current) return;
        pollingRef.current = true;
        const mutation = mutationRef.current;
        try {
            const res = await fetch(`/api/clip/${code}?live=1`, { headers: authHeaders(), cache: "no-store" });
            if (mutation !== mutationRef.current) return;
            if (res.status === 404 || res.status === 410) {
                const body = await res.json().catch(() => ({}));
                removeHistoryItem(code);
                setError(res.status === 404 ? "This clip was deleted." : body.message || "Clip has expired");
                return;
            }
            // Rate limits and server hiccups are transient; try again next tick.
            if (!res.ok) return;
            const next: ClipData = await res.json();
            if (mutation !== mutationRef.current) return;

            const prev = dataRef.current;
            if (prev) {
                const filesChanged = !sameFiles(prev.files, next.files);
                if (filesChanged) setPreviewFileIndex(null);
                if (filesChanged || prev.text !== next.text) toast.info("This clip was just updated");
            }
            setData(next);
        } catch {
            // offline or network blip; try again next tick
        } finally {
            pollingRef.current = false;
        }
    }, [code, authHeaders]);

    const startEditing = () => {
        setDraft(data?.text || "");
        setEditing(true);
    };

    const saveEdit = async () => {
        mutationRef.current++;
        setSaving(true);
        try {
            const res = await fetch(`/api/clip/${code}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({ text: draft }),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.message || "Couldn't save changes");
            setData((prev) => (prev ? { ...prev, text: draft } : prev));
            setEditing(false);
            toast.success("Clip updated");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Couldn't save changes");
        } finally {
            mutationRef.current++;
            setSaving(false);
        }
    };

    const deleteClip = async () => {
        mutationRef.current++;
        try {
            const res = await fetch(`/api/clip/${code}`, { method: "DELETE", headers: authHeaders() });
            const body = await res.json().catch(() => null);
            if (!res.ok && res.status !== 404) throw new Error(body?.message || "Couldn't delete the clip");
            removeHistoryItem(code);
            toast.info("Clip deleted");
            router.push("/");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Couldn't delete the clip");
        }
    };

    useEffect(() => {
        if (code) {
            fetchClip();
        }
    }, [code, fetchClip]);

    // Poll for changes while the tab is visible, and catch up as soon as it
    // becomes visible again.
    const hasData = !!data;
    useEffect(() => {
        if (!hasData || error) return;
        const tick = () => {
            if (document.visibilityState === "visible") refreshClip();
        };
        const interval = setInterval(tick, LIVE_POLL_MS);
        document.addEventListener("visibilitychange", tick);
        return () => {
            clearInterval(interval);
            document.removeEventListener("visibilitychange", tick);
        };
    }, [hasData, error, refreshClip]);

    // Live countdown to expiry
    useEffect(() => {
        if (!data?.expiresAt) return;
        const expiresAtTime = new Date(data.expiresAt).getTime();
        const update = () => {
            const diff = expiresAtTime - Date.now();
            if (diff <= 0) {
                setTimeLeft({ d: 0, h: 0, m: 0, s: 0 });
                return;
            }
            setTimeLeft({
                d: Math.floor(diff / 86400000),
                h: Math.floor((diff % 86400000) / 3600000),
                m: Math.floor((diff % 3600000) / 60000),
                s: Math.floor((diff % 60000) / 1000),
            });
        };
        update();
        const interval = setInterval(update, 1000);
        return () => clearInterval(interval);
    }, [data?.expiresAt]);

    // Fetch text-based file previews on demand
    useEffect(() => {
        if (previewFileIndex === null || !data?.files[previewFileIndex]) return;
        const file = data.files[previewFileIndex];
        if (!isTextPreview(file.filename) || textFilePreviews[file.filename] !== undefined) return;
        const endpoint = `/api/download?url=${encodeURIComponent(file.path)}&filename=${encodeURIComponent(file.filename)}`;
        fetch(endpoint).then(async (res) => {
            if (!res.ok) throw new Error("preview fetch failed");
            const text = await res.text();
            setTextFilePreviews(prev => ({ ...prev, [file.filename]: text.slice(0, 50_000) }));
        }).catch(() => {
            setTextFilePreviews(prev => ({ ...prev, [file.filename]: "Failed to load preview." }));
        });
    }, [previewFileIndex, data?.files, textFilePreviews]);

    const downloadTextAsFile = () => {
        if (!data?.text) return;
        const blob = new Blob([data.text], { type: "text/plain;charset=utf-8" });
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = `clip-${code}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 2000);
        toast.success("Text downloaded as .txt");
    };

    const downloadSingleFile = async (url: string, filename: string) => {
        setDownloadingMap((prev) => ({ ...prev, [filename]: true }));
        const downloadEndpoint = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;

        try {
            const res = await fetch(downloadEndpoint);
            if (!res.ok) throw new Error("Download request failed");

            const blob = await res.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = blobUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => window.URL.revokeObjectURL(blobUrl), 2000);
            toast.success(`Downloaded ${filename}`);
        } catch (e) {
            console.warn("Direct blob download failed, triggering fallback download:", e);
            const link = document.createElement("a");
            link.href = downloadEndpoint;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.info(`Downloading ${filename}...`);
        } finally {
            setDownloadingMap((prev) => ({ ...prev, [filename]: false }));
        }
    };

    const handleDeleteFile = async (filename: string, key?: string) => {
        if (!data || !key) {
            toast.error("Cannot delete this file");
            return;
        }
        mutationRef.current++;
        setDeletingFile(filename);
        try {
            const res = await fetch(`/api/clip/${code}/file?key=${encodeURIComponent(key)}`, { method: "DELETE", headers: authHeaders() });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.message || "Delete failed");
            setData(prev => prev ? ({ ...prev, files: prev.files.filter(f => f.key !== key) }) : prev);
            toast.success(`Deleted ${filename}`);
            setPreviewFileIndex(null);
            if (!data.text?.trim() && data.files.length <= 1) {
                // The server keeps an empty clip around; nothing left worth showing.
                toast.info("That was the last file in this clip.");
            }
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Delete failed");
        } finally {
            mutationRef.current++;
            setDeletingFile(null);
        }
    };

    const handleDownloadZip = async () => {
        if (!data?.files || data.files.length === 0 || downloadingAll) return;
        setDownloadingAll(true);

        try {
            const res = await fetch(`/api/clip/${code}/zip`, { headers: authHeaders() });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.message || "ZIP download failed");
            }

            const blob = await res.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = blobUrl;
            link.download = `clip-${code}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => window.URL.revokeObjectURL(blobUrl), 2000);
            toast.success(`Downloaded ${data.files.length} file(s) as ZIP`);
        } catch (e) {
            console.error(e);
            toast.error(e instanceof Error ? e.message : "ZIP download failed");
        } finally {
            setDownloadingAll(false);
        }
    };

    const getFileIcon = (filename: string, resourceType?: string) => (
      <FileIcon filename={filename} resourceType={resourceType} className="w-5 h-5 text-primary shrink-0" />
    );

    const formatSize = formatBytes;

    if (loading) {
        return (
            <div className="flex-1 w-full min-w-0 overflow-x-clip px-3 py-4 sm:px-6 sm:py-6">
                <div className="mx-auto w-full max-w-3xl min-w-0 flex flex-col gap-3">
                    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4">
                        <Skeleton className="h-8 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-32 w-full" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex-1 w-full px-3 py-4 sm:px-6 sm:py-6">
                <div className="mx-auto w-full max-w-3xl flex flex-col gap-3">
                    <Card className="w-full max-w-md mx-auto border-destructive/50 shadow-md rounded-xl animate-rise">
                        <CardHeader className="text-center">
                            <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-2 animate-pop" />
                            <CardTitle className="text-2xl text-destructive">Error</CardTitle>
                            <CardDescription>{error}</CardDescription>
                        </CardHeader>
                        <CardFooter className="flex justify-center">
                            <Button asChild>
                                <Link href="/">Back to Home</Link>
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 w-full px-3 py-4 sm:px-6 sm:py-6">
            <div className="mx-auto w-full max-w-3xl flex flex-col gap-3">
                <div className="flex w-full items-center gap-1 rounded-xl border border-border bg-card p-1.5 animate-in fade-in slide-in-from-top-4">
                    <Button variant="ghost" size="sm" asChild className="h-10 shrink-0 rounded-lg px-3">
                        <Link href="/"><ArrowLeft className="w-4 h-4 mr-2" /> Back</Link>
                    </Button>
                    <div className="flex flex-1 items-center justify-center min-w-0">
                        <CodeBadge code={code} className="w-full" />
                    </div>
                </div>

                {data ? (
                    <section className="min-w-0 flex-1 rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4 sm:space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] sm:text-xs text-muted-foreground text-center">
                            {data.createdAt && (
                                <span className="flex items-center gap-1.5">
                                    <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                                    Created {format(new Date(data.createdAt), "MMM d, yyyy 'at' h:mm a")}
                                </span>
                            )}
                            {data.expiresAt && timeLeft && (
                                <span className={`flex items-center gap-1.5 font-mono tabular-nums transition-colors duration-300 ${timeLeft.d === 0 && timeLeft.h === 0 && timeLeft.m < 10 ? "text-destructive font-semibold" : ""}`}>
                                    <Clock className={`w-3.5 h-3.5 shrink-0 ${timeLeft.d === 0 && timeLeft.h === 0 && timeLeft.m < 1 ? "animate-pulse" : ""}`} />
                                    {timeLeft.d + timeLeft.h + timeLeft.m + timeLeft.s === 0
                                        ? "Expired"
                                        : `Expires in ${timeLeft.d > 0 ? `${timeLeft.d}d ` : ""}${timeLeft.h}h ${String(timeLeft.m).padStart(2, "0")}m ${String(timeLeft.s).padStart(2, "0")}s`}
                                </span>
                            )}
                            <span className="flex items-center gap-1.5" title={data.lastViewedAt ? `Last opened ${format(new Date(data.lastViewedAt), "MMM d 'at' h:mm a")}` : undefined}>
                                <BarChart3 className="w-3.5 h-3.5 shrink-0" />
                                {data.views ?? 0} view{data.views === 1 ? "" : "s"}
                                {data.lastViewedAt && <span className="hidden sm:inline">· last {format(new Date(data.lastViewedAt), "MMM d, h:mm a")}</span>}
                            </span>
                            <span className="flex items-center gap-1.5" title="Changes made on other devices show up here automatically">
                                <span className="relative flex h-2 w-2 shrink-0">
                                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 motion-safe:animate-ping" />
                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                                </span>
                                Live
                            </span>
                        </div>

                        {data.isOwner && (
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border px-3 py-2 animate-rise">
                                <p className="text-xs text-muted-foreground">You created this clip on this device.</p>
                                <div className="flex items-center gap-1.5">
                                    {!editing && (
                                        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={startEditing}>
                                            <Pencil className="w-3.5 h-3.5" /> {data.text ? "Edit text" : "Add text"}
                                        </Button>
                                    )}
                                    <ConfirmButton onConfirm={deleteClip} confirmLabel="Delete clip?" className="h-8 text-xs">
                                        <Trash2 className="w-3.5 h-3.5" /> Delete clip
                                    </ConfirmButton>
                                </div>
                            </div>
                        )}

                        {editing && (
                            <Card className="border-primary/40 shadow-sm rounded-xl overflow-hidden animate-rise">
                                <CardContent className="p-3 sm:p-4 space-y-2">
                                    <Textarea
                                        autoFocus
                                        value={draft}
                                        maxLength={MAX_TEXT_LENGTH}
                                        onChange={(e) => setDraft(e.target.value)}
                                        onKeyDown={(e) => {
                                            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); saveEdit(); }
                                            if (e.key === "Escape") setEditing(false);
                                        }}
                                        className="min-h-40 max-h-[60vh] font-mono text-sm"
                                    />
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] text-muted-foreground tabular-nums">{draft.length.toLocaleString("en-US")} chars · Ctrl+Enter to save, Esc to cancel</span>
                                        <div className="flex gap-1.5">
                                            <Button variant="ghost" size="sm" className="h-8" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
                                            <Button size="sm" className="h-8" onClick={saveEdit} disabled={saving || draft === (data.text || "")}>
                                                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {data.text && !editing && (
                            <Card className="border-border shadow-sm rounded-xl overflow-hidden">
                                <CardHeader className="pb-3 border-b bg-muted/30 px-4 sm:px-6">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                                            <FileCode className="w-4 h-4 text-primary" /> Text Content
                                        </CardTitle>
                                        <div className="flex gap-2 self-stretch sm:self-auto flex-wrap">
                                            <Segmented
                                                ariaLabel="Text view"
                                                options={TEXT_VIEWS}
                                                value={textView}
                                                onChange={setTextView}
                                                className="w-52"
                                                itemClassName="h-7 text-xs"
                                            />
                                            <Button variant="ghost" size="sm" onClick={downloadTextAsFile} className="h-8 flex-1 sm:flex-none text-xs sm:text-sm">
                                                <Download className="w-4 h-4 mr-1 sm:mr-2" /> .txt
                                            </Button>
                                            <CopyButton
                                                value={data.text}
                                                successMessage="Text copied to clipboard!"
                                                size="sm"
                                                title="Copy text"
                                                iconClassName="size-4"
                                                className="h-8 flex-1 sm:flex-none text-xs sm:text-sm"
                                            >
                                                Copy
                                            </CopyButton>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent key={textView} className="pt-4 px-4 sm:px-6 animate-fade">
                                    {textView === "code" ? (
                                        <CodeView code={data.text} className="bg-muted/20 p-3 sm:p-4 rounded-md min-h-[100px] border border-muted/50 max-w-full" />
                                    ) : textView === "raw" ? (
                                        <pre className="whitespace-pre-wrap break-words font-mono bg-muted/20 p-3 sm:p-4 rounded-md min-h-[100px] border border-muted/50 text-sm sm:text-base selection:bg-primary/20 overflow-x-auto max-w-full">
                                            {data.text}
                                        </pre>
                                    ) : (
                                        <div className="markdown-preview min-h-[100px] border border-muted/50 rounded-md bg-muted/20 p-3 sm:p-4 overflow-x-auto max-w-full text-sm leading-relaxed [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_p]:mb-2 [&_p]:leading-7 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 [&_li]:mb-1 [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-primary/30 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:my-3 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_code]:bg-transparent [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[13px] [&_code]:font-mono [&_pre]:bg-transparent [&_pre]:border [&_pre]:border-border [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:overflow-x-auto [&_pre]:my-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_hr]:my-4 [&_hr]:border-border">
                                            <Markdown>{data.text || ""}</Markdown>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )}

                        {data.files && data.files.length > 0 && (
                            <Card className="border-border shadow-sm rounded-xl overflow-hidden">
                                <CardHeader className="pb-3 border-b bg-muted/30 px-4 sm:px-6">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <CardTitle className="text-base sm:text-lg">Attached Files ({data.files.length})</CardTitle>
                                        {data.files.length > 1 && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={handleDownloadZip}
                                                disabled={downloadingAll}
                                                className="h-9 sm:h-8 shrink-0 text-xs w-full sm:w-auto"
                                            >
                                                {downloadingAll ? (
                                                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                                ) : (
                                                    <FileArchive className="w-3.5 h-3.5 mr-1.5" />
                                                )}
                                                {downloadingAll ? "Bundling..." : "Download All (ZIP)"}
                                            </Button>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-4 px-3 sm:px-6">
                                    <div className="space-y-3">
                                        {data.files.map((file: ClipFile, index: number) => {
                                            const ext = file.filename.split('.').pop()?.toLowerCase() || '';
                                            const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext) || file.resourceType === 'image';
                                            const isVideo = ['mp4', 'webm', 'mov'].includes(ext) || file.resourceType === 'video';
                                            const isAudio = ['mp3', 'wav', 'ogg', 'm4a'].includes(ext);
                                            const isPreviewing = previewFileIndex === index;

                                            return (
                                                <div key={file.key || file.path} className="rounded-lg border border-border bg-card overflow-hidden transition-[background-color,border-color] duration-150 hover:bg-muted/30 hover:border-primary/20 animate-rise" style={{ animationDelay: `${Math.min(index * 40, 200)}ms` }}>
                                                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:p-3.5">
                                                        <div className="flex items-center gap-3 flex-1 min-w-0 w-full">
                                                            <div className="w-10 h-10 sm:w-11 sm:h-11 shrink-0 rounded-md bg-primary/10 flex items-center justify-center">
                                                                {getFileIcon(file.filename, file.resourceType)}
                                                            </div>

                                                            <div className="flex-1 min-w-0">
                                                                <p className="font-medium text-sm truncate pr-2" title={file.filename}>{file.filename}</p>
                                                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                                                                    <span>{formatSize(file.size)}</span>
                                                                    <span className="w-1 h-1 rounded-full bg-muted-foreground/50 hidden sm:block" />
                                                                    <span className="uppercase font-medium truncate">{ext || "FILE"}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                                                            {isPreviewable(file.filename, file.resourceType) && (
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => setPreviewFileIndex(isPreviewing ? null : index)}
                                                                    className="h-9 sm:h-8 px-3 text-xs flex-1 sm:flex-none"
                                                                >
                                                                    <span key={String(isPreviewing)} className="inline-flex animate-fade">
                                                                        {isPreviewing ? <EyeOff className="w-3.5 h-3.5 mr-1.5" /> : <Eye className="w-3.5 h-3.5 mr-1.5" />}
                                                                    </span>
                                                                    {isPreviewing ? "Hide" : "Preview"}
                                                                </Button>
                                                            )}
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => downloadSingleFile(file.path, file.filename)}
                                                                disabled={!!downloadingMap[file.filename]}
                                                                className="h-9 sm:h-8 px-3 text-xs flex-1 sm:flex-none"
                                                            >
                                                                {downloadingMap[file.filename] ? (
                                                                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                                                ) : (
                                                                    <Download className="w-3.5 h-3.5 mr-1.5" />
                                                                )}
                                                                <span className="hidden sm:inline">{downloadingMap[file.filename] ? "Downloading..." : "Download"}</span>
                                                                <span className="sm:hidden">Download</span>
                                                            </Button>
                                                            {data.isOwner && <ConfirmButton
                                                                onConfirm={() => handleDeleteFile(file.filename, file.key)}
                                                                disabled={deletingFile === file.filename}
                                                                confirmLabel={<span className="text-xs">Delete?</span>}
                                                                className="h-9 min-w-9 sm:h-8 sm:min-w-8 px-2 shrink-0"
                                                                title="Delete file"
                                                            >
                                                                {deletingFile === file.filename ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                                            </ConfirmButton>}
                                                        </div>
                                                    </div>

                                                    {isPreviewing && (
                                                        <div className="border-t border-border bg-muted/20 p-3 sm:p-4 flex justify-center items-center overflow-hidden animate-rise">
                                                            {isImage && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setLightbox({ src: file.path, alt: file.filename })}
                                                                    className="group/img relative cursor-zoom-in rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                                                    aria-label={`Open ${file.filename} full screen`}
                                                                >
                                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                    <img
                                                                        src={file.path}
                                                                        alt={file.filename}
                                                                        className="max-h-80 max-w-full object-contain rounded-md border border-border shadow-sm transition-transform duration-200 ease-out group-hover/img:scale-[1.01]"
                                                                    />
                                                                    <span className="absolute right-2 top-2 rounded-md bg-black/60 p-1.5 text-white opacity-0 transition-opacity duration-150 group-hover/img:opacity-100 group-focus-visible/img:opacity-100">
                                                                        <Maximize2 className="w-3.5 h-3.5" />
                                                                    </span>
                                                                </button>
                                                            )}
                                                            {isVideo && (
                                                                <video
                                                                    src={file.path}
                                                                    controls
                                                                    className="max-h-80 max-w-full rounded-md border border-border shadow-sm"
                                                                />
                                                            )}
                                                            {isAudio && (
                                                                <audio
                                                                    src={file.path}
                                                                    controls
                                                                    className="w-full max-w-md"
                                                                />
                                                            )}
                                                            {isPdf(file.filename) && (
                                                                <iframe src={file.path} title={file.filename} className="w-full h-[60vh] sm:h-[500px] rounded-md border border-border bg-white" />
                                                            )}
                                                            {isTextPreview(file.filename) && (
                                                                textFilePreviews[file.filename] === undefined || !textFilePreviews[file.filename] ? (
                                                                    <p className="w-full text-center text-sm text-muted-foreground py-4">
                                                                        {textFilePreviews[file.filename] === undefined ? "Loading preview…" : "Empty file"}
                                                                    </p>
                                                                ) : (
                                                                    <CodeView
                                                                        code={textFilePreviews[file.filename]}
                                                                        language={languageForFilename(file.filename)}
                                                                        className="w-full max-h-80 overflow-auto bg-muted/30 p-3 rounded-md border border-border"
                                                                    />
                                                                )
                                                            )}
                                                            {!isImage && !isVideo && !isAudio && !isPdf(file.filename) && !isTextPreview(file.filename) && (
                                                                <p className="text-sm text-muted-foreground py-4">No preview available for this file type.</p>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </section>
                ) : null}
            </div>
            {lightbox && <Lightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />}
        </div>
    );
}