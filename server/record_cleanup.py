from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

from mysql.connector import Error


def delete_expired_records(get_db):
    """
    Delete each record after it has existed
    for at least 24 hours.
    """

    db = None
    cursor = None

    try:
        db = get_db()
        cursor = db.cursor()

        cursor.execute(
            """
            DELETE FROM records
            WHERE created_at <= NOW() - INTERVAL 24 HOUR
            """
        )

        deleted_count = cursor.rowcount

        db.commit()

        print(
            f"[Records Cleanup] Deleted "
            f"{deleted_count} expired records."
        )

    except Error as error:
        if db is not None:
            db.rollback()

        print("[Records Cleanup] Error:", error)

    finally:
        if cursor is not None:
            cursor.close()

        if db is not None and db.is_connected():
            db.close()


def start_record_cleanup(get_db):
    scheduler = BackgroundScheduler()

    # Check for expired records every minute.
    scheduler.add_job(
        delete_expired_records,
        trigger=IntervalTrigger(minutes=1),
        args=[get_db],
        id="record_cleanup",
        replace_existing=True,
        max_instances=1,
        coalesce=True
    )

    scheduler.start()

    return scheduler