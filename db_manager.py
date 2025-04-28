#!/usr/bin/env python
# db_manager.py
import argparse
import os
import sys
import logging
import subprocess
import time
import sqlite3
import traceback
from pathlib import Path
import shutil
import json

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
    missing_packages = []

    try:
        import pandas
    except ImportError:
        missing_packages.append("pandas")

    try:
        import aiosqlite
    except ImportError:
        missing_packages.append("aiosqlite")

    try:
        import psycopg2
    except ImportError:
        missing_packages.append("psycopg2-binary")

    if missing_packages:
        logger.error(f"Missing required packages: {', '.join(missing_packages)}")
        logger.info(f"Please install required packages: pip install {' '.join(missing_packages)}")
        return False

    return True


def get_db_config():
    """Get database configuration from app settings"""
    try:
        # Import settings from app
        sys.path.append(str(current_dir))
        from app.core.config import settings

        db_config = {
            "pg_host": settings.POSTGRES_HOST,
            "pg_port": settings.POSTGRES_PORT,
            "pg_db": settings.POSTGRES_DB,
            "pg_user": settings.POSTGRES_USER,
            "pg_password": settings.POSTGRES_PASSWORD,
            "local_db": settings.LOCAL_DB_PATH,
        }
        return db_config
    except ImportError as e:
        logger.error(f"Error importing app settings: {e}")
        # Return default values
        return {
            "pg_host": os.environ.get("POSTGRES_HOST", "172.20.10.11"),
            "pg_port": os.environ.get("POSTGRES_PORT", "5432"),
            "pg_db": os.environ.get("POSTGRES_DB", "accessdb"),
            "pg_user": os.environ.get("POSTGRES_USER", "postgres"),
            "pg_password": os.environ.get("POSTGRES_PASSWORD", "1234"),
            "local_db": data_dir / "local_data.db"
        }


def test_postgresql_connection(config=None):
    """Test if PostgreSQL server is accessible"""
    if not config:
        config = get_db_config()

    try:
        import psycopg2
        logger.info(f"Connecting to PostgreSQL at {config['pg_host']}:{config['pg_port']}...")

        conn = psycopg2.connect(
            host=config['pg_host'],
            port=config['pg_port'],
            dbname=config['pg_db'],
            user=config['pg_user'],
            password=config['pg_password'],
            connect_timeout=5
        )

        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.close()
        conn.close()

        logger.info("PostgreSQL connection successful")
        return True

    except Exception as e:
        logger.error(f"PostgreSQL connection failed: {e}")
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

    config = get_db_config()

    # Check connection to PostgreSQL
    if not test_postgresql_connection(config):
        logger.error("Cannot connect to PostgreSQL server. Export aborted.")
        return False

    try:
        # Try using pg_dump if available (more efficient for large databases)
        if shutil.which('pg_dump'):
            # Export schema
            env = os.environ.copy()
            env['PGPASSWORD'] = config['pg_password']

            schema_cmd = [
                'pg_dump',
                '-h', config['pg_host'],
                '-p', str(config['pg_port']),
                '-U', config['pg_user'],
                '-d', config['pg_db'],
                '-t', 'taitur_data',
                '--schema-only',
                '-f', str(schema_file)
            ]

            data_cmd = [
                'pg_dump',
                '-h', config['pg_host'],
                '-p', str(config['pg_port']),
                '-U', config['pg_user'],
                '-d', config['pg_db'],
                '-t', 'taitur_data',
                '--data-only',
                '--column-inserts',
                '-f', str(data_file)
            ]

            subprocess.run(schema_cmd, env=env, check=True)
            subprocess.run(data_cmd, env=env, check=True)

            logger.info("Export completed using pg_dump")
        else:
            # Fallback to Python exporter
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

        # Also run PostgreSQL to SQLite export for local db
        postgresql_to_sqlite()

        elapsed = time.time() - start_time
        logger.info(f"Export completed in {elapsed:.2f} seconds")
        logger.info(f"Schema exported to: {schema_file}")
        logger.info(f"Data exported to: {data_file}")
        logger.info(f"SQLite database created at: {config['local_db']}")
        return True

    except Exception as e:
        logger.error(f"Export failed: {e}")
        logger.error(traceback.format_exc())
        return False


