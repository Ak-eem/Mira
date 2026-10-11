import { LoadingScreen, SkeletonHeading, SkeletonPanel } from "@/components/Skeleton";

export default function TeamLoading() {
  return (
    <LoadingScreen label="Loading team">
      <SkeletonHeading />
      <SkeletonPanel lines={4} />
      <SkeletonPanel lines={5} />
    </LoadingScreen>
  );
}
