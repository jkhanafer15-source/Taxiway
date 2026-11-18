
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate
} from "react-router-dom";

import Welcome from "./pages/Welcome";

import StudentDashboard from "./pages/StudentDashboard";
import StudentLogin from "./pages/StudentLogin";
import StudentHome from "./pages/StudentHome";

import DriverLogin from "./pages/DriverLogin";
import DriverDashboard from "./pages/DriverDashboard";

import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";

function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* WELCOME */}
        <Route
          path="/"
          element={<Welcome />}
        />

        {/* STUDENT */}
        <Route
          path="/register"
          element={<StudentDashboard />}
        />

        <Route
          path="/login"
          element={<StudentLogin />}
        />

        <Route
          path="/student-home"
          element={<StudentHome />}
        />

        {/* DRIVER */}
        <Route
          path="/driver-login"
          element={<DriverLogin />}
        />

        <Route
          path="/driver"
          element={<DriverDashboard />}
        />

        {/* ADMIN */}
        <Route
          path="/admin-login"
          element={<AdminLogin />}
        />

        <Route
          path="/admin"
          element={<AdminDashboard />}
        />

        {/* FALLBACK */}
        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />

      </Routes>
    </BrowserRouter>
  );
}

export default App;
