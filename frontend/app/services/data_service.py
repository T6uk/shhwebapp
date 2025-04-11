from sqlalchemy.ext.asyncio import AsyncSession
from app.db import crud
from typing import Dict, List, Tuple, Optional, Any
import logging
import csv
import io
import pandas as pd
import json
from datetime import datetime

# Configure logging
logger = logging.getLogger(__name__)


class DataService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_all_tables(self) -> List[str]:
        """Get list of all tables in the database"""
        return await crud.get_tables(self.db)

    async def get_table_info(self, table_name: str = None) -> Dict[str, Any]:
        """Get table metadata including columns, primary keys, etc."""
        tables = await self.get_all_tables()

        if not table_name and tables:
            table_name = tables[0]

        if not table_name:
            return {"error": "No tables found in database"}

        columns = await crud.get_columns(self.db, table_name)
        primary_keys = await crud.get_primary_keys(self.db, table_name)
        row_count = await crud.get_table_row_count(self.db, table_name)

        return {
            "table_name": table_name,
            "columns": columns,
            "primary_keys": primary_keys,
            "row_count": row_count
        }

    async def get_paginated_data(
            self,
            table_name: str = None,
            page: int = 1,
            page_size: int = 100,
            sort_column: Optional[str] = None,
            sort_direction: str = "asc",
            filters: Optional[Dict[str, Any]] = None,
            search: Optional[str] = None,
            columns: Optional[List[str]] = None
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        Get paginated data with sorting, filtering and search
        Returns (data_list, total_count)
        """
        # Get table name if not provided
        if not table_name:
            tables = await self.get_all_tables()
            if not tables:
                return [], 0
            table_name = tables[0]

        # Calculate offset from page
        skip = (page - 1) * page_size

        return await crud.get_data(
            db=self.db,
            table_name=table_name,
            skip=skip,
            limit=page_size,
            sort_column=sort_column,
            sort_direction=sort_direction,
            filters=filters,
            search=search,
            columns=columns
        )

    async def export_data(
            self,
            format: str = "csv",
            table_name: str = None,
            filters: Optional[Dict[str, Any]] = None,
            columns: Optional[List[str]] = None
    ) -> Tuple[bytes, str]:
        """
        Export filtered data to CSV or Excel
        Returns (file_content, filename)
        """
        # Get table name if not provided
        if not table_name:
            tables = await self.get_all_tables()
            if not tables:
                return b"", "empty_export.csv"
            table_name = tables[0]

        # Get all data matching filters (no pagination)
        data, _ = await crud.get_data(
            db=self.db,
            table_name=table_name,
            skip=0,
            limit=100000,  # Large limit to get all data
            filters=filters,
            columns=columns
        )

        # Generate filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        if format.lower() == "csv":
            # Generate CSV
            output = io.StringIO()
            if data:
                writer = csv.DictWriter(output, fieldnames=data[0].keys())
                writer.writeheader()
                writer.writerows(data)

            return output.getvalue().encode(), f"{table_name}_{timestamp}.csv"

        elif format.lower() == "excel":
            # Generate Excel
            output = io.BytesIO()
            df = pd.DataFrame(data)
            df.to_excel(output, index=False)
            output.seek(0)

            return output.getvalue(), f"{table_name}_{timestamp}.xlsx"

        elif format.lower() == "json":
            # Generate JSON
            output = json.dumps(data, default=str, indent=2)
            return output.encode(), f"{table_name}_{timestamp}.json"

        else:
            raise ValueError(f"Unsupported export format: {format}")

    async def get_data_stats(self, table_name: str = None, columns: List[str] = None) -> Dict[str, Any]:
        """Get statistical information about the data"""
        # Get table name if not provided
        if not table_name:
            tables = await self.get_all_tables()
            if not tables:
                return {"error": "No tables found"}
            table_name = tables[0]

        # Get total row count
        row_count = await crud.get_table_row_count(self.db, table_name)

        # Get column statistics using SQL
        stats = {}

        if not columns:
            # Get all columns
            column_info = await crud.get_columns(self.db, table_name)
            columns = [col["name"] for col in column_info]

        for column in columns:
            # Get basic stats for each column
            query = f"""
                SELECT 
                    COUNT({column}) as count,
                    COUNT(DISTINCT {column}) as unique_count
                FROM {table_name}
            """

            result = await crud.execute_raw_query(self.db, query)
            if result:
                stats[column] = result[0]

        return {
            "table_name": table_name,
            "row_count": row_count,
            "column_stats": stats
        }