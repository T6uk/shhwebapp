#!/usr/bin/env python
# import_to_sqlite.py
"""
Import PostgreSQL SQL exports into SQLite database
with proper encoding handling and improved schema conversion.
"""

import os
import sys
import time
import argparse
import logging
import sqlite3
import re
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def parse_args():
    parser = argparse.ArgumentParser(description="Import SQL files to SQLite database")
    parser.add_argument("--schema-file", required=True, help="Path to schema SQL file")
    parser.add_argument("--data-file", required=True, help="Path to data SQL file")
    parser.add_argument("--sqlite-db", default="data/local_data.db", help="SQLite database file")
    parser.add_argument("--table", default="taitur_data", help="Table name")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    return parser.parse_args()


def convert_schema_to_sqlite(schema_sql, table_name):
    """Convert PostgreSQL schema to SQLite format with better error handling"""
    try:
        # Extract the CREATE TABLE statement more robustly
        create_match = re.search(r'CREATE TABLE\s+(?:"?(\w+)"?)?\s*\((.*?)\);', schema_sql, re.DOTALL | re.IGNORECASE)

        if not create_match:
            logger.error("Failed to find CREATE TABLE statement in schema SQL")
            logger.debug(f"Schema SQL preview: {schema_sql[:500]}...")

            # Manual approach - build a simple schema
            logger.info("Attempting to create basic schema...")
            return f"""
            CREATE TABLE IF NOT EXISTS {table_name} (
                id INTEGER PRIMARY KEY,
                _change_nr TEXT,
                _nr_plaan TEXT,
                _created_by TEXT,
                _updated_by TEXT,
                _created_date TEXT,
                _updated_date TEXT
            );
            """

        # Get the column definitions
        column_defs = create_match.group(2)

        # Clean up the column definitions
        column_lines = []

        # Process each column definition line
        for line in column_defs.split(','):
            line = line.strip()
            if not line:
                continue

            # Skip PostgreSQL-specific constraints
            if line.upper().startswith(('CONSTRAINT', 'PRIMARY KEY', 'FOREIGN KEY', 'CHECK', 'UNIQUE')):
                continue

            # Extract column name and type
            col_match = re.match(r'"?(\w+)"?\s+([\w\s\(\)]+)(.*)', line)
            if not col_match:
                logger.debug(f"Skipping line: {line}")
                continue

            col_name, col_type, constraints = col_match.groups()

            # Convert PostgreSQL types to SQLite types
            if re.search(r'serial|bigserial', col_type, re.IGNORECASE):
                col_type = 'INTEGER PRIMARY KEY AUTOINCREMENT'
            elif re.search(r'character varying|varchar', col_type, re.IGNORECASE):
                col_type = 'TEXT'
            elif re.search(r'char|text', col_type, re.IGNORECASE):
                col_type = 'TEXT'
            elif re.search(r'int|integer|smallint|bigint', col_type, re.IGNORECASE):
                col_type = 'INTEGER'
            elif re.search(r'float|double|numeric|decimal|real', col_type, re.IGNORECASE):
                col_type = 'REAL'
            elif re.search(r'bool|boolean', col_type, re.IGNORECASE):
                col_type = 'INTEGER'  # SQLite uses INTEGER for boolean (0/1)
            elif re.search(r'date|time|timestamp', col_type, re.IGNORECASE):
                col_type = 'TEXT'  # Store as ISO8601 strings
            elif re.search(r'bytea|blob|binary', col_type, re.IGNORECASE):
                col_type = 'BLOB'
            elif re.search(r'json|jsonb', col_type, re.IGNORECASE):
                col_type = 'TEXT'
            else:
                # Default to TEXT for unknown types
                col_type = 'TEXT'

            # Check if column is PRIMARY KEY
            if 'PRIMARY KEY' in constraints.upper():
                if col_type == 'INTEGER':
                    col_type = 'INTEGER PRIMARY KEY AUTOINCREMENT'
                else:
                    col_type = f'{col_type} PRIMARY KEY'

            # Add NOT NULL if needed
            elif 'NOT NULL' in constraints.upper():
                col_type = f'{col_type} NOT NULL'

            # Build the column definition
            column_lines.append(f'"{col_name}" {col_type}')

        # If we didn't get any valid columns, use a default schema
        if not column_lines:
            logger.warning("Could not parse any columns, using default schema")
            return f"""
            CREATE TABLE IF NOT EXISTS {table_name} (
                id INTEGER PRIMARY KEY,
                data TEXT
            );
            """

        # Build the final CREATE TABLE statement
        sqlite_schema = f"CREATE TABLE IF NOT EXISTS {table_name} (\n"
        sqlite_schema += ",\n".join(column_lines)
        sqlite_schema += "\n);"

        logger.debug(f"Converted schema: {sqlite_schema}")
        return sqlite_schema

    except Exception as e:
        logger.error(f"Error converting schema: {str(e)}")
        # Create a minimal schema as fallback
        return f"""
        CREATE TABLE IF NOT EXISTS {table_name} (
            id INTEGER PRIMARY KEY,
            data TEXT
        );
        """


