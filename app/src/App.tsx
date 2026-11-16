import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom';
import { KitchenSink } from '@features/dev/KitchenSink';
import { MediaProbe } from '@features/dev/MediaProbe';
import { NotFound } from '@features/NotFound';
import { PlaceholderScreen } from '@features/PlaceholderScreen';
import { destinations, settingsDestination } from '@features/routes';
import { Shell } from '@features/Shell';
import { ToastProvider } from '@ui/index';
import { UpdatePrompt } from './pwa/UpdatePrompt';

// Hash routing: deep links work on static hosting (GitHub Pages) and offline with no server rules.
const router = createHashRouter([
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Navigate to="/today" replace /> },
      ...[...destinations, settingsDestination].map((destination) => ({
        path: destination.path.slice(1),
        element: <PlaceholderScreen destination={destination} />,
      })),
      { path: 'dev/kitchen-sink', element: <KitchenSink /> },
      { path: 'dev/media-probe', element: <MediaProbe /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export function App() {
  return (
    <ToastProvider>
      <UpdatePrompt />
      <RouterProvider router={router} />
    </ToastProvider>
  );
}
