# koondaja.py - Updated with toimiku_nr_loplik logic
import csv
import logging
import os
import re
from datetime import datetime
from typing import Any, Dict, List, Optional
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_active_user
from app.core.db import get_db
from app.models.user import User

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create router with proper prefix
router = APIRouter(prefix="/api/v1/koondaja", tags=["koondaja"])

# Column definitions for easy maintenance and extension
KOONDAJA_COLUMNS = {
    "toimiku_nr_loplik": {"name": "Toimiku nr lõplik", "source": "calculated"},
    "toimiku_nr_selgituses": {"name": "Toimiku nr selgituses", "source": "extracted"},
    "toimiku_nr_viitenumbris": {"name": "Toimiku nr viitenumbris", "source": "db_lookup"},
    "dokumendi_nr": {"name": "Dokumendi nr", "source": "csv", "index": 1},
    "kande_kpv": {"name": "Kande kpv", "source": "csv", "index": 2},
    "arvelduskonto_nr": {"name": "Arvelduskonto nr", "source": "csv", "index": 3},
    "panga_tunnus_nimi": {"name": "Panga tunnus nimi", "source": "csv", "index": 4},
    "panga_tunnus": {"name": "Panga tunnus", "source": "csv", "index": 5},
    "nimi_baasis": {"name": "Nimi baasis", "source": "db", "field": "võlgnik"},
    "noude_sisu": {"name": "Nõude sisu", "source": "db", "field": "nõude_sisu"},
    "toimiku_jaak": {"name": "Toimiku jääk", "source": "db", "field": "võla_jääk"},
    "staatus_baasis": {"name": "Staatus baasis", "source": "db", "field": "staatus"},
    "toimikute_arv": {"name": "Toimikute arv tööbaasis", "source": "calculated"},
    "toimikute_jaakide_summa": {"name": "Toimikute jääkide summa tööbaasis", "source": "calculated"},
    "vahe": {"name": "Vahe", "source": "calculated"},
    "elatus_miinimumid": {"name": "Elatus-miinimumid", "source": "empty"},
    "laekumiste_arv": {"name": "Laekumiste arv", "source": "calculated"},
    "laekumised_kokku": {"name": "Laekumised kokku", "source": "calculated"},
    "tagastamised": {"name": "Tagastamised", "source": "empty"},
    "s_v": {"name": "S/V", "source": "csv", "index": 7},
    "summa": {"name": "Summa", "source": "csv", "index": 8},
    "viitenumber": {"name": "Viitenumber", "source": "csv", "index": 9},
    "arhiveerimistunnus": {"name": "Arhiveerimistunnus", "source": "csv", "index": 10},
    "makse_selgitus": {"name": "Makse selgitus", "source": "csv", "index": 11},
    "valuuta": {"name": "Valuuta", "source": "fixed", "value": "EUR"},
    "isiku_registrikood": {"name": "Isiku- või registrikood", "source": "csv", "index": 14},
    "laekumise_tunnus": {"name": "Laekumise tunnus", "source": "empty"},
    "laekumise_kood": {"name": "Laekumise kood deposiidis", "source": "empty"},
    "kliendi_konto": {"name": "Kliendi konto", "source": "csv", "index": 0},
    "em_markus": {"name": "EM märkus", "source": "db", "field": "rmp_märkused"},
    "toimiku_markused": {"name": "Toimiku märkused", "source": "db", "field": "märkused"}
}


def safe_number_conversion(value: Any, default: float = 0.0) -> float:
    """Safely convert a value to float, handling Estonian number format."""
    if value is None:
        return default

    try:
        if isinstance(value, (int, float)):
            return float(value)

        if isinstance(value, str):
            cleaned = value.strip()
            if not cleaned:
                return default

            # Handle Estonian number format
            cleaned = cleaned.replace(' ', '').replace(',', '.')

            if cleaned.startswith('-'):
                return -float(cleaned[1:])

            return float(cleaned)

        return float(value)

    except (ValueError, TypeError, AttributeError):
        logger.debug(f"Could not convert '{value}' to float, using default {default}")
        return default


