import "@/App.css";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { ChatAssistant } from "@/components/ChatAssistant";
import { TopNav } from "@/components/TopNav";
import { BuildCalcProvider } from "@/context/BuildCalcContext";
import AboutPage from "@/pages/AboutPage";
import DrawingAnalyzerPage from "@/pages/DrawingAnalyzerPage";
import EstimatePage from "@/pages/EstimatePage";
import HomePage from "@/pages/HomePage";
import LocalMarketRatesPage from "@/pages/LocalMarketRatesPage";
import MaterialsPage from "@/pages/MaterialsPage";
import ReportsPage from "@/pages/ReportsPage";
import SchedulePage from "@/pages/SchedulePage";
import SuppliersPage from "@/pages/SuppliersPage";

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
              <Route path="/drawing-analyzer" element={<DrawingAnalyzerPage />} />
              <Route path="/boq" element={<MaterialsPage />} />
              <Route path="/local-market-rates" element={<LocalMarketRatesPage />} />
              <Route path="/suppliers" element={<SuppliersPage />} />
              <Route path="/reports" element={<ReportsPage />} />
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
