"use client";

import { useState, useEffect, use, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Download, Copy, AlertTriangle, ArrowLeft, Lock, FileArchive,
  FileText, FileCode, Image as ImageIcon, Video, Music, File, Eye, EyeOff, Loader2, CalendarDays, Clock, Share2, MessageCircle, Send, Mail
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
    expiresAt?: string;
}

const ONE_TIME_AUTO_DOWNLOAD_DELAY = 400;

export default function ClipPage({ params }: { params: Promise<{ code: string }> }) {
    const unwrappedParams = use(params);
    const code = unwrappedParams.code;

    const [data, setData] = useState<ClipData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [needsPassword, setNeedsPassword] = useState(false);
    const [password, setPassword] = useState("");
    const [passwordChecking, setPasswordChecking] = useState(false);

    const [downloadingMap, setDownloadingMap] = useState<Record<string, boolean>>({});
    const [downloadingAll, setDownloadingAll] = useState(false);
    const [previewFileIndex, setPreviewFileIndex] = useState<number | null>(null);

    const [timeLeft, setTimeLeft] = useState<{ h: number; m: number; s: number } | null>(null);

    const fetchClip = useCallback(async (pwd?: string) => {
        try {
            setLoading(true);
            const headers: Record<string, string> = {};
            if (pwd) headers["x-clip-password"] = pwd;

            const res = await fetch(`/api/clip/${code}`, { headers });
            const resData = await res.json();

            if (res.status === 401) {
                setNeedsPassword(true);
                setError("");
                setLoading(false);
                return;
            }

            if (!res.ok) {
                setError(resData.message || "Clip not found or expired.");
                setLoading(false);
                return;
            }

            setNeedsPassword(false);
            setData(resData);
            setLoading(false);
        } catch (err) {
            console.error(err);
            setError("Clip not found or expired.");
            setLoading(false);
        }
    }, [code]);

    useEffect(() => {
        if (code) {
            fetchClip();
        }
    }, [code, fetchClip]);

    // Live countdown to expiry
    useEffect(() => {
        if (!data?.expiresAt) return;
        const expiresAtTime = new Date(data.expiresAt).getTime();
        const update = () => {
            const diff = expiresAtTime - Date.now();
            if (diff <= 0) {
                setTimeLeft({ h: 0, m: 0, s: 0 });
                return;
            }
            setTimeLeft({
                h: Math.floor(diff / 3600000),
                m: Math.floor((diff % 3600000) / 60000),
                s: Math.floor((diff % 60000) / 1000),
            });
        };
        update();
        const interval = setInterval(update, 1000);
        return () => clearInterval(interval);
    }, [data?.expiresAt]);

    // One-time clips are deleted server-side on fetch — save the files locally
    // immediately so the recipient keeps them.
    useEffect(() => {
        if (!data?.isOneTimeView || !data.files || data.files.length === 0) return;
        const timers = data.files.map((file, i) =>
            setTimeout(() => {
                downloadSingleFile(file.path, file.filename).catch(() => {});
            }, ONE_TIME_AUTO_DOWNLOAD_DELAY * (i + 1))
        );
        return () => timers.forEach(clearTimeout);
    }, [data?.isOneTimeView, data?.files]);

    const handlePasswordSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!password.trim()) return;
        setPasswordChecking(true);
        fetchClip(password).finally(() => setPasswordChecking(false));
    };

    const copyText = () => {
        if (data?.text) {
            navigator.clipboard.writeText(data.text);
            toast.success("Text copied to clipboard!");
        }
    };

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

    const handleDownloadZip = async () => {
        if (!data?.files || data.files.length === 0 || downloadingAll) return;
        setDownloadingAll(true);

        try {
            const headers: Record<string, string> = {};
            if (password) headers["x-clip-password"] = password;

            const res = await fetch(`/api/clip/${code}/zip`, { headers });
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

    const clipUrl = useMemo(
        () => `${typeof window !== "undefined" ? window.location.origin : ""}/clip/${code}`,
        [code]
    );
    const shareText = `Check out my CodeClip: ${clipUrl}`;

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

    if (needsPassword) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-4">
                <Card className="w-full max-w-md border-border shadow-lg">
                    <CardHeader className="text-center">
                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center border border-primary/20 mx-auto mb-2">
                            <Lock className="w-6 h-6 text-primary" />
                        </div>
                        <CardTitle className="text-xl">Password Protected</CardTitle>
                        <CardDescription className="text-sm">This clip is locked. Enter the password to view it.</CardDescription>
                    </CardHeader>
                    <form onSubmit={handlePasswordSubmit}>
                        <CardContent>
                            <Input
                                type="password"
                                placeholder="Enter clip password"
                                className="h-11 text-center rounded-md font-mono"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoFocus
                            />
                        </CardContent>
                        <CardFooter className="flex gap-2">
                            <Button type="button" variant="outline" className="flex-1" asChild>
                                <Link href="/">Back</Link>
                            </Button>
                            <Button type="submit" className="flex-1" disabled={!password.trim() || passwordChecking}>
                                {passwordChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                                {passwordChecking ? "Checking..." : "Unlock"}
                            </Button>
                        </CardFooter>
                    </form>
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
        <div className="flex-1 bg-background flex flex-col items-center justify-center px-3 py-6 sm:p-4 sm:py-10">
            <div className="w-full max-w-3xl lg:max-w-4xl">
                <div className="mb-4 sm:mb-6 flex items-center justify-between">
                    <Button variant="ghost" size="sm" asChild className="h-9">
                        <Link href="/"><ArrowLeft className="w-4 h-4 mr-2" /> Back</Link>
                    </Button>
                </div>

                <div className="text-center mb-6 sm:mb-8 animate-in fade-in slide-in-from-top-4 px-2">
                    <div className="flex items-center justify-center gap-2 sm:gap-3 mb-2">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-primary text-primary-foreground flex items-center justify-center rounded-xl font-bold text-xl sm:text-2xl shadow-sm shrink-0">
                            C
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Clip Access</h1>
                    </div>
                    <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 sm:px-4 py-1.5 max-w-full">
                        <span className="font-mono text-base sm:text-lg font-bold tracking-[0.2em] sm:tracking-[0.3em] text-primary truncate">{code}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => { navigator.clipboard.writeText(code); toast.success("Code copied to clipboard!"); }} title="Copy code">
                            <Copy className="w-3.5 h-3.5 text-primary" />
                        </Button>
                    </div>
                </div>

                {data ? (
                    <div className="space-y-4 sm:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] sm:text-xs text-muted-foreground text-center">
                            {data.createdAt && (
                                <span className="flex items-center gap-1.5">
                                    <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                                    Created {format(new Date(data.createdAt), "MMM d, yyyy 'at' h:mm a")}
                                </span>
                            )}
                            {data.expiresAt && timeLeft && (
                                <span className={`flex items-center gap-1.5 font-mono ${timeLeft.h === 0 && timeLeft.m < 10 ? "text-destructive font-semibold" : ""}`}>
                                    <Clock className="w-3.5 h-3.5 shrink-0" />
                                    Expires in {timeLeft.h}h {timeLeft.m}m {timeLeft.s}s
                                </span>
                            )}
                        </div>

                        {data.isOneTimeView && (
                            <div className="bg-primary/10 border border-primary/20 text-primary p-4 rounded-md flex items-start gap-3 shadow-sm">
                                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-medium">One-Time View Enabled</p>
                                    <p className="text-sm opacity-90">
                                        This clip can only be viewed once — it will be permanently deleted from the server when it expires.
                                        {data.files.length > 0 && " Your files are being saved to this device automatically."}
                                        {data.files.length === 0 && " If you refresh, it will be gone."}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Share buttons */}
                        <div className="flex flex-wrap justify-center items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground mr-1 w-full sm:w-auto justify-center sm:justify-start mb-1 sm:mb-0">
                                <Share2 className="w-3.5 h-3.5" /> Share:
                            </span>
                            <Button variant="outline" size="sm" className="h-8 text-xs flex-1 sm:flex-none min-w-[90px]" asChild>
                                <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer">
                                    <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                                </a>
                            </Button>
                            <Button variant="outline" size="sm" className="h-8 text-xs flex-1 sm:flex-none min-w-[90px]" asChild>
                                <a href={`https://t.me/share/url?url=${encodeURIComponent(clipUrl)}&text=${encodeURIComponent("Check out my CodeClip")}`} target="_blank" rel="noopener noreferrer">
                                    <Send className="w-3.5 h-3.5" /> Telegram
                                </a>
                            </Button>
                            <Button variant="outline" size="sm" className="h-8 text-xs flex-1 sm:flex-none min-w-[70px]" asChild>
                                <a href={`mailto:?subject=${encodeURIComponent("CodeClip")}&body=${encodeURIComponent(shareText)}`}>
                                    <Mail className="w-3.5 h-3.5" /> Email
                                </a>
                            </Button>
                        </div>

                        {data.text && (
                            <Card className="border-border shadow-sm rounded-xl overflow-hidden">
                                <CardHeader className="pb-3 border-b bg-muted/30 px-4 sm:px-6">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                                            Text Content
                                        </CardTitle>
                                        <div className="flex gap-2 self-stretch sm:self-auto">
                                            <Button variant="ghost" size="sm" onClick={downloadTextAsFile} className="h-8 flex-1 sm:flex-none text-xs sm:text-sm">
                                                <Download className="w-4 h-4 mr-1 sm:mr-2" /> .txt
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={copyText} className="h-8 flex-1 sm:flex-none text-xs sm:text-sm">
                                                <Copy className="w-4 h-4 mr-1 sm:mr-2" /> Copy
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-4 px-4 sm:px-6">
                                    <pre className="whitespace-pre-wrap break-words font-mono bg-muted/20 p-3 sm:p-4 rounded-md min-h-[100px] border border-muted/50 text-sm sm:text-base selection:bg-primary/20 overflow-x-auto max-w-full">
                                        {data.text}
                                    </pre>
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
                                                <div key={index} className="rounded-lg border border-border bg-card overflow-hidden transition-colors hover:bg-muted/30">
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
                                                                    {isPreviewing ? <EyeOff className="w-3.5 h-3.5 mr-1.5" /> : <Eye className="w-3.5 h-3.5 mr-1.5" />}
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