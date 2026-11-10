import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy } from "react";
import { RouterProvider, createBrowserRouter } from "react-router";

import { ApiError } from "./api/client";
import { Layout } from "./components/layout/Layout";

const OverviewPage = lazy(() => import("./pages/OverviewPage"));
const StatesIndexPage = lazy(() => import("./pages/StatesIndexPage"));
const StatePage = lazy(() => import("./pages/StatePage"));
const ComparePage = lazy(() => import("./pages/ComparePage"));
const MatopibaPage = lazy(() => import("./pages/MatopibaPage"));
const ExplorePage = lazy(() => import("./pages/ExplorePage"));
const AboutPage = lazy(() => import("./pages/AboutPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // The source is revised daily: ten minutes without refetching is plenty.
        staleTime: 10 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        // A wrong parameter will not fix itself; a sleeping server or a timeout may.
        retry: (count, error) => count < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      },
    },
  });
}

export const routes = [
  {
    element: <Layout />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: "estados", element: <StatesIndexPage /> },
      { path: "estados/:uf", element: <StatePage /> },
      { path: "comparar", element: <ComparePage /> },
      { path: "matopiba", element: <MatopibaPage /> },
      { path: "dados", element: <ExplorePage /> },
      { path: "sobre", element: <AboutPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

const router = createBrowserRouter(routes);
const queryClient = createQueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
