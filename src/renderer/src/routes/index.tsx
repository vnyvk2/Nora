import Preloader from '@renderer/components/Preloader/Preloader';
import { settingsQuery } from '@renderer/queries/settings';
import { createFileRoute, Navigate } from '@tanstack/react-router';

import { queryClient, router } from '..';

export const Route = createFileRoute('/')({
  component: RouteComponent,
  pendingComponent: () => <Preloader />,
  loader: async () => {
    console.log('[LOADER] / started');
    await Promise.all([
      queryClient.ensureQueryData(settingsQuery.all).then(() => console.log('[LOADER] settingsQuery.all resolved')),
      router.preloadRoute({ to: '/main-player/home' }).then(() => console.log('[LOADER] preloadRoute /main-player/home resolved'))
    ]);
    console.log('[LOADER] / finished');
  },
  // override pendingMs to 0 to show preloader immediately
  pendingMs: 0,
  // ensure preloader shows for at least 1000ms
  pendingMinMs: 1000
});

function RouteComponent() {
  return <Navigate to="/main-player/home" />;
}
