import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div className="ui-ws" role="status" aria-busy="true" aria-label="Opening">
      <header className="ui-ws-top"><Skeleton w={160} h={20} /></header>
      <div className="ui-ws-main">
        <div className="ui-ws-chat" style={{ padding: 16 }}><div className="ui-stack"><Skeleton w="70%" /><Skeleton w="50%" /></div></div>
        <main className="ui-ws-doc"><div className="ui-paper ui-ws-paper"><div className="ui-stack"><Skeleton w="60%" h={36} /><Skeleton /><Skeleton w="92%" /><Skeleton w="78%" /></div></div></main>
      </div>
    </div>
  );
}
