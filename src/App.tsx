import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/use-auth";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import AssetSearch from "@/pages/AssetSearch";
import Dashboard from "@/pages/Dashboard";
import WhaleWatch from "@/pages/WhaleWatch";
import PaperTrades from "@/pages/PaperTrades";
import NewsIntelligence from "@/pages/NewsIntelligence";
import MetaCognition from "@/pages/MetaCognition";
import GlobalPatternLibrary from "@/pages/GlobalPatternLibrary";
import StrategyLab from "@/pages/StrategyLab";
import Login from "@/pages/Login";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Routes>
                      <Route path="/" element={<AssetSearch />} />
                      <Route path="/dashboard" element={<Dashboard />} />
                      <Route path="/whale-watch" element={<WhaleWatch />} />
                      <Route path="/paper-trades" element={<PaperTrades />} />
                      <Route path="/news" element={<NewsIntelligence />} />
                      <Route path="/meta" element={<MetaCognition />} />
                      <Route path="/gpr" element={<GlobalPatternLibrary />} />
                      <Route path="/strategy-lab" element={<StrategyLab />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </AppLayout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
