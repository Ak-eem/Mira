import { LoadingScreen, SkeletonHeading, SkeletonPanel } from "@/components/Skeleton";

export default function NudgesLoading() {
  return (
    <LoadingScreen label="Loading nudges">
      <SkeletonHeading />
      <SkeletonPanel lines={4} />
      <SkeletonPanel lines={5} />
    </LoadingScreen>
  );
}
