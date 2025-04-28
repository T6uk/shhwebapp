#!/usr/bin/env python
# pg2sqlite.py
"""
Direct PostgreSQL to SQLite converter that handles all special characters and encoding issues
by using database drivers directly instead of SQL files.
"""

import os
import sys
import time
import argparse
import logging
import sqlite3
import psycopg2
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def parse_args():
    parser = argparse.ArgumentParser(description="Direct PostgreSQL to SQLite converter")
    parser.add_argument("--host", default="172.20.10.11", help="PostgreSQL host")
    parser.add_argument("--port", default="5432", help="PostgreSQL port")
    parser.add_argument("--user", default="postgres", help="PostgreSQL user")
    parser.add_argument("--password", default="1234", help="PostgreSQL password")
    parser.add_argument("--database", default="accessdb", help="PostgreSQL database")
    parser.add_argument("--table", default="taitur_data", help="Table name to convert")
    parser.add_argument("--sqlite-db", default="data/local_data.db", help="SQLite database file")
    parser.add_argument("--batch-size", type=int, default=500, help="Rows per batch")
    parser.add_argument("--verbose", action="store_true", help="Verbose output")
    return parser.parse_args()


def get_columns(pg_conn, table_name):
    """Get column information from PostgreSQL"""
    with pg_conn.cursor() as cursor:
        cursor.execute("""
            SELECT 
                column_name, 
                data_type,
                is_nullable,
                column_default,
                ordinal_position
            FROM information_schema.columns
            WHERE table_name = %s
            ORDER BY ordinal_position
        """, (table_name,))

        return cursor.fetchall()


def get_primary_keys(pg_conn, table_name):
    """Get primary key columns from PostgreSQL"""
    with pg_conn.cursor() as cursor:
        cursor.execute("""
            SELECT a.attname
            FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            WHERE i.indrelid = %s::regclass AND i.indisprimary
        """, (table_name,))

        return [row[0] for row in cursor.fetchall()]


def create_sqlite_table(sqlite_conn, table_name, columns, primary_keys):
    """Create table in SQLite based on PostgreSQL schema"""
    # Map PostgreSQL types to SQLite types
    type_map = {
        'integer': 'INTEGER',
        'bigint': 'INTEGER',
        'smallint': 'INTEGER',
        'serial': 'INTEGER',
        'bigserial': 'INTEGER',
        'numeric': 'REAL',
        'decimal': 'REAL',
        'real': 'REAL',
        'double precision': 'REAL',
        'float': 'REAL',
        'boolean': 'INTEGER',
        'character varying': 'TEXT',
        'varchar': 'TEXT',
        'character': 'TEXT',
        'char': 'TEXT',
        'text': 'TEXT',
        'date': 'TEXT',
        'time': 'TEXT',
        'timestamp': 'TEXT',
        'bytea': 'BLOB',
        'jsonb': 'TEXT',
        'json': 'TEXT',
    }

    # Build CREATE TABLE statement
    create_table = f"CREATE TABLE {table_name} (\n"
    column_defs = []

    for name, pg_type, nullable, default, _ in columns:
        # Get SQLite type
        sqlite_type = 'TEXT'  # Default to TEXT
        for pg_type_prefix, sqlite_type_value in type_map.items():
            if pg_type.startswith(pg_type_prefix):
                sqlite_type = sqlite_type_value
                break

        # Build column definition
        if name in primary_keys and sqlite_type == 'INTEGER':
            column_defs.append(f'"{name}" INTEGER PRIMARY KEY')
        else:
            column_def = f'"{name}" {sqlite_type}'
            if nullable == 'NO':
                column_def += ' NOT NULL'
            column_defs.append(column_def)

    create_table += ",\n".join(column_defs)
    create_table += "\n);"

    # Execute CREATE TABLE
    with sqlite_conn:
        sqlite_conn.execute(f"DROP TABLE IF EXISTS {table_name}")
        sqlite_conn.execute(create_table)

    return True


