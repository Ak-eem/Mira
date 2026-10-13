import { LoadingScreen, SkeletonHeading, SkeletonTable } from "@/components/Skeleton";

export default function OrdersLoading() {
  return (
    <LoadingScreen label="Loading orders">
      <SkeletonHeading />
      <SkeletonTable rows={7} />
    </LoadingScreen>
  );
}
