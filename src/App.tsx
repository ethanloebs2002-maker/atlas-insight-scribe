import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import AssetSearch from "@/pages/AssetSearch";
import Dashboard from "@/pages/Dashboard";
import WhaleWatch from "@/pages/WhaleWatch";
import PaperTrades from "@/pages/PaperTrades";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/" element={<AssetSearch />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/whale-watch" element={<WhaleWatch />} />
            <Route path="/paper-trades" element={<PaperTrades />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppLayout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