def extract_toimiku_number(text: str) -> Optional[str]:
    """Extract toimiku number from text using pattern matching."""
    if not text:
        return None

    # Look for pattern like xxx/xxx/xxx
    match = re.search(r'(\d+/\d+/\d+)', text)
    if match:
        return match.group(1)

    return None


async def get_database_info(db: AsyncSession, toimiku_numbers: List[str], viitenumbers: List[str],
                            registrikoodid: List[str]) -> Dict[str, Dict]:
    """Fetch all required database information in one efficient query including võlgnik names."""
    if not toimiku_numbers and not viitenumbers and not registrikoodid:
        return {"by_toimiku": {}, "by_viitenumber": {}, "by_registrikood": {}, "by_name": {}}

    try:
        # Build query to get all needed fields
        query = text("""
            SELECT 
                "toimiku_nr",
                "viitenumber",
                "võlgnik",
                "nõude_sisu",
                "võla_jääk",
                "staatus",
                "rmp_märkused",
                "märkused",
                "võlgniku_kood"
            FROM "taitur_data"
            WHERE "toimiku_nr" = ANY(:toimiku_numbers) 
               OR "viitenumber" = ANY(:viitenumbers)
               OR "võlgniku_kood" = ANY(:registrikoodid)
        """)

        result = await db.execute(query, {
            "toimiku_numbers": toimiku_numbers or [],
            "viitenumbers": viitenumbers or [],
            "registrikoodid": registrikoodid or []
        })

        rows = result.fetchall()

        # Create lookup dictionaries
        data_by_toimiku = {}
        data_by_viitenumber = {}
        data_by_registrikood = {}
        data_by_name = {}  # NEW: Add name-based lookup

        for row in rows:
            row_dict = {
                "toimiku_nr": row[0],
                "viitenumber": row[1],
                "võlgnik": row[2],
                "nõude_sisu": row[3],
                "võla_jääk": row[4],
                "staatus": row[5],
                "rmp_märkused": row[6],
                "märkused": row[7],
                "võlgniku_kood": row[8]
            }

            if row[0]:  # toimiku_nr
                data_by_toimiku[row[0]] = row_dict
            if row[1]:  # viitenumber
                data_by_viitenumber[row[1]] = row_dict
            if row[8]:  # võlgniku_kood
                data_by_registrikood[row[8]] = row_dict
            if row[2]:  # võlgnik (name)
                # For name lookup, we might have multiple records per name,
                # so store as a list and we'll use the first one with a toimiku_nr
                if row[2] not in data_by_name:
                    data_by_name[row[2]] = []
                data_by_name[row[2]].append(row_dict)

        return {
            "by_toimiku": data_by_toimiku,
            "by_viitenumber": data_by_viitenumber,
            "by_registrikood": data_by_registrikood,
            "by_name": data_by_name  # NEW: Add name-based lookup
        }

    except Exception as e:
        logger.error(f"Error fetching database info: {str(e)}")
        return {"by_toimiku": {}, "by_viitenumber": {}, "by_registrikood": {}, "by_name": {}}


async def calculate_aggregates(db: AsyncSession, all_rows: List[Dict]) -> Dict[str, Dict]:
    """Calculate aggregate values for toimiku statistics."""
    try:
        # Get all unique võlgnik names
        volgnik_names = list(set(row.get("nimi_baasis", "") for row in all_rows if row.get("nimi_baasis")))

        if not volgnik_names:
            return {}

        # Query to get counts and sums by võlgnik
        query = text("""
            SELECT 
                "võlgnik",
                COUNT(DISTINCT "toimiku_nr") as toimiku_count,
                SUM("võla_jääk") as total_jaak
            FROM "taitur_data"
            WHERE "võlgnik" = ANY(:names)
            GROUP BY "võlgnik"
        """)

        result = await db.execute(query, {"names": volgnik_names})
        rows = result.fetchall()

        aggregates = {}
        for row in rows:
            aggregates[row[0]] = {
                "count": row[1],
                "sum": float(row[2]) if row[2] else 0.0
            }

        return aggregates

    except Exception as e:
        logger.error(f"Error calculating aggregates: {str(e)}")
        return {}


