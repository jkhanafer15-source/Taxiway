
import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Optional

import jwt
import mysql.connector
from mysql.connector import Error, IntegrityError
from dotenv import load_dotenv
from pwdlib import PasswordHash

from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, EmailStr
from transport_routes import register_transport_routes
from contextlib import asynccontextmanager
from transport_routes import register_transport_routes
from ors_routes import register_ors_routes

# =========================================
# CONFIGURATION
# =========================================

load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET")

if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET missing from .env")

JWT_ALGORITHM = "HS256"
LEBANON_TZ = ZoneInfo("Asia/Beirut")

pwd_context = PasswordHash.recommended()
security = HTTPBearer(auto_error=False)

@asynccontextmanager
async def lifespan(app):
    # Clean expired records when FastAPI starts.
    delete_expired_records(get_db)

    # Start the daily cleanup scheduler.
    scheduler = start_record_cleanup(get_db)

    try:
        yield
    finally:
        scheduler.shutdown(wait=False)


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


# =========================================
# DATABASE
# =========================================

def get_db_connection():
    return mysql.connector.connect(
        host=os.environ["DB_HOST"],
        port=int(os.environ.get("DB_PORT", "3306")),
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        database=os.environ["DB_NAME"],
        connection_timeout=10
    )

# =========================================
# PYDANTIC MODELS
# =========================================

class StudentRegister(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    age: int = Field(ge=3, le=100)
    email: EmailStr
    password: str = Field(min_length=8)
    school_name: str = Field(min_length=1, max_length=150)
    school_address: str = Field(min_length=1, max_length=255)
    house_address: str = Field(min_length=1, max_length=255)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class DailySchoolStatus(BaseModel):
    has_school: bool
    school_start_time: Optional[str] = None
    school_end_time: Optional[str] = None


class DriverLocation(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class DriverRegister(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8)
    phone: Optional[str] = Field(default=None, max_length=30)
    vehicle_plate: Optional[str] = Field(
        default=None,
        max_length=30
    )
    company_id: int = Field(gt=0)


# =========================================
# AUTHENTICATION HELPERS
# =========================================

def create_access_token(user_id, role):
    expires = datetime.now(timezone.utc) + timedelta(
        hours=24
    )

    return jwt.encode(
        {
            "sub": str(user_id),
            "role": role,
            "exp": expires
        },
        JWT_SECRET,
        algorithm=JWT_ALGORITHM
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(
        security
    )
):
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Authentication required"
        )

    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM]
        )

        user_id = int(payload["sub"])
        role = payload["role"]

        if user_id <= 0 or role not in (
            "student",
            "driver",
            "admin"
        ):
            raise ValueError("Invalid user")

        return {
            "id": user_id,
            "role": role
        }

    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token"
        )


def require_student(user=Depends(get_current_user)):
    if user["role"] != "student":
        raise HTTPException(
            status_code=403,
            detail="Student access required"
        )

    return user["id"]


def require_driver(user=Depends(get_current_user)):
    if user["role"] != "driver":
        raise HTTPException(
            status_code=403,
            detail="Driver access required"
        )

    return user["id"]


def require_admin(user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(
            status_code=403,
            detail="Admin access required"
        )

    # Also verify admin still exists in database.
    db = None
    cursor = None

    try:
        db = get_db()
        cursor = db.cursor()

        cursor.execute(
            "SELECT id FROM admin WHERE id = %s",
            (user["id"],)
        )

        if cursor.fetchone() is None:
            raise HTTPException(
                status_code=403,
                detail="Admin account not available"
            )

        return user["id"]

    except Error as error:
        print("Admin verification error:", error)
        raise HTTPException(
            status_code=500,
            detail="Unable to verify admin"
        )

    finally:
        if cursor is not None:
            cursor.close()
        if db is not None and db.is_connected():
            db.close()


# =========================================
# DATE AND SERIALIZATION HELPERS
# =========================================

def get_tomorrow():
    return (
        datetime.now(LEBANON_TZ).date()
        + timedelta(days=1)
    )


def validate_time(value):
    try:
        return datetime.strptime(value, "%H:%M").time()
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=422,
            detail="Time must use HH:MM format"
        )


