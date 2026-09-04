import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function ClipLoading() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-3 py-6 sm:p-4 sm:py-10">
      <div className="w-full max-w-3xl lg:max-w-4xl space-y-4 sm:space-y-6">
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="h-8 w-40 rounded-md" />
        </div>
        {/* Text content match: min-h-[100px] card */}
        <Card className="rounded-xl overflow-hidden">
          <CardHeader className="pb-3 border-b">
            <Skeleton className="h-6 w-36" />
          </CardHeader>
          <CardContent className="pt-4">
            <Skeleton className="h-40 w-full rounded-md" />
          </CardContent>
        </Card>
        {/* File rows match: icon 10x10 + two text lines + action buttons */}
        <Card className="rounded-xl overflow-hidden">
          <CardHeader className="pb-3 border-b">
            <Skeleton className="h-6 w-44" />
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="rounded-lg border border-border p-3 sm:p-3.5 flex items-center gap-3"
              >
                <Skeleton className="w-10 h-10 sm:w-11 sm:h-11 rounded-md shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-8 w-24 rounded-md shrink-0" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
