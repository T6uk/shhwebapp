#!/usr/bin/env python3
import os
import re
import time
import gzip
import hashlib
import argparse
import logging
from pathlib import Path
from typing import List, Tuple, Optional

# Use rcssmin for minification (install with: pip install rcssmin)
try:
    import rcssmin
except ImportError:
    print("rcssmin not found. Install with: pip install rcssmin")


    # Simple fallback minification
    def rcssmin(css: str) -> str:
        # Remove comments
        css = re.sub(r'/\*.*?\*/', '', css, flags=re.DOTALL)
        # Remove whitespace
        css = re.sub(r'\s+', ' ', css)
        css = re.sub(r'[\n\r]', '', css)
        css = re.sub(r'\s*([{};,:])\s*', r'\1', css)
        return css.strip()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Define the order of CSS files to maintain dependencies
CSS_FILE_ORDER = [
    "styles.css",
    "custom.css",
    "compact-ui.css",
    "dark-edit.css",
    "enhanced-ui.css"
]


def get_static_dir() -> Path:
    """Get the static directory path"""
    # First try the standard path
    static_dir = Path(__file__).resolve().parent.parent / "static"
    if static_dir.exists():
        return static_dir

    # Try relative to the current directory
    current_dir = Path.cwd()
    static_dir = current_dir / "app" / "static"
    if static_dir.exists():
        return static_dir

    # Try parent directory
    static_dir = current_dir.parent / "app" / "static"
    if static_dir.exists():
        return static_dir

    raise FileNotFoundError("Cannot find static directory. Run this script from the project root or app directory.")


def collect_css_files(static_dir: Path) -> List[Path]:
    """Collect CSS files in specified order"""
    css_dir = static_dir / "css"
    if not css_dir.exists():
        logger.error(f"CSS directory not found: {css_dir}")
        return []

    # Get all CSS files
    all_files = list(css_dir.glob("*.css"))

    # Sort files according to CSS_FILE_ORDER
    ordered_files = []

    # First add files in specified order
    for filename in CSS_FILE_ORDER:
        file_path = css_dir / filename
        if file_path in all_files:
            ordered_files.append(file_path)
            all_files.remove(file_path)

    # Then add any remaining files
    ordered_files.extend(sorted(all_files))

    return ordered_files


def concatenate_files(files: List[Path]) -> str:
    """Concatenate multiple CSS files into one string"""
    result = []

    for file_path in files:
        try:
            content = file_path.read_text(encoding='utf-8')
            # Add file info as comment
            result.append(f"/* {file_path.name} */")
            result.append(content)
            result.append("")  # Empty line between files
        except Exception as e:
            logger.error(f"Error reading {file_path}: {e}")

    return "\n".join(result)


def minify_css(css: str) -> str:
    """Minify CSS content"""
    start_time = time.time()

    # Use rcssmin for better minification
    minified = rcssmin(css)

    end_time = time.time()
    original_size = len(css)
    minified_size = len(minified)
    savings = (1 - minified_size / original_size) * 100

    logger.info(f"Minification completed in {end_time - start_time:.2f}s")
    logger.info(
        f"Original size: {original_size / 1024:.2f}KB, Minified: {minified_size / 1024:.2f}KB (saved {savings:.2f}%)")

    return minified


def create_gzipped_version(content: str, output_path: Path) -> Path:
    """Create a gzipped version of the content"""
    gzip_path = output_path.with_suffix(output_path.suffix + '.gz')

    with gzip.open(gzip_path, 'wt', encoding='utf-8') as f:
        f.write(content)

    original_size = len(content.encode('utf-8'))
    gzip_size = gzip_path.stat().st_size
    savings = (1 - gzip_size / original_size) * 100

    logger.info(f"Gzipped size: {gzip_size / 1024:.2f}KB (saved {savings:.2f}% from original)")

    return gzip_path


def generate_hash(content: str) -> str:
    """Generate a content hash for cache busting"""
    return hashlib.md5(content.encode('utf-8')).hexdigest()[:8]