def format_time(value):
    if value is None:
        return None

    if isinstance(value, timedelta):
        minutes = int(value.total_seconds() // 60)
        return f"{minutes // 60:02d}:{minutes % 60:02d}"

    return str(value)[:5]



def serialize_student(student):
    if student is None:
        return None

    row = dict(student)

    # Convert student GPS coordinates to floats
    if row.get("latitude") is not None:
        row["latitude"] = float(row["latitude"])

    if row.get("longitude") is not None:
        row["longitude"] = float(row["longitude"])

    # Do not return sensitive authentication information
    row.pop("password_hash", None)

    return row



def serialize_driver(row):
    if row.get("location_updated_at") is not None:
        row["location_updated_at"] = (
            row["location_updated_at"].isoformat()
        )

    return row


# =========================================
# HOME
# =========================================

@app.get("/")
def home():
    return {"message": "Taxiway API is running"}


# =========================================
# STUDENT REGISTRATION
# =========================================


@app.post("/students/register")
def register_student(student: StudentRegister):

    db = None
    cursor = None

    try:
        # ======================================
        # 1. CONNECT TO DATABASE
        # ======================================

        db = get_db()
        cursor = db.cursor(dictionary=True)

        # ======================================
        # 2. CHECK EMAIL
        # ======================================

        cursor.execute(
            """
            SELECT id
            FROM student
            WHERE email = %s
            """,
            (student.email,)
        )

        existing_student = cursor.fetchone()

        if existing_student:
            raise HTTPException(
                status_code=409,
                detail="Email is already registered"
            )

        # ======================================
        # 3. HASH PASSWORD
        # ======================================

        hashed_password = pwd_context.hash(student.password)

        # ======================================
        # 4. INSERT STUDENT
        # ======================================
        #
        # Only permanent student information.
        #
        # School attendance and dates belong
        # to the records table.

        cursor.execute(
            """
            INSERT INTO student (
                name,
                age,
                email,
                password_hash,
                school_name,
                school_address,
                house_address,
                latitude,
                longitude
            )
            VALUES (
                %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s
            )
            """,
            (
                student.name,
                student.age,
                student.email,
                hashed_password,
                student.school_name,
                student.school_address,
                student.house_address,
                student.latitude,
                student.longitude
            )
        )

        student_id = cursor.lastrowid

        db.commit()

        # ======================================
        # 5. SUCCESS RESPONSE
        # ======================================

        return {
            "message": "Student registered successfully",
            "student_id": student_id
        }

    except HTTPException:
        if db is not None:
            db.rollback()
        raise

    except Error as error:
        if db is not None:
            db.rollback()

        print("Student registration error:", error)

        if error.errno == 1062:
            raise HTTPException(
                status_code=409,
                detail="Email is already registered"
            )

        raise HTTPException(
            status_code=500,
            detail="Unable to register student"
        )

    finally:
        if cursor is not None:
            cursor.close()

        if db is not None:
            db.close()



# =========================================
# STUDENT LOGIN
# =========================================

@app.post("/students/login")
def login_student(login: LoginRequest):
    db = None
    cursor = None

    try:
        db = get_db()
        cursor = db.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT id, name, email, password_hash
            FROM student
            WHERE email = %s
            """,
            (str(login.email).lower(),)
        )

        student = cursor.fetchone()

        if (
            student is None
            or not student["password_hash"]
            or not pwd_context.verify(
                login.password,
                student["password_hash"]
            )
        ):
            raise HTTPException(
                status_code=401,
                detail="Invalid email or password"
            )

        token = create_access_token(
            student["id"],
            "student"
        )

        return {
            "access_token": token,
            "token_type": "bearer",
            "student": {
                "id": student["id"],
                "name": student["name"],
                "email": student["email"]
            }
        }

    except Error as error:
        print("Student login error:", error)
        raise HTTPException(
            status_code=500,
            detail="Unable to log in"
        )

    finally:
        if cursor is not None:
            cursor.close()
        if db is not None and db.is_connected():
            db.close()


# =========================================
# STUDENT PROFILE
# =========================================

@app.get("/students/me")
def get_student_profile(
    student_id: int = Depends(require_student)
):
    db = None
    cursor = None

    try:
        db = get_db()
        cursor = db.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT
                id,
                name,
                age,
                email,
                school_name,
                school_address,
                house_address,
                latitude,
                longitude
            FROM student
            WHERE id = %s
            """,
            (student_id,)
        )

        student = cursor.fetchone()

        if student is None:
            raise HTTPException(
                status_code=404,
                detail="Student not found"
            )

        return serialize_student(student)

    except Error as error:
        print("Student profile error:", error)
        raise HTTPException(
            status_code=500,
            detail="Unable to load student profile"
        )

    finally:
        if cursor is not None:
            cursor.close()

        if db is not None:
            db.close()
