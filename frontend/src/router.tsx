import {
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { Home } from './routes/home';
import { Layout } from './routes/layout';

const rootRoute = createRootRoute({ component: Layout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Home,
});

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
