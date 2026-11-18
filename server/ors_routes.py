import os
import math
import requests

from pathlib import Path
from dotenv import load_dotenv

from fastapi import (
    APIRouter,
    Depends,
    HTTPException
)

from mysql.connector import Error


# ============================================
# ENVIRONMENT VARIABLES
# ============================================

BASE_DIR = Path(__file__).resolve().parent

load_dotenv(
    dotenv_path=BASE_DIR / ".env"
)

ORS_MATRIX_URL = (
    "https://api.heigit.org/"
    "openrouteservice/v2/matrix/driving-car"
)

# Small limit for initial testing.
MAX_STUDENTS = 10


# ============================================
# 1. VALIDATE GPS COORDINATES
# ============================================

def valid_gps(latitude, longitude):

    try:
        if latitude is None or longitude is None:
            return False

        lat = float(latitude)
        lng = float(longitude)

        return (
            math.isfinite(lat)
            and math.isfinite(lng)
            and -90 <= lat <= 90
            and -180 <= lng <= 180
        )

    except (TypeError, ValueError):
        return False


# ============================================
# 2. FORMAT SCHOOL TIMES
# ============================================

def format_time(value):

    if value is None:
        return None

    return str(value)[:5]


# ============================================
# 3. CALL OPENROUTESERVICE MATRIX API
# ============================================

def get_distance_matrix(driver, students):

    api_key = os.getenv("ORS_API_KEY", "").strip()

    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="ORS_API_KEY is missing from .env"
        )

    # OpenRouteService coordinates must be:
    # [longitude, latitude]
    #
    # Index 0 = Driver
    # Index 1 = Student 1
    # Index 2 = Student 2
    # ...

    locations = [
        [
            float(driver["longitude"]),
            float(driver["latitude"])
        ]
    ]

    for student in students:

        locations.append([
            float(student["longitude"]),
            float(student["latitude"])
        ])

    # No sources/destinations filters:
    # Calculate every location to every location.
    #
    # Driver -> Students
    # Student 1 -> Student 2
    # Student 2 -> Student 3
    # ...

    payload = {
        "locations": locations,
        "metrics": [
            "distance",
            "duration"
        ],
        "units": "m"
    }

    try:

        response = requests.post(
            ORS_MATRIX_URL,
            headers={
                "Authorization": api_key,
                "Content-Type": "application/json"
            },
            json=payload,
            timeout=40
        )

        if not response.ok:

            # Log only the status and error body,
            # never the API key.
            print(
                "[ORS] HTTP status:",
                response.status_code
            )

            print(
                "[ORS] Error response:",
                response.text[:800]
            )

            if response.status_code == 429:

                raise HTTPException(
                    status_code=429,
                    detail=(
                        "OpenRouteService request limit "
                        "reached. Please try again later."
                    )
                )

            if response.status_code in (401, 403):

                raise HTTPException(
                    status_code=502,
                    detail=(
                        "OpenRouteService rejected the "
                        "API request. Check your API "
                        "key and usage limits."
                    )
                )

            raise HTTPException(
                status_code=502,
                detail=(
                    "OpenRouteService request failed "
                    "with HTTP status "
                    + str(response.status_code)
                )
            )

        data = response.json()

    except HTTPException:
        raise

    except requests.RequestException as error:

        print("[ORS] Connection error:", error)

        raise HTTPException(
            status_code=502,
            detail=(
                "Unable to connect to "
                "OpenRouteService"
            )
        )

    except ValueError:

        raise HTTPException(
            status_code=502,
            detail="Invalid JSON response from ORS"
        )

    distances = data.get("distances")
    durations = data.get("durations")

    expected_size = len(locations)

    # Validate the full N x N matrix.

    if (
        not isinstance(distances, list)
        or not isinstance(durations, list)
        or len(distances) != expected_size
        or len(durations) != expected_size
        or any(
            not isinstance(row, list)
            or len(row) != expected_size
            for row in distances + durations
        )
    ):

        raise HTTPException(
            status_code=502,
            detail=(
                "Unexpected distance matrix "
                "returned from OpenRouteService"
            )
        )

    return distances, durations


# ============================================
# 4. RANK STUDENTS FROM DRIVER LOCATION
# ============================================

