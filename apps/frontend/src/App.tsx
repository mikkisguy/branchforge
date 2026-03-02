import { Routes, Route } from "react-router-dom";
import { HomePageIDE } from "./pages/ide";
import { LoginPage } from "./pages/auth/login";
import { RegisterPage } from "./pages/auth/register";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider } from "./contexts/AuthContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ToastProvider } from "./contexts/ToastContext";
import { GitLabProvider } from "./contexts/GitLabContext";
import { ProjectProvider } from "./contexts/ProjectContext";
import { BASE_URL } from "./lib/constants";

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ProjectProvider>
          <ToastProvider>
            <SettingsProvider>
              <GitLabProvider>
                <div className="app">
                <Routes>
                  <Route path={`${BASE_URL}login`} element={<LoginPage />} />
                  <Route path={`${BASE_URL}register`} element={<RegisterPage />} />
                  <Route
                    path={BASE_URL}
                    element={
                      <ProtectedRoute>
                        <HomePageIDE />
                      </ProtectedRoute>
                    }
                  />
                </Routes>
              </div>
            </GitLabProvider>
          </SettingsProvider>
        </ToastProvider>
      </ProjectProvider>
    </AuthProvider>
  </ThemeProvider>
);
}

export default App;