def import_db():
    """Import database schema and data to SQLite"""
    if not check_requirements():
        return False

    config = get_db_config()
    schema_file = data_dir / "taitur_data_schema.sql"
    data_file = data_dir / "taitur_data.sql"
    sqlite_db = config['local_db']

    if not schema_file.exists() or not data_file.exists():
        logger.error("Schema or data file not found. Run export first.")
        return False

    logger.info("Importing database schema and data to SQLite...")
    start_time = time.time()

    try:
        # Create a backup of existing SQLite database if it exists
        if os.path.exists(sqlite_db):
            backup_path = f"{sqlite_db}.bak.{int(time.time())}"
            shutil.copy2(sqlite_db, backup_path)
            logger.info(f"Created backup of existing database: {backup_path}")

        # Run the import process
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

        # Verify the import
        conn = sqlite3.connect(str(sqlite_db))
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM taitur_data")
        count = cursor.fetchone()[0]
        conn.close()

        logger.info(f"Verified {count} rows in SQLite database")
        return True

    except Exception as e:
        logger.error(f"Import failed: {e}")
        logger.error(traceback.format_exc())
        return False


def initialize_local_db():
    """Create and initialize the local SQLite database structure"""
    import sqlite3

    # Get the database path
    config = get_db_config()
    local_db_path = config['local_db']
    os.makedirs(os.path.dirname(local_db_path), exist_ok=True)

    if os.path.exists(local_db_path):
        logger.info(f"Local database already exists at: {local_db_path}")
        if not input("Do you want to recreate it? This will delete all data! (y/n): ").lower().startswith('y'):
            return False

        # Backup the existing database
        backup_path = f"{local_db_path}.bak.{int(time.time())}"
        shutil.copy2(local_db_path, backup_path)
        logger.info(f"Backup created at: {backup_path}")

        # Remove the existing database
        os.remove(local_db_path)

    logger.info("Creating new SQLite database...")

    # Try to get schema from PostgreSQL if available
    if test_postgresql_connection():
        logger.info("PostgreSQL is available. Getting schema from server...")
        try:
            # This will create the SQLite database with schema from PostgreSQL
            postgresql_to_sqlite()
            logger.info(f"Local database initialized with schema from PostgreSQL at: {local_db_path}")
            return True
        except Exception as e:
            logger.error(f"Error getting schema from PostgreSQL: {e}")
            logger.info("Falling back to basic schema...")

    # Create a new database with basic schema
    try:
        conn = sqlite3.connect(str(local_db_path))
        cursor = conn.cursor()

        # Create the taitur_data table with basic schema
        # You may need to customize this schema for your actual needs
        cursor.execute('''
        CREATE TABLE taitur_data (
            id INTEGER PRIMARY KEY,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            data TEXT,
            status TEXT,
            owner_id INTEGER,
            name TEXT,
            description TEXT
        )
        ''')

        conn.commit()
        conn.close()

        logger.info(f"Local database initialized with basic schema at: {local_db_path}")
        return True

    except Exception as e:
        logger.error(f"Error initializing local database: {e}")
        logger.error(traceback.format_exc())
        return False