def rank_students(
    students,
    distances,
    durations
):

    ranking = []
    unreachable = []

    # Matrix index 0 is the driver.

    for index, student in enumerate(students):

        matrix_index = index + 1

        distance = distances[0][matrix_index]
        duration = durations[0][matrix_index]

        if distance is None or duration is None:

            unreachable.append({
                "student_id": student["id"],
                "name": student["name"],
                "reason": (
                    "No driving route available "
                    "from driver location"
                )
            })

            continue

        ranking.append({
            "student_id": student["id"],
            "name": student["name"],

            "school_name": student["school_name"],
            "house_address": student["house_address"],

            "latitude": float(
                student["latitude"]
            ),

            "longitude": float(
                student["longitude"]
            ),

            "start_time": format_time(
                student["start_time"]
            ),

            "end_time": format_time(
                student["end_time"]
            ),

            "distance_meters": distance,

            "distance_km": round(
                distance / 1000, 2
            ),

            "duration_minutes": round(
                duration / 60, 1
            )
        })

    # Sort by actual distance in meters
    # to avoid rounding differences.

    ranking.sort(
        key=lambda item: (
            item["distance_meters"],
            item["student_id"]
        )
    )

    for index, student in enumerate(ranking):

        student["rank"] = index + 1

    return ranking, unreachable


# ============================================
# 5. NEAREST NEIGHBOR PICKUP SCHEDULE
# ============================================

def build_pickup_schedule(
    students,
    distances,
    durations
):

    # The driver starts at index 0.

    current_index = 0

    # Students are at indices 1 to N.

    unvisited = set(
        range(1, len(students) + 1)
    )

    stops = []

    total_distance = 0
    total_duration = 0

    while unvisited:

        candidates = []

        # Check distance from current location
        # to every unvisited student.

        for next_index in unvisited:

            distance = distances[
                current_index
            ][next_index]

            duration = durations[
                current_index
            ][next_index]

            if distance is None or duration is None:
                continue

            candidates.append(
                (
                    distance,
                    duration,
                    next_index
                )
            )

        if not candidates:

            # No reachable remaining students.
            break

        # The nearest remaining student wins.
        # Tie-break using duration and index.

        distance, duration, next_index = min(
            candidates
        )

        student = students[next_index - 1]

        if current_index == 0:

            from_location = "Driver"

        else:

            from_location = students[
                current_index - 1
            ]["name"]

        total_distance += distance
        total_duration += duration

        stops.append({
            "stop": len(stops) + 1,

            "from": from_location,
            "to": student["name"],

            "student_id": student["id"],

            "distance_km": round(
                distance / 1000, 2
            ),

            "duration_minutes": round(
                duration / 60, 1
            ),

            "total_distance_km": round(
                total_distance / 1000, 2
            ),

            "total_duration_minutes": round(
                total_duration / 60, 1
            ),

            "start_time": format_time(
                student["start_time"]
            ),

            "end_time": format_time(
                student["end_time"]
            )
        })

        # Now the driver's current location
        # becomes the selected student's location.

        current_index = next_index

        # Remove selected student from the list.

        unvisited.remove(next_index)

    not_scheduled = []

    for index in sorted(unvisited):

        student = students[index - 1]

        not_scheduled.append({
            "student_id": student["id"],
            "name": student["name"],
            "reason": "No reachable driving route"
        })

    return {
        "stops": stops,

        "total_distance_km": round(
            total_distance / 1000, 2
        ),

        "total_duration_minutes": round(
            total_duration / 60, 1
        ),

        "not_scheduled": not_scheduled
    }


# ============================================
# 6. REGISTER FASTAPI ROUTES
# ============================================

