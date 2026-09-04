import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";

export default function ClipNotFound() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md border-destructive/50">
        <CardHeader className="text-center">
          <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-2" />
          <CardTitle className="text-2xl text-destructive">Clip not found</CardTitle>
          <CardDescription>
            This clip doesn&apos;t exist, has expired, or was viewed already (one-time clips
            disappear after the first view).
          </CardDescription>
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
