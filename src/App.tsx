import { createBrowserRouter, RouterProvider } from 'react-router';
import DocumentPage from './pages/DocumentPage';
import NotFoundPage from './pages/NotFoundPage';
import RouteError from './components/RouteError';
import { getDocument } from './utils/getDocument';

const router = createBrowserRouter([
  { path: '/', element: null },
  {
    path: '/:id',
    loader: ({ params }) => getDocument(params.id),
    element: <DocumentPage />,
    errorElement: <RouteError />,
  },
  { path: '*', element: <NotFoundPage /> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
