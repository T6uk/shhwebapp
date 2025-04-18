# app/utils/db_exporter.py
import os
import logging
from sqlalchemy import create_engine, inspect, MetaData, Table, text
from sqlalchemy.schema import CreateTable
from sqlalchemy.dialects import postgresql, sqlite
import pandas as pd
import argparse
import sys
import time

from app.core.config import settings

# Configure logger
logger = logging.getLogger(__name__)


def get_postgres_engine():
    """Create a direct connection to the PostgreSQL database"""
    postgres_url = (
        f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@"
        f"{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}"
    )
    engine = create_engine(postgres_url, echo=False)
    return engine


def get_sqlite_engine(db_path=None):
    """Create a connection to a SQLite database"""
    if db_path is None:
        db_path = os.path.join(settings.DATA_DIR, "local_data.db")

    # Ensure directory exists
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    sqlite_url = f"sqlite:///{db_path}"
    engine = create_engine(sqlite_url, echo=False)
    return engine, db_path


def get_table_create_statement(source_engine, table_name="taitur_data", dialect=postgresql.dialect()):
    """Get CREATE TABLE statement for the specified table"""
    try:
        # Create metadata object
        metadata = MetaData()

        # Reflect the table
        table = Table(table_name, metadata, autoload_with=source_engine)

        # Generate CREATE TABLE statement
        create_stmt = CreateTable(table).compile(dialect=dialect)

        return str(create_stmt)
    except Exception as e:
        logger.error(f"Error getting CREATE TABLE statement: {e}")
        raise


def export_table_schema(source_engine, output_file=None, table_name="taitur_data"):
    """Export table schema to an SQL file"""
    if output_file is None:
        output_file = os.path.join(settings.DATA_DIR, f"{table_name}_schema.sql")

    # Ensure directory exists
    os.makedirs(os.path.dirname(output_file), exist_ok=True)

    try:
        # Get PostgreSQL CREATE TABLE statement
        pg_create_stmt = get_table_create_statement(source_engine, table_name)

        # Convert to SQLite compatible CREATE TABLE statement
        sqlite_dialect = sqlite.dialect()
        metadata = MetaData()
        table = Table(table_name, metadata, autoload_with=source_engine)
        sqlite_create_stmt = str(CreateTable(table).compile(dialect=sqlite_dialect))

        # Write both statements to file with comments
        with open(output_file, 'w') as f:
            f.write("-- PostgreSQL CREATE TABLE statement\n")
            f.write(pg_create_stmt)
            f.write(";\n\n")
            f.write("-- SQLite compatible CREATE TABLE statement\n")
            f.write(sqlite_create_stmt)
            f.write(";\n")

        logger.info(f"Table schema exported to {output_file}")
        return output_file
    except Exception as e:
        logger.error(f"Error exporting table schema: {e}")
        raise


def export_table_data(source_engine, output_file=None, table_name="taitur_data",
                      batch_size=1000, format="sql"):
    """Export table data to a file in SQL or CSV format"""
    if output_file is None:
        output_file = os.path.join(settings.DATA_DIR, f"{table_name}_data.{format}")

    # Ensure directory exists
    os.makedirs(os.path.dirname(output_file), exist_ok=True)

    try:
        # Get total row count to show progress
        with source_engine.connect() as conn:
            row_count = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar()

        logger.info(f"Exporting {row_count} rows from {table_name}...")
        start_time = time.time()

        if format.lower() == "csv":
            # Export to CSV using pandas for efficiency
            df = pd.read_sql_table(table_name, source_engine)
            df.to_csv(output_file, index=False)
            logger.info(f"Data exported to CSV file: {output_file}")
        else:  # SQL format
            # Export data as INSERT statements
            # Using batch processing to handle large tables efficiently
            offset = 0

            with open(output_file, 'w') as f:
                f.write(f"-- Data for table {table_name}\n")
                f.write(f"-- Total rows: {row_count}\n")
                f.write(f"-- Export date: {time.strftime('%Y-%m-%d %H:%M:%S')}\n\n")
                f.write("BEGIN TRANSACTION;\n\n")

                while True:
                    # Read a batch of data
                    query = text(f"SELECT * FROM {table_name} LIMIT {batch_size} OFFSET {offset}")
                    df_batch = pd.read_sql(query, source_engine)

                    # If no more data, break
                    if df_batch.empty:
                        break

                    # Write INSERT statements for this batch
                    for _, row in df_batch.iterrows():
                        # Generate an INSERT statement with proper escaping
                        columns = ", ".join(f'"{col}"' for col in df_batch.columns)
                        values = ", ".join([
                            f"'{str(val).replace(\"'\", \"''\")}'" if val is not None else "NULL"
                            for val in row
                            ])
                            f.write(f"INSERT INTO {table_name} ({columns}) VALUES ({values});\n")

                        # Update offset for next batch
                        offset += batch_size

                        # Show progress
                        progress = min(offset, row_count)
                        elapsed = time.time() - start_time
                        rows_per_sec = progress / elapsed if elapsed > 0 else 0
                        logger.info(
                            f"Exported {progress}/{row_count} rows ({progress / row_count * 100:.1f}%) - {rows_per_sec:.1f} rows/sec")

                        # Add commit statement at the end
                        f.write("\nCOMMIT;\n")

                        elapsed = time.time() - start_time
                        logger.info(f"Table data export completed in {elapsed:.2f} seconds: {output_file}")
        return output_file
    except Exception as e:
        logger.error(f"Error exporting table data: {e}")
        raise


