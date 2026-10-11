import { LoadingScreen, SkeletonChart, SkeletonHeading, SkeletonPanel, SkeletonStats } from "@/components/Skeleton";

export default function PortalBusinessLoading() {
  return (
    <LoadingScreen label="Loading your dashboard">
      <SkeletonHeading />
      <SkeletonStats />
      <SkeletonChart />
      <SkeletonPanel lines={4} />
    </LoadingScreen>
  );
}
