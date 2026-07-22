import ContextMenu from '@renderer/components/ContextMenu/ContextMenu';
import MiniPlayer from '@renderer/components/MiniPlayer/MiniPlayer';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/mini-player/')({
  component: RouteComponent
});

function RouteComponent() {
  return (
    <>
      <MiniPlayer />
      <ContextMenu />
    </>
  );
}
