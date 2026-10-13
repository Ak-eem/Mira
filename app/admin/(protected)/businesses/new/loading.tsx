import { LoadingScreen, SkeletonHeading, SkeletonPanel } from "@/components/Skeleton";

export default function NewBusinessLoading() {
  return (
    <LoadingScreen label="Loading form">
      <SkeletonHeading subtitle={false} />
      <SkeletonPanel lines={6} />
    </LoadingScreen>
  );
}