def import_schema(schema_file, db_conn, table_name):
    """Import schema to SQLite database"""
    try:
        logger.info(f"Importing schema from {schema_file}...")

        # Read schema file
        with open(schema_file, 'r', encoding='utf-8') as f:
            schema_sql = f.read()

        # Convert schema to SQLite format
        sqlite_schema = convert_schema_to_sqlite(schema_sql, table_name)

        # Execute schema in SQLite
        cursor = db_conn.cursor()

        # Drop table if exists
        cursor.execute(f"DROP TABLE IF EXISTS {table_name}")

        # Create table
        logger.debug(f"Executing schema: {sqlite_schema}")
        cursor.execute(sqlite_schema)
        db_conn.commit()

        logger.info(f"Schema imported successfully")
        return True

    except Exception as e:
        logger.error(f"Error importing schema: {str(e)}")
        return False


def parse_insert_statements(file_path):
    """Parse INSERT statements from a file and yield batches of values"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

            # Find all INSERT statements
            insert_pattern = re.compile(r'INSERT INTO .*?\((.*?)\) VALUES\s*(.*?);', re.DOTALL)
            matches = insert_pattern.finditer(content)

            for match in matches:
                columns = match.group(1)
                values_text = match.group(2)

                # Clean and parse values
                values = []
                value_pattern = re.compile(r'\((.*?)\)', re.DOTALL)
                for value_match in value_pattern.finditer(values_text):
                    # Extract the comma-separated values
                    value_str = value_match.group(1)
                    values.append(f"({value_str})")

                yield columns, values

    except Exception as e:
        logger.error(f"Error parsing INSERT statements: {str(e)}")
        yield None, None


def import_data(data_file, db_conn, table_name):
    """Import data to SQLite database using direct SQL execution"""
    try:
        logger.info(f"Importing data from {data_file}...")

        cursor = db_conn.cursor()
        start_time = time.time()
        total_rows = 0

        # Process INSERT statements in batches
        for columns, values in parse_insert_statements(data_file):
            if not columns or not values:
                continue

            # Execute in reasonable-sized batches
            batch_size = 100
            for i in range(0, len(values), batch_size):
                batch = values[i:i + batch_size]
                batch_sql = f"INSERT INTO {table_name} ({columns}) VALUES {', '.join(batch)}"

                try:
                    cursor.execute(batch_sql)
                    db_conn.commit()

                    total_rows += len(batch)

                    # Show progress
                    elapsed = time.time() - start_time
                    rate = total_rows / elapsed if elapsed > 0 else 0
                    logger.info(f"Imported {total_rows} rows - {rate:.1f} rows/sec")

                except sqlite3.Error as e:
                    logger.error(f"Error executing batch: {str(e)}")
                    # Try individually if batch fails
                    for value in batch:
                        try:
                            single_sql = f"INSERT INTO {table_name} ({columns}) VALUES {value}"
                            cursor.execute(single_sql)
                            db_conn.commit()
                            total_rows += 1
                        except sqlite3.Error as e2:
                            logger.error(f"Error importing row: {str(e2)}")

        # Final commit
        db_conn.commit()

        logger.info(f"Data import completed: {total_rows} rows in {time.time() - start_time:.2f} seconds")
        return True

    except Exception as e:
        logger.error(f"Error importing data: {str(e)}")
        return False


def create_basic_schema(db_conn, table_name):
    """Create a basic schema as fallback"""
    try:
        logger.info("Creating basic schema as fallback...")

        schema = f"""
        CREATE TABLE IF NOT EXISTS {table_name} (
            id INTEGER PRIMARY KEY,
            _change_nr TEXT,
            _nr_plaan TEXT,
            _created_by TEXT,
            _updated_by TEXT, 
            _created_date TEXT,
            _updated_date TEXT,
            data TEXT
        );
        """

        cursor = db_conn.cursor()
        cursor.execute(f"DROP TABLE IF EXISTS {table_name}")
        cursor.execute(schema)
        db_conn.commit()

        logger.info("Basic schema created successfully")
        return True

    except sqlite3.Error as e:
        logger.error(f"Error creating basic schema: {str(e)}")
        return False


def main():
    args = parse_args()

    # Set logging level
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)

    # Create directory for SQLite database if it doesn't exist
    os.makedirs(os.path.dirname(args.sqlite_db), exist_ok=True)

    try:
        # Connect to SQLite database
        logger.info(f"Connecting to SQLite database {args.sqlite_db}...")
        conn = sqlite3.connect(args.sqlite_db)

        # Import schema
        schema_ok = import_schema(args.schema_file, conn, args.table)

        # If schema import failed, try creating a basic schema
        if not schema_ok:
            logger.warning("Schema import failed, creating basic schema...")
            schema_ok = create_basic_schema(conn, args.table)

        # Import data if schema import was successful
        if schema_ok:
            data_ok = import_data(args.data_file, conn, args.table)

            if data_ok:
                logger.info("Import completed successfully")
                return 0

        logger.error("Import failed")
        return 1

    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return 1

    finally:
        # Close connection if it exists
        if 'conn' in locals() and conn:
            conn.close()


if __name__ == "__main__":
    sys.exit(main())