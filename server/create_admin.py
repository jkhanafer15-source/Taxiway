
from getpass import getpass

import mysql.connector
from mysql.connector import IntegrityError
from pwdlib import PasswordHash

from main import get_db


password_hasher = PasswordHash.recommended()


def create_admin():
    print("=== Taxiway Admin Setup ===")

    name = input("Admin name: ").strip()
    email = input("Admin email: ").strip().lower()

    password = getpass("Admin password: ")
    confirm = getpass("Confirm password: ")

    if not name or not email:
        print("Name and email are required.")
        return

    if len(password) < 12:
        print("Admin password must be at least 12 characters.")
        return

    if password != confirm:
        print("Passwords do not match.")
        return

    db = None
    cursor = None

    try:
        db = get_db()
        cursor = db.cursor()

        # Restrict this local setup script to the first admin.
        cursor.execute("SELECT COUNT(*) FROM admin")
        total = cursor.fetchone()[0]

        if total > 0:
            print("An administrator already exists.")
            return

        hashed_password = password_hasher.hash(password)

        cursor.execute(
            """
            INSERT INTO admin (
                name, email, password_hash
            )
            VALUES (%s, %s, %s)
            """,
            (name, email, hashed_password)
        )

        db.commit()
        print("Admin account created successfully!")

    except IntegrityError:
        if db is not None:
            db.rollback()
        print("Email already registered.")

    except mysql.connector.Error as error:
        if db is not None:
            db.rollback()
        print("Database error:", error)

    finally:
        if cursor is not None:
            cursor.close()
        if db is not None and db.is_connected():
            db.close()


if __name__ == "__main__":
    create_admin()