# =========================================
# STUDENT DAILY SCHOOL SELECTION
# =========================================

@app.put("/students/me/school-status")
def update_student_school_status(
    status: DailySchoolStatus,
    student_id: int = Depends(require_student)
):
    start_time = None
    end_time = None

    if status.has_school:
        if (
            not status.school_start_time
            or not status.school_end_time
        ):
            raise HTTPException(
                status_code=422,
                detail="School start and end times required"
            )

        start_time = validate_time(
            status.school_start_time
        )
        end_time = validate_time(
            status.school_end_time
        )

        if start_time >= end_time:
            raise HTTPException(
                status_code=422,
                detail="End time must be after start time"
            )

    db = None
    cursor = None

    try:
        db = get_db()
        cursor = db.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT id, school_date
            FROM student
            WHERE id = %s
            FOR UPDATE
            """,
            (student_id,)
        )

        student = cursor.fetchone()

        if student is None:
            raise HTTPException(
                status_code=404,
                detail="Student not found"
            )

        tomorrow = get_tomorrow()

        if student["school_date"] == tomorrow:
            raise HTTPException(
                status_code=409,
                detail="Tomorrow's schedule already submitted"
            )

        cursor.execute(
            """
            UPDATE student
            SET
                has_school = %s,
                school_date = %s,
                school_start_time = %s,
                school_end_time = %s
            WHERE id = %s
            """,
            (
                status.has_school,
                tomorrow,
                start_time,
                end_time,
                student_id
            )
        )

        db.commit()

        return {
            "message": "School schedule saved successfully",
            "school_date": tomorrow.isoformat(),
            "has_school": status.has_school,
            "school_start_time": (
                start_time.strftime("%H:%M")
                if start_time else None
            ),
            "school_end_time": (
                end_time.strftime("%H:%M")
                if end_time else None
            )
        }

    except HTTPException:
        if db is not None:
            db.rollback()
        raise

    except Error as error:
        if db is not None:
            db.rollback()

        print("Student schedule error:", error)
        raise HTTPException(
            status_code=500,
            detail="Unable to save school schedule"
        )

    finally:
        if cursor is not None:
            cursor.close()
        if db is not None and db.is_connected():
            db.close()


# =========================================
# DRIVER LOGIN
# =========================================

@app.post("/drivers/login")
def login_driver(login: LoginRequest):
    db = None
    cursor = None

    try:
        db = get_db()
        cursor = db.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT id, name, email, password_hash
            FROM driver
            WHERE email = %s
            """,
            (str(login.email).lower(),)
        )

        driver = cursor.fetchone()

        if (
            driver is None
            or not driver["password_hash"]
            or not pwd_context.verify(
                login.password,
                driver["password_hash"]
            )
        ):
            raise HTTPException(
                status_code=401,
                detail="Invalid email or password"
            )

        token = create_access_token(
            driver["id"],
            "driver"
        )

        return {
            "access_token": token,
            "token_type": "bearer",
            "driver": {
                "id": driver["id"],
                "name": driver["name"],
                "email": driver["email"]
            }
        }

    except Error as error:
        print("Driver login error:", error)
        raise HTTPException(
            status_code=500,
            detail="Unable to log in"
        )

    finally:
        if cursor is not None:
            cursor.close()
        if db is not None and db.is_connected():
            db.close()


