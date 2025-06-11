# koondaja_routes.py (or whatever your file is named)
import csv
import json
import logging
import os
import re
from datetime import datetime
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_active_user
from app.core.db import get_db
from app.models.user import User

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create router with proper prefix to match JavaScript calls
router = APIRouter(prefix="/api/v1/koondaja", tags=["koondaja"])


@router.get("/browse-koondaja-folder")
async def browse_koondaja_folder(
        path: str = "",
        current_user: User = Depends(get_current_active_user)
):
    """Browse the Koondaja folder structure"""
    try:
        base_path = r"C:\TAITEMENETLUS\ÜLESANDED\Tööriistad\ROCKI"

        if path:
            # Handle path normalization
            path = path.replace('/', os.sep).replace('\\', os.sep)
            full_path = os.path.join(base_path, path)
        else:
            full_path = base_path

        logger.info(f"Browsing Koondaja folder: {full_path}")

        if not os.path.exists(full_path):
            logger.error(f"Path does not exist: {full_path}")
            return {
                "success": False,
                "error": f"Path does not exist: {full_path}",
                "items": []
            }

        if not os.path.isdir(full_path):
            logger.error(f"Path is not a directory: {full_path}")
            return {
                "success": False,
                "error": f"Path is not a directory: {full_path}",
                "items": []
            }

        items = []

        try:
            for item in os.listdir(full_path):
                item_path = os.path.join(full_path, item)

                try:
                    if os.path.isdir(item_path):
                        # Construct relative path properly
                        relative_path = os.path.join(path, item) if path else item
                        items.append({
                            "name": item,
                            "type": "folder",
                            "path": relative_path.replace(os.sep, '/'),  # Use forward slashes for consistency
                            "full_path": item_path
                        })
                    elif item.lower().endswith('.csv'):
                        stats = os.stat(item_path)
                        items.append({
                            "name": item,
                            "type": "file",
                            "path": item_path,  # Full path for files
                            "size": stats.st_size,
                            "modified": datetime.fromtimestamp(stats.st_mtime).strftime("%d.%m.%Y %H:%M")
                        })
                except (OSError, PermissionError) as e:
                    logger.warning(f"Cannot access item {item_path}: {e}")
                    continue
        except PermissionError as e:
            logger.error(f"Permission denied accessing directory: {full_path}")
            return {
                "success": False,
                "error": f"Permission denied accessing directory",
                "items": []
            }

        # Sort: folders first, then files, both alphabetically
        items.sort(key=lambda x: (x["type"] == "file", x["name"].lower()))

        logger.info(f"Found {len(items)} items in {full_path}")

        return {
            "success": True,
            "current_path": path,
            "full_path": full_path,
            "items": items
        }

    except Exception as e:
        logger.exception(f"Error browsing Koondaja folder: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error browsing folder: {str(e)}")


@router.get("/koondaja-list-files")
async def list_koondaja_files(
        folder: str,
        current_user: User = Depends(get_current_active_user)
):
    """List all CSV files in a specific Koondaja folder"""
    try:
        base_path = r"C:\TAITEMENETLUS\ÜLESANDED\Tööriistad\ROCKI"
        folder_path = os.path.join(base_path, folder)

        logger.info(f"Listing CSV files in: {folder_path}")

        if not os.path.exists(folder_path):
            logger.warning(f"Folder does not exist: {folder_path}")
            return {
                "success": True,
                "files": [],
                "folder": folder
            }

        if not os.path.isdir(folder_path):
            logger.warning(f"Path is not a directory: {folder_path}")
            return {
                "success": True,
                "files": [],
                "folder": folder
            }

        files = []

        try:
            for item in os.listdir(folder_path):
                if item.lower().endswith('.csv'):
                    item_path = os.path.join(folder_path, item)
                    try:
                        stats = os.stat(item_path)
                        files.append({
                            "name": item,
                            "path": item_path,
                            "size": stats.st_size,
                            "modified": datetime.fromtimestamp(stats.st_mtime).strftime("%d.%m.%Y %H:%M")
                        })
                    except (OSError, PermissionError) as e:
                        logger.warning(f"Cannot access file {item_path}: {e}")
                        continue
        except PermissionError as e:
            logger.error(f"Permission denied accessing directory: {folder_path}")
            return {
                "success": False,
                "error": f"Permission denied accessing directory",
                "files": [],
                "folder": folder
            }

        # Sort files by name
        files.sort(key=lambda x: x["name"].lower())

        logger.info(f"Found {len(files)} CSV files in {folder}")

        return {
            "success": True,
            "files": files,
            "folder": folder,
            "count": len(files)
        }

    except Exception as e:
        logger.exception(f"Error listing files in folder {folder}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error listing files: {str(e)}")


