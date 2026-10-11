import { LoadingScreen, SkeletonHeading, SkeletonPanel, SkeletonStats } from "@/components/Skeleton";

// Any page inside a single business (overview, products, FAQs, ...). The business sidebar comes from the layout.
export default function BusinessLoading() {
  return (
    <LoadingScreen label="Loading business">
      <SkeletonHeading />
      <SkeletonStats />
      <SkeletonPanel lines={5} />
    </LoadingScreen>
  );
}
