"use client";

import { useState, useRef, DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { UploadCloud, CheckCircle2, Copy, ExternalLink, Moon, Sun, Github, Clock } from "lucide-react";
import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Home() {
  const [text, setText] = useState("");
  const [password, setPassword] = useState("");
  const [isOneTimeView, setIsOneTimeView] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const [code, setCode] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");

  const [timeLeft, setTimeLeft] = useState(120);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { theme, setTheme } = useTheme();

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

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
    }
  };

  const handleFiles = (newFiles: File[]) => {
    const currentTotalSize = files.reduce((sum, f) => sum + f.size, 0);
    const newTotalSize = newFiles.reduce((sum, f) => sum + f.size, 0);

    if (currentTotalSize + newTotalSize > 20 * 1024 * 1024) {
      toast.error("Total file size cannot exceed 20MB");
      return;
    }
    setFiles((prev) => [...prev, ...newFiles]);
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (!text.trim() && files.length === 0) {
      toast.error("Please add some text or files to upload.");
      return;
    }

    setUploading(true);
    setProgress(0);

    const formData = new FormData();
    formData.append("text", text);
    if (password) formData.append("password", password);
    formData.append("isOneTimeView", String(isOneTimeView));

    for (const file of files) {
      formData.append("files", file);
    }

    try {
      const progressInterval = setInterval(() => {
        setProgress((prev) => (prev >= 90 ? 90 : prev + 10));
      }, 500);

      const res = await fetch("/api/clip/create", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (!res.ok) {
        const text = await res.text();
        let message = "Something went wrong during upload.";
        try {
          const json = JSON.parse(text);
          message = json.message || message;
        } catch {
          if (text.toLowerCase().includes("too large") || text.toLowerCase().includes("entity")) {
            message = "File too large. Vercel limits uploads to 4.5MB on the free plan.";
          }
        }
        throw new Error(message);
      }

      const data = await res.json();

      const generatedCode = data.code;
      setCode(generatedCode);
      setTimeLeft(120);

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handleCloseClip();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      const clipUrl = `${window.location.origin}/clip/${generatedCode}`;
      const qrDataUrl = await QRCode.toDataURL(clipUrl, { width: 250, margin: 2 });
      setQrCodeUrl(qrDataUrl);

      toast.success("Clipboard created successfully!");
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Something went wrong during upload.");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const copyToClipboard = (textToCopy: string) => {
    navigator.clipboard.writeText(textToCopy);
    toast.success("Copied to clipboard!");
  };

  const handleCloseClip = async () => {
    if (!code) return;
    try {
      await fetch(`/api/clip/${code}`, { method: 'DELETE' });
      toast.info("Clip has been closed and deleted.");
    } catch (e) {
      console.error(e);
    } finally {
      setCode("");
      setFiles([]);
      setText("");
      setPassword("");
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
     

      <div className="max-w-xl w-full">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="w-12 h-12 bg-primary text-primary-foreground flex items-center justify-center rounded-xl font-bold text-3xl shadow-sm shrink-0">
              C
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-primary">CodeClip</h1>
          </div>
          <p className="text-muted-foreground text-lg">Share text and files securely in seconds.</p>
        </div>

        <Tabs defaultValue="create" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="create">Create Clip</TabsTrigger>
            <TabsTrigger value="access">Access Clip</TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="mt-0">
            {code ? (
              <Card className="border-border shadow-md animate-in fade-in zoom-in duration-300 rounded-none sm:rounded-xl overflow-hidden">

                {/* Success header */}
                <div className="flex flex-col items-center gap-3  py-6 px-6 text-center border-b border-border bg-muted/20">
                  <div className="w-14 h-14 bg-green-500/10 rounded-full flex items-center justify-center border border-green-500/20">
                    <CheckCircle2 className="w-8 h-8 text-green-500" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold tracking-tight">Clip Created!</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">Share the code or scan the QR</p>
                  </div>
                </div>

                <CardContent className="p-6 space-y-4">
                  {/* Access code */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Access Code</Label>
                    <div className="flex items-center gap-2 bg-muted rounded-lg border border-border px-4 py-3">
                      <span className="flex-1 text-3xl font-mono tracking-[0.3em] font-bold text-center">{code}</span>
                      <Button variant="ghost" size="icon" onClick={() => copyToClipboard(code)} className="h-9 w-9 shrink-0">
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Direct link */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Direct Link</Label>
                    <div className="flex items-center gap-2 bg-muted rounded-lg border border-border px-3 py-2">
                      <span className="flex-1 text-xs text-muted-foreground truncate font-mono">
                        {`${typeof window !== "undefined" ? window.location.origin : ""}/clip/${code}`}
                      </span>
                      <Button variant="ghost" size="icon" onClick={() => copyToClipboard(`${window.location.origin}/clip/${code}`)} className="h-8 w-8 shrink-0">
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* QR + timer side by side */}
                  <div className="flex gap-4 items-stretch pt-1">
                    {qrCodeUrl && (
                      <div className="p-3 bg-white rounded-lg border border-border shadow-sm shrink-0">
                        <img src={qrCodeUrl} alt="QR Code" className="w-32 h-32" />
                      </div>
                    )}
                    <div className="flex flex-col flex-1 gap-3 justify-between">
                      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-center gap-3">
                        <Clock className="w-4 h-4 text-destructive shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-destructive">Auto-deletes in</p>
                          <p className="text-2xl font-mono font-bold text-destructive leading-tight">
                            {Math.floor(timeLeft / 60).toString().padStart(2, "0")}:{(timeLeft % 60).toString().padStart(2, "0")}
                          </p>
                        </div>
                      </div>
                      <Button className="w-full" onClick={() => router.push(`/clip/${code}`)}>
                        <ExternalLink className="w-4 h-4 mr-2" /> View Clip
                      </Button>
                    </div>
                  </div>
                </CardContent>

                <CardFooter className="border-t bg-muted/20 px-6 py-4 flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => { setCode(""); setFiles([]); setText(""); setPassword(""); if (timerRef.current) clearInterval(timerRef.current); }}>
                    New Clip
                  </Button>
                  <Button variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleCloseClip}>
                    Delete
                  </Button>
                </CardFooter>
              </Card>
            ) : (
              <Card className="border-border shadow-sm duration-300 animate-in fade-in slide-in-from-bottom-4 rounded-none sm:rounded-md">
                <CardHeader>
                  <CardTitle>Create New Clipboard</CardTitle>
                  <CardDescription>Upload text or files (up to 4.5MB total).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="text">Text Content</Label>
                    <Textarea
                      id="text"
                      placeholder="Paste your text here..."
                      className="min-h-[120px] resize-y"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Files</Label>
                    <div
                      className={`border border-dashed rounded-md p-8 text-center transition-colors cursor-pointer flex flex-col items-center justify-center gap-2 ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/40 hover:border-primary/60"}`}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <UploadCloud className="w-10 h-10 text-muted-foreground" />
                      <p className="font-medium">Click or drag files here</p>
                      <p className="text-sm text-muted-foreground">Any file type up to 20MB</p>
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                      />
                    </div>

                    {files.length > 0 && (
                      <div className="space-y-2 mt-4">
                        <Label className="text-xs text-muted-foreground">Selected Files ({files.length})</Label>
                        <div className="space-y-2 max-h-32 overflow-y-auto">
                          {files.map((file, i) => (
                            <div key={i} className="flex items-center justify-between bg-muted/50 p-2 rounded-md text-sm border border-border">
                              <span className="truncate max-w-[80%]">{file.name}</span>
                              <span className="text-xs text-muted-foreground mr-2">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                              <button onClick={(e) => { e.stopPropagation(); removeFile(i); }} className="text-red-500 hover:text-red-700">✕</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/30 p-4 border border-border rounded-md">
                    <div className="space-y-2">
                      <Label htmlFor="password">Password Protect (Optional)</Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder="Enter password..."
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center space-x-2 pt-8">
                      <input
                        type="checkbox"
                        id="oneTime"
                        className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                        checked={isOneTimeView}
                        onChange={(e) => setIsOneTimeView(e.target.checked)}
                      />
                      <Label htmlFor="oneTime" className="cursor-pointer">Auto-delete after first view</Label>
                    </div>
                  </div>

                  {uploading && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Uploading...</span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                  )}
                </CardContent>
                <CardFooter>
                  <Button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="w-full h-10 text-sm font-medium rounded-md shadow-sm"
                  >
                    {uploading ? "Creating Clipboard..." : "Create Clipboard"}
                  </Button>
                </CardFooter>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="access" className="mt-0">
            <Card className="border-border shadow-sm duration-300 animate-in fade-in rounded-none sm:rounded-md">
              <CardHeader>
                <CardTitle>Open Clipboard</CardTitle>
                <CardDescription>Enter the 6-digit code to access shared content.</CardDescription>
              </CardHeader>
              <form onSubmit={handleAccess}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">Access Code</Label>
                    <div className="relative">
                      <Input
                        id="code"
                        placeholder="A1B2C3"
                        className="text-center text-2xl tracking-[0.5em] uppercase font-mono rounded-md border-border h-16 shadow-inner"
                        maxLength={6}
                        value={accessCode}
                        onChange={(e) => setAccessCode(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button type="submit" className="w-full h-10 rounded-md shadow-sm mt-6" disabled={!accessCode.trim()}>
                    Access Now
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
