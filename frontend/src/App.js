import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { CurrencyProvider } from "@/lib/currency";
import { Toaster } from "@/components/ui/sonner";
import Login from "@/pages/Login";
import AppShell from "@/pages/AppShell";
import Home from "@/pages/Home";
import Dashboard from "@/pages/Dashboard";
import Customers from "@/pages/Customers";
import Pipeline from "@/pages/Pipeline";
import Segments from "@/pages/Segments";
import Automations from "@/pages/Automations";
import Reminders from "@/pages/Reminders";
import Campaigns from "@/pages/Campaigns";
import Tasks from "@/pages/Tasks";
import Users from "@/pages/Users";
import Documents from "@/pages/Documents";
import { ForgotPassword, ResetPassword } from "@/pages/PasswordReset";
import Signup from "@/pages/Signup";
import Connectors from "@/pages/Connectors";
import Settings from "@/pages/Settings";

function Protected({ children }) {
  const { user } = useAuth();
  if (user === null)
    return (
      <div className="min-h-screen flex items-center justify-center text-white/50 font-mono text-sm">
        loading…
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <AuthProvider>
      <CurrencyProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route
              path="/"
              element={
                <Protected>
                  <AppShell />
                </Protected>
              }
            >
              <Route index element={<Home />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="customers" element={<Customers />} />
              <Route path="pipeline" element={<Pipeline />} />
              <Route path="segments" element={<Segments />} />
              <Route path="automations" element={<Automations />} />
              <Route path="reminders" element={<Reminders />} />
              <Route path="campaigns" element={<Campaigns />} />
              <Route path="tasks" element={<Tasks />} />
              <Route path="documents" element={<Documents />} />
              <Route path="users" element={<Users />} />
              <Route path="connectors" element={<Connectors />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </CurrencyProvider>
      <Toaster theme="dark" position="top-right" richColors />
    </AuthProvider>
  );
}

export default App;
