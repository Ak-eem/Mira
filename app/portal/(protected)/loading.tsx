import { LoadingScreen, SkeletonHeading, SkeletonPanel } from "@/components/Skeleton";

export default function PortalLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
    <LoadingScreen label="Loading">
      <SkeletonHeading />
      <SkeletonPanel lines={4} />
    </LoadingScreen>
    </div>
  );
}