def save_output(content: str, output_dir: Path, filename: str, create_gzip: bool = True) -> Tuple[Path, Optional[Path]]:
    """Save the output to a file"""
    output_dir.mkdir(parents=True, exist_ok=True)

    # Add hash to filename for cache busting
    content_hash = generate_hash(content)
    base_name, ext = os.path.splitext(filename)
    hashed_filename = f"{base_name}.{content_hash}{ext}"

    output_path = output_dir / hashed_filename

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(content)

    logger.info(f"Saved to: {output_path}")

    # Create gzipped version if requested
    gzip_path = None
    if create_gzip:
        gzip_path = create_gzipped_version(content, output_path)

    return output_path, gzip_path


def update_html_references(static_dir: Path, old_css_path: str, new_css_path: Path) -> int:
    """Update HTML templates to use the new CSS file"""
    count = 0
    templates_dir = static_dir.parent / "templates"

    if not templates_dir.exists():
        logger.warning(f"Templates directory not found: {templates_dir}")
        return 0

    old_filename = os.path.basename(old_css_path)
    new_filename = new_css_path.name

    for html_file in templates_dir.glob("**/*.html"):
        try:
            content = html_file.read_text(encoding='utf-8')

            # Replace references to the old CSS files with the new one
            for css_file in CSS_FILE_ORDER:
                pattern = rf'<link\s+rel=["\']stylesheet["\']\s+href=["\'](?:.*/)?(?:static/css/{css_file}|.*/css/{css_file})["\']>'
                if re.search(pattern, content):
                    count += 1

            # If any matches found, replace all CSS links with the new one
            if count > 0:
                # Remove all individual CSS file links that are being combined
                for css_file in CSS_FILE_ORDER:
                    content = re.sub(
                        rf'<link\s+rel=["\']stylesheet["\']\s+href=["\'](?:.*/)?(?:static/css/{css_file}|.*/css/{css_file})["\']>\s*',
                        '',
                        content
                    )

                # Add the new combined CSS file link after the last <link> tag
                last_link_match = re.search(r'<link[^>]+>', content)
                if last_link_match:
                    pos = last_link_match.end()
                    content = (
                            content[:pos] +
                            f'\n<link rel="stylesheet" href="/static/css/dist/{new_filename}">' +
                            content[pos:]
                    )

                    # Write the updated content
                    html_file.write_text(content, encoding='utf-8')
                    logger.info(f"Updated references in {html_file}")
        except Exception as e:
            logger.error(f"Error updating {html_file}: {e}")

    return count


def main():
    """Main function to optimize CSS files"""
    parser = argparse.ArgumentParser(description='Optimize CSS files')
    parser.add_argument('--no-minify', action='store_true', help='Skip minification')
    parser.add_argument('--no-gzip', action='store_true', help='Skip gzip compression')
    parser.add_argument('--update-html', action='store_true', help='Update HTML references')
    parser.add_argument('--output', default='app.css', help='Output filename')
    args = parser.parse_args()

    try:
        # Get static directory
        static_dir = get_static_dir()
        logger.info(f"Using static directory: {static_dir}")

        # Collect CSS files
        css_files = collect_css_files(static_dir)
        if not css_files:
            logger.error("No CSS files found")
            return

        logger.info(f"Found {len(css_files)} CSS files to process")
        for file in css_files:
            logger.info(f"  - {file.name}")

        # Concatenate files
        logger.info("Concatenating CSS files...")
        concatenated = concatenate_files(css_files)

        # Minify if requested
        if not args.no_minify:
            logger.info("Minifying CSS...")
            processed_css = minify_css(concatenated)
        else:
            processed_css = concatenated

        # Save the output
        output_dir = static_dir / "css" / "dist"
        css_path, gzip_path = save_output(
            processed_css,
            output_dir,
            args.output,
            create_gzip=not args.no_gzip
        )

        # Update HTML references if requested
        if args.update_html:
            logger.info("Updating HTML references...")
            updated = update_html_references(static_dir, "css", css_path)
            logger.info(f"Updated {updated} HTML files")

        logger.info("CSS optimization completed successfully")

    except Exception as e:
        logger.error(f"Error: {e}")


if __name__ == "__main__":
    main()