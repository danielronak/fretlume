import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom';
import { Diagrams } from '@features/dev/Diagrams';
import { KitchenSink } from '@features/dev/KitchenSink';
import { MediaProbe } from '@features/dev/MediaProbe';
import { NotFound } from '@features/NotFound';
import { PlaceholderScreen } from '@features/PlaceholderScreen';
import { destinations } from '@features/routes';
import { Shell } from '@features/Shell';
import { Settings } from '@features/settings/Settings';
import { LibraryScreen, SavedScreen } from '@features/library/LibraryScreen';
import { Welcome } from '@features/welcome/Welcome';
import { ToastProvider } from '@ui/index';
import { useTheme } from '@ui/useTheme';
import { UpdatePrompt } from './pwa/UpdatePrompt';

// Hash routing: deep links work on static hosting (GitHub Pages) and offline with no server rules.
const router = createHashRouter([
  { path: '/welcome', element: <Welcome /> },
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Navigate to="/today" replace /> },
      { path: 'settings', element: <Settings /> },
      { path: 'library', element: <Navigate to="/library/chord/C/maj" replace /> },
      { path: 'library/saved', element: <SavedScreen /> },
      { path: 'library/:kind/:root/:type', element: <LibraryScreen /> },
      ...destinations
        .filter((destination) => destination.path !== '/library')
        .map((destination) => ({
          path: destination.path.slice(1),
          element: <PlaceholderScreen destination={destination} />,
        })),
      { path: 'dev/diagrams', element: <Diagrams /> },
      { path: 'dev/kitchen-sink', element: <KitchenSink /> },
      { path: 'dev/media-probe', element: <MediaProbe /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export function App() {
  useTheme(); // keeps <html data-theme> in step with the settings on every route
  return (
    <ToastProvider>
      <UpdatePrompt />
      <RouterProvider router={router} />
    </ToastProvider>
  );
}