# =========================================
# DRIVER PROFILE
# =========================================

@app.get("/drivers/me")
def get_driver_profile(
    driver_id: int = Depends(require_driver)
):
    db = None
    cursor = None

    try:
        db = get_db()
        cursor = db.cursor(dictionary=True)

        cursor.execute(
    """
    SELECT
        d.id,
        d.name,
        d.email,
        d.phone,
        d.vehicle_plate,
        d.latitude,
        d.longitude,
        d.location_updated_at,
        d.company_id,
        c.name AS company_name
    FROM driver d
    LEFT JOIN company c
        ON d.company_id = c.id
    WHERE d.id = %s
    """,
    (driver_id,)
)

        driver = cursor.fetchone()

        if driver is None:
            raise HTTPException(
                status_code=404,
                detail="Driver not found"
            )

        return serialize_driver(driver)

    except Error as error:
        print("Driver profile error:", error)
        raise HTTPException(
            status_code=500,
            detail="Unable to load driver profile"
        )

    finally:
        if cursor is not None:
            cursor.close()
        if db is not None and db.is_connected():
            db.close()


# =========================================
# DRIVER GPS LOCATION
# =========================================

@app.put("/drivers/me/location")
def update_driver_location(
    location: DriverLocation,
    driver_id: int = Depends(require_driver)
):
    db = None
    cursor = None

    try:
        db = get_db()
        cursor = db.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT id FROM driver WHERE id = %s
            """,
            (driver_id,)
        )

        if cursor.fetchone() is None:
            raise HTTPException(
                status_code=404,
                detail="Driver not found"
            )

        cursor.execute(
            """
            UPDATE driver
            SET
                latitude = %s,
                longitude = %s,
                location_updated_at = UTC_TIMESTAMP()
            WHERE id = %s
            """,
            (
                location.latitude,
                location.longitude,
                driver_id
            )
        )

        db.commit()

        cursor.execute(
            """
            SELECT latitude, longitude, location_updated_at
            FROM driver
            WHERE id = %s
            """,
            (driver_id,)
        )

        saved = cursor.fetchone()

        return {
            "message": "Driver starting location saved",
            "latitude": saved["latitude"],
            "longitude": saved["longitude"],
            "location_updated_at": (
                saved["location_updated_at"].isoformat()
                if saved["location_updated_at"]
                else None
            )
        }

    except HTTPException:
        if db is not None:
            db.rollback()
        raise

    except Error as error:
        if db is not None:
            db.rollback()

        print("Driver location error:", error)
        raise HTTPException(
            status_code=500,
            detail="Unable to save driver location"
        )

    finally:
        if cursor is not None:
            cursor.close()
        if db is not None and db.is_connected():
            db.close()


# =========================================
# DRIVER STUDENT LIST
# Development: all students, later assigned only
# =========================================


@app.get("/drivers/me/students")
def get_driver_students(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str = Query(default="", max_length=100),
    account=Depends(require_driver)
):
    db = None
    cursor = None

    try:
        db = get_db()
        cursor = db.cursor(dictionary=True)

        # ======================================
        # 1. GET AUTHENTICATED DRIVER ID
        # ======================================

        driver_id = (
            account["id"]
            if isinstance(account, dict)
            else account
        )

        # ======================================
        # 2. GET DRIVER'S COMPANY
        # ======================================

        cursor.execute(
            """
            SELECT
                d.id,
                d.company_id,
                c.name AS company_name
            FROM driver d
            LEFT JOIN company c
                ON c.id = d.company_id
            WHERE d.id = %s
            """,
            (driver_id,)
        )

        driver = cursor.fetchone()

        if driver is None:
            raise HTTPException(
                status_code=404,
                detail="Driver not found"
            )

        if driver["company_id"] is None:
            raise HTTPException(
                status_code=409,
                detail="Driver has no assigned company"
            )

        # ======================================
        # 3. GET STUDENTS + ACTIVE RECORDS
        # ======================================

        where_sql = """
            WHERE ts.company_id = %s
              AND r.created_at > NOW() - INTERVAL 24 HOUR
        """

        params = [driver["company_id"]]

        search = search.strip()

        if search:
            where_sql += """
                AND (
                    s.name LIKE %s
                    OR s.school_name LIKE %s
                )
            """

            pattern = f"%{search}%"
            params.extend([pattern, pattern])

        # ======================================
        # 4. COUNT MATCHING STUDENTS
        # ======================================

        cursor.execute(
            f"""
            SELECT COUNT(*) AS total
            FROM student s
            JOIN transportation_selection ts
                ON ts.student_id = s.id
            JOIN records r
                ON r.student_id = s.id
            {where_sql}
            """,
            tuple(params)
        )

        total = cursor.fetchone()["total"]

        offset = (page - 1) * page_size

        # ======================================
        # 5. RETRIEVE STUDENTS + RECORD DATA
        # ======================================

        cursor.execute(
            f"""
            SELECT
                s.id,
                s.name,
                s.age,
                s.school_name,
                s.school_address,
                s.house_address,
                s.latitude,
                s.longitude,

                r.id AS record_id,
                r.school_date,
                r.has_school,
                r.start_time,
                r.end_time,
                r.created_at

            FROM student s

            JOIN transportation_selection ts
                ON ts.student_id = s.id

            JOIN records r
                ON r.student_id = s.id

            {where_sql}

            ORDER BY
                r.start_time IS NULL,
                r.start_time ASC,
                s.name ASC

            LIMIT %s OFFSET %s
            """,
            tuple(params + [page_size, offset])
        )

        students = cursor.fetchall()

        # ======================================
        # 6. SERIALIZE SQL DATE/TIME VALUES
        # ======================================

        tomorrow = get_tomorrow()

        for student in students:
            school_date = student["school_date"]

            if school_date is not None:
                student["school_date"] = (
                    school_date.isoformat()
                )

            for field in ("start_time", "end_time"):
                value = student[field]

                if value is not None:
                    student[field] = str(value)

            created_at = student["created_at"]

            if created_at is not None:
                student["created_at"] = (
                    created_at.isoformat()
                )

            # Keep compatibility with your existing
            # DriverDashboard.js field names.
            student["school_start_time"] = student["start_time"]
            student["school_end_time"] = student["end_time"]

            student["confirmed_for_tomorrow"] = (
                student["school_date"] == tomorrow.isoformat()
            )

            student["included_tomorrow"] = (
                student["confirmed_for_tomorrow"]
                and bool(student["has_school"])
            )

        # ======================================
        # 7. RESPONSE
        # ======================================

        return {
            "driver_id": driver_id,
            "company_id": driver["company_id"],
            "company_name": driver["company_name"],
            "tomorrow": tomorrow.isoformat(),
            "students": students,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (
                (total + page_size - 1) // page_size
            )
        }

    except Error as error:
        print("Driver records retrieval error:", error)

        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve driver student records"
        )

    finally:
        if cursor is not None:
            cursor.close()

        if db is not None and db.is_connected():
            db.close()


# =========================================
# ADMIN LOGIN
# =========================================

@app.post("/admin/login")
def login_admin(login: LoginRequest):
    db = None
    cursor = None

    try:
        db = get_db()
        cursor = db.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT id, name, email, password_hash
            FROM admin
            WHERE email = %s
            """,
            (str(login.email).lower(),)
        )

        admin = cursor.fetchone()

        if (
            admin is None
            or not password_hasher.verify(
                login.password,
                admin["password_hash"]
            )
        ):
            raise HTTPException(
                status_code=401,
                detail="Invalid email or password"
            )

        token = create_access_token(
            admin["id"],
            "admin"
        )

        return {
            "access_token": token,
            "token_type": "bearer",
            "admin": {
                "id": admin["id"],
                "name": admin["name"],
                "email": admin["email"]
            }
        }

    except Error as error:
        print("Admin login error:", error)
        raise HTTPException(
            status_code=500,
            detail="Unable to log in"
        )

    finally:
        if cursor is not None:
            cursor.close()
        if db is not None and db.is_connected():
            db.close()


