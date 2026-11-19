
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../style/StudentDashboard.css";

const API_URL = "../config";

function StudentDashboard() {
  const navigate = useNavigate();

  const [student, setStudent] = useState({
    name: "",
    age: "",
    email: "",
    password: "",
    schoolName: "",
    schoolAddress: "",
    houseAddress: "",
    latitude: null,
    longitude: null
  });

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);

  // ======================================
  // INPUT CHANGES
  // ======================================

  const handleChange = (e) => {
    const { name, value } = e.target;

    setStudent((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  // ======================================
  // HOUSE GPS LOCATION
  // ======================================

  const getHouseLocation = () => {
    if (!window.isSecureContext) {
      setMessage("GPS requires HTTPS or localhost.");
      return;
    }

    if (!navigator.geolocation) {
      setMessage("Your browser does not support GPS.");
      return;
    }

    setGpsLoading(true);
    setMessage("Getting your GPS location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStudent((prev) => ({
          ...prev,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        }));

        setGpsAccuracy(position.coords.accuracy);
        setMessage("GPS location detected successfully.");
        setGpsLoading(false);
      },

      (error) => {
        let errorMessage = error.message;

        if (error.code === 1) {
          errorMessage = "Location permission denied.";
        } else if (error.code === 2) {
          errorMessage = "Location unavailable.";
        } else if (error.code === 3) {
          errorMessage = "Location request timed out.";
        }

        setMessage(errorMessage);
        setGpsLoading(false);
      },

      {
        enableHighAccuracy: false,
        timeout: 30000,
        maximumAge: 0
      }
    );
  };

  // ======================================
  // REGISTER STUDENT
  // ======================================

  const handleRegister = async (e) => {
    e.preventDefault();

    if (
      student.latitude === null ||
      student.longitude === null
    ) {
      setMessage("Please select your house GPS location.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(
        `${API_URL}/students/register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name: student.name.trim(),
            age: Number(student.age),
            email: student.email.trim().toLowerCase(),
            password: student.password,
            school_name: student.schoolName.trim(),
            school_address: student.schoolAddress.trim(),
            house_address: student.houseAddress.trim(),
            latitude: student.latitude,
            longitude: student.longitude
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Registration failed"
        );
      }

      // Registration succeeded.
      // Navigate to login instead of school-status.
      navigate("/login", {
        replace: true,
        state: {
          registered: true
        }
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
        <h1>Student Registration</h1>

        <p>Create your Taxiway student account.</p>

        <form onSubmit={handleRegister}>
          <label htmlFor="name">Full Name</label>
          <input
            id="name"
            type="text"
            name="name"
            value={student.name}
            onChange={handleChange}
            required
          />

          <label htmlFor="age">Age</label>
          <input
            id="age"
            type="number"
            name="age"
            min="3"
            max="100"
            value={student.age}
            onChange={handleChange}
            required
          />

          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            name="email"
            value={student.email}
            onChange={handleChange}
            autoComplete="email"
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            name="password"
            value={student.password}
            onChange={handleChange}
            minLength={8}
            autoComplete="new-password"
            required
          />

          <label htmlFor="schoolName">School Name</label>
          <input
            id="schoolName"
            type="text"
            name="schoolName"
            value={student.schoolName}
            onChange={handleChange}
            required
          />

          <label htmlFor="schoolAddress">
            School Address
          </label>
          <input
            id="schoolAddress"
            type="text"
            name="schoolAddress"
            value={student.schoolAddress}
            onChange={handleChange}
            required
          />

          <label htmlFor="houseAddress">
            House Address
          </label>
          <input
            id="houseAddress"
            type="text"
            name="houseAddress"
            value={student.houseAddress}
            onChange={handleChange}
            required
          />

          <button
            type="button"
            className="gps-button"
            onClick={getHouseLocation}
            disabled={loading || gpsLoading}
          >
            {gpsLoading
              ? "Getting Location..."
              : "Use My GPS Location"}
          </button>

          {student.latitude !== null && (
            <div className="coordinates">
              <p>
                Latitude: {student.latitude.toFixed(6)}
              </p>

              <p>
                Longitude: {student.longitude.toFixed(6)}
              </p>

              {gpsAccuracy !== null && (
                <p>
                  Accuracy: {Math.round(gpsAccuracy)} meters
                </p>
              )}

              <a
                href={`https://www.google.com/maps?q=${student.latitude},${student.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on Google Maps
              </a>
            </div>
          )}

          <button
            type="submit"
            className="primary-button"
            disabled={loading || gpsLoading}
          >
            {loading ? "Registering..." : "Register"}
          </button>
        </form>

        <p className="footer-text">
          Already have an account?{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => navigate("/login")}
          >
            Login
          </button>
        </p>

        {message && (
          <p className="message" role="status">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

export default StudentDashboard;