def postgresql_to_sqlite():
    """Export data from PostgreSQL and import into SQLite"""
    if not check_requirements():
        return False

    config = get_db_config()
    local_db_path = config['local_db']

    try:
        import psycopg2

        logger.info("Connecting to PostgreSQL database...")
        conn = psycopg2.connect(
            host=config['pg_host'],
            port=config['pg_port'],
            dbname=config['pg_db'],
            user=config['pg_user'],
            password=config['pg_password'],
            connect_timeout=5
        )

        cursor = conn.cursor()

        # Get table structure
        cursor.execute("""
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'taitur_data'
        ORDER BY ordinal_position
        """)

        columns = cursor.fetchall()
        logger.info(f"Found {len(columns)} columns in PostgreSQL table")

        # Backup existing database if it exists
        if os.path.exists(local_db_path):
            backup_path = f"{local_db_path}.bak.{int(time.time())}"
            shutil.copy2(local_db_path, backup_path)
            logger.info(f"Backup created at: {backup_path}")

        # Connect to SQLite
        os.makedirs(os.path.dirname(local_db_path), exist_ok=True)
        sqlite_conn = sqlite3.connect(str(local_db_path))
        sqlite_cursor = sqlite_conn.cursor()

        # Create table with PostgreSQL schema adapted to SQLite
        create_table_sql = "CREATE TABLE IF NOT EXISTS taitur_data (\n"

        for i, (col_name, data_type, is_nullable) in enumerate(columns):
            # Convert PostgreSQL types to SQLite
            sqlite_type = "TEXT"  # Default

            if "int" in data_type.lower():
                sqlite_type = "INTEGER"
            elif any(t in data_type.lower() for t in ["float", "numeric", "decimal", "real", "double"]):
                sqlite_type = "REAL"
            elif "bool" in data_type.lower():
                sqlite_type = "INTEGER"  # SQLite doesn't have boolean
            elif any(t in data_type.lower() for t in ["timestamp", "date", "time"]):
                sqlite_type = "TIMESTAMP"

            # Handle primary key
            if col_name == "id":
                sqlite_type = "INTEGER PRIMARY KEY"

            # Add NOT NULL if needed
            null_constraint = "" if is_nullable == "YES" else " NOT NULL"

            # Add column definition
            create_table_sql += f"    {col_name} {sqlite_type}{null_constraint}"

            # Add comma if not the last column
            if i < len(columns) - 1:
                create_table_sql += ",\n"
            else:
                create_table_sql += "\n"

        create_table_sql += ");"

        logger.info("Creating SQLite table with schema from PostgreSQL")

        # Drop existing table and create new one
        sqlite_cursor.execute("DROP TABLE IF EXISTS taitur_data")
        sqlite_cursor.execute(create_table_sql)

        # Get column names for INSERT statement
        column_names = [col[0] for col in columns]

        # Determine batch size based on available memory
        batch_size = 1000

        # Prepare INSERT statement
        placeholders = ",".join(["?"] * len(column_names))
        insert_sql = f"INSERT INTO taitur_data ({','.join(column_names)}) VALUES ({placeholders})"

        # Count total rows
        cursor.execute("SELECT COUNT(*) FROM taitur_data")
        total_rows = cursor.fetchone()[0]
        logger.info(f"Total rows to transfer: {total_rows}")

        # Fetch and insert data in batches to avoid memory issues
        offset = 0
        total_inserted = 0

        while True:
            # Fetch data from PostgreSQL in batches
            cursor.execute(f"SELECT * FROM taitur_data ORDER BY id LIMIT {batch_size} OFFSET {offset}")
            rows = cursor.fetchall()

            if not rows:
                break

            # Process rows to handle data types properly
            processed_rows = []
            for row in rows:
                processed_row = []
                for i, val in enumerate(row):
                    # Convert PostgreSQL types to SQLite compatible types
                    if val is None:
                        processed_row.append(None)
                    elif isinstance(val, (list, dict)):
                        # Convert JSON types to string
                        processed_row.append(json.dumps(val))
                    else:
                        processed_row.append(val)
                processed_rows.append(processed_row)

            # Insert data into SQLite
            sqlite_cursor.executemany(insert_sql, processed_rows)
            sqlite_conn.commit()

            total_inserted += len(rows)
            offset += batch_size

            logger.info(f"Inserted {total_inserted}/{total_rows} rows ({(total_inserted / total_rows * 100):.1f}%)")

            if len(rows) < batch_size:
                break

        # Create indexes that might be useful for performance
        logger.info("Creating indexes...")
        try:
            # Common indexes that might be useful - adjust based on your queries
            sqlite_cursor.execute("CREATE INDEX IF NOT EXISTS idx_taitur_data_name ON taitur_data(name)")
            sqlite_cursor.execute("CREATE INDEX IF NOT EXISTS idx_taitur_data_status ON taitur_data(status)")
            sqlite_cursor.execute("CREATE INDEX IF NOT EXISTS idx_taitur_data_owner ON taitur_data(owner_id)")
            sqlite_conn.commit()
        except Exception as e:
            logger.warning(f"Error creating indexes: {e}")

        # Close connections
        cursor.close()
        conn.close()
        sqlite_cursor.close()
        sqlite_conn.close()

        logger.info(f"Data successfully transferred from PostgreSQL to SQLite: {total_inserted} rows")
        return True

    except Exception as e:
        logger.error(f"Error transferring data: {e}")
        logger.error(traceback.format_exc())
        return False