@router.post("/import-koondaja-csv")
async def import_koondaja_csv(
        request: Request,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_active_user)
):
    """Import CSV file for Koondaja data"""
    try:
        # Get the request body
        try:
            body = await request.json()
            logger.info(f"Received Koondaja import request body: {body}")
        except Exception as e:
            logger.error(f"Error parsing request body: {str(e)}")
            raise HTTPException(status_code=400, detail="Invalid JSON in request body")

        file_path = body.get('file_path')
        folder_name = body.get('folder_name')  # Can be passed explicitly

        if not file_path:
            logger.error("No file_path provided in request")
            raise HTTPException(status_code=400, detail="File path is required")

        logger.info(f"Attempting to import Koondaja CSV file: {file_path}")

        if not os.path.exists(file_path):
            logger.error(f"File not found: {file_path}")
            raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

        if not os.path.isfile(file_path):
            logger.error(f"Path is not a file: {file_path}")
            raise HTTPException(status_code=400, detail=f"Path is not a file: {file_path}")

        # Determine which folder this file is from
        if not folder_name:
            folder_name = os.path.basename(os.path.dirname(file_path))
        logger.info(f"Processing file from folder: {folder_name}")

        # Skip if not Konto vv (for now)
        if folder_name.lower() != "konto vv":
            logger.info(f"Skipping folder '{folder_name}' - not implemented yet")
            return {
                "success": True,
                "message": f"Folder '{folder_name}' processing not implemented yet",
                "data": [],
                "folder_type": folder_name.lower(),
                "valid_rows": 0
            }

        data = []

        # Try different encodings to handle Estonian characters
        encodings = ['utf-8-sig', 'utf-8', 'windows-1252', 'iso-8859-15', 'cp1257']
        content = None
        used_encoding = None

        for encoding in encodings:
            try:
                logger.debug(f"Trying encoding: {encoding}")
                with open(file_path, 'r', encoding=encoding) as csvfile:
                    content = csvfile.read()
                    used_encoding = encoding
                    logger.info(f"Successfully read file with encoding: {encoding}")
                    break
            except UnicodeDecodeError as e:
                logger.debug(f"Failed to read with encoding {encoding}: {str(e)}")
                continue
            except Exception as e:
                logger.error(f"Unexpected error reading file with encoding {encoding}: {str(e)}")
                continue

        if content is None:
            logger.error("Unable to decode file with any supported encoding")
            raise HTTPException(status_code=400, detail="Unable to decode file with supported encodings")

        if not content.strip():
            logger.error("File is empty")
            raise HTTPException(status_code=400, detail="File is empty")

        # Parse CSV content based on folder type
        try:
            lines = content.split('\n')
            csv_reader = csv.reader(lines, delimiter=';')

            # No header row to skip since CSVs don't have headers

            row_count = 0
            processed_rows = 0

            for row_num, row in enumerate(csv_reader, start=1):
                if not row:  # Skip completely empty rows
                    continue

                row_count += 1

                # Clean row data - strip whitespace from all fields and handle None values
                cleaned_row = []
                for field in row:
                    if field is None:
                        cleaned_row.append("")
                    else:
                        cleaned_row.append(str(field).strip())

                row = cleaned_row

                # Skip rows that are essentially empty
                if len([f for f in row if f.strip()]) < 3:
                    logger.debug(f"Skipping row {row_num} - insufficient data")
                    continue

                row_data = {}

                try:
                    # Updated section for the import_koondaja_csv function in koondaja_routes.py

                    if folder_name.lower() == "konto vv":
                        # Process Konto vv folder files
                        logger.debug(f"Row {row_num}: {len(row)} columns - {row[:10] if len(row) > 10 else row}")

                        # Only process rows where 8th item (index 7) = 'C'
                        if len(row) > 7 and row[7] == 'C':
                            logger.debug(f"Processing Konto vv row {row_num} with {len(row)} columns")

                            # Map columns according to specification
                            row_data["Esimene"] = row[10] if len(row) > 10 else ""
                            row_data["Viitenumber"] = row[9] if len(row) > 9 else ""
                            row_data["Selgitus"] = row[11] if len(row) > 11 else ""
                            row_data["Makse_summa"] = row[8] if len(row) > 8 else ""

                            # Extract toimiku number from Selgitus and store in "Toimik_mk_jargi"
                            selgitus = row_data["Selgitus"]
                            toimiku_match = re.search(r'(\d+/\d+/\d+)', selgitus)
                            if toimiku_match:
                                row_data["Toimik_mk_jargi"] = toimiku_match.group(1)
                            else:
                                row_data["Toimik_mk_jargi"] = ""

                            # Get the last value from the CSV row for database lookup (for Toimik_ik_jargi)
                            last_value = row[-1] if row else ""

                            # Look up toimiku_nr from database using the last CSV value
                            if last_value.strip():
                                try:
                                    lookup_query = text("""
                                        SELECT "toimiku_nr" 
                                        FROM "taitur_data" 
                                        WHERE "võlgniku_kood" = :last_value 
                                        LIMIT 1
                                    """)

                                    db_result = await db.execute(lookup_query, {"last_value": last_value.strip()})
                                    db_row = db_result.fetchone()

                                    if db_row:
                                        row_data["Toimik_ik_jargi"] = db_row[0]
                                    else:
                                        row_data["Toimik_ik_jargi"] = ""
                                        logger.debug(f"No matching toimiku_nr found for last value: {last_value}")

                                except Exception as e:
                                    logger.warning(f"Error looking up toimiku_nr for row {row_num}: {str(e)}")
                                    row_data["Toimik_ik_jargi"] = ""
                            else:
                                row_data["Toimik_ik_jargi"] = ""

                            # Look up toimiku_nr from database using Viitenumber (for Toimik_vn_jargi)
                            viitenumber = row_data["Viitenumber"]
                            if viitenumber.strip():
                                try:
                                    viitenumber_query = text("""
                                        SELECT "toimiku_nr" 
                                        FROM "taitur_data" 
                                        WHERE "viitenumber" = :viitenumber 
                                        LIMIT 1
                                    """)

                                    vn_result = await db.execute(viitenumber_query,
                                                                 {"viitenumber": viitenumber.strip()})
                                    vn_row = vn_result.fetchone()

                                    if vn_row:
                                        row_data["Toimik_vn_jargi"] = vn_row[0]
                                    else:
                                        row_data["Toimik_vn_jargi"] = ""
                                        logger.debug(f"No matching toimiku_nr found for viitenumber: {viitenumber}")

                                except Exception as e:
                                    logger.warning(
                                        f"Error looking up toimiku_nr by viitenumber for row {row_num}: {str(e)}")
                                    row_data["Toimik_vn_jargi"] = ""
                            else:
                                row_data["Toimik_vn_jargi"] = ""

                            # Initialize other required columns
                            row_data["Jaak_peale_makset"] = ""

                            # Enhanced validation logic with detailed status tracking
                            toimik_mk = row_data["Toimik_mk_jargi"].strip()
                            toimik_vn = row_data["Toimik_vn_jargi"].strip()
                            toimik_ik = row_data["Toimik_ik_jargi"].strip()

                            # Validation status tracking
                            validation_status = {
                                "is_valid": False,
                                "match_source": None,
                                "has_mk": bool(toimik_mk),
                                "has_vn": bool(toimik_vn),
                                "has_ik": bool(toimik_ik)
                            }

                            if toimik_mk and (toimik_mk == toimik_vn or toimik_mk == toimik_ik):
                                # Match found - use the matching value for Toimiku_nr
                                row_data["Toimiku_nr"] = toimik_mk
                                validation_status["is_valid"] = True
                                validation_status["match_source"] = "vn" if toimik_mk == toimik_vn else "ik"
                                logger.debug(
                                    f"Row {row_num}: Match found - Toimiku_nr set to '{toimik_mk}' (source: {validation_status['match_source']})")
                            else:
                                # No match found - leave Toimiku_nr empty
                                row_data["Toimiku_nr"] = ""
                                validation_status["is_valid"] = False
                                logger.warning(
                                    f"Row {row_num}: No match found - Toimik_mk_jargi='{toimik_mk}', Toimik_vn_jargi='{toimik_vn}', Toimik_ik_jargi='{toimik_ik}'")

                            # Add validation metadata for frontend use
                            row_data["_validation_status"] = validation_status
                            row_data["_needs_highlighting"] = not validation_status["is_valid"]

                            # Add a readable validation message for tooltips/debugging
                            if validation_status["is_valid"]:
                                row_data[
                                    "_validation_message"] = f"Valid - matched with {validation_status['match_source']} lookup"
                            else:
                                reasons = []
                                if not toimik_mk:
                                    reasons.append("No toimiku number in selgitus")
                                if not toimik_vn and not toimik_ik:
                                    reasons.append("No database matches found")
                                elif toimik_mk and toimik_vn and toimik_ik and toimik_mk != toimik_vn and toimik_mk != toimik_ik:
                                    reasons.append("Toimiku numbers don't match")

                                row_data["_validation_message"] = f"Invalid - {'; '.join(reasons)}"

                            data.append(row_data)
                            processed_rows += 1
                            logger.debug(f"Added row {row_num} to data: validation={validation_status['is_valid']}")
                        else:
                            logger.debug(
                                f"Skipping row {row_num} - 8th item is '{row[7] if len(row) > 7 else 'N/A'}' (not 'C') or row too short ({len(row)} columns)")

                    else:
                        # Handle other folders (to be implemented)
                        logger.warning(f"Folder '{folder_name}' processing not yet implemented")
                        continue

                except Exception as e:
                    logger.warning(f"Error processing row {row_num}: {str(e)}")
                    logger.debug(f"Row data that caused error: {row}")
                    continue

            logger.info(
                f"Successfully processed {processed_rows} out of {row_count} rows from {os.path.basename(file_path)}")

            return {
                "success": True,
                "message": f"Successfully imported {len(data)} rows from {os.path.basename(file_path)}",
                "data": data,
                "folder_type": folder_name.lower(),
                "encoding_used": used_encoding,
                "total_rows_processed": row_count,
                "valid_rows": len(data)
            }

        except Exception as e:
            logger.error(f"Error parsing CSV content: {str(e)}")
            raise HTTPException(status_code=400, detail=f"Error parsing CSV file: {str(e)}")

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Unexpected error importing Koondaja CSV: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Unexpected error importing CSV: {str(e)}")


