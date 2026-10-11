import { LoadingScreen, SkeletonHeading, SkeletonTable } from "@/components/Skeleton";

export default function Loading() {
  return (
    <LoadingScreen label="Loading activity">
      <SkeletonHeading />
      <SkeletonTable />
    </LoadingScreen>
  );
}
