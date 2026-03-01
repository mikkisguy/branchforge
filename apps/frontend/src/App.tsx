import { Routes, Route } from "react-router-dom";
import { HomePageIDE } from "./pages/ide";
import { LoginPage } from "./pages/auth/login";
import { RegisterPage } from "./pages/auth/register";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider } from "./contexts/AuthContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { BASE_URL } from "./lib/constants";

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SettingsProvider>
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
      </SettingsProvider>
    </AuthProvider>
  </ThemeProvider>
);
}

export default App;