def determine_toimiku_nr_loplik(row_data: Dict[str, Any], db_info: Dict[str, Dict]) -> tuple[
    Optional[str], bool, Optional[str]]:
    """
    Determine the final toimiku number based on the extended business logic.
    Returns tuple: (toimiku_nr_loplik, has_valid_toimiku, match_source)

    Extended Logic:
    1. If "Toimiku nr selgituses" equals "Toimiku nr viitenumbris" (from viitenumber lookup), use it
    2. OR if "Toimiku nr selgituses" equals toimiku_nr from database row matching isiku_registrikood, use it
    3. OR if we can find toimiku_nr through "Nimi baasis"/võlgnik lookup, use that
    4. Else leave empty (invalid)

    match_source values: 'viitenumber', 'registrikood', 'name', None
    """
    toimiku_selgituses = row_data.get("toimiku_nr_selgituses", "")
    viitenumber = row_data.get("viitenumber", "")
    isiku_registrikood = row_data.get("isiku_registrikood", "")

    # Get toimiku_nr_viitenumbris from database lookup by viitenumber (10th CSV item)
    toimiku_viitenumbris = ""
    if viitenumber and viitenumber in db_info["by_viitenumber"]:
        db_record = db_info["by_viitenumber"][viitenumber]
        toimiku_viitenumbris = db_record.get("toimiku_nr", "")

    # Get toimiku_nr from database lookup by isiku_registrikood (15th CSV item)
    toimiku_from_registrikood = ""
    if isiku_registrikood and isiku_registrikood in db_info["by_registrikood"]:
        db_record = db_info["by_registrikood"][isiku_registrikood]
        toimiku_from_registrikood = db_record.get("toimiku_nr", "")

    # Store the viitenumbris value for display
    row_data["toimiku_nr_viitenumbris"] = toimiku_viitenumbris

    # Validation logic:
    # 1. If toimiku_selgituses equals toimiku_viitenumbris, it's valid
    if toimiku_selgituses and toimiku_selgituses == toimiku_viitenumbris:
        return toimiku_selgituses, True, 'viitenumber'

    # 2. If toimiku_selgituses equals toimiku_nr from registrikood lookup, it's valid
    if toimiku_selgituses and toimiku_selgituses == toimiku_from_registrikood:
        return toimiku_selgituses, True, 'registrikood'

    # 3. NEW: Check for toimiku_nr by name lookup ("Nimi baasis"/võlgnik)
    # Find any database record that could provide the name, then look up toimiku_nr by that name
    potential_name = ""
    name_based_toimiku = ""

    # Try to get name from various database lookups
    if viitenumber and viitenumber in db_info["by_viitenumber"]:
        potential_name = db_info["by_viitenumber"][viitenumber].get("võlgnik", "")
    elif isiku_registrikood and isiku_registrikood in db_info["by_registrikood"]:
        potential_name = db_info["by_registrikood"][isiku_registrikood].get("võlgnik", "")
    elif toimiku_selgituses and toimiku_selgituses in db_info["by_toimiku"]:
        potential_name = db_info["by_toimiku"][toimiku_selgituses].get("võlgnik", "")

    # If we have a name, look for any toimiku_nr associated with that võlgnik
    if potential_name and potential_name in db_info.get("by_name", {}):
        # Get the first record with a toimiku_nr for this name
        name_records = db_info["by_name"][potential_name]
        for record in name_records:
            if record.get("toimiku_nr"):
                name_based_toimiku = record.get("toimiku_nr")
                break

        # If we found a toimiku_nr through name lookup, use it
        if name_based_toimiku:
            row_data["nimi_baasis"] = potential_name  # Store the name we used
            logger.debug(f"Name-based lookup successful: '{potential_name}' -> '{name_based_toimiku}'")
            return name_based_toimiku, True, 'name'

    # No validation passed - leave empty (will be highlighted in light blue)
    return "", False, None


