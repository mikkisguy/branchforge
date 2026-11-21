import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { RootRouteError } from "./components/RootRouteError";
import { queryClient } from "./lib/query-client";
import "./index.css";

const router = createBrowserRouter([
  { path: "*", element: <App />, errorElement: <RootRouteError /> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
);
