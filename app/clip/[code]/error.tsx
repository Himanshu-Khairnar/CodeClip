"use client";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";

export default function ClipError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md border-destructive/50">
        <CardHeader className="text-center">
          <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-2" />
          <CardTitle className="text-2xl text-destructive">Couldn&apos;t load this clip</CardTitle>
          <CardDescription>
            The clip may have expired or been deleted. You can retry or go back home.
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex justify-center gap-2">
          <Button onClick={() => reset()}>Try again</Button>
          <Button variant="outline" asChild>
            <Link href="/">Back to Home</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
