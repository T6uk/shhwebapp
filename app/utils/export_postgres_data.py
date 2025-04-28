#!/usr/bin/env python
# export_postgres_data.py
"""
Simple, reliable script to export PostgreSQL table to SQL files
with proper UTF-8 encoding for all Unicode characters.
"""

import os
import sys
import time
import argparse
import logging
import psycopg2
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def parse_args():
    parser = argparse.ArgumentParser(description="Export PostgreSQL table to SQL files")
    parser.add_argument("--host", default="172.20.10.11", help="Database host")
    parser.add_argument("--port", default="5432", help="Database port")
    parser.add_argument("--user", default="postgres", help="Database user")
    parser.add_argument("--password", default="1234", help="Database password")
    parser.add_argument("--database", default="accessdb", help="Database name")
    parser.add_argument("--table", default="taitur_data", help="Table name to export")
    parser.add_argument("--output-dir", default="data", help="Output directory for SQL files")
    parser.add_argument("--batch-size", type=int, default=1000, help="Rows per batch")
    return parser.parse_args()


def export_schema(conn, table_name, output_file):
    """Export table schema to SQL file with proper encoding"""
    try:
        logger.info(f"Exporting schema for table {table_name}...")

        # Create output directory if it doesn't exist
        os.makedirs(os.path.dirname(output_file), exist_ok=True)

        with conn.cursor() as cursor:
            # Check if table exists
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' AND table_name = %s
                );
            """, (table_name,))

            if not cursor.fetchone()[0]:
                logger.error(f"Table {table_name} does not exist")
                return False

            # Get column definitions
            cursor.execute("""
                SELECT 
                    column_name, 
                    data_type,
                    character_maximum_length,
                    is_nullable,
                    column_default
                FROM information_schema.columns
                WHERE table_name = %s
                ORDER BY ordinal_position
            """, (table_name,))

            columns = cursor.fetchall()

            # Get primary key
            cursor.execute("""
                SELECT a.attname
                FROM pg_index i
                JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
                WHERE i.indrelid = %s::regclass AND i.indisprimary
            """, (table_name,))

            primary_keys = [row[0] for row in cursor.fetchall()]

            # Get indexes
            cursor.execute("""
                SELECT indexname, indexdef
                FROM pg_indexes
                WHERE tablename = %s
            """, (table_name,))

            indexes = cursor.fetchall()

        # Write schema to file
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(f"-- Schema for table {table_name}\n")
            f.write(f"-- Exported on {time.strftime('%Y-%m-%d %H:%M:%S')}\n\n")

            f.write(f"DROP TABLE IF EXISTS {table_name} CASCADE;\n\n")

            # Create table statement
            f.write(f"CREATE TABLE {table_name} (\n")

            col_defs = []
            for col_name, data_type, max_length, nullable, default in columns:
                col_def = f"    \"{col_name}\" {data_type}"

                # Add length for character types
                if max_length is not None:
                    col_def += f"({max_length})"

                # Add constraints
                constraints = []

                # Primary key
                if col_name in primary_keys:
                    constraints.append("PRIMARY KEY")

                # Nullable
                if nullable == "NO":
                    constraints.append("NOT NULL")

                # Default value
                if default is not None:
                    constraints.append(f"DEFAULT {default}")

                if constraints:
                    col_def += " " + " ".join(constraints)

                col_defs.append(col_def)

            f.write(",\n".join(col_defs))
            f.write("\n);\n\n")

            # Add indexes
            if indexes:
                f.write("-- Indexes\n")
                for _, indexdef in indexes:
                    if "PRIMARY KEY" not in indexdef:  # Skip primary key indexes, already defined in table
                        f.write(f"{indexdef};\n")
                f.write("\n")

        logger.info(f"Schema exported to {output_file}")
        return True

    except Exception as e:
        logger.error(f"Error exporting schema: {str(e)}")
        return False


def export_data(conn, table_name, output_file, batch_size=1000):
    """Export table data to SQL file with proper encoding"""
    try:
        logger.info(f"Exporting data for table {table_name}...")

        # Create output directory if it doesn't exist
        os.makedirs(os.path.dirname(output_file), exist_ok=True)

        # Get total number of rows
        with conn.cursor() as cursor:
            cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            total_rows = cursor.fetchone()[0]
            logger.info(f"Total rows: {total_rows}")

            # Get column names
            cursor.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = %s
                ORDER BY ordinal_position
            """, (table_name,))

            columns = [row[0] for row in cursor.fetchall()]

            # Open output file with UTF-8 encoding
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(f"-- Data for table {table_name}\n")
                f.write(f"-- Exported on {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
                f.write(f"-- Total rows: {total_rows}\n\n")

                # Use SQL INSERT statements instead of COPY for better compatibility
                batch_count = 0
                offset = 0
                start_time = time.time()

                while offset < total_rows:
                    cursor.execute(f"""
                        SELECT * FROM {table_name}
                        ORDER BY id
                        LIMIT {batch_size} OFFSET {offset}
                    """)

                    batch = cursor.fetchall()
                    if not batch:
                        break

                    # Write INSERT statements for this batch
                    col_list = ", ".join(f'"{col}"' for col in columns)
                    f.write(f"INSERT INTO {table_name} ({col_list}) VALUES\n")

                    values_list = []
                    for row in batch:
                        values = []
                        for val in row:
                            if val is None:
                                values.append("NULL")
                            elif isinstance(val, (int, float)):
                                values.append(str(val))
                            elif isinstance(val, (bytes, bytearray)):
                                # Handle binary data
                                hex_str = val.hex()
                                values.append(f"decode('{hex_str}', 'hex')")
                            else:
                                # Properly escape strings with Unicode characters
                                escaped = str(val).replace("'", "''")
                                values.append(f"'{escaped}'")

                        values_list.append("(" + ", ".join(values) + ")")

                    # Join values with commas and end with semicolon
                    f.write(",\n".join(values_list))
                    f.write(";\n\n")

                    # Update counters
                    offset += len(batch)
                    batch_count += 1

                    # Report progress
                    progress = min(100, round(offset / total_rows * 100, 1))
                    elapsed = time.time() - start_time
                    rate = offset / elapsed if elapsed > 0 else 0
                    eta = (total_rows - offset) / rate if rate > 0 else 0

                    logger.info(f"Progress: {offset}/{total_rows} rows ({progress}%) "
                                f"- {rate:.1f} rows/sec - ETA: {eta:.1f} sec")

                # Add sequence reset if needed
                f.write(f"-- Reset sequences\n")
                f.write(f"SELECT setval(pg_get_serial_sequence('{table_name}', 'id'), "
                        f"(SELECT MAX(id) FROM {table_name}));\n")

        logger.info(f"Data export completed in {time.time() - start_time:.2f} seconds")
        logger.info(f"Data exported to {output_file}")
        return True

    except Exception as e:
        logger.error(f"Error exporting data: {str(e)}")
        return False


def main():
    args = parse_args()

    # Create connection parameters
    conn_params = {
        "host": args.host,
        "port": args.port,
        "user": args.user,
        "password": args.password,
        "database": args.database
    }

    # Set output file paths
    output_dir = Path(args.output_dir)
    schema_file = output_dir / f"{args.table}_schema.sql"
    data_file = output_dir / f"{args.table}_data.sql"

    try:
        # Connect to database
        logger.info(f"Connecting to PostgreSQL database {args.database} on {args.host}...")
        conn = psycopg2.connect(**conn_params)

        # Export schema
        schema_ok = export_schema(conn, args.table, schema_file)

        # Export data if schema export was successful
        if schema_ok:
            data_ok = export_data(conn, args.table, data_file, args.batch_size)

            if data_ok:
                logger.info("Export completed successfully")
                return 0

        logger.error("Export failed")
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