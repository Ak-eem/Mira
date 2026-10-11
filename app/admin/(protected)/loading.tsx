import { LoadingScreen, SkeletonHeading, SkeletonPanel, SkeletonStats } from "@/components/Skeleton";

// Shown while any admin page without its own loading.tsx is fetching (dashboard, settings, ...).
export default function AdminLoading() {
  return (
    <LoadingScreen label="Loading dashboard">
      <SkeletonHeading />
      <SkeletonStats />
      <SkeletonPanel lines={3} />
      <SkeletonPanel lines={5} />
    </LoadingScreen>
  );
}
