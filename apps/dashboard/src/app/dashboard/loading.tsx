"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const barHeights = [45, 30, 55, 40, 60, 35];

export default function DashboardLoading() {
  return (
    <div className="flex-1 space-y-6 p-6 lg:p-8 animate-in fade-in duration-300">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-4 w-32 rounded-md" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-64 rounded-xl" />
          <Skeleton className="h-9 w-24 rounded-xl" />
        </div>
      </div>

      {/* Stats cards skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="border overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <Skeleton className="h-4 w-24 rounded-md" />
                <Skeleton className="h-8 w-8 rounded-xl" />
              </div>
              <Skeleton className="h-8 w-32 rounded-lg mb-2" />
              <Skeleton className="h-3 w-20 rounded-md" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart area skeleton */}
      <div className="grid gap-6 lg:grid-cols-7">
        <Card className="lg:col-span-4 border">
          <CardContent className="p-6">
            <Skeleton className="h-5 w-40 rounded-md mb-6" />
            <div className="flex items-end gap-1 h-44">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center gap-1"
                >
                  <Skeleton
                    className="w-[10px] rounded-t"
                    style={{
                      height: `${barHeights[(i - 1) % barHeights.length]}%`,
                    }}
                  />
                  <Skeleton className="h-3 w-8 rounded" />
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-1">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-6 w-full rounded-lg" />
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-3 space-y-6">
          <Card className="border">
            <CardContent className="p-6">
              <Skeleton className="h-5 w-36 rounded-md mb-4" />
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex justify-between">
                      <Skeleton className="h-4 w-24 rounded-md" />
                      <Skeleton className="h-4 w-16 rounded-md" />
                    </div>
                    <Skeleton className="h-2.5 w-full rounded-full" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border">
            <CardContent className="p-6">
              <Skeleton className="h-5 w-32 rounded-md mb-4" />
              <Skeleton className="h-4 w-48 rounded-md mb-3" />
              <div className="grid grid-cols-2 gap-2">
                <Skeleton className="h-14 rounded-lg" />
                <Skeleton className="h-14 rounded-lg" />
                <Skeleton className="h-14 rounded-lg col-span-2" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent transactions skeleton */}
      <Card className="border">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <Skeleton className="h-5 w-40 rounded-md" />
            <Skeleton className="h-4 w-20 rounded-md" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-32 rounded-md" />
                  <Skeleton className="h-3 w-24 rounded-md" />
                </div>
                <div className="text-right space-y-1.5">
                  <Skeleton className="h-4 w-20 rounded-md" />
                  <Skeleton className="h-3 w-12 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