# =========================================
# ADMIN PROFILE
# =========================================

@app.get("/admin/me")
def get_admin_profile(
    admin_id: int = Depends(require_admin)
):
    db = None
    cursor = None

    try:
        db = get_db()
        cursor = db.cursor(dictionary=True)

        cursor.execute(
            """
            SELECT id, name, email
            FROM admin
            WHERE id = %s
            """,
            (admin_id,)
        )

        admin = cursor.fetchone()

        if admin is None:
            raise HTTPException(
                status_code=404,
                detail="Admin not found"
            )

        return admin

    except Error as error:
        print("Admin profile error:", error)
        raise HTTPException(
            status_code=500,
            detail="Unable to load admin profile"
        )

    finally:
        if cursor is not None:
            cursor.close()
        if db is not None and db.is_connected():
            db.close()


# =========================================
# ADMIN DASHBOARD STATISTICS
# =========================================

@app.get("/admin/stats")
def get_admin_stats(
    admin_id: int = Depends(require_admin)
):
    db = None
    cursor = None

    try:
        db = get_db()
        cursor = db.cursor(dictionary=True)

        cursor.execute(
            "SELECT COUNT(*) AS total FROM student"
        )
        total_students = cursor.fetchone()["total"]

        cursor.execute(
            "SELECT COUNT(*) AS total FROM driver"
        )
        total_drivers = cursor.fetchone()["total"]

        tomorrow = get_tomorrow()

        cursor.execute(
            """
            SELECT COUNT(*) AS total
            FROM student
            WHERE has_school = TRUE
            AND school_date = %s
            """,
            (tomorrow,)
        )

        students_tomorrow = cursor.fetchone()["total"]

        return {
            "total_students": total_students,
            "total_drivers": total_drivers,
            "students_tomorrow": students_tomorrow,
            "tomorrow": tomorrow.isoformat()
        }

    except Error as error:
        print("Admin stats error:", error)
        raise HTTPException(
            status_code=500,
            detail="Unable to load statistics"
        )

    finally:
        if cursor is not None:
            cursor.close()
        if db is not None and db.is_connected():
            db.close()