def register_ors_routes(
    app,
    get_db,
    require_driver,
    get_tomorrow
):

    router = APIRouter()

    # ========================================
    # GET /drivers/me/distances
    # ========================================

    @router.get("/drivers/me/distances")
    def get_driver_distances(
        account=Depends(require_driver)
    ):

        # ====================================
        # GET DRIVER ID FROM JWT
        # ====================================

        driver_id = (
            account["id"]
            if isinstance(account, dict)
            else account
        )

        tomorrow = get_tomorrow()

        db = None
        cursor = None

        # ====================================
        # 1. RETRIEVE DRIVER AND STUDENTS
        # ====================================

        try:

            db = get_db()

            cursor = db.cursor(
                dictionary=True
            )

            # --------------------------------
            # GET DRIVER
            # --------------------------------

            cursor.execute(
                """
                SELECT
                    d.id,
                    d.name,
                    d.company_id,
                    d.latitude,
                    d.longitude,
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
                    detail=(
                        "Admin has not assigned "
                        "a company to this driver"
                    )
                )

            if not valid_gps(
                driver["latitude"],
                driver["longitude"]
            ):

                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Driver GPS is missing. "
                        "Click Update My GPS Location first."
                    )
                )

            # --------------------------------
            # GET ELIGIBLE STUDENTS
            # --------------------------------
            #
            # Students must:
            # - Select the same company
            # - Have school tomorrow
            # - Have an active record (<24 hours)
            #
            # Records with has_school=0
            # are excluded from pickup analysis.

            cursor.execute(
                """
                SELECT
                    s.id,
                    s.name,
                    s.school_name,
                    s.house_address,
                    s.latitude,
                    s.longitude,

                    r.start_time,
                    r.end_time

                FROM student s

                JOIN transportation_selection ts
                    ON ts.student_id = s.id

                JOIN records r
                    ON r.student_id = s.id

                WHERE ts.company_id = %s
                  AND r.school_date = %s
                  AND r.has_school = 1
                  AND r.created_at >
                      NOW() - INTERVAL 24 HOUR

                ORDER BY s.id
                """,
                (
                    driver["company_id"],
                    tomorrow
                )
            )

            students = cursor.fetchall()

        except Error as error:

            print(
                "[ORS] Database error:",
                error
            )

            raise HTTPException(
                status_code=500,
                detail="Unable to retrieve driver students"
            )

        finally:

            if cursor is not None:
                cursor.close()

            if db is not None:
                db.close()

        # ====================================
        # 2. VALIDATE STUDENT GPS
        # ====================================

        valid_students = []
        skipped_students = []

        for student in students:

            if valid_gps(
                student["latitude"],
                student["longitude"]
            ):

                valid_students.append(student)

            else:

                skipped_students.append({
                    "student_id": student["id"],
                    "name": student["name"],
                    "reason": "Missing or invalid GPS"
                })

        # ====================================
        # 3. CHECK TEST LIMIT
        # ====================================

        if len(valid_students) > MAX_STUDENTS:

            raise HTTPException(
                status_code=400,
                detail=(
                    "Maximum 10 students allowed "
                    "for this initial route test"
                )
            )

        # ====================================
        # 4. HANDLE EMPTY STUDENT LIST
        # ====================================

        if not valid_students:

            return {
                "driver_id": driver["id"],
                "driver_name": driver["name"],

                "company_id": driver["company_id"],
                "company_name": driver["company_name"],

                "school_date": str(tomorrow),

                "driver_location": {
                    "latitude": float(
                        driver["latitude"]
                    ),
                    "longitude": float(
                        driver["longitude"]
                    )
                },

                "ranking": [],
                "students": [],

                "nearest": None,
                "farthest": None,

                "total": 0,

                "pickup_schedule": {
                    "stops": [],
                    "total_distance_km": 0,
                    "total_duration_minutes": 0,
                    "not_scheduled": []
                },

                "skipped_students": skipped_students,
                "unreachable": skipped_students
            }

        # ====================================
        # 5. CALL OPENROUTESERVICE
        # ====================================

        distances, durations = get_distance_matrix(
            driver,
            valid_students
        )

        # ====================================
        # 6. RANK STUDENTS BY DISTANCE
        # ====================================

        ranking, unreachable = rank_students(
            valid_students,
            distances,
            durations
        )

        # ====================================
        # 7. CREATE PICKUP SCHEDULE
        # ====================================
        #
        # Only students reachable from driver
        # are used as starting candidates.

        reachable_ids = {
            item["student_id"]
            for item in ranking
        }

        reachable_students = [
            student
            for student in valid_students
            if student["id"] in reachable_ids
        ]

        # Build index positions based on
        # original matrix ordering.

        original_indices = [0]

        for index, student in enumerate(
            valid_students,
            start=1
        ):

            if student["id"] in reachable_ids:
                original_indices.append(index)

        # Keep original ORS matrix values,
        # but select only reachable students.

        filtered_distances = [
            [
                distances[i][j]
                for j in original_indices
            ]
            for i in original_indices
        ]

        filtered_durations = [
            [
                durations[i][j]
                for j in original_indices
            ]
            for i in original_indices
        ]

        schedule = build_pickup_schedule(
            reachable_students,
            filtered_distances,
            filtered_durations
        )

        # ====================================
        # 8. FINAL API RESPONSE
        # ====================================

        return {
            "driver_id": driver["id"],
            "driver_name": driver["name"],

            "company_id": driver["company_id"],
            "company_name": driver["company_name"],

            "school_date": str(tomorrow),

            "driver_location": {
                "latitude": float(
                    driver["latitude"]
                ),

                "longitude": float(
                    driver["longitude"]
                )
            },

            # Initial distance ranking
            # from driver to every student.

            "ranking": ranking,

            # Keep compatibility with
            # older dashboard versions.

            "students": ranking,

            "nearest": (
                ranking[0]
                if ranking
                else None
            ),

            "farthest": (
                ranking[-1]
                if ranking
                else None
            ),

            "total": len(ranking),

            # Sequential driver pickup schedule.

            "pickup_schedule": schedule,

            # Missing GPS + unavailable routes.

            "skipped_students": skipped_students,

            "unreachable": (
                unreachable + skipped_students
            )
        }

    # Register the router on FastAPI.

    app.include_router(router)