@router.post("/koondaja-fetch-columns")
async def fetch_koondaja_columns(
        request: Request,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_active_user)
):
    """Fetch additional columns from the main database for Koondaja rows"""
    try:
        body = await request.json()
        toimiku_numbers = body.get('toimiku_numbers', [])
        fields = body.get('fields', [])

        if not toimiku_numbers or not fields:
            return {
                "success": True,
                "data": []
            }

        # Build query to fetch requested fields for the given toimiku numbers
        field_list = ', '.join([f'"{field}"' for field in fields])
        placeholders = ', '.join([f':tn_{i}' for i in range(len(toimiku_numbers))])

        query = f"""
            SELECT "toimiku_nr", {field_list}
            FROM "taitur_data"
            WHERE "toimiku_nr" IN ({placeholders})
        """

        # Create parameters
        params = {f'tn_{i}': tn for i, tn in enumerate(toimiku_numbers)}

        result = await db.execute(text(query), params)
        rows = result.fetchall()

        # Convert to list of dicts
        data = []
        for row in rows:
            row_dict = {}
            for key in row._mapping.keys():
                value = row._mapping[key]
                # Handle datetime objects for JSON serialization
                if hasattr(value, 'isoformat'):
                    row_dict[str(key)] = value.isoformat()
                else:
                    row_dict[str(key)] = value
            data.append(row_dict)

        logger.info(f"Fetched {len(data)} rows with additional columns")

        return {
            "success": True,
            "data": data
        }

    except Exception as e:
        logger.exception(f"Error fetching Koondaja columns: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching columns: {str(e)}")
