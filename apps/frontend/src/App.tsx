import { Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import { BASE_URL } from "./lib/constants";

function App() {
  return (
    <div className="app">
      <Routes>
        <Route path={BASE_URL} element={<HomePage />} />
      </Routes>
    </div>
  );
}

export default App;

