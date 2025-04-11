#!/usr/bin/env python3
"""
Script to discover existing PostgreSQL tables and register them in the application.
This creates necessary metadata records in the data_table and table_schema tables.
"""
import os
import sys
import json
import argparse
from sqlalchemy import create_engine, inspect, MetaData, Table, Column, text
import logging
from dotenv import load_dotenv

# Add parent directory to path to import app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.models.data_models import Base, DataTable, TableSchema
from app.database import engine, SessionLocal, init_db

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("discover_tables.log"),
        logging.StreamHandler()
    ]
)


def map_pg_type_to_simple_type(pg_type):
    """Map PostgreSQL data types to simplified types for the UI"""
    # Simple mapping of common types
    if pg_type in ('integer', 'bigint', 'smallint'):
        return 'integer'
    elif pg_type in ('numeric', 'decimal', 'real', 'double precision'):
        return 'number'
    elif pg_type in ('text', 'character varying', 'varchar', 'char', 'character'):
        return 'text'
    elif pg_type in ('timestamp', 'timestamp with time zone', 'timestamp without time zone'):
        return 'datetime'
    elif pg_type in ('date'):
        return 'date'
    elif pg_type in ('time', 'time with time zone', 'time without time zone'):
        return 'time'
    elif pg_type in ('boolean'):
        return 'boolean'
    elif pg_type in ('bytea', 'binary'):
        return 'binary'
    elif pg_type in ('json', 'jsonb'):
        return 'json'
    # Default to text for unknown types
    return 'text'


def discover_tables(schema='public', exclude_tables=None):
    """
    Discover existing tables in PostgreSQL and register them in the application.
    Exclude system tables and optionally user-specified tables.
    """
    if exclude_tables is None:
        exclude_tables = []

    # Always exclude the application's metadata tables
    exclude_tables.extend(['data_table', 'table_schema'])

    try:
        # First, make sure our metadata tables exist
        init_db()

        # Get DB session
        session = SessionLocal()

        # Get database inspector
        inspector = inspect(engine)

        # Get list of tables in the specified schema
        tables = inspector.get_table_names(schema=schema)

        total_tables = 0

        for table_name in tables:
            # Skip excluded tables
            if table_name in exclude_tables:
                logging.info(f"Skipping excluded table: {table_name}")
                continue

            try:
                # Check if table is already registered
                existing = session.query(DataTable).filter(
                    DataTable.table_name == table_name
                ).first()

                if existing:
                    logging.info(f"Table {table_name} is already registered")
                    continue

                # Get column information
                columns = inspector.get_columns(table_name, schema=schema)

                # Create dummy entry in data_table
                dummy_entry = DataTable(
                    table_name=table_name,
                    description=f"Imported from PostgreSQL schema {schema}",
                    data={}  # Empty data for metadata entry
                )
                session.add(dummy_entry)
                session.commit()

                # Add columns to table_schema
                for i, col in enumerate(columns):
                    col_name = col['name']
                    col_type = map_pg_type_to_simple_type(str(col['type']))

                    schema_entry = TableSchema(
                        table_name=table_name,
                        column_name=col_name,
                        column_type=col_type,
                        is_required=not col.get('nullable', True),
                        default_value=str(col.get('default', '')),
                        description='',
                        display_order=i,
                        is_visible=True
                    )
                    session.add(schema_entry)

                session.commit()
                logging.info(f"Registered table {table_name} with {len(columns)} columns")
                total_tables += 1

            except Exception as e:
                session.rollback()
                logging.error(f"Error registering table {table_name}: {e}")

        session.close()
        logging.info(f"Completed table discovery. Registered {total_tables} new tables.")
        return total_tables

    except Exception as e:
        logging.error(f"Error discovering tables: {e}")
        raise


def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Discover PostgreSQL tables and register them in the application')
    parser.add_argument('--schema', default='public', help='PostgreSQL schema to scan (default: public)')
    parser.add_argument('--exclude', nargs='+', help='Tables to exclude from discovery')
    args = parser.parse_args()

    # Load environment variables
    load_dotenv()

    try:
        total_tables = discover_tables(schema=args.schema, exclude_tables=args.exclude)
        logging.info(f"Successfully registered {total_tables} tables")
    except Exception as e:
        logging.error(f"Discovery failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()