import { Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import { BASE_URL } from "./lib/constants";
import { ThemeProvider } from "./contexts/ThemeContext";

function App() {
  return (
    <ThemeProvider>
      <div className="app">
        <Routes>
          <Route path={BASE_URL} element={<HomePage />} />
        </Routes>
      </div>
    </ThemeProvider>
  );
}

export default App;

