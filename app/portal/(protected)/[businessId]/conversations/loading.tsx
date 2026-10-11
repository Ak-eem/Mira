import { LoadingScreen, SkeletonHeading, SkeletonTable } from "@/components/Skeleton";

export default function ConversationsLoading() {
  return (
    <LoadingScreen label="Loading conversations">
      <SkeletonHeading />
      <SkeletonTable rows={7} />
    </LoadingScreen>
  );
}