def import_data_to_sqlite(schema_file, data_file, db_path=None, table_name="taitur_data"):
    """Import schema and data to SQLite database"""
    if db_path is None:
        db_path = os.path.join(settings.DATA_DIR, "local_data.db")

    # Ensure directory exists
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    # Create SQLite engine
    sqlite_engine, db_path = get_sqlite_engine(db_path)

    try:
        # Read the schema file to get the SQLite CREATE TABLE statement
        with open(schema_file, 'r') as f:
            schema_sql = f.read()

        # Extract the SQLite schema (assuming it's the second statement in the file)
        sqlite_stmt = schema_sql.split("-- SQLite compatible CREATE TABLE statement")[1].strip()

        # Create the table
        with sqlite_engine.connect() as conn:
            conn.execute(text(f"DROP TABLE IF EXISTS {table_name}"))
            conn.execute(text(sqlite_stmt))
            conn.commit()
            logger.info(f"Created table {table_name} in SQLite database")

        # Read data format (SQL or CSV)
        data_format = os.path.splitext(data_file)[1].lower()
        start_time = time.time()

        if data_format == '.csv':
            # Import CSV data using pandas
            df = pd.read_csv(data_file)
            df.to_sql(table_name, sqlite_engine, if_exists='append', index=False,
                      method='multi', chunksize=1000)
            logger.info(f"Imported {len(df)} rows from CSV file")
        else:  # SQL format
            # Execute the SQL file directly for better performance
            # This approach is faster than parsing and executing individual statements
            with sqlite_engine.connect() as conn:
                with open(data_file, 'r') as f:
                    sql_script = f.read()

                # Execute the script (SQLite will handle the transaction)
                conn.execute(text(sql_script))
                conn.commit()

                # Get row count for confirmation
                row_count = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar()
                logger.info(f"Imported {row_count} rows to SQLite database")

        elapsed = time.time() - start_time
        logger.info(f"Data import completed in {elapsed:.2f} seconds: {db_path}")
        return db_path
    except Exception as e:
        logger.error(f"Error importing data to SQLite: {e}")
        raise


def main():
    """Command line interface for database export/import functions"""
    # Set up argument parser
    parser = argparse.ArgumentParser(description='Export or import database schema and data')
    subparsers = parser.add_subparsers(dest='command', help='Command to run')

    # Export command
    export_parser = subparsers.add_parser('export', help='Export schema and data from PostgreSQL')
    export_parser.add_argument('--schema-file', help='Output file for schema SQL')
    export_parser.add_argument('--data-file', help='Output file for data SQL/CSV')
    export_parser.add_argument('--table', default='taitur_data', help='Table name to export')
    export_parser.add_argument('--format', choices=['sql', 'csv'], default='sql',
                               help='Data export format (sql or csv)')
    export_parser.add_argument('--batch-size', type=int, default=1000,
                               help='Batch size for processing large tables')

    # Import command
    import_parser = subparsers.add_parser('import', help='Import schema and data to SQLite')
    import_parser.add_argument('--schema-file', required=True, help='Schema SQL file to import')
    import_parser.add_argument('--data-file', required=True, help='Data SQL/CSV file to import')
    import_parser.add_argument('--sqlite-db', help='SQLite database file to create/use')
    import_parser.add_argument('--table', default='taitur_data', help='Table name to import')

    # Parse arguments
    args = parser.parse_args()

    # Set up logging to console
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    if args.command == 'export':
        # Export schema and data
        pg_engine = get_postgres_engine()

        # Export schema
        schema_file = export_table_schema(
            pg_engine,
            output_file=args.schema_file,
            table_name=args.table
        )

        # Export data
        data_file = export_table_data(
            pg_engine,
            output_file=args.data_file,
            table_name=args.table,
            batch_size=args.batch_size,
            format=args.format
        )

        logger.info(f"Export completed. Schema: {schema_file}, Data: {data_file}")

    elif args.command == 'import':
        # Import schema and data to SQLite
        db_path = import_data_to_sqlite(
            args.schema_file,
            args.data_file,
            db_path=args.sqlite_db,
            table_name=args.table
        )

        logger.info(f"Import completed to SQLite database: {db_path}")

    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()