import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <main className="ui-lib" aria-busy="true" aria-label="Loading your library">
      <div className="ui-lib-new"><Skeleton w="40%" h={32} /><Skeleton h={112} /></div>
      <div className="ui-lib-grid">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={200} />)}</div>
    </main>
  );
}
