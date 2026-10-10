import { isRouteErrorResponse, useRouteError } from 'react-router';
import NotFoundPage from '../pages/NotFoundPage';

export default function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />;
  }

  throw error;
}
