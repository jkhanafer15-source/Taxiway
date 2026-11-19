
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../style/DriverDashboard.css";

const API_URL = "../config";

function DriverLogin() {
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
        `${API_URL}/drivers/login`,
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
            : "Driver login failed"
        );
      }

      sessionStorage.setItem(
        "taxiway_driver_token",
        data.access_token
      );

      navigate("/driver", {
        replace: true
      });

    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="driver-page">
      <div className="driver-login-card">
        <h1>Taxiway Driver Login</h1>

        <p>
          Sign in to manage your transportation dashboard.
        </p>

        <form onSubmit={handleLogin}>
          <label htmlFor="driver-email">
            Email
          </label>

          <input
            id="driver-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            autoComplete="email"
            required
          />

          <label htmlFor="driver-password">
            Password
          </label>

          <input
            id="driver-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            autoComplete="current-password"
            required
          />

          <button
            type="submit"
            className="driver-primary-button"
            disabled={loading}
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        {message && (
          <p className="driver-message" role="alert">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

export default DriverLogin;
