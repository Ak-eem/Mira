import { LoadingScreen, SkeletonHeading, SkeletonTable } from "@/components/Skeleton";

export default function Loading() {
  return (
    <LoadingScreen label="Loading queue">
      <SkeletonHeading />
      <SkeletonTable />
    </LoadingScreen>
  );
}
