
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../style/AdminDashboard.css";

import API_URL from "../config";
const PAGE_SIZE = 20;

const emptyDriver = {
  name: "",
  email: "",
  password: "",
  phone: "",
  vehicle_plate: "",
  company_id: ""
};

function AdminDashboard() {
  const navigate = useNavigate();

  const [admin, setAdmin] = useState(null);
  const [section, setSection] = useState("students");

  const [stats, setStats] = useState({
    total_students: 0,
    total_drivers: 0,
    students_tomorrow: 0,
    tomorrow: ""
  });

  const [companies, setCompanies] = useState([]);
  const [students, setStudents] = useState([]);
  const [drivers, setDrivers] = useState([]);

  const [studentSearch, setStudentSearch] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const [studentPage, setStudentPage] = useState(1);
  const [studentPages, setStudentPages] = useState(0);
  const [studentTotal, setStudentTotal] = useState(0);

  const [driverSearch, setDriverSearch] = useState("");
  const [driverQuery, setDriverQuery] = useState("");
  const [driverPage, setDriverPage] = useState(1);
  const [driverPages, setDriverPages] = useState(0);
  const [driverTotal, setDriverTotal] = useState(0);

  const [newDriver, setNewDriver] = useState(emptyDriver);

  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ======================================
  // AUTH
  // ======================================

  const logout = useCallback(() => {
    sessionStorage.removeItem("taxiway_admin_token");
    navigate("/admin-login", { replace: true });
  }, [navigate]);

  const apiRequest = useCallback(async (path, options = {}) => {
    const token = sessionStorage.getItem("taxiway_admin_token");

    if (!token) {
      logout();
      throw new Error("Please log in as administrator");
    }

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body
          ? { "Content-Type": "application/json" }
          : {}),
        ...options.headers
      }
    });

    if (response.status === 401 || response.status === 403) {
      logout();
      throw new Error("Admin session expired or access denied");
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        typeof data.detail === "string"
          ? data.detail
          : "Request failed"
      );
    }

    return data;
  }, [logout]);

  // ======================================
  // INITIAL DATA
  // ======================================

  const loadStats = useCallback(async () => {
    const data = await apiRequest("/admin/stats");
    setStats(data);
  }, [apiRequest]);

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      try {
        const [profile, statistics, companyData] =
          await Promise.all([
            apiRequest("/admin/me"),
            apiRequest("/admin/stats"),
            apiRequest("/admin/companies")
          ]);

        if (cancelled) return;

        setAdmin(profile);
        setStats(statistics);
        setCompanies(companyData.companies);

      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    initialize();

    return () => {
      cancelled = true;
    };
  }, [apiRequest]);

  // ======================================
  // LOAD STUDENTS
  // ======================================

  useEffect(() => {
    if (!admin || section !== "students") return;

    let cancelled = false;

    const loadStudents = async () => {
      setTableLoading(true);

      try {
        const params = new URLSearchParams({
          page: String(studentPage),
          page_size: String(PAGE_SIZE),
          search: studentQuery
        });

        const data = await apiRequest(
          `/admin/students?${params}`
        );

        if (cancelled) return;

        setStudents(data.students);
        setStudentTotal(data.total);
        setStudentPages(data.total_pages);

      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setTableLoading(false);
      }
    };

    loadStudents();

    return () => {
      cancelled = true;
    };
  }, [
    admin,
    section,
    studentPage,
    studentQuery,
    apiRequest
  ]);

  // ======================================
  // LOAD DRIVERS
  // ======================================

  useEffect(() => {
    if (!admin || section !== "drivers") return;

    let cancelled = false;

    const loadDrivers = async () => {
      setTableLoading(true);

      try {
        const params = new URLSearchParams({
          page: String(driverPage),
          page_size: String(PAGE_SIZE),
          search: driverQuery
        });

        const data = await apiRequest(
          `/admin/drivers?${params}`
        );

        if (cancelled) return;

        setDrivers(data.drivers);
        setDriverTotal(data.total);
        setDriverPages(data.total_pages);

      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setTableLoading(false);
      }
    };

    loadDrivers();

    return () => {
      cancelled = true;
    };
  }, [
    admin,
    section,
    driverPage,
    driverQuery,
    apiRequest
  ]);

  // ======================================
  // REGISTER DRIVER
  // ======================================

  const handleDriverChange = (e) => {
    const { name, value } = e.target;

    setNewDriver((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const registerDriver = async (e) => {
    e.preventDefault();

    if (!newDriver.company_id) {
      setError("Please select a transportation company.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const data = await apiRequest("/admin/drivers", {
        method: "POST",
        body: JSON.stringify({
          name: newDriver.name.trim(),
          email: newDriver.email.trim().toLowerCase(),
          password: newDriver.password,
          phone: newDriver.phone.trim() || null,
          vehicle_plate: newDriver.vehicle_plate.trim() || null,
          company_id: Number(newDriver.company_id)
        })
      });

      setSuccess(
        `Driver registered successfully under ${data.company_name}.`
      );

      setNewDriver(emptyDriver);
      setDriverPage(1);
      setDriverQuery("");
      setDriverSearch("");

      await loadStats();

    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ======================================
  // SEARCH + NAVIGATION
  // ======================================

  const searchStudents = (e) => {
    e.preventDefault();
    setStudentPage(1);
    setStudentQuery(studentSearch.trim());
  };

  const searchDrivers = (e) => {
    e.preventDefault();
    setDriverPage(1);
    setDriverQuery(driverSearch.trim());
  };

  const changeSection = (next) => {
    setSection(next);
    setError("");
    setSuccess("");
  };

  const mapUrl = (latitude, longitude) =>
    `https://www.google.com/maps?q=${latitude},${longitude}`;

  const getStatus = (student) => {
    if (!student.confirmed_for_tomorrow) return "Not confirmed";
    return student.has_school ? "Yes" : "No";
  };

  if (loading) {
    return (
      <div className="admin-login-page">
        <div className="admin-login-card">
          <p>Loading admin dashboard...</p>
          {error && <p role="alert">{error}</p>}
        </div>
      </div>
    );
  }

  if (!admin) {
    return (
      <div className="admin-login-page">
        <div className="admin-login-card">
          <p role="alert">{error || "Unable to load admin"}</p>
          <button
            className="admin-primary-button"
            onClick={logout}
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-layout">

      {/* SIDEBAR */}
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span>🚍</span>
          <h2>Taxiway</h2>
        </div>

        <p className="admin-sidebar-label">
          ADMIN MANAGEMENT
        </p>

        <nav className="admin-navigation">
          <button
            className={section === "students" ? "active" : ""}
            onClick={() => changeSection("students")}
          >
            Students
          </button>

          <button
            className={section === "drivers" ? "active" : ""}
            onClick={() => changeSection("drivers")}
          >
            Drivers
          </button>

          <button
            className={section === "register" ? "active" : ""}
            onClick={() => changeSection("register")}
          >
            Register Driver
          </button>
        </nav>

        <div className="admin-sidebar-footer">
          <p>{admin.name}</p>
          <small>{admin.email}</small>

          <button onClick={logout}>Logout</button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="admin-main">
        <header className="admin-header">
          <div>
            <h1>Admin Dashboard</h1>
            <p>Welcome, {admin.name}</p>
          </div>

          <span className="admin-role-label">
            Administrator
          </span>
        </header>

        {/* STATISTICS */}
        <div className="admin-stats">
          <div className="admin-stat-card">
            <span>Total Students</span>
            <strong>{stats.total_students.toLocaleString()}</strong>
          </div>

          <div className="admin-stat-card">
            <span>Total Drivers</span>
            <strong>{stats.total_drivers.toLocaleString()}</strong>
          </div>

          <div className="admin-stat-card">
            <span>School Tomorrow</span>
            <strong>
              {stats.students_tomorrow.toLocaleString()}
            </strong>
            <small>{stats.tomorrow}</small>
          </div>
        </div>

        {error && (
          <p className="admin-error" role="alert">
            {error}
          </p>
        )}

        {success && (
          <p className="admin-success" role="status">
            {success}
          </p>
        )}

        {/* STUDENTS */}
        {section === "students" && (
          <section className="admin-panel">
            <div className="admin-panel-header">
              <div>
                <h2>Students</h2>
                <p>{studentTotal} registered students</p>
              </div>
            </div>

            <form
              className="admin-search"
              onSubmit={searchStudents}
            >
              <input
                type="search"
                value={studentSearch}
                onChange={(e) =>
                  setStudentSearch(e.target.value)
                }
                placeholder="Search student or school"
              />
              <button type="submit">Search</button>
            </form>

            {tableLoading ? (
              <p>Loading students...</p>
            ) : (
              <div className="admin-table-scroll">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>School</th>
                      <th>House</th>
                      <th>Tomorrow</th>
                      <th>Start</th>
                      <th>Finish</th>
                      <th>GPS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student) => (
                      <tr key={student.id}>
                        <td>{student.id}</td>
                        <td>{student.name}</td>
                        <td>{student.email || "—"}</td>
                        <td>{student.school_name}</td>
                        <td>{student.house_address}</td>
                        <td>{getStatus(student)}</td>
                        <td>{student.school_start_time || "—"}</td>
                        <td>{student.school_end_time || "—"}</td>
                        <td>
                          <a
                            href={mapUrl(
                              student.latitude,
                              student.longitude
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View Map
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {students.length === 0 && <p>No students found.</p>}
              </div>
            )}

            <div className="admin-pagination">
              <button
                disabled={studentPage <= 1 || tableLoading}
                onClick={() =>
                  setStudentPage((p) => Math.max(1, p - 1))
                }
              >
                Previous
              </button>

              <span>
                Page {studentPage} of {Math.max(1, studentPages)}
              </span>

              <button
                disabled={
                  studentPage >= studentPages || tableLoading
                }
                onClick={() => setStudentPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </section>
        )}

        {/* DRIVERS */}
        {section === "drivers" && (
          <section className="admin-panel">
            <div className="admin-panel-header">
              <div>
                <h2>Drivers</h2>
                <p>{driverTotal} registered drivers</p>
              </div>

              <button
                className="admin-primary-button"
                onClick={() => changeSection("register")}
              >
                + Add Driver
              </button>
            </div>

            <form
              className="admin-search"
              onSubmit={searchDrivers}
            >
              <input
                type="search"
                value={driverSearch}
                onChange={(e) =>
                  setDriverSearch(e.target.value)
                }
                placeholder="Search driver or vehicle plate"
              />
              <button type="submit">Search</button>
            </form>

            {tableLoading ? (
              <p>Loading drivers...</p>
            ) : (
              <div className="admin-table-scroll">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Company</th>
                      <th>Phone</th>
                      <th>Vehicle</th>
                      <th>GPS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drivers.map((driver) => {
                      const company = companies.find(
                        (c) => c.id === driver.company_id
                      );

                      return (
                        <tr key={driver.id}>
                          <td>{driver.id}</td>
                          <td>{driver.name}</td>
                          <td>{driver.email}</td>
                          <td>
                            {driver.company_name ||
                              company?.name ||
                              "Unassigned"}
                          </td>
                          <td>{driver.phone || "—"}</td>
                          <td>{driver.vehicle_plate || "—"}</td>
                          <td>
                            {driver.latitude != null &&
                            driver.longitude != null ? (
                              <a
                                href={mapUrl(
                                  driver.latitude,
                                  driver.longitude
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                View Map
                              </a>
                            ) : (
                              "Not set"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {drivers.length === 0 && <p>No drivers found.</p>}
              </div>
            )}

            <div className="admin-pagination">
              <button
                disabled={driverPage <= 1 || tableLoading}
                onClick={() =>
                  setDriverPage((p) => Math.max(1, p - 1))
                }
              >
                Previous
              </button>

              <span>
                Page {driverPage} of {Math.max(1, driverPages)}
              </span>

              <button
                disabled={
                  driverPage >= driverPages || tableLoading
                }
                onClick={() => setDriverPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </section>
        )}

        {/* REGISTER DRIVER */}
        {section === "register" && (
          <section className="admin-panel">
            <div className="admin-panel-header">
              <div>
                <h2>Register New Driver</h2>
                <p>Assign a company during registration.</p>
              </div>
            </div>

            <form
              className="admin-driver-form"
              onSubmit={registerDriver}
            >
              <label htmlFor="driver-name">Full Name</label>
              <input
                id="driver-name"
                type="text"
                name="name"
                value={newDriver.name}
                onChange={handleDriverChange}
                required
              />

              <label htmlFor="driver-email">Email</label>
              <input
                id="driver-email"
                type="email"
                name="email"
                value={newDriver.email}
                onChange={handleDriverChange}
                required
              />

              <label htmlFor="driver-password">
                Initial Password
              </label>
              <input
                id="driver-password"
                type="password"
                name="password"
                value={newDriver.password}
                onChange={handleDriverChange}
                minLength={8}
                autoComplete="new-password"
                required
              />

              <label htmlFor="driver-phone">Phone Number</label>
              <input
                id="driver-phone"
                type="tel"
                name="phone"
                value={newDriver.phone}
                onChange={handleDriverChange}
              />

              <label htmlFor="vehicle-plate">
                Vehicle Plate
              </label>
              <input
                id="vehicle-plate"
                type="text"
                name="vehicle_plate"
                value={newDriver.vehicle_plate}
                onChange={handleDriverChange}
              />

              {/* NEW COMPANY SELECTION */}
              <label htmlFor="driver-company">
                Transportation Company
              </label>

              <select
                id="driver-company"
                name="company_id"
                value={newDriver.company_id}
                onChange={handleDriverChange}
                required
                style={{
                  padding: 12,
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  backgroundColor: "white"
                }}
              >
                <option value="">
                  Select Transportation Company
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
                <p className="admin-form-note">
                  No companies found. Add a company in MySQL first.
                </p>
              )}

              <p className="admin-form-note">
                The driver will only see students who selected
                their assigned company. The driver can set
                their starting GPS after logging in.
              </p>

              <button
                type="submit"
                className="admin-primary-button"
                disabled={saving || companies.length === 0}
              >
                {saving
                  ? "Registering Driver..."
                  : "Register Driver"}
              </button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}

export default AdminDashboard;
