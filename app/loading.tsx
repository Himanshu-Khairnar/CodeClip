import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function HomeLoading() {
  return (
    <div className="flex-1 flex flex-col items-center justify-start sm:justify-center px-3 py-4 sm:p-4 pb-6 sm:pb-4">
      <div className="w-full max-w-lg lg:max-w-xl space-y-4">
        <Skeleton className="h-10 sm:h-11 w-full rounded-md" />
        <Card className="rounded-xl">
          <CardHeader className="pb-3">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Textarea match: h-40 */}
            <Skeleton className="h-40 w-full rounded-md" />
            {/* Dropzone match: h-40 */}
            <Skeleton className="h-40 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
