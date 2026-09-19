import { CostWorkspace } from "@/features/cost-engine/cost-workspace";

export default async function CostWorkspacePage({ params }: { params: Promise<{ sourceType: string; sourceId: string }> }) {
  const { sourceType, sourceId } = await params;
  return <CostWorkspace sourceType={sourceType} sourceId={sourceId} />;
}
