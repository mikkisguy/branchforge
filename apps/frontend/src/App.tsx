import { Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import HomePageVN from "./pages/HomePage.vn";
import HomePageIDE from "./pages/HomePage.ide";
import HomePageAsymmetric from "./pages/HomePage.asymmetric";
import HomePageStorybookIDE from "./pages/HomePage.storybook-ide";
import HomePageAll from "./pages/HomePage.all";
import { BASE_URL } from "./lib/constants";
import { ThemeProvider } from "./contexts/ThemeContext";

function App() {
  return (
    <ThemeProvider>
      <div className="app">
        <Routes>
          <Route path={BASE_URL} element={<HomePageAll />} />
          <Route path={`${BASE_URL}original`} element={<HomePage />} />
          <Route path={`${BASE_URL}vn`} element={<HomePageVN />} />
          <Route path={`${BASE_URL}ide`} element={<HomePageIDE />} />
          <Route path={`${BASE_URL}asymmetric`} element={<HomePageAsymmetric />} />
          <Route path={`${BASE_URL}storybook-ide`} element={<HomePageStorybookIDE />} />
        </Routes>
      </div>
    </ThemeProvider>
  );
}

export default App;