def check_local_db_exists():
    """Check if local database exists and has the required table"""
    config = get_db_config()
    local_db_path = config['local_db']

    if not os.path.exists(local_db_path):
        logger.warning(f"Local database not found at {local_db_path}")
        return False

    try:
        conn = sqlite3.connect(str(local_db_path))
        cursor = conn.cursor()

        # Check if the table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='taitur_data'")
        if not cursor.fetchone():
            logger.warning("Local database does not contain 'taitur_data' table")
            conn.close()
            return False

        # Check if the table has data
        cursor.execute("SELECT COUNT(*) FROM taitur_data")
        count = cursor.fetchone()[0]
        conn.close()

        if count == 0:
            logger.warning("Local database exists but 'taitur_data' table is empty")
            return False

        logger.info(f"Local database verified: {count} rows in 'taitur_data' table")
        return True

    except Exception as e:
        logger.error(f"Error checking local database: {e}")
        return False


def start_app_with_local_db():
    """Start the application using the local SQLite database"""
    env = os.environ.copy()
    env["USE_LOCAL_DB"] = "true"

    # Check if local DB exists
    if not check_local_db_exists():
        logger.warning("Local database file not found or invalid.")
        if input("Do you want to run the initialize local database now? (y/n): ").lower() == 'y':
            if not initialize_local_db():
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

    # Test connection to PostgreSQL
    if not test_postgresql_connection():
        logger.warning("Cannot connect to PostgreSQL server.")
        if input(
                "PostgreSQL server is unavailable. Do you want to start with local database instead? (y/n): ").lower() == 'y':
            return start_app_with_local_db()
        else:
            logger.error("Application not started.")
            return False

    logger.info("Starting application with remote PostgreSQL database...")
    try:
        subprocess.run([
            sys.executable, "startup.py"
        ], env=env)
        return True
    except Exception as e:
        logger.error(f"Error starting app: {e}")
        return False


def auto_start():
    """Start the application automatically choosing the best available database"""
    logger.info("Determining best database to use...")

    # Check PostgreSQL connection
    if test_postgresql_connection():
        logger.info("PostgreSQL is available. Using remote database.")
        return start_app_with_remote_db()

    # If PostgreSQL not available, check local DB
    logger.info("PostgreSQL unavailable. Checking local database...")
    if check_local_db_exists():
        logger.info("Local database is available. Using local database.")
        return start_app_with_local_db()

    # If neither available, offer to create local DB
    logger.warning("Neither PostgreSQL nor local database is available.")
    if input("Do you want to initialize a new local database? (y/n): ").lower() == 'y':
        if initialize_local_db():
            logger.info("Local database initialized. Starting application with local database.")
            return start_app_with_local_db()

    logger.error("No database available. Application not started.")
    return False


