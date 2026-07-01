import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ToastProvider } from "./contexts/ToastContext";
import { BASE_URL } from "./lib/constants";

const HomePageIDE = lazy(() =>
  import("./pages/ide").then((m) => ({ default: m.HomePageIDE }))
);
const LoginPage = lazy(() =>
  import("./pages/auth/login").then((m) => ({ default: m.LoginPage }))
);
const RegisterPage = lazy(() =>
  import("./pages/auth/register").then((m) => ({ default: m.RegisterPage }))
);
function App() {
  return (
    <ToastProvider>
      <ThemeProvider>
        <div className="app">
          <ErrorBoundary
            onError={(error) => {
              // Log errors for monitoring/debugging
              console.error("App error:", error);
            }}
          >
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-screen text-muted-foreground">
                  Loading…
                </div>
              }
            >
              <Routes>
                <Route path={`${BASE_URL}login`} element={<LoginPage />} />
                <Route
                  path={`${BASE_URL}register`}
                  element={<RegisterPage />}
                />
                <Route
                  path={BASE_URL}
                  element={
                    <ProtectedRoute>
                      <HomePageIDE />
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </div>
      </ThemeProvider>
    </ToastProvider>
  );
}

export default App;
