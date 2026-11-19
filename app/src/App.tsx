import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom';
import { Diagrams } from '@features/dev/Diagrams';
import { KitchenSink } from '@features/dev/KitchenSink';
import { MediaProbe } from '@features/dev/MediaProbe';
import { NotFound } from '@features/NotFound';
import { PlaceholderScreen } from '@features/PlaceholderScreen';
import { destinations } from '@features/routes';
import { Shell } from '@features/Shell';
import { Settings } from '@features/settings/Settings';
import { LibraryScreen, RunsScreen, SavedScreen } from '@features/library/LibraryScreen';
import { RunBuilder } from '@features/runs/RunBuilder';
import { Playground } from '@features/playground/Playground';
import { TabsList } from '@features/tabs/TabsList';
import { TabEditor } from '@features/tabs/TabEditor';
import { HelpGuide, HelpIndex } from '@features/help/Help';
import { Tools } from '@features/tools/Tools';
import { Tuner } from '@features/tools/Tuner';
import { MetronomeScreen } from '@features/tools/MetronomeScreen';
import { Welcome } from '@features/welcome/Welcome';
import { StageScreen } from '@features/stage/StageScreen';
import { FieldTest } from '@features/fieldtest/FieldTest';
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
      { path: 'settings/field-test', element: <FieldTest /> },
      { path: 'library', element: <Navigate to="/library/chord/C/maj" replace /> },
      { path: 'library/saved', element: <SavedScreen /> },
      { path: 'library/runs', element: <RunsScreen /> },
      { path: 'library/runs/:runId', element: <RunBuilder /> },
      { path: 'help', element: <HelpIndex /> },
      { path: 'help/:guide', element: <HelpGuide /> },
      { path: 'tools', element: <Tools /> },
      { path: 'tools/tuner', element: <Tuner /> },
      { path: 'tools/metronome', element: <MetronomeScreen /> },
      { path: 'library/:kind/:root/:type', element: <LibraryScreen /> },
      { path: 'stage', element: <StageScreen /> },
      { path: 'stage/:kind/:root/:type', element: <StageScreen /> },
      { path: 'stage/run/:runId', element: <StageScreen /> },
      { path: 'stage/playground', element: <StageScreen source="playground" /> },
      { path: 'stage/tab/:tabId', element: <StageScreen /> },
      { path: 'playground', element: <Playground /> },
      { path: 'tabs', element: <TabsList /> },
      { path: 'tabs/:tabId', element: <TabEditor /> },
      ...destinations
        .filter(
          (destination) => !['/library', '/tools', '/stage', '/tabs'].includes(destination.path),
        )
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
