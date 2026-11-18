
import { useNavigate } from "react-router-dom";
import "../style/Welcome.css";

function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="welcome-page">
      <div className="welcome-container">

        <div className="welcome-header">
          <div className="welcome-logo">
            <span className="welcome-logo-icon">🚍</span>
            <h1>Taxiway</h1>
          </div>

          <h2>Welcome to Taxiway</h2>

          <p>
            Smart school transportation made simple.
            Choose how you want to continue.
          </p>
        </div>

        <div className="role-cards">

          {/* STUDENT */}
          <div className="role-card">
            <div className="role-icon student-icon">
              🎓
            </div>

            <h3>I'm a Student</h3>

            <p>
              Register your location, manage your school
              schedule, and access your transportation
              information.
            </p>

            <button
              className="role-button student-button"
              onClick={() => navigate("/login")}
            >
              Student Login
            </button>

            <button
              className="role-secondary-button"
              onClick={() => navigate("/register")}
            >
              Create Student Account
            </button>
          </div>

          {/* DRIVER */}
          <div className="role-card">
            <div className="role-icon driver-icon">
              🚍
            </div>

            <h3>I'm a Driver</h3>

            <p>
              Access student information, manage your
              starting GPS location, and prepare your
              transportation routes.
            </p>

            <button
              className="role-button driver-button"
              onClick={() => navigate("/driver-login")}
            >
              Driver Login
            </button>

            <p className="driver-note">
              Driver accounts are created by the
              transportation administrator.
            </p>
          </div>

        </div>

        <div className="welcome-footer">
          <p>
            Taxiway — Intelligent School Transportation
          </p>
        </div>

      </div>
    </div>
  );
}

export default Welcome;
