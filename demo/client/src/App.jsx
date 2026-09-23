import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { FloodDataProvider } from "./FloodDataContext";
import { AuthProvider } from "./AuthContext";
import RequireAuth from "./RequireAuth";
import Login from "./pages/Login";
import Layout from "./Layout";
import Overview from "./pages/Overview";
import LiveMap from "./pages/LiveMap";
import SensorGrid from "./pages/SensorGrid";
import ZoneDetail from "./pages/ZoneDetail";
import Incidents from "./pages/Incidents";
import CitizenReports from "./pages/CitizenReports";
import Broadcasts from "./pages/Broadcasts";
import Shelters from "./pages/Shelters";
import Analytics from "./pages/Analytics";
import Architecture from "./pages/Architecture";
import Settings from "./pages/Settings";
import Citizen from "./pages/Citizen";
import "./App.css";

export default function App() {
  return (
    <AuthProvider>
      <FloodDataProvider>
        <BrowserRouter>
          <Routes>
            <Route path="login" element={<Login />} />
            <Route path="citizen" element={<Citizen />} />
            <Route element={<RequireAuth><Layout /></RequireAuth>}>
              <Route index element={<Overview />} />
              <Route path="map" element={<LiveMap />} />
              <Route path="sensors" element={<SensorGrid />} />
              <Route path="sensors/:id" element={<ZoneDetail />} />
              <Route path="incidents" element={<Incidents />} />
              <Route path="alerts" element={<Navigate to="/incidents" replace />} />
              <Route path="reports" element={<CitizenReports />} />
              <Route path="broadcasts" element={<Broadcasts />} />
              <Route path="shelters" element={<Shelters />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="architecture" element={<Architecture />} />
              <Route path="settings" element={<RequireAuth roles={["admin"]}><Settings /></RequireAuth>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </FloodDataProvider>
    </AuthProvider>
  );
}