# =========================================
# ADMIN VIEW STUDENTS
# =========================================

@app.get("/admin/students")
def admin_get_students(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str = Query(default="", max_length=100),
    admin_id: int = Depends(require_admin)
):
    db = None
    cursor = None

    try:
        db = get_db()
        cursor = db.cursor(dictionary=True)

        search = search.strip()
        where_sql = ""
        params = []

        if search:
            where_sql = """
                WHERE name LIKE %s
                OR school_name LIKE %s
                OR email LIKE %s
            """

            pattern = f"%{search}%"
            params = [pattern, pattern, pattern]

        cursor.execute(
            f"""
            SELECT COUNT(*) AS total
            FROM student
            {where_sql}
            """,
            tuple(params)
        )

        total = cursor.fetchone()["total"]
        offset = (page - 1) * page_size

        cursor.execute(
            f"""
            SELECT
                id, name, age, email,
                school_name, school_address,
                house_address, latitude, longitude,
                has_school, school_date,
                school_start_time, school_end_time
            FROM student
            {where_sql}
            ORDER BY id DESC
            LIMIT %s OFFSET %s
            """,
            tuple(params + [page_size, offset])
        )

        students = cursor.fetchall()
        tomorrow = get_tomorrow().isoformat()

        for student in students:
            serialize_student(student)

            student["confirmed_for_tomorrow"] = (
                student["school_date"] == tomorrow
            )

            student["included_tomorrow"] = (
                student["confirmed_for_tomorrow"]
                and student["has_school"]
            )

        return {
            "students": students,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (
                (total + page_size - 1) // page_size
            )
        }

    except Error as error:
        print("Admin students error:", error)
        raise HTTPException(
            status_code=500,
            detail="Unable to load students"
        )

    finally:
        if cursor is not None:
            cursor.close()
        if db is not None and db.is_connected():
            db.close()


# =========================================
# ADMIN VIEW DRIVERS
# =========================================