def process_konto_vv_row(
        row: List[str],
        row_num: int,
        db_info: Dict[str, Dict],
        aggregates: Dict[str, Dict],
        payment_stats: Dict[str, Dict]
) -> Optional[Dict[str, Any]]:
    """Process a single row from Konto vv CSV file with updated toimiku validation logic."""

    # Skip rows that don't have S/V = 'C'
    if len(row) <= 7 or row[7] != 'C':
        return None

    row_data = {}

    # Process CSV fields
    for field_key, field_info in KOONDAJA_COLUMNS.items():
        if field_info["source"] == "csv" and "index" in field_info:
            idx = field_info["index"]
            row_data[field_key] = row[idx] if len(row) > idx else ""
        elif field_info["source"] == "empty":
            row_data[field_key] = ""
        elif field_info["source"] == "fixed":
            row_data[field_key] = field_info.get("value", "")

    # Extract toimiku number from selgitus (makse_selgitus = CSV index 11)
    makse_selgitus = row_data.get("makse_selgitus", "")
    toimiku_from_selgitus = extract_toimiku_number(makse_selgitus)
    row_data["toimiku_nr_selgituses"] = toimiku_from_selgitus or ""

    # Determine final toimiku number using extended validation logic
    toimiku_nr_loplik, has_valid_toimiku, match_source = determine_toimiku_nr_loplik(row_data, db_info)
    row_data["toimiku_nr_loplik"] = toimiku_nr_loplik
    row_data["has_valid_toimiku"] = has_valid_toimiku  # Flag for frontend styling
    row_data[
        "match_source"] = match_source  # Track how the toimiku was found ('viitenumber', 'registrikood', 'name', None)

    # Find the best database record for additional data
    viitenumber = row_data.get("viitenumber", "")
    isiku_registrikood = row_data.get("isiku_registrikood", "")
    db_record = None

    # Priority: 1) by final toimiku_nr, 2) by viitenumber, 3) by registrikood
    if toimiku_nr_loplik and toimiku_nr_loplik in db_info["by_toimiku"]:
        db_record = db_info["by_toimiku"][toimiku_nr_loplik]
    elif viitenumber and viitenumber in db_info["by_viitenumber"]:
        db_record = db_info["by_viitenumber"][viitenumber]
    elif isiku_registrikood and isiku_registrikood in db_info["by_registrikood"]:
        db_record = db_info["by_registrikood"][isiku_registrikood]

    # Fill in database fields
    if db_record:
        row_data["nimi_baasis"] = db_record.get("võlgnik", "")
        row_data["noude_sisu"] = db_record.get("nõude_sisu", "")
        row_data["toimiku_jaak"] = db_record.get("võla_jääk", 0.0)
        row_data["staatus_baasis"] = db_record.get("staatus", "")
        row_data["em_markus"] = db_record.get("rmp_märkused", "")
        row_data["toimiku_markused"] = db_record.get("märkused", "")

        # Get aggregates for this võlgnik
        volgnik_name = db_record.get("võlgnik", "")
        if volgnik_name and volgnik_name in aggregates:
            row_data["toimikute_arv"] = aggregates[volgnik_name]["count"]
            row_data["toimikute_jaakide_summa"] = aggregates[volgnik_name]["sum"]
        else:
            row_data["toimikute_arv"] = 0
            row_data["toimikute_jaakide_summa"] = 0.0

        # Calculate Vahe (difference between database balance and CSV amount)
        csv_summa = safe_number_conversion(row_data.get("summa", 0))
        db_jaak = safe_number_conversion(db_record.get("võla_jääk", 0))
        row_data["vahe"] = db_jaak - csv_summa
    else:
        # No database record found
        row_data["nimi_baasis"] = ""
        row_data["noude_sisu"] = ""
        row_data["toimiku_jaak"] = 0.0
        row_data["staatus_baasis"] = ""
        row_data["em_markus"] = ""
        row_data["toimiku_markused"] = ""
        row_data["toimikute_arv"] = 0
        row_data["toimikute_jaakide_summa"] = 0.0
        row_data["vahe"] = 0.0

    # Add payment statistics based on "Toimiku nr selgituses"
    toimiku_selgituses = row_data.get("toimiku_nr_selgituses", "")
    if toimiku_selgituses and toimiku_selgituses in payment_stats:
        row_data["laekumiste_arv"] = payment_stats[toimiku_selgituses]["count"]
        # Format the total back to Estonian format for display
        total_amount = payment_stats[toimiku_selgituses]["total"]
        if isinstance(total_amount, (int, float)):
            # Convert back to Estonian format (comma as decimal separator)
            row_data["laekumised_kokku"] = str(total_amount).replace('.', ',')
        else:
            row_data["laekumised_kokku"] = str(total_amount)
    else:
        row_data["laekumiste_arv"] = 1  # Current row counts as 1
        row_data["laekumised_kokku"] = row_data.get("summa", "")

    return row_data


