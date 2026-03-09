import "@/App.css";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { ChatAssistant } from "@/components/ChatAssistant";
import { TopNav } from "@/components/TopNav";
import { BuildCalcProvider } from "@/context/BuildCalcContext";
import AboutPage from "@/pages/AboutPage";
import EstimatePage from "@/pages/EstimatePage";
import HomePage from "@/pages/HomePage";
import MaterialsPage from "@/pages/MaterialsPage";
import SchedulePage from "@/pages/SchedulePage";

function App() {
  return (
    <BuildCalcProvider>
      <BrowserRouter>
        <div className="app-shell" data-testid="app-shell">
          <TopNav />
          <main className="app-main" data-testid="app-main-content">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/estimate" element={<EstimatePage />} />
              <Route path="/materials" element={<MaterialsPage />} />
              <Route path="/schedule" element={<SchedulePage />} />
              <Route path="/about" element={<AboutPage />} />
            </Routes>
          </main>
          <ChatAssistant />
        </div>
        <Toaster richColors position="top-right" />
      </BrowserRouter>
    </BuildCalcProvider>
  );
}

export default App;
