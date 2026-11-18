
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../style/DriverDashboard.css";

const API_URL = "http://127.0.0.1:8000";
const PAGE_SIZE = 10;

function DriverDashboard() {
  const navigate = useNavigate();

  // ======================================
  // DRIVER PROFILE
  // ======================================

  const [driver, setDriver] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // ======================================
  // STUDENT TABLE
  // ======================================

  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalStudents, setTotalStudents] = useState(0);

  const [schoolDate, setSchoolDate] = useState("");

  // ======================================
  // GPS
  // ======================================

  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsMessage, setGpsMessage] = useState("");

  // ======================================
  // OPENROUTESERVICE ANALYSIS
  // ======================================

  const [distanceLoading, setDistanceLoading] =
    useState(false);

  const [distanceData, setDistanceData] =
    useState(null);

  // ======================================
  // MESSAGES
  // ======================================

  const [error, setError] = useState("");

  // ======================================
  // AUTHENTICATION
  // ======================================

  const logout = useCallback(() => {
    sessionStorage.removeItem("taxiway_driver_token");

    navigate("/driver-login", {
      replace: true
    });
  }, [navigate]);

  const apiRequest = useCallback(
    async (endpoint, options = {}) => {
      const token = sessionStorage.getItem(
        "taxiway_driver_token"
      );

      if (!token) {
        logout();
        throw new Error("Please log in as a driver.");
      }

      const response = await fetch(
        `${API_URL}${endpoint}`,
        {
          ...options,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(options.body
              ? { "Content-Type": "application/json" }
              : {}),
            ...options.headers
          }
        }
      );

      const data = await response
        .json()
        .catch(() => ({}));

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        logout();
        throw new Error("Driver session expired.");
      }

      if (!response.ok) {
        const detail =
          typeof data.detail === "string"
            ? data.detail
            : `Request failed (HTTP ${response.status})`;

        throw new Error(detail);
      }

      return data;
    },
    [logout]
  );

  // ======================================
  // LOAD DRIVER PROFILE
  // ======================================

  useEffect(() => {
    let cancelled = false;

    const loadDriver = async () => {
      try {
        const data = await apiRequest("/drivers/me");

        if (cancelled) return;

        setDriver(data.driver || data);

      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    };

    loadDriver();

    return () => {
      cancelled = true;
    };
  }, [apiRequest]);

  // ======================================
  // LOAD STUDENTS
  // ======================================

  const loadStudents = useCallback(async () => {
    setStudentsLoading(true);

    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE),
        search: searchQuery
      });

      const data = await apiRequest(
        `/drivers/me/students?${params.toString()}`
      );

      setStudents(data.students || []);
      setTotalStudents(data.total || 0);
      setTotalPages(Math.max(1, data.total_pages || 1));
      setSchoolDate(data.tomorrow || "");

    } catch (err) {
      setError(err.message);
    } finally {
      setStudentsLoading(false);
    }
  }, [apiRequest, page, searchQuery]);

  useEffect(() => {
    if (driver) {
      loadStudents();
    }
  }, [driver, loadStudents]);

  // ======================================
  // SEARCH
  // ======================================

  const handleSearch = (e) => {
    e.preventDefault();

    setPage(1);
    setSearchQuery(search.trim());
  };

  // ======================================
  // UPDATE DRIVER GPS
  // ======================================

  const updateMyGPS = () => {
    if (!navigator.geolocation) {
      setError(
        "Your browser does not support geolocation."
      );
      return;
    }

    setGpsLoading(true);
    setGpsMessage("");
    setError("");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const latitude = position.coords.latitude;
          const longitude = position.coords.longitude;

          await apiRequest(
            "/drivers/me/location",
            {
              method: "PUT",
              body: JSON.stringify({
                latitude,
                longitude
              })
            }
          );

          setDriver((previous) => ({
            ...previous,
            latitude,
            longitude,
            location_updated_at:
              new Date().toISOString()
          }));

          setGpsMessage(
            "GPS location updated successfully."
          );

          // Previous results were calculated
          // using an older driver location.
          setDistanceData(null);

        } catch (err) {
          setError(err.message);
        } finally {
          setGpsLoading(false);
        }
      },

      (geoError) => {
        setError(
          `Unable to retrieve GPS: ${geoError.message}`
        );

        setGpsLoading(false);
      },

      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  };

  // ======================================
  // CALCULATE STUDENT DISTANCES
  // ======================================

  const calculateDistances = async () => {
    setDistanceLoading(true);
    setDistanceData(null);
    setError("");

    try {
      const data = await apiRequest(
        "/drivers/me/distances"
      );

      setDistanceData(data);

    } catch (err) {
      setError(err.message);
    } finally {
      setDistanceLoading(false);
    }
  };

  // ======================================
  // HELPERS
  // ======================================

  const formatTime = (value) => {
    if (!value) return "—";
    return String(value).slice(0, 5);
  };

  const getAttendance = (student) => {
    if (
      student.confirmed_for_tomorrow === false
    ) {
      return "Not confirmed";
    }

    return student.has_school ? "Yes" : "No";
  };

  const hasValidCoordinates = (latitude, longitude) =>
    latitude !== null &&
    latitude !== undefined &&
    longitude !== null &&
    longitude !== undefined &&
    latitude !== "" &&
    longitude !== "";

  const getMapLink = (latitude, longitude) => {
    return (
      `https://www.google.com/maps?q=` +
      `${latitude},${longitude}`
    );
  };

  const ranking = distanceData?.ranking || [];
  const schedule = distanceData?.pickup_schedule;
  const stops = schedule?.stops || [];

  // ======================================
  // LOADING
  // ======================================

  if (profileLoading) {
    return (
      <div className="driver-page">
        <div className="driver-card">
          <p>Loading Driver Dashboard...</p>
        </div>
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="driver-page">
        <div className="driver-card">
          <h2>Unable to load driver profile</h2>
          <p role="alert">{error}</p>

          <button onClick={logout}>
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  // ======================================
  // DASHBOARD RETURN
  // ======================================

  return (
    <div className="driver-page">
      <div
        className="driver-card"
        style={{
          maxWidth: 1200,
          margin: "0 auto"
        }}
      >

        {/* ======================================
            HEADER
        ====================================== */}

        <div className="dashboard-header">
          <div>
            <h1>Taxiway Driver Dashboard</h1>

            <p>
              Welcome, {driver.name}
            </p>
          </div>

          <button
            type="button"
            className="logout-button"
            onClick={logout}
          >
            Logout
          </button>
        </div>

        {/* ======================================
            DRIVER INFORMATION
        ====================================== */}

        <section className="profile-section">
          <h2>Driver Information</h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 15,
              marginTop: 15
            }}
          >
            <div>
              <strong>Name</strong>
              <p>{driver.name}</p>
            </div>

            <div>
              <strong>Email</strong>
              <p>{driver.email}</p>
            </div>

            <div>
              <strong>Phone</strong>
              <p>{driver.phone || "—"}</p>
            </div>

            <div>
              <strong>Vehicle Plate</strong>
              <p>{driver.vehicle_plate || "—"}</p>
            </div>

            <div>
              <strong>Company</strong>
              <p>
                {driver.company_name ||
                  (driver.company_id
                    ? `Company ID: ${driver.company_id}`
                    : "Not assigned")}
              </p>
            </div>
          </div>
        </section>

        {/* ======================================
            DRIVER GPS INFORMATION
        ====================================== */}

        <section
          className="gps-section"
          style={{ marginTop: 30 }}
        >
          <h2>My GPS Location</h2>

          <p>
            <strong>Latitude:</strong>{" "}
            {driver.latitude ?? "Not set"}
          </p>

          <p>
            <strong>Longitude:</strong>{" "}
            {driver.longitude ?? "Not set"}
          </p>

          {driver.location_updated_at && (
            <p>
              <strong>Last Updated:</strong>{" "}
              {String(driver.location_updated_at)}
            </p>
          )}

          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              marginTop: 15
            }}
          >
            <button
              type="button"
              onClick={updateMyGPS}
              disabled={gpsLoading}
            >
              {gpsLoading
                ? "Getting GPS..."
                : "Update My GPS Location"}
            </button>

            {hasValidCoordinates(
              driver.latitude,
              driver.longitude
            ) && (
              <a
                href={getMapLink(
                  driver.latitude,
                  driver.longitude
                )}
                target="_blank"
                rel="noopener noreferrer"
              >
                View Saved Location
              </a>
            )}
          </div>

          {gpsMessage && (
            <p role="status" style={{ color: "green" }}>
              {gpsMessage}
            </p>
          )}
        </section>

        {/* ======================================
            STUDENT TABLE
        ====================================== */}

        <section
          className="students-section"
          style={{ marginTop: 35 }}
        >
          <div className="dashboard-header">
            <div>
              <h2>Company Students</h2>

              <p>
                Students with active school records
                {schoolDate ? ` — ${schoolDate}` : ""}
              </p>

              <p>
                Total Students: {totalStudents}
              </p>
            </div>

            <button
              type="button"
              onClick={loadStudents}
              disabled={studentsLoading}
            >
              Refresh Students
            </button>
          </div>

          {/* SEARCH */}

          <form
            onSubmit={handleSearch}
            style={{
              display: "flex",
              gap: 10,
              marginTop: 15,
              marginBottom: 20
            }}
          >
            <input
              type="search"
              placeholder="Search student or school..."
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              style={{
                flex: 1,
                padding: 12,
                border: "1px solid #ddd",
                borderRadius: 8
              }}
            />

            <button type="submit">
              Search
            </button>
          </form>

          {studentsLoading ? (
            <p>Loading students...</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse"
                }}
              >
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Student</th>
                    <th>Age</th>
                    <th>School</th>
                    <th>School Address</th>
                    <th>House Address</th>
                    <th>School Tomorrow</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>GPS</th>
                  </tr>
                </thead>

                <tbody>
                  {students.map((student) => (
                    <tr
                      key={
                        student.record_id ||
                        student.id
                      }
                    >
                      <td>{student.id}</td>

                      <td>{student.name}</td>

                      <td>{student.age ?? "—"}</td>

                      <td>
                        {student.school_name}
                      </td>

                      <td>
                        {student.school_address}
                      </td>

                      <td>
                        {student.house_address}
                      </td>

                      <td>
                        {getAttendance(student)}
                      </td>

                      <td>
                        {formatTime(
                          student.school_start_time ||
                          student.start_time
                        )}
                      </td>

                      <td>
                        {formatTime(
                          student.school_end_time ||
                          student.end_time
                        )}
                      </td>

                      <td>
                        {hasValidCoordinates(
                          student.latitude,
                          student.longitude
                        ) ? (
                          <a
                            href={getMapLink(
                              student.latitude,
                              student.longitude
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View GPS
                          </a>
                        ) : (
                          "Not set"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {students.length === 0 && (
                <p>
                  No active student records found
                  for your company.
                </p>
              )}
            </div>
          )}

          {/* PAGINATION */}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 15,
              marginTop: 20
            }}
          >
            <button
              type="button"
              disabled={
                studentsLoading || page <= 1
              }
              onClick={() =>
                setPage((previous) =>
                  Math.max(1, previous - 1)
                )
              }
            >
              Previous
            </button>

            <span>
              Page {page} of {totalPages}
            </span>

            <button
              type="button"
              disabled={
                studentsLoading ||
                page >= totalPages
              }
              onClick={() =>
                setPage((previous) =>
                  previous + 1
                )
              }
            >
              Next
            </button>
          </div>
        </section>

        {/* ======================================
            NEW OPENROUTESERVICE ANALYSIS
        ====================================== */}

        <section
          className="gps-analysis-section"
          style={{ marginTop: 40 }}
        >
          <h2>Student Distance Analysis</h2>

          <p>
            Calculate road distances from your saved
            GPS location to students who confirmed
            school tomorrow.
          </p>

          <button
            type="button"
            onClick={calculateDistances}
            disabled={distanceLoading || gpsLoading}
            style={{ marginTop: 15 }}
          >
            {distanceLoading
              ? "Calculating Distances..."
              : "Calculate Student Distances"}
          </button>

          {distanceData && (
            <div style={{ marginTop: 25 }}>

              <h3>
                {distanceData.company_name}
              </h3>

              <p>
                School Date:{" "}
                {distanceData.school_date}
              </p>

              <p>
                Eligible Students: {ranking.length}
              </p>

              {/* NEAREST AND FARTHEST */}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(230px, 1fr))",
                  gap: 20,
                  marginTop: 20
                }}
              >
                <div
                  style={{
                    padding: 20,
                    border: "1px solid #ddd",
                    borderRadius: 10
                  }}
                >
                  <h3>Nearest Student</h3>

                  {distanceData.nearest ? (
                    <>
                      <h4>
                        {distanceData.nearest.name}
                      </h4>

                      <p>
                        Distance:{" "}
                        {distanceData.nearest.distance_km} km
                      </p>

                      <p>
                        Driving Time:{" "}
                        {distanceData.nearest.duration_minutes} min
                      </p>
                    </>
                  ) : (
                    <p>No student available</p>
                  )}
                </div>

                <div
                  style={{
                    padding: 20,
                    border: "1px solid #ddd",
                    borderRadius: 10
                  }}
                >
                  <h3>Farthest Student</h3>

                  {distanceData.farthest ? (
                    <>
                      <h4>
                        {distanceData.farthest.name}
                      </h4>

                      <p>
                        Distance:{" "}
                        {distanceData.farthest.distance_km} km
                      </p>

                      <p>
                        Driving Time:{" "}
                        {distanceData.farthest.duration_minutes} min
                      </p>
                    </>
                  ) : (
                    <p>No student available</p>
                  )}
                </div>
              </div>

              {/* ======================================
                  INITIAL RANKING
              ====================================== */}

              <h2 style={{ marginTop: 30 }}>
                1. Nearest to Farthest from Driver
              </h2>

              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse"
                  }}
                >
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Student</th>
                      <th>Distance</th>
                      <th>Driving Time</th>
                      <th>School Start</th>
                      <th>School End</th>
                    </tr>
                  </thead>

                  <tbody>
                    {ranking.map((student) => (
                      <tr key={student.student_id}>
                        <td>{student.rank}</td>

                        <td>{student.name}</td>

                        <td>
                          {student.distance_km} km
                        </td>

                        <td>
                          {student.duration_minutes} min
                        </td>

                        <td>
                          {formatTime(
                            student.start_time
                          )}
                        </td>

                        <td>
                          {formatTime(
                            student.end_time
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {ranking.length === 0 && (
                  <p>
                    No eligible students found for
                    distance calculation.
                  </p>
                )}
              </div>

              {/* ======================================
                  SEQUENTIAL PICKUP SCHEDULE
              ====================================== */}

              <h2 style={{ marginTop: 35 }}>
                2. Driver Pickup Schedule
              </h2>

              <p>
                Start at the driver location, go to
                the nearest student, then continue
                from that student to the nearest
                remaining student.
              </p>

              <div
                style={{
                  overflowX: "auto",
                  marginTop: 20
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse"
                  }}
                >
                  <thead>
                    <tr>
                      <th>Stop</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Distance</th>
                      <th>Driving Time</th>
                      <th>Cumulative Distance</th>
                    </tr>
                  </thead>

                  <tbody>
                    {stops.map((stop) => (
                      <tr key={stop.stop}>
                        <td>{stop.stop}</td>

                        <td>{stop.from}</td>

                        <td>{stop.to}</td>

                        <td>
                          {stop.distance_km} km
                        </td>

                        <td>
                          {stop.duration_minutes} min
                        </td>

                        <td>
                          {stop.total_distance_km} km
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {stops.length === 0 && (
                  <p>
                    No pickup schedule available.
                  </p>
                )}
              </div>

              {/* ======================================
                  TOTAL JOURNEY
              ====================================== */}

              {schedule && (
                <div
                  style={{
                    marginTop: 25,
                    padding: 20,
                    border: "1px solid #ddd",
                    borderRadius: 10
                  }}
                >
                  <h2>3. Total Journey</h2>

                  <p>
                    <strong>
                      Total Pickup Distance:
                    </strong>{" "}
                    {schedule.total_distance_km} km
                  </p>

                  <p>
                    <strong>
                      Estimated Driving Time:
                    </strong>{" "}
                    {schedule.total_duration_minutes} min
                  </p>

                  <p>
                    <small>
                      This calculation covers student
                      pickups only. It does not include
                      the final journey to school.
                    </small>
                  </p>
                </div>
              )}

              {/* ======================================
                  SKIPPED STUDENTS
              ====================================== */}

              {distanceData.skipped_students?.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <h3>Students With Missing GPS</h3>

                  {distanceData.skipped_students.map(
                    (student) => (
                      <p key={student.student_id}>
                        {student.name}: {student.reason}
                      </p>
                    )
                  )}
                </div>
              )}

              {schedule?.not_scheduled?.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <h3>Students Not Scheduled</h3>

                  {schedule.not_scheduled.map(
                    (student) => (
                      <p key={student.student_id}>
                        {student.name}
                      </p>
                    )
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ======================================
            ERRORS
        ====================================== */}

        {error && (
          <p
            role="alert"
            style={{
              color: "#c62828",
              marginTop: 20
            }}
          >
            {error}
          </p>
        )}

      </div>
    </div>
  );
}

export default DriverDashboard;
