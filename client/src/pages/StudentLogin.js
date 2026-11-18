
import { useState } from "react";
import {
  useNavigate,
  useLocation
} from "react-router-dom";

import "../style/StudentDashboard.css";

const API_URL = "http://127.0.0.1:8000";

function StudentLogin() {
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // ======================================
  // LOGIN
  // ======================================

  const handleLogin = async (e) => {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(
        `${API_URL}/students/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Login failed"
        );
      }

      // Save JWT token for authenticated API requests.
      sessionStorage.setItem(
        "taxiway_token",
        data.access_token
      );

      navigate("/student-home", {
        replace: true
      });

    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  // ======================================
  // UI
  // ======================================

  return (
    <div className="student-page">
      <div className="student-card">
        <h1>Student Login</h1>

        {location.state?.registered && (
          <p className="success-message">
            Registration successful! Please log in.
          </p>
        )}

        <p>Access your Taxiway dashboard.</p>

        <form onSubmit={handleLogin}>
          <label htmlFor="email">Email</label>

          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="Enter your email"
            required
          />

          <label htmlFor="password">Password</label>

          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="Enter your password"
            required
          />

          <button
            type="submit"
            className="primary-button"
            disabled={loading}
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="footer-text">
          Don't have an account?{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => navigate("/register")}
          >
            Register
          </button>
        </p>

        {message && (
          <p className="message" role="alert">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

export default StudentLogin;
