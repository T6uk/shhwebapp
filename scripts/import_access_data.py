#!/usr/bin/env python3
"""
Script to import data from Microsoft Access database to PostgreSQL.
This script requires the pypyodbc or pyodbc library for connecting to Access
and SQLAlchemy for PostgreSQL connection.
"""
import os
import sys
import json
import argparse
import pyodbc  # or import pypyodbc as pyodbc
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import pandas as pd
from dotenv import load_dotenv
import logging

from app.models.data_models import Base, DataTable, TableSchema
from app.database import engine

# Add parent directory to path to import app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("import_access.log"),
        logging.StreamHandler()
    ]
)


def connect_to_access(access_file):
    """Connect to MS Access database file"""
    try:
        # Connection string for MS Access
        conn_str = f"DRIVER={{Microsoft Access Driver (*.mdb, *.accdb)}};DBQ={access_file};"
        conn = pyodbc.connect(conn_str)
        logging.info(f"Successfully connected to Access database: {access_file}")
        return conn
    except Exception as e:
        logging.error(f"Error connecting to Access database: {e}")
        raise


def get_access_tables(conn):
    """Get list of tables from Access database"""
    cursor = conn.cursor()
    tables = []

    # Query to get user tables (not system tables)
    for row in cursor.tables(tableType='TABLE'):
        table_name = row.table_name
        if not table_name.startswith('MSys'):  # Skip system tables
            tables.append(table_name)

    logging.info(f"Found {len(tables)} tables in Access database")
    return tables


def get_table_columns(conn, table_name):
    """Get column information for a specific table"""
    cursor = conn.cursor()
    columns = []

    # Query column information
    for row in cursor.columns(table=table_name):
        column = {
            'name': row.column_name,
            'type': map_access_type_to_pg(row.type_name),
            'nullable': row.nullable,
            'default': row.column_def
        }
        columns.append(column)

    logging.info(f"Found {len(columns)} columns in table {table_name}")
    return columns


def map_access_type_to_pg(access_type):
    """Map Access data types to PostgreSQL data types"""
    # Simple mapping of common types
    type_map = {
        'COUNTER': 'integer',
        'INTEGER': 'integer',
        'LONG': 'integer',
        'BYTE': 'smallint',
        'SMALLINT': 'smallint',
        'SINGLE': 'float',
        'DOUBLE': 'float',
        'CURRENCY': 'numeric',
        'DECIMAL': 'numeric',
        'TEXT': 'text',
        'VARCHAR': 'varchar',
        'LONGCHAR': 'text',
        'DATETIME': 'timestamp',
        'DATE': 'date',
        'TIME': 'time',
        'BIT': 'boolean',
        'YESNO': 'boolean',
        'OLEOBJECT': 'bytea',
        'BINARY': 'bytea',
        'VARBINARY': 'bytea',
        'CHAR': 'char',
        'MEMO': 'text',
    }

    # Default to text if type is unknown
    return type_map.get(access_type.upper(), 'text')


def import_table_data(access_conn, pg_session, table_name, batch_size=1000):
    """Import data from Access table to PostgreSQL"""
    try:
        logging.info(f"Starting import of table: {table_name}")

        # Get column information
        columns = get_table_columns(access_conn, table_name)
        column_names = [col['name'] for col in columns]

        # First, store column definitions in TableSchema
        for i, col in enumerate(columns):
            schema_entry = TableSchema(
                table_name=table_name,
                column_name=col['name'],
                column_type=col['type'],
                is_required=not col['nullable'],
                default_value=col['default'],
                display_order=i,
                is_visible=True
            )
            pg_session.add(schema_entry)

        pg_session.commit()
        logging.info(f"Added schema information for {len(columns)} columns")

        # Read data from Access in batches
        cursor = access_conn.cursor()
        query = f"SELECT * FROM [{table_name}]"
        cursor.execute(query)

        batch = []
        total_rows = 0

        # Process rows in batches
        row = cursor.fetchone()
        while row:
            # Convert row to dict
            row_dict = {}
            for i, value in enumerate(row):
                # Handle NULL values
                if value is None:
                    row_dict[column_names[i]] = None
                # Handle binary data
                elif isinstance(value, bytes):
                    row_dict[column_names[i]] = None  # Skip binary data
                # Handle other data types
                else:
                    row_dict[column_names[i]] = value

            # Add to batch
            batch.append(DataTable(
                table_name=table_name,
                data=row_dict
            ))

            # Process batch if batch size reached
            if len(batch) >= batch_size:
                pg_session.bulk_save_objects(batch)
                pg_session.commit()
                total_rows += len(batch)
                logging.info(f"Imported {total_rows} rows for table {table_name}")
                batch = []

            row = cursor.fetchone()

        # Process any remaining rows
        if batch:
            pg_session.bulk_save_objects(batch)
            pg_session.commit()
            total_rows += len(batch)

        logging.info(f"Completed import of {total_rows} rows for table {table_name}")
        return total_rows

    except Exception as e:
        logging.error(f"Error importing table {table_name}: {e}")
        pg_session.rollback()
        raise


def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Import MS Access database to PostgreSQL')
    parser.add_argument('access_file', help='Path to MS Access database file')
    parser.add_argument('--tables', nargs='+', help='Specific tables to import (default: all)')
    args = parser.parse_args()

    # Load environment variables
    load_dotenv()

    try:
        # Connect to MS Access
        access_conn = connect_to_access(args.access_file)

        # Get list of tables
        all_tables = get_access_tables(access_conn)

        # Filter tables if specified
        tables_to_import = args.tables if args.tables else all_tables

        # Create SQLAlchemy session
        Session = sessionmaker(bind=engine)
        pg_session = Session()

        # Create database tables if they don't exist
        Base.metadata.create_all(engine)

        # Import each table
        for table_name in tables_to_import:
            if table_name in all_tables:
                try:
                    rows_imported = import_table_data(access_conn, pg_session, table_name)
                    logging.info(f"Successfully imported {rows_imported} rows from {table_name}")
                except Exception as e:
                    logging.error(f"Failed to import table {table_name}: {e}")
            else:
                logging.warning(f"Table {table_name} not found in Access database")

        # Close connections
        access_conn.close()
        pg_session.close()

        logging.info("Import completed successfully")

    except Exception as e:
        logging.error(f"Import failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
