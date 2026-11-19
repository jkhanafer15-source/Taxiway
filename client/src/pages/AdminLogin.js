
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../style/AdminDashboard.css";

import API_URL from "../config";

function AdminLogin() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(
        `${API_URL}/admin/login`,
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
            : "Admin login failed"
        );
      }

      sessionStorage.setItem(
        "taxiway_admin_token",
        data.access_token
      );

      navigate("/admin", {
        replace: true
      });

    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-card">

        <div className="admin-login-icon">
          <span>⚙</span>
        </div>

        <h1>Taxiway Admin</h1>

        <p>
          Sign in to manage students, drivers,
          and transportation operations.
        </p>

        <form onSubmit={handleLogin}>
          <label htmlFor="admin-email">
            Email
          </label>

          <input
            id="admin-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter admin email"
            autoComplete="email"
            required
          />

          <label htmlFor="admin-password">
            Password
          </label>

          <input
            id="admin-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            autoComplete="current-password"
            required
          />

          <button
            type="submit"
            className="admin-primary-button"
            disabled={loading}
          >
            {loading ? "Logging in..." : "Login as Admin"}
          </button>
        </form>

        {message && (
          <p className="admin-error" role="alert">
            {message}
          </p>
        )}

        <button
          type="button"
          className="admin-text-button"
          onClick={() => navigate("/")}
        >
          Back to Taxiway
        </button>

      </div>
    </div>
  );
}

export default AdminLogin;