def copy_data(pg_conn, sqlite_conn, table_name, columns, batch_size=500):
    """Copy data from PostgreSQL to SQLite"""
    try:
        # Get total row count
        with pg_conn.cursor() as cursor:
            cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            total_rows = cursor.fetchone()[0]
            logger.info(f"Total rows to copy: {total_rows}")

            # Prepare column names and placeholders for SQLite
            column_names = [col[0] for col in columns]
            placeholders = ",".join(["?" for _ in columns])

            insert_sql = f'INSERT INTO {table_name} ("' + '","'.join(column_names) + f'") VALUES ({placeholders})'

            # Copy data in batches
            offset = 0
            imported_rows = 0
            start_time = time.time()

            while offset < total_rows:
                # Get batch from PostgreSQL
                cursor.execute(f"""
                    SELECT * FROM {table_name}
                    ORDER BY id
                    LIMIT {batch_size} OFFSET {offset}
                """)

                rows = cursor.fetchall()
                if not rows:
                    break

                # Insert batch into SQLite
                sqlite_cursor = sqlite_conn.cursor()

                try:
                    # Use executemany with parameterized queries
                    # This safely handles all special characters
                    sqlite_conn.executemany(insert_sql, rows)
                    sqlite_conn.commit()
                    imported_rows += len(rows)
                except sqlite3.Error as e:
                    logger.error(f"Batch insert error: {str(e)}")

                    # Fall back to individual inserts if batch fails
                    sqlite_conn.rollback()

                    # Try inserting rows one by one
                    for row in rows:
                        try:
                            sqlite_conn.execute(insert_sql, row)
                            imported_rows += 1
                        except sqlite3.Error as row_error:
                            logger.error(f"Row insert error: {str(row_error)}")

                    sqlite_conn.commit()

                # Update offset
                offset += batch_size

                # Show progress
                progress = (imported_rows / total_rows) * 100
                elapsed = time.time() - start_time
                rate = imported_rows / elapsed if elapsed > 0 else 0

                logger.info(f"Imported {imported_rows}/{total_rows} rows "
                            f"({progress:.1f}%) - {rate:.1f} rows/sec")

        logger.info(f"Data import completed: {imported_rows} rows in {time.time() - start_time:.2f} seconds")
        return True

    except Exception as e:
        logger.error(f"Error copying data: {str(e)}")
        return False


def set_pragma_options(sqlite_conn):
    """Set SQLite PRAGMA options for better performance"""
    sqlite_conn.execute("PRAGMA synchronous = OFF")
    sqlite_conn.execute("PRAGMA journal_mode = MEMORY")
    sqlite_conn.execute("PRAGMA temp_store = MEMORY")
    sqlite_conn.execute("PRAGMA cache_size = 10000")
    sqlite_conn.execute("PRAGMA foreign_keys = OFF")


def main():
    args = parse_args()

    # Set logging level
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # Create output directory if needed
    os.makedirs(os.path.dirname(args.sqlite_db), exist_ok=True)

    try:
        logger.info(f"Connecting to PostgreSQL {args.host}:{args.port}/{args.database}...")

        # Connect to PostgreSQL
        pg_conn = psycopg2.connect(
            host=args.host,
            port=args.port,
            user=args.user,
            password=args.password,
            database=args.database
        )

        # Connect to SQLite
        logger.info(f"Connecting to SQLite database {args.sqlite_db}...")
        sqlite_conn = sqlite3.connect(args.sqlite_db)

        # Enable foreign keys in SQLite
        set_pragma_options(sqlite_conn)

        # Get schema information
        logger.info(f"Getting schema information for {args.table}...")
        columns = get_columns(pg_conn, args.table)
        primary_keys = get_primary_keys(pg_conn, args.table)

        # Create table in SQLite
        logger.info(f"Creating SQLite table {args.table}...")
        create_sqlite_table(sqlite_conn, args.table, columns, primary_keys)

        # Copy data
        logger.info(f"Copying data from PostgreSQL to SQLite...")
        copy_data(pg_conn, sqlite_conn, args.table, columns, args.batch_size)

        logger.info("Conversion completed successfully!")
        return 0

    except Exception as e:
        logger.error(f"Conversion failed: {str(e)}")
        return 1

    finally:
        # Close connections
        if 'pg_conn' in locals():
            pg_conn.close()

        if 'sqlite_conn' in locals():
            sqlite_conn.close()


if __name__ == "__main__":
    sys.exit(main())