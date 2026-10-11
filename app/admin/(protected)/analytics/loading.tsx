import { LoadingScreen, SkeletonChart, SkeletonHeading, SkeletonStats } from "@/components/Skeleton";

export default function AnalyticsLoading() {
  return (
    <LoadingScreen label="Loading analytics">
      <SkeletonHeading />
      <SkeletonStats />
      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonChart />
        <SkeletonChart />
        <SkeletonChart />
      </div>
    </LoadingScreen>
  );
}
