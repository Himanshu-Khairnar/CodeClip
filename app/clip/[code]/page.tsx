"use client";

import { useState, useEffect, use } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Download, Copy, Lock, ShieldCheck, AlertTriangle, ArrowLeft, Sun, Moon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { useTheme } from "next-themes";

export default function ClipPage({ params }: { params: Promise<{ code: string }> }) {
    const unwrappedParams = use(params);
    const code = unwrappedParams.code;

    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [password, setPassword] = useState("");
    const [verifying, setVerifying] = useState(false);
    const [needsPassword, setNeedsPassword] = useState(false);

    const { theme, setTheme } = useTheme();

    useEffect(() => {
        if (code) {
            fetchClip();
        }
    }, [code]);

    const fetchClip = async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/clip/${code}`);
            const resData = await res.json();

            if (!res.ok) {
                throw new Error(resData.message || "Clip not found or expired.");
            }

            if (resData.isPasswordProtected) {
                setNeedsPassword(true);
            } else {
                setData(resData);
            }
        } catch (err: any) {
            console.error(err);
            setError(err.message || "Clip not found or expired.");
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password) return;

        setVerifying(true);
        try {
            const res = await fetch(`/api/clip/${code}/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password }),
            });
            const resData = await res.json();

            if (!res.ok) {
                throw new Error(resData.message || "Incorrect password");
            }

            setData(resData);
            setNeedsPassword(false);
            toast.success("Access granted!");
        } catch (err: any) {
            console.error(err);
            toast.error(err.message || "Incorrect password");
        } finally {
            setVerifying(false);
        }
    };

    const copyText = () => {
        if (data?.text) {
            navigator.clipboard.writeText(data.text);
            toast.success("Text copied to clipboard!");
        }
    };

    const handleDownloadAll = () => {
        if (!data?.files) return;

        data.files.forEach((file: any, index: number) => {
            setTimeout(() => {
                const a = document.createElement("a");
                a.href = file.path;
                a.download = file.filename;
                a.target = "_blank";
                a.rel = "noopener noreferrer";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }, index * 250);
        });
        toast.success("Downloading all files...");
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
                <Card className="w-full max-w-md border-red-500/50 shadow-lg shadow-red-500/10">
                    <CardHeader className="text-center">
                        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-2" />
                        <CardTitle className="text-2xl text-red-500">Error</CardTitle>
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
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 py-12">
            <div className="absolute top-4 right-4 flex gap-4">
                <Button variant="outline" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
                    {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
            </div>

            <div className="absolute top-4 left-4">
                <Button variant="ghost" asChild>
                    <Link href="/"><ArrowLeft className="w-4 h-4 mr-2" /> Back</Link>
                </Button>
            </div>

            <div className="max-w-2xl w-full">
                <div className="text-center mb-8 animate-in fade-in slide-in-from-top-4">
                    <div className="flex items-center justify-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-primary text-primary-foreground flex items-center justify-center rounded-xl font-bold text-2xl shadow-sm shrink-0">
                            C
                        </div>
                        <h1 className="text-3xl font-extrabold tracking-tight">Clip Access</h1>
                    </div>
                    <p className="text-muted-foreground uppercase tracking-widest font-mono font-bold text-xl">{code}</p>
                </div>

                {needsPassword ? (
                    <Card className="border-border shadow-md animate-in fade-in zoom-in duration-300 rounded-none sm:rounded-md max-w-md mx-auto mt-12 overflow-hidden relative">
                        <div className="absolute top-0 left-0 w-full h-1 bg-primary"></div>
                        <CardHeader className="text-center pt-10 pb-6">
                            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4 border border-border">
                                <ShieldCheck className="w-8 h-8 text-primary" />
                            </div>
                            <CardTitle className="text-2xl font-bold tracking-tight">Protected Clip</CardTitle>
                            <CardDescription className="text-base mt-2">
                                This clip is secured. Please enter the password to view its contents.
                            </CardDescription>
                        </CardHeader>
                        <form onSubmit={handleVerifyPassword}>
                            <CardContent className="px-8 pb-4">
                                <div className="space-y-4">
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            id="password"
                                            type="password"
                                            placeholder="Enter password..."
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="pl-10 h-12 text-md border-border"
                                            required
                                        />
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="px-8 pb-10">
                                <Button type="submit" className="w-full h-12 text-md shadow-sm" disabled={verifying}>
                                    {verifying ? "Verifying Access..." : "Unlock Clip"}
                                </Button>
                            </CardFooter>
                        </form>
                    </Card>
                ) : data ? (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {data.isOneTimeView && (
                            <div className="bg-amber-500/10 border border-amber-500/30 text-amber-600 p-4 rounded-md flex items-start gap-3 shadow-sm">
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
                                            <Button variant="outline" size="sm" onClick={handleDownloadAll} className="h-8 shrink-0">
                                                <Download className="w-4 h-4 mr-2" /> Download All
                                            </Button>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-4">
                                    <div className="space-y-2">
                                        {data.files.map((file: any, index: number) => (
                                            <div key={index} className="flex items-center justify-between p-3 rounded-md border border-border bg-card hover:bg-muted/50 transition-colors">
                                                <div className="overflow-hidden">
                                                    <p className="font-medium truncate">{file.filename}</p>
                                                    <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                                </div>
                                                <Button variant="outline" size="sm" asChild className="shrink-0 ml-4">
                                                    <a href={file.path} download={file.filename} target="_blank" rel="noopener noreferrer">
                                                        <Download className="w-4 h-4 mr-2" /> Download
                                                    </a>
                                                </Button>
                                            </div>
                                        ))}
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
