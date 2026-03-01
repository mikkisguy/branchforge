import { Routes, Route } from "react-router-dom";
import { HomePageStorybookIDE } from "./pages/home/storybook-ide";
import { BASE_URL } from "./lib/constants";
import { ThemeProvider } from "./contexts/ThemeContext";

function App() {
  return (
    <ThemeProvider>
      <div className="app">
        <Routes>
          <Route path={BASE_URL} element={<HomePageStorybookIDE />} />
        </Routes>
      </div>
    </ThemeProvider>
  );
}

export default App;