@router.get("/browse-koondaja-folder")
async def browse_koondaja_folder(
        path: str = "",
        current_user: User = Depends(get_current_active_user)
):
    """Browse the Koondaja folder structure"""
    try:
        base_path = r"C:\TAITEMENETLUS\ÜLESANDED\Tööriistad\ROCKI"

        if path:
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
                        relative_path = os.path.join(path, item) if path else item
                        items.append({
                            "name": item,
                            "type": "folder",
                            "path": relative_path.replace(os.sep, '/'),
                            "full_path": item_path
                        })
                    elif item.lower().endswith('.csv'):
                        stats = os.stat(item_path)
                        items.append({
                            "name": item,
                            "type": "file",
                            "path": item_path,
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

        # Sort: folders first, then files
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
    """Import CSV file for Koondaja data with new column structure"""
    try:
        body = await request.json()
        file_path = body.get('file_path')
        folder_name = body.get('folder_name')

        if not file_path:
            raise HTTPException(status_code=400, detail="File path is required")

        logger.info(f"Attempting to import Koondaja CSV file: {file_path}")

        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

        if not os.path.isfile(file_path):
            raise HTTPException(status_code=400, detail=f"Path is not a file: {file_path}")

        if not folder_name:
            folder_name = os.path.basename(os.path.dirname(file_path))
        logger.info(f"Processing file from folder: {folder_name}")

        # Skip if not Konto vv
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

        # Try different encodings
        encodings = ['utf-8-sig', 'utf-8', 'windows-1252', 'iso-8859-15', 'cp1257']
        content = None
        used_encoding = None

        for encoding in encodings:
            try:
                with open(file_path, 'r', encoding=encoding) as csvfile:
                    content = csvfile.read()
                    used_encoding = encoding
                    logger.info(f"Successfully read file with encoding: {encoding}")
                    break
            except UnicodeDecodeError:
                continue

        if content is None:
            raise HTTPException(status_code=400, detail="Unable to decode file with supported encodings")

        if not content.strip():
            raise HTTPException(status_code=400, detail="File is empty")

        # First pass: collect all toimiku numbers, viitenumbers, and registrikoodid for database lookup
        lines = content.split('\n')
        csv_reader = csv.reader(lines, delimiter=';')

        all_toimiku_numbers = []
        all_viitenumbers = []
        all_registrikoodid = []
        all_rows = []
        payment_stats = defaultdict(lambda: {"count": 0, "total": 0.0})

        for row in csv_reader:
            if not row or len(row) < 10:
                continue

            # Clean row data
            cleaned_row = [str(field).strip() if field is not None else "" for field in row]

            # Only process rows where S/V = 'C'
            if len(cleaned_row) > 7 and cleaned_row[7] == 'C':
                all_rows.append(cleaned_row)

                # Extract toimiku number from selgitus
                if len(cleaned_row) > 11:
                    toimiku_num = extract_toimiku_number(cleaned_row[11])
                    if toimiku_num:
                        all_toimiku_numbers.append(toimiku_num)

                # Get viitenumber
                if len(cleaned_row) > 9 and cleaned_row[9]:
                    all_viitenumbers.append(cleaned_row[9])

                # Get registrikood
                if len(cleaned_row) > 14 and cleaned_row[14]:
                    all_registrikoodid.append(cleaned_row[14])

                # Calculate payment statistics
                identifier = None
                if len(cleaned_row) > 9 and cleaned_row[9]:  # viitenumber
                    identifier = cleaned_row[9]
                elif len(cleaned_row) > 11:  # toimiku from selgitus
                    identifier = extract_toimiku_number(cleaned_row[11])

                if identifier and len(cleaned_row) > 8:
                    payment_amount = safe_number_conversion(cleaned_row[8], 0.0)
                    payment_stats[identifier]["count"] += 1
                    payment_stats[identifier]["total"] += payment_amount

        # Get all database info at once
        db_info = await get_database_info(db, all_toimiku_numbers, all_viitenumbers, all_registrikoodid)

        # Get aggregates
        temp_rows = []
        for row in all_rows:
            temp_data = process_konto_vv_row(row, 0, db_info, {}, {})
            if temp_data:
                temp_rows.append(temp_data)

        aggregates = await calculate_aggregates(db, temp_rows)

        # Process each row with all the data
        row_count = 0
        processed_rows = 0

        for row_num, row in enumerate(all_rows, start=1):
            row_count += 1

            row_data = process_konto_vv_row(row, row_num, db_info, aggregates, dict(payment_stats))

            if row_data:
                data.append(row_data)
                processed_rows += 1

        logger.info(
            f"Successfully processed {processed_rows} out of {row_count} rows from {os.path.basename(file_path)}")

        return {
            "success": True,
            "message": f"Successfully imported {len(data)} rows from {os.path.basename(file_path)}",
            "data": data,
            "folder_type": folder_name.lower(),
            "encoding_used": used_encoding,
            "total_rows_processed": row_count,
            "valid_rows": len(data),
            "columns": KOONDAJA_COLUMNS  # Send column definitions to frontend
        }

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

        # Build query to fetch requested fields
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
                # Handle datetime objects
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


# ADD THIS ENDPOINT to your koondaja_routes.py file (at the end, before the last endpoint)

@router.post("/search-toimikud")
async def search_toimikud(
        request: Request,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_active_user)
):
    """Search for toimikud based on võlgniku_kood (registrikood) or toimiku number"""
    try:
        body = await request.json()
        search_value = body.get('search_value', '').strip()  # This is isiku_registrikood from Koondaja
        selgitus_value = body.get('selgitus_value', '').strip()  # This is toimiku_nr_selgituses from Koondaja

        if not search_value and not selgitus_value:
            return {
                "success": False,
                "message": "Vähemalt üks otsinguparameeter on kohustuslik",
                "data": []
            }

        # Build query conditions
        conditions = []
        params = {}

        if search_value:
            # Search by võlgniku_kood (registrikood) - exact match
            conditions.append('"võlgniku_kood" = :search_value')
            params['search_value'] = search_value
            logger.info(f"Searching for võlgniku_kood = {search_value}")

        if selgitus_value:
            # Search by toimiku_nr - using LIKE for partial matches
            conditions.append('"toimiku_nr" LIKE :toimiku_pattern')
            params['toimiku_pattern'] = f'%{selgitus_value}%'
            logger.info(f"Searching for toimiku_nr LIKE %{selgitus_value}%")

        # Use OR if both conditions exist
        where_clause = ' OR '.join(conditions)

        # Query to get all required toimiku information
        query = text(f"""
            SELECT 
                "toimiku_nr",
                "võlgnik",
                "sissenõudja_eesnimi",
                "sissenõudja_perenimi", 
                "sissenõudja_kood",
                "võla_jääk",
                "staatus",
                "võlgniku_kood"
            FROM "taitur_data"
            WHERE {where_clause}
            ORDER BY "toimiku_nr"
            LIMIT 500
        """)

        result = await db.execute(query, params)
        rows = result.fetchall()

        # Convert to list of dicts with all required fields
        data = []
        for row in rows:
            # Build sissenõudja display name
            sissenõudja_parts = []
            if row[2]:  # sissenõudja_eesnimi
                sissenõudja_parts.append(row[2])
            if row[3]:  # sissenõudja_perenimi
                sissenõudja_parts.append(row[3])
            if row[4]:  # sissenõudja_kood
                sissenõudja_parts.append(f"({row[4]})")

            sissenõudja_display = ' '.join(sissenõudja_parts) if sissenõudja_parts else ''

            data.append({
                "toimiku_nr": row[0],
                "võlgnik": row[1] or '',
                "sissenõudja_eesnimi": row[2] or '',
                "sissenõudja_perenimi": row[3] or '',
                "sissenõudja_kood": row[4] or '',
                "sissenõudja": sissenõudja_display,  # Combined display field
                "võla_jääk": float(row[5]) if row[5] is not None else 0.0,
                "staatus": row[6] or '',
                "võlgniku_kood": row[7] or ''
            })

        logger.info(
            f"Found {len(data)} toimikud matching search criteria (search_value='{search_value}', selgitus_value='{selgitus_value}')")

        return {
            "success": True,
            "data": data,
            "count": len(data),
            "search_params": {
                "võlgniku_kood": search_value,
                "toimiku_nr_pattern": selgitus_value
            }
        }

    except Exception as e:
        logger.exception(f"Error searching toimikud: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error searching toimikud: {str(e)}")


@router.post("/fetch-isikukoodid")
async def fetch_isikukoodid(
        request: Request,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_active_user)
):
    """Fetch isikukoodid (võlgniku_kood) for given võlgniku names for Tagastused modal"""
    try:
        body = await request.json()
        volgniku_nimed = body.get('volgniku_nimed', [])

        if not volgniku_nimed:
            return {
                "success": True,
                "data": []
            }

        # Clean and filter the names
        valid_names = [name.strip() for name in volgniku_nimed if name and name.strip()]

        if not valid_names:
            return {
                "success": True,
                "data": []
            }

        logger.info(f"Fetching isikukoodid for {len(valid_names)} võlgniku names")

        # Query to get võlgniku_kood for each võlgnik name
        # Use DISTINCT to avoid duplicates since multiple toimikud can have same võlgnik
        query = text("""
            SELECT DISTINCT 
                "võlgnik",
                "võlgniku_kood"
            FROM "taitur_data"
            WHERE "võlgnik" = ANY(:names)
            AND "võlgniku_kood" IS NOT NULL 
            AND "võlgniku_kood" != ''
            ORDER BY "võlgnik"
        """)

        result = await db.execute(query, {"names": valid_names})
        rows = result.fetchall()

        # Convert to list of dicts
        data = []
        for row in rows:
            data.append({
                "võlgnik": row[0] or '',
                "võlgniku_kood": row[1] or ''
            })

        logger.info(f"Found isikukoodid for {len(data)} võlgniku names")

        return {
            "success": True,
            "data": data,
            "count": len(data),
            "requested_count": len(valid_names)
        }

    except Exception as e:
        logger.exception(f"Error fetching isikukoodid: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching isikukoodid: {str(e)}")