@app.get("/admin/drivers")
def admin_get_drivers(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str = Query(default="", max_length=100),
    admin_id: int = Depends(require_admin)
):
    db = None
    cursor = None

    try:
        db = get_db()
        cursor = db.cursor(dictionary=True)

        search = search.strip()
        where_sql = ""
        params = []

        if search:
            where_sql = """
                WHERE name LIKE %s
                OR email LIKE %s
                OR vehicle_plate LIKE %s
            """

            pattern = f"%{search}%"
            params = [pattern, pattern, pattern]

        cursor.execute(
            f"""
            SELECT COUNT(*) AS total
            FROM driver
            {where_sql}
            """,
            tuple(params)
        )

        total = cursor.fetchone()["total"]
        offset = (page - 1) * page_size

        cursor.execute(
            f"""
            SELECT
                id, name, email, phone,
                vehicle_plate, latitude, longitude,
                location_updated_at, created_at
            FROM driver
            {where_sql}
            ORDER BY id DESC
            LIMIT %s OFFSET %s
            """,
            tuple(params + [page_size, offset])
        )

        drivers = cursor.fetchall()

        for driver in drivers:
            serialize_driver(driver)

            if driver.get("created_at"):
                driver["created_at"] = (
                    driver["created_at"].isoformat()
                )

        return {
            "drivers": drivers,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (
                (total + page_size - 1) // page_size
            )
        }

    except Error as error:
        print("Admin drivers error:", error)
        raise HTTPException(
            status_code=500,
            detail="Unable to load drivers"
        )

    finally:
        if cursor is not None:
            cursor.close()
        if db is not None and db.is_connected():
            db.close()


# =========================================
# ADMIN REGISTER NEW DRIVER
# =========================================

@app.post("/admin/drivers", status_code=201)
def admin_register_driver(
    driver: DriverRegister,
    admin_id: int = Depends(require_admin)
):
    db = None
    cursor = None

    try:
        db = get_db()
        cursor = db.cursor(dictionary=True)

        # Verify the selected company exists.
        cursor.execute(
            """
            SELECT id, name
            FROM company
            WHERE id = %s
            """,
            (driver.company_id,)
        )

        company = cursor.fetchone()

        if company is None:
            raise HTTPException(
                status_code=404,
                detail="Selected company does not exist"
            )

        # Hash the driver's password.
        hashed_password = password_hasher.hash(
            driver.password
        )

        # Insert driver with their assigned company.
        cursor.execute(
            """
            INSERT INTO driver (
                name,
                email,
                password_hash,
                phone,
                vehicle_plate,
                company_id
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                driver.name.strip(),
                str(driver.email).lower(),
                hashed_password,
                driver.phone or None,
                driver.vehicle_plate or None,
                company["id"]
            )
        )

        driver_id = cursor.lastrowid
        db.commit()

        return {
            "message": "Driver registered successfully",
            "driver_id": driver_id,
            "company_id": company["id"],
            "company_name": company["name"]
        }

    except HTTPException:
        if db is not None:
            db.rollback()
        raise

    except IntegrityError:
        if db is not None:
            db.rollback()

        raise HTTPException(
            status_code=409,
            detail="Driver email already registered"
        )

    except Error as error:
        if db is not None:
            db.rollback()

        print("Driver registration error:", error)

        raise HTTPException(
            status_code=500,
            detail="Unable to register driver"
        )

    finally:
        if cursor is not None:
            cursor.close()

        if db is not None and db.is_connected():
            db.close()


@app.get("/admin/companies")
def get_admin_companies(
    admin=Depends(require_admin)
):
    db = None
    cursor = None

    try:
        db = get_db()
        cursor = db.cursor(dictionary=True)

        cursor.execute("""
            SELECT id, name, company_code
            FROM company
            ORDER BY name
        """)

        return {
            "companies": cursor.fetchall()
        }

    except Error as error:
        print("Company retrieval error:", error)

        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve companies"
        )

    finally:
        if cursor is not None:
            cursor.close()

        if db is not None and db.is_connected():
            db.close()




register_transport_routes(
    app,
    get_db,
    require_student,
    get_tomorrow
)


from record_cleanup import (
    start_record_cleanup,
    delete_expired_records
)



register_ors_routes(
    app,
    get_db,
    require_driver,
    get_tomorrow
)