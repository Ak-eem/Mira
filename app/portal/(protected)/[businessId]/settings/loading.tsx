import { LoadingScreen, SkeletonHeading, SkeletonPanel } from "@/components/Skeleton";

export default function SettingsLoading() {
  return (
    <LoadingScreen label="Loading settings">
      <SkeletonHeading />
      <SkeletonPanel lines={4} />
      <SkeletonPanel lines={5} />
    </LoadingScreen>
  );
}
