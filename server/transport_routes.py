
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from mysql.connector import Error


# ======================================
# REQUEST MODEL
# Python 3.9 compatible
# ======================================

class TransportationRequest(BaseModel):
    company_id: int = Field(gt=0)
    has_school: bool

    school_start_time: Optional[str] = None
    school_end_time: Optional[str] = None


# ======================================
# HELPER FUNCTIONS
# ======================================

def get_student_id(account):
    if isinstance(account, dict):
        return int(account["id"])

    return int(account)


def format_time(value):
    if value is None:
        return None

    return str(value)[:5]


def parse_time(value):
    try:
        return datetime.strptime(
            value,
            "%H:%M"
        ).time()
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=400,
            detail="Time must use HH:MM format"
        )


# ======================================
# REGISTER ROUTES
# ======================================

def register_transport_routes(
    app,
    get_db,
    require_student,
    get_tomorrow
):
    router = APIRouter()

    # ======================================
    # GET ALL COMPANIES
    # ======================================

    @router.get("/companies")
    def get_companies(
        account=Depends(require_student)
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
                    company_code
                FROM company
                ORDER BY name
                """
            )

            return {
                "companies": cursor.fetchall()
            }

        except Error as error:
            print("Get companies error:", error)

            raise HTTPException(
                status_code=500,
                detail="Unable to load companies"
            )

        finally:
            if cursor is not None:
                cursor.close()

            if db is not None and db.is_connected():
                db.close()

    # ======================================
    # GET STUDENT'S TRANSPORTATION
    # ======================================

    @router.get("/students/me/transportation")
    def get_student_transportation(
        account=Depends(require_student)
    ):
        student_id = get_student_id(account)
        tomorrow = get_tomorrow()

        db = None
        cursor = None

        try:
            db = get_db()
            cursor = db.cursor(dictionary=True)

            cursor.execute(
                """
                SELECT
                    s.id AS student_id,

                    ts.company_id,
                    c.name AS company_name,

                    r.id AS record_id,
                    r.school_date,
                    r.has_school,
                    r.start_time,
                    r.end_time

                FROM student s

                LEFT JOIN transportation_selection ts
                    ON ts.student_id = s.id

                LEFT JOIN company c
                    ON c.id = ts.company_id

                LEFT JOIN records r
                    ON r.student_id = s.id
                    AND r.school_date = %s

                WHERE s.id = %s
                """,
                (tomorrow, student_id)
            )

            result = cursor.fetchone()

            if result is None:
                raise HTTPException(
                    status_code=404,
                    detail="Student not found"
                )

            submitted = result["record_id"] is not None

            return {
                "student_id": student_id,
                "company_id": result["company_id"],
                "company_name": result["company_name"],

                "tomorrow": tomorrow.isoformat(),
                "school_date": tomorrow.isoformat(),

                "submitted_for_tomorrow": submitted,

                "has_school": (
                    bool(result["has_school"])
                    if submitted
                    else None
                ),

                "school_start_time": (
                    format_time(result["start_time"])
                    if submitted
                    else None
                ),

                "school_end_time": (
                    format_time(result["end_time"])
                    if submitted
                    else None
                )
            }

        except Error as error:
            print("Get transportation error:", error)

            raise HTTPException(
                status_code=500,
                detail="Unable to load transportation information"
            )

        finally:
            if cursor is not None:
                cursor.close()

            if db is not None and db.is_connected():
                db.close()

    # ======================================
    # SAVE TRANSPORTATION AND DAILY RECORD
    # ======================================

    @router.put("/students/me/transportation")
    def save_student_transportation(
        data: TransportationRequest,
        account=Depends(require_student)
    ):
        student_id = get_student_id(account)
        tomorrow = get_tomorrow()

        # ----------------------------------
        # VALIDATE SCHOOL TIMES
        # ----------------------------------

        start_time = None
        end_time = None

        if data.has_school:

            if (
                not data.school_start_time
                or not data.school_end_time
            ):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Start and end times are required "
                        "when the student has school"
                    )
                )

            start_time = parse_time(
                data.school_start_time
            )

            end_time = parse_time(
                data.school_end_time
            )

            if start_time >= end_time:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "End time must be after start time"
                    )
                )

        db = None
        cursor = None

        try:
            db = get_db()
            cursor = db.cursor(dictionary=True)

            # ----------------------------------
            # 1. LOCK THIS STUDENT'S ROW
            # Prevent simultaneous submissions.
            # ----------------------------------

            cursor.execute(
                """
                SELECT id
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

            # ----------------------------------
            # 2. CHECK IF ALREADY SUBMITTED
            # ----------------------------------

            cursor.execute(
                """
                SELECT id
                FROM records
                WHERE student_id = %s
                  AND school_date = %s
                """,
                (student_id, tomorrow)
            )

            existing_record = cursor.fetchone()

            if existing_record is not None:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "You already submitted tomorrow's "
                        "school schedule"
                    )
                )

            # ----------------------------------
            # 3. VALIDATE COMPANY
            # ----------------------------------

            cursor.execute(
                """
                SELECT id, name
                FROM company
                WHERE id = %s
                """,
                (data.company_id,)
            )

            company = cursor.fetchone()

            if company is None:
                raise HTTPException(
                    status_code=404,
                    detail="Transportation company not found"
                )

            # ----------------------------------
            # 4. SAVE STUDENT'S COMPANY
            # ----------------------------------

            cursor.execute(
                """
                INSERT INTO transportation_selection (
                    student_id,
                    company_id
                )
                VALUES (%s, %s)

                ON DUPLICATE KEY UPDATE
                    company_id = VALUES(company_id),
                    selected_at = CURRENT_TIMESTAMP
                """,
                (
                    student_id,
                    data.company_id
                )
            )

            # ----------------------------------
            # 5. INSERT INTO RECORDS TABLE
            # DO NOT UPDATE STUDENT TABLE
            # ----------------------------------

            cursor.execute(
                """
                INSERT INTO records (
                    student_id,
                    school_date,
                    has_school,
                    start_time,
                    end_time
                )
                VALUES (%s, %s, %s, %s, %s)
                """,
                (
                    student_id,
                    tomorrow,
                    data.has_school,
                    start_time,
                    end_time
                )
            )

            record_id = cursor.lastrowid

            # ----------------------------------
            # 6. COMMIT BOTH OPERATIONS
            # ----------------------------------

            db.commit()

            return {
                "message": (
                    "Transportation selection saved"
                ),

                "record_id": record_id,
                "student_id": student_id,

                "company_id": company["id"],
                "company_name": company["name"],

                "school_date": tomorrow.isoformat(),
                "submitted_for_tomorrow": True,

                "has_school": data.has_school,

                "school_start_time": (
                    start_time.strftime("%H:%M")
                    if start_time is not None
                    else None
                ),

                "school_end_time": (
                    end_time.strftime("%H:%M")
                    if end_time is not None
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

            print("Save transportation error:", error)

            raise HTTPException(
                status_code=500,
                detail="Unable to save transportation record"
            )

        finally:
            if cursor is not None:
                cursor.close()

            if db is not None and db.is_connected():
                db.close()

    app.include_router(router)
