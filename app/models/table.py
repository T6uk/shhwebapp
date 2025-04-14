from sqlalchemy import Table, MetaData
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()
metadata = MetaData()

# Instead of defining a specific model with hardcoded columns,
# we'll create a dynamic reflected table that will get columns from the database
BigTable = Table(
    "taitur_data",  # Replace with your actual table name
    metadata,
    autoload_with=None  # This will be set at runtime with the engine
)