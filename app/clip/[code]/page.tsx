"use client";

import { useState, useEffect, use, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Download, Copy, AlertTriangle, ArrowLeft,
  FileText, FileCode, FileArchive, Image as ImageIcon, Video, Music, File, Eye, EyeOff, Loader2, CalendarDays
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { format } from "date-fns";

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
    isOneTimeView?: boolean;
    createdAt?: string;
}

export default function ClipPage({ params }: { params: Promise<{ code: string }> }) {
    const unwrappedParams = use(params);
    const code = unwrappedParams.code;

    const [data, setData] = useState<ClipData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [downloadingMap, setDownloadingMap] = useState<Record<string, boolean>>({});
    const [downloadingAll, setDownloadingAll] = useState(false);
    const [previewFileIndex, setPreviewFileIndex] = useState<number | null>(null);

    const fetchClip = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/clip/${code}`);
            const resData = await res.json();

            if (!res.ok) {
                setError(resData.message || "Clip not found or expired.");
                return;
            }

            setData(resData);
        } catch (err) {
            console.error(err);
            setError("Clip not found or expired.");
        } finally {
            setLoading(false);
        }
    }, [code]);

    useEffect(() => {
        if (code) {
            fetchClip();
        }
    }, [code, fetchClip]);

    const copyText = () => {
        if (data?.text) {
            navigator.clipboard.writeText(data.text);
            toast.success("Text copied to clipboard!");
        }
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

    const handleDownloadAll = async () => {
        if (!data?.files || data.files.length === 0 || downloadingAll) return;
        setDownloadingAll(true);
        toast.info(`Downloading ${data.files.length} file(s)...`);

        try {
            for (let i = 0; i < data.files.length; i++) {
                const file = data.files[i];
                await downloadSingleFile(file.path, file.filename);
                if (i < data.files.length - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 600));
                }
            }
        } finally {
            setDownloadingAll(false);
        }
    };

    const getFileIcon = (filename: string, resourceType?: string) => {
        const ext = filename.split('.').pop()?.toLowerCase() || '';
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext) || resourceType === 'image') {
            return <ImageIcon className="w-5 h-5 text-primary shrink-0" />;
        }
        if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext) || resourceType === 'video') {
            return <Video className="w-5 h-5 text-primary shrink-0" />;
        }
        if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) {
            return <Music className="w-5 h-5 text-primary shrink-0" />;
        }
        if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) {
            return <FileArchive className="w-5 h-5 text-primary shrink-0" />;
        }
        if (['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs', 'sh', 'sql', 'xml', 'yaml', 'yml'].includes(ext)) {
            return <FileCode className="w-5 h-5 text-primary shrink-0" />;
        }
        if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'csv', 'md'].includes(ext)) {
            return <FileText className="w-5 h-5 text-primary shrink-0" />;
        }
        return <File className="w-5 h-5 text-muted-foreground shrink-0" />;
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    };

    const isPreviewable = (filename: string, resourceType?: string) => {
        const ext = filename.split('.').pop()?.toLowerCase() || '';
        return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'mp4', 'webm', 'mp3', 'wav', 'ogg'].includes(ext) || resourceType === 'image' || resourceType === 'video';
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <Card className="w-full max-w-xl">
                    <CardHeader>
                        <Skeleton className="h-8 w-3/4 mb-2" />
                        <Skeleton className="h-4 w-1/2" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Skeleton className="h-32 w-full" />
                        <Skeleton className="h-10 w-full" />
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-4">
                <Card className="w-full max-w-md border-destructive/50 shadow-lg shadow-destructive/10">
                    <CardHeader className="text-center">
                        <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-2" />
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
        );
    }

    return (
        <div className="flex-1 bg-background flex flex-col items-center justify-center p-4 py-10">
            <div className="w-full max-w-3xl lg:max-w-4xl">
                <div className="mb-6 flex items-center justify-between">
                    <Button variant="ghost" asChild>
                        <Link href="/"><ArrowLeft className="w-4 h-4 mr-2" /> Back</Link>
                    </Button>
                </div>

                <div className="text-center mb-8 animate-in fade-in slide-in-from-top-4">
                    <div className="flex items-center justify-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-primary text-primary-foreground flex items-center justify-center rounded-xl font-bold text-2xl shadow-sm shrink-0">
                            C
                        </div>
                        <h1 className="text-3xl font-extrabold tracking-tight">Clip Access</h1>
                    </div>
                    <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-4 py-1.5">
                        <span className="font-mono text-lg font-bold tracking-[0.3em] text-primary">{code}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => { navigator.clipboard.writeText(code); toast.success("Code copied to clipboard!"); }} title="Copy code">
                            <Copy className="w-3.5 h-3.5 text-primary" />
                        </Button>
                    </div>
                </div>

                {data ? (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {data.createdAt && (
                            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                                <CalendarDays className="w-3.5 h-3.5" />
                                Created {format(new Date(data.createdAt), "MMM d, yyyy 'at' h:mm a")}
                            </div>
                        )}

                        {data.isOneTimeView && (
                            <div className="bg-primary/10 border border-primary/20 text-primary p-4 rounded-md flex items-start gap-3 shadow-sm">
                                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-medium">One-Time View Enabled</p>
                                    <p className="text-sm opacity-90">This clip has been permanently deleted from the server. If you refresh, it will be gone.</p>
                                </div>
                            </div>
                        )}

                        {data.text && (
                            <Card className="border-border shadow-sm rounded-none sm:rounded-md">
                                <CardHeader className="pb-3 border-b bg-muted/30">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-lg flex items-center gap-2">
                                            Text Content
                                        </CardTitle>
                                        <Button variant="ghost" size="sm" onClick={copyText} className="h-8">
                                            <Copy className="w-4 h-4 mr-2" /> Copy
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-4">
                                    <pre className="whitespace-pre-wrap font-sans bg-muted/20 p-4 rounded-md min-h-[100px] border border-muted/50 text-sm md:text-base selection:bg-primary/20">
                                        {data.text}
                                    </pre>
                                </CardContent>
                            </Card>
                        )}

                        {data.files && data.files.length > 0 && (
                            <Card className="border-border shadow-sm rounded-none sm:rounded-md">
                                <CardHeader className="pb-3 border-b bg-muted/30">
                                    <div className="flex flex-row items-center justify-between gap-4">
                                        <CardTitle className="text-lg">Attached Files ({data.files.length})</CardTitle>
                                        {data.files.length > 1 && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={handleDownloadAll}
                                                disabled={downloadingAll}
                                                className="h-8 shrink-0 text-xs"
                                            >
                                                {downloadingAll ? (
                                                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                                ) : (
                                                    <Download className="w-3.5 h-3.5 mr-1.5" />
                                                )}
                                                {downloadingAll ? "Downloading All..." : "Download All"}
                                            </Button>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-4">
                                    <div className="space-y-3">
                                        {data.files.map((file: ClipFile, index: number) => {
                                            const ext = file.filename.split('.').pop()?.toLowerCase() || '';
                                            const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext) || file.resourceType === 'image';
                                            const isVideo = ['mp4', 'webm', 'mov'].includes(ext) || file.resourceType === 'video';
                                            const isAudio = ['mp3', 'wav', 'ogg', 'm4a'].includes(ext);
                                            const isPreviewing = previewFileIndex === index;

                                            return (
                                                <div key={index} className="rounded-lg border border-border bg-card overflow-hidden transition-colors hover:bg-muted/30">
                                                    <div className="flex items-center gap-3 p-3.5">
                                                        <div className="w-11 h-11 shrink-0 rounded-md bg-primary/10 flex items-center justify-center">
                                                            {getFileIcon(file.filename, file.resourceType)}
                                                        </div>

                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-medium text-sm truncate" title={file.filename}>{file.filename}</p>
                                                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                                                <span>{formatSize(file.size)}</span>
                                                                <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
                                                                <span className="uppercase font-medium">{ext || "FILE"}</span>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2 shrink-0">
                                                            {isPreviewable(file.filename, file.resourceType) && (
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => setPreviewFileIndex(isPreviewing ? null : index)}
                                                                    className="h-8 px-3 text-xs"
                                                                >
                                                                    {isPreviewing ? <EyeOff className="w-3.5 h-3.5 mr-1.5" /> : <Eye className="w-3.5 h-3.5 mr-1.5" />}
                                                                    {isPreviewing ? "Hide" : "Preview"}
                                                                </Button>
                                                            )}
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => downloadSingleFile(file.path, file.filename)}
                                                                disabled={!!downloadingMap[file.filename]}
                                                                className="h-8 px-3 text-xs"
                                                            >
                                                                {downloadingMap[file.filename] ? (
                                                                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                                                ) : (
                                                                    <Download className="w-3.5 h-3.5 mr-1.5" />
                                                                )}
                                                                {downloadingMap[file.filename] ? "Downloading..." : "Download"}
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    {isPreviewing && (
                                                        <div className="border-t border-border bg-muted/20 p-4 flex justify-center items-center">
                                                            {isImage && (
                                                                /* eslint-disable-next-line @next/next/no-img-element */
                                                                <img
                                                                    src={file.path}
                                                                    alt={file.filename}
                                                                    className="max-h-80 max-w-full object-contain rounded-md border border-border shadow-sm"
                                                                />
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
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