def show_db_info():
    """Show information about the available databases"""
    config = get_db_config()

    # Check PostgreSQL connection
    pg_available = test_postgresql_connection(config)

    # Check local DB
    local_db_path = config['local_db']
    local_db_exists = os.path.exists(local_db_path)
    local_db_valid = check_local_db_exists()

    schema_file = data_dir / "taitur_data_schema.sql"
    data_file = data_dir / "taitur_data.sql"

    print("\n=== Database Information ===")
    print(f"PostgreSQL Database: {config['pg_user']}@{config['pg_host']}:{config['pg_port']}/{config['pg_db']}")
    print(f"PostgreSQL Status: {'Available ✓' if pg_available else 'Unavailable ✗'}")

    if local_db_exists:
        size_mb = os.path.getsize(local_db_path) / (1024 * 1024)
        print(f"\nLocal SQLite Database: {local_db_path} ({size_mb:.2f} MB)")
        print(f"Local DB Status: {'Valid ✓' if local_db_valid else 'Invalid or Empty ✗'}")

        # Get row count from SQLite
        if local_db_valid:
            try:
                conn = sqlite3.connect(str(local_db_path))
                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) FROM taitur_data")
                row_count = cursor.fetchone()[0]
                cursor.close()
                conn.close()
                print(f"  - Rows in taitur_data: {row_count:,}")
            except Exception as e:
                print(f"  - Error getting row count: {e}")
    else:
        print(f"\nLocal SQLite Database: Not found at {local_db_path}")

    if schema_file.exists():
        schema_size = os.path.getsize(schema_file) / 1024
        print(f"\nSchema SQL file: {schema_file} ({schema_size:.2f} KB)")
    else:
        print(f"\nSchema SQL file: Not found at {schema_file}")

    if data_file.exists():
        data_size = os.path.getsize(data_file) / (1024 * 1024)
        print(f"Data SQL file: {data_file} ({data_size:.2f} MB)")
    else:
        print(f"Data SQL file: Not found at {data_file}")

    print("\nRecommended Operation:")
    if pg_available and not local_db_valid:
        print("  - Run 'python db_manager.py export' to create a local database backup")
    elif not pg_available and not local_db_valid:
        print("  - PostgreSQL unavailable and no local database found")
        print("  - Start application when PostgreSQL is available or create a local database")
    elif not pg_available and local_db_valid:
        print("  - PostgreSQL unavailable but local database exists")
        print("  - Run 'python db_manager.py start --local' to use local database")
    else:
        print("  - Both PostgreSQL and local database are available")
        print("  - Run 'python db_manager.py start' to use PostgreSQL")
        print("  - Run 'python db_manager.py start --local' to use local database")

    print("\nCommands:")
    print("  - Export: python db_manager.py export")
    print("  - Import: python db_manager.py import")
    print("  - Initialize local DB: python db_manager.py initialize")
    print("  - Start with local DB: python db_manager.py start --local")
    print("  - Start with remote DB: python db_manager.py start --remote")
    print("  - Auto-start (best available): python db_manager.py start")

    return True


def main():
    """Main entry point for the DB manager"""
    parser = argparse.ArgumentParser(description="Manage database operations")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # Export command
    export_parser = subparsers.add_parser("export", help="Export database from PostgreSQL")

    # Import command
    import_parser = subparsers.add_parser("import", help="Import database to SQLite")

    # Initialize command
    init_parser = subparsers.add_parser("initialize", help="Initialize a new local database")

    # Start command
    start_parser = subparsers.add_parser("start", help="Start application with specified database")
    start_parser.add_argument("--local", action="store_true", help="Use local SQLite database")
    start_parser.add_argument("--remote", action="store_true", help="Use remote PostgreSQL database")

    # Info command
    info_parser = subparsers.add_parser("info", help="Show database information")

    args = parser.parse_args()

    if args.command == "export":
        export_db()
    elif args.command == "import":
        import_db()
    elif args.command == "initialize":
        initialize_local_db()
    elif args.command == "start":
        if args.local:
            start_app_with_local_db()
        elif args.remote:
            start_app_with_remote_db()
        else:
            auto_start()
    elif args.command == "info":
        show_db_info()
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()