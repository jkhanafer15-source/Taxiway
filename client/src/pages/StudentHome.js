
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../style/StudentDashboard.css";

const API_URL = "../config";

function StudentHome() {
  const navigate = useNavigate();

  // ======================================
  // STATES
  // ======================================

  const [student, setStudent] = useState(null);
  const [companies, setCompanies] = useState([]);

  const [companyId, setCompanyId] = useState("");
  const [hasSchool, setHasSchool] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const [selection, setSelection] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // ======================================
  // API HELPER
  // ======================================

  const getToken = () => {
    return sessionStorage.getItem("taxiway_token");
  };

  const logout = () => {
    sessionStorage.removeItem("taxiway_token");

    navigate("/login", {
      replace: true
    });
  };

  // ======================================
  // LOAD PROFILE + COMPANIES + SELECTION
  // ======================================

  useEffect(() => {
    let cancelled = false;

    const loadDashboard = async () => {
      const token = sessionStorage.getItem(
        "taxiway_token"
      );

      if (!token) {
        navigate("/login", { replace: true });
        return;
      }

      try {
        const headers = {
          Authorization: `Bearer ${token}`
        };

        const [
          profileResponse,
          companiesResponse,
          selectionResponse
        ] = await Promise.all([
          fetch(`${API_URL}/students/me`, {
            headers
          }),

          fetch(`${API_URL}/companies`, {
            headers
          }),

          fetch(
            `${API_URL}/students/me/transportation`,
            { headers }
          )
        ]);

        if (
          [
            profileResponse,
            companiesResponse,
            selectionResponse
          ].some(
            (response) =>
              response.status === 401 ||
              response.status === 403
          )
        ) {
          sessionStorage.removeItem("taxiway_token");

          navigate("/login", {
            replace: true
          });

          return;
        }

        if (
          !profileResponse.ok ||
          !companiesResponse.ok ||
          !selectionResponse.ok
        ) {
          throw new Error(
            "Unable to load transportation information"
          );
        }

        const profileData = await profileResponse.json();
        const companiesData = await companiesResponse.json();
        const selectionData = await selectionResponse.json();

        if (cancelled) return;

        setStudent(profileData);
        setCompanies(companiesData.companies);
        setSelection(selectionData);

        if (selectionData.company_id != null) {
          setCompanyId(
            String(selectionData.company_id)
          );
        }

        if (selectionData.submitted_for_tomorrow) {
          setHasSchool(
            selectionData.has_school ? "yes" : "no"
          );

          setStartTime(
            selectionData.school_start_time || ""
          );

          setEndTime(
            selectionData.school_end_time || ""
          );
        }

      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // ======================================
  // SAVE COMPANY + SCHOOL TIMES
  // ======================================

  const saveTransportation = async (e) => {
    e.preventDefault();

    if (!companyId) {
      setError("Please select a transportation company.");
      return;
    }

    if (!hasSchool) {
      setError("Please select Yes or No.");
      return;
    }

    if (
      hasSchool === "yes" &&
      (!startTime || !endTime)
    ) {
      setError(
        "Please enter school start and finish times."
      );
      return;
    }

    if (
      hasSchool === "yes" &&
      startTime >= endTime
    ) {
      setError(
        "Finish time must be after start time."
      );
      return;
    }

    const token = getToken();

    if (!token) {
      logout();
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `${API_URL}/students/me/transportation`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            company_id: Number(companyId),
            has_school: hasSchool === "yes",
            school_start_time:
              hasSchool === "yes"
                ? startTime
                : null,
            school_end_time:
              hasSchool === "yes"
                ? endTime
                : null
          })
        }
      );

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        logout();
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Unable to save transportation selection"
        );
      }

      setSelection({
        company_id: data.company_id,
        company_name: data.company_name,
        tomorrow: data.school_date,
        submitted_for_tomorrow: true,
        has_school: data.has_school,
        school_start_time: data.school_start_time,
        school_end_time: data.school_end_time
      });

      setMessage(
        "Your transportation selection was saved successfully!"
      );

    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ======================================
  // LOADING
  // ======================================

  if (loading) {
    return (
      <div className="student-page">
        <div className="student-card">
          <p>Loading your transportation dashboard...</p>
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="student-page">
        <div className="student-card">
          <h2>Unable to load dashboard</h2>
          <p role="alert">{error}</p>

          <button
            type="button"
            className="primary-button"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>

          <button
            type="button"
            className="gps-button"
            onClick={logout}
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  const submitted = selection?.submitted_for_tomorrow;

  // ======================================
  // UI
  // ======================================

  return (
    <div className="student-page">
      <div className="student-card">

        {/* HEADER */}
        <div className="dashboard-header">
          <h1>Welcome, {student.name}!</h1>

          <button
            type="button"
            className="logout-button"
            onClick={logout}
          >
            Logout
          </button>
        </div>

        <p>Taxiway Student Dashboard</p>

        {/* STUDENT INFORMATION */}
        <div className="profile-section">
          <h2>Your Information</h2>

          <p>
            <strong>Name:</strong> {student.name}
          </p>

          <p>
            <strong>School:</strong>{" "}
            {student.school_name}
          </p>

          <p>
            <strong>School Address:</strong>{" "}
            {student.school_address}
          </p>

          <p>
            <strong>House Address:</strong>{" "}
            {student.house_address}
          </p>
        </div>

        {/* TRANSPORTATION SELECTION */}
        <div className="attendance-section">
          <h2>Transportation Company</h2>

          <p>
            Select the transportation company you
            want to use for tomorrow.
          </p>

          {submitted ? (
            <div className="schedule-result">
              <h3>Tomorrow's Schedule Saved</h3>

              <p>
                <strong>Company:</strong>{" "}
                {selection.company_name}
              </p>

              <p>
                <strong>Date:</strong>{" "}
                {selection.tomorrow}
              </p>

              <p>
                <strong>School Tomorrow:</strong>{" "}
                {selection.has_school ? "Yes" : "No"}
              </p>

              {selection.has_school && (
                <>
                  <p>
                    <strong>School Starts:</strong>{" "}
                    {selection.school_start_time}
                  </p>

                  <p>
                    <strong>School Finishes:</strong>{" "}
                    {selection.school_end_time}
                  </p>
                </>
              )}

              <p>
                Your schedule is confirmed for
                tomorrow. You can submit the next
                day's schedule tomorrow.
              </p>
            </div>
          ) : (
            <form onSubmit={saveTransportation}>

              <label htmlFor="company">
                Choose Transportation Company
              </label>

              <select
                id="company"
                value={companyId}
                onChange={(e) =>
                  setCompanyId(e.target.value)
                }
                required
              >
                <option value="">
                  Select a company
                </option>

                {companies.map((company) => (
                  <option
                    key={company.id}
                    value={company.id}
                  >
                    {company.name}
                  </option>
                ))}
              </select>

              {companies.length === 0 && (
                <p>
                  No transportation companies
                  are currently available.
                </p>
              )}

              <label htmlFor="hasSchool">
                Do you have school tomorrow?
              </label>

              <select
                id="hasSchool"
                value={hasSchool}
                onChange={(e) => {
                  setHasSchool(e.target.value);
                }}
                required
              >
                <option value="">
                  Select an option
                </option>

                <option value="yes">
                  Yes, I have school
                </option>

                <option value="no">
                  No, I don't have school
                </option>
              </select>

              {hasSchool === "yes" && (
                <div className="time-section">
                  <label htmlFor="startTime">
                    What time does school start?
                  </label>

                  <input
                    id="startTime"
                    type="time"
                    value={startTime}
                    onChange={(e) =>
                      setStartTime(e.target.value)
                    }
                    required
                  />

                  <label htmlFor="endTime">
                    What time does school finish?
                  </label>

                  <input
                    id="endTime"
                    type="time"
                    value={endTime}
                    onChange={(e) =>
                      setEndTime(e.target.value)
                    }
                    required
                  />
                </div>
              )}

              <button
                type="submit"
                className="primary-button"
                disabled={
                  saving || companies.length === 0
                }
              >
                {saving
                  ? "Saving..."
                  : "Save Transportation Selection"}
              </button>

            </form>
          )}
        </div>

        {message && (
          <p
            className="success-message"
            role="status"
          >
            {message}
          </p>
        )}

        {error && (
          <p
            className="message"
            role="alert"
          >
            {error}
          </p>
        )}

      </div>
    </div>
  );
}

export default StudentHome;
