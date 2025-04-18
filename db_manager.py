#!/usr/bin/env python
# db_manager.py
import argparse
import os
import sys
import logging
import subprocess
import time
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Get the current directory and project root
current_dir = Path(__file__).resolve().parent
data_dir = current_dir / "data"


def check_requirements():
    """Check if required packages are installed"""
    try:
        import pandas
        import aiosqlite
        return True
    except ImportError as e:
        logger.error(f"Missing required package: {e}")
        logger.info("Please install required packages: pip install pandas aiosqlite")
        return False


def export_db():
    """Export database schema and data from PostgreSQL to files"""
    if not check_requirements():
        return False

    os.makedirs(data_dir, exist_ok=True)

    schema_file = data_dir / "taitur_data_schema.sql"
    data_file = data_dir / "taitur_data.sql"

    logger.info("Exporting database schema and data...")
    start_time = time.time()

    result = subprocess.run([
        sys.executable, "-m", "app.utils.db_exporter", "export",
        "--schema-file", str(schema_file),
        "--data-file", str(data_file),
        "--table", "taitur_data",
        "--format", "sql"
    ], capture_output=True, text=True)

    if result.returncode != 0:
        logger.error(f"Export failed: {result.stderr}")
        return False

    elapsed = time.time() - start_time
    logger.info(f"Export completed in {elapsed:.2f} seconds")
    logger.info(f"Schema exported to: {schema_file}")
    logger.info(f"Data exported to: {data_file}")
    return True


def import_db():
    """Import database schema and data to SQLite"""
    if not check_requirements():
        return False

    schema_file = data_dir / "taitur_data_schema.sql"
    data_file = data_dir / "taitur_data.sql"
    sqlite_db = data_dir / "local_data.db"

    if not schema_file.exists() or not data_file.exists():
        logger.error("Schema or data file not found. Run export first.")
        return False

    logger.info("Importing database schema and data to SQLite...")
    start_time = time.time()

    result = subprocess.run([
        sys.executable, "-m", "app.utils.db_exporter", "import",
        "--schema-file", str(schema_file),
        "--data-file", str(data_file),
        "--sqlite-db", str(sqlite_db),
        "--table", "taitur_data"
    ], capture_output=True, text=True)

    if result.returncode != 0:
        logger.error(f"Import failed: {result.stderr}")
        return False

    elapsed = time.time() - start_time
    logger.info(f"Import completed in {elapsed:.2f} seconds")
    logger.info(f"Data imported to SQLite database: {sqlite_db}")
    return True


def start_app_with_local_db():
    """Start the application using the local SQLite database"""
    env = os.environ.copy()
    env["USE_LOCAL_DB"] = "true"

    # Check if local DB exists
    local_db = data_dir / "local_data.db"
    if not local_db.exists():
        logger.warning("Local database file not found. Run import first.")
        if input("Do you want to run the import now? (y/n): ").lower() == 'y':
            if not import_db():
                return False
        else:
            return False

    logger.info("Starting application with local SQLite database...")
    try:
        subprocess.run([
            sys.executable, "startup.py"
        ], env=env)
        return True
    except Exception as e:
        logger.error(f"Error starting app: {e}")
        return False


def start_app_with_remote_db():
    """Start the application using the remote PostgreSQL database"""
    env = os.environ.copy()
    env["USE_LOCAL_DB"] = "false"

    logger.info("Starting application with remote PostgreSQL database...")
    try:
        subprocess.run([
            sys.executable, "startup.py"
        ], env=env)
        return True
    except Exception as e:
        logger.error(f"Error starting app: {e}")
        return False


def show_db_info():
    """Show information about the available databases"""
    local_db = data_dir / "local_data.db"
    schema_file = data_dir / "taitur_data_schema.sql"
    data_file = data_dir / "taitur_data.sql"

    print("\n=== Database Information ===")
    print(f"PostgreSQL Database: {settings.POSTGRES_USER}@{settings.POSTGRES_HOST}/{settings.POSTGRES_DB}")

    if local_db.exists():
        size_mb = local_db.stat().st_size / (1024 * 1024)
        print(f"Local SQLite Database: {local_db} ({size_mb:.2f} MB)")

        # Get row count from SQLite
        try:
            import sqlite3
            conn = sqlite3.connect(str(local_db))
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM taitur_data")
            row_count = cursor.fetchone()[0]
            cursor.close()
            conn.close()
            print(f"  - Rows in taitur_data: {row_count:,}")
        except Exception as e:
            print(f"  - Error getting row count: {e}")
    else:
        print(f"Local SQLite Database: Not found")

    if schema_file.exists():
        print(f"Schema SQL file: {schema_file} ({schema_file.stat().st_size / 1024:.2f} KB)")
    else:
        print(f"Schema SQL file: Not found")

    if data_file.exists():
        size_mb = data_file.stat().st_size / (1024 * 1024)
        print(f"Data SQL file: {data_file} ({size_mb:.2f} MB)")
    else:
        print(f"Data SQL file: Not found")

    print("\nCommands:")
    print("  - Export: python db_manager.py export")
    print("  - Import: python db_manager.py import")
    print("  - Start with local DB: python db_manager.py start --local")
    print("  - Start with remote DB: python db_manager.py start")

    return True


def main():
    """Main entry point for the DB manager"""
    parser = argparse.ArgumentParser(description="Manage database operations")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # Export command
    export_parser = subparsers.add_parser("export", help="Export database from PostgreSQL")

    # Import command
    import_parser = subparsers.add_parser("import", help="Import database to SQLite")

    # Start command
    start_parser = subparsers.add_parser("start", help="Start application with specified database")
    start_parser.add_argument("--local", action="store_true", help="Use local SQLite database")

    # Info command
    info_parser = subparsers.add_parser("info", help="Show database information")

    args = parser.parse_args()

    if args.command == "export":
        export_db()
    elif args.command == "import":
        import_db()
    elif args.command == "start":
        if args.local:
            start_app_with_local_db()
        else:
            start_app_with_remote_db()
    elif args.command == "info":
        from app.core.config import settings
        show_db_info()
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()