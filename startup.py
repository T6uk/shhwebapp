# startup.py - Run this file to start the application
import os
import sys
import subprocess
import webbrowser
import threading
import time
import signal
import platform
import hashlib
import json
from datetime import datetime


def generate_cache_version():
    """Generate a unique cache version for static assets"""
    import hashlib
    from datetime import datetime

    # Generate version
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    random_component = os.urandom(4).hex()
    cache_version = f"{timestamp}-{random_component}"

    try:
        # Save to file for service worker access
        cache_file = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                  "app", "static", "cache_version.json")

        os.makedirs(os.path.dirname(cache_file), exist_ok=True)

        with open(cache_file, 'w', encoding='utf-8') as f:
            json.dump({
                "version": cache_version,
                "timestamp": int(time.time())
            }, f)

        print(f"Generated new cache version: {cache_version}")
    except Exception as e:
        print(f"Warning: Could not save cache version to file: {e}")

    return cache_version


def is_server_running(port):
    """Check if server is already running on the specified port"""
    import socket
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(2)
        result = sock.connect_ex(('127.0.0.1', port))
        sock.close()
        return result == 0
    except:
        return False


def launch_browser(url, delay=2):
    """Launch browser in app mode with a delay"""
    time.sleep(delay)  # Wait for server to start

    print(f"Opening {url} in app mode...")

    # Add cache-busting parameter to URL
    cache_buster = f"?cache_bust={int(time.time())}"
    url_with_cache_buster = f"{url}{cache_buster}"

    # Different approaches based on platform
    if platform.system() == 'Windows':
        # Use Edge on Windows in app mode
        edge_path = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
        if os.path.exists(edge_path):
            subprocess.Popen([
                edge_path,
                f"--app={url_with_cache_buster}",
                "--edge-kiosk-type=normal",
                "--disable-features=TranslateUI",
                "--disable-plugins-discovery",
                "--autoplay-policy=no-user-gesture-required",
                "--profile-directory=Default",
                "--disk-cache-size=1"  # Minimal disk cache
            ])
        else:
            webbrowser.open(url_with_cache_buster)
    elif platform.system() == 'Darwin':  # macOS
        # Try Chrome for macOS in app mode
        try:
            subprocess.Popen([
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                f"--app={url_with_cache_buster}",
                "--disable-features=TranslateUI",
                "--disk-cache-size=1"  # Minimal disk cache
            ])
        except:
            webbrowser.open(url_with_cache_buster)
    else:  # Linux and others
        try:
            subprocess.Popen([
                "google-chrome",
                f"--app={url_with_cache_buster}",
                "--disable-features=TranslateUI",
                "--disk-cache-size=1"  # Minimal disk cache
            ])
        except:
            webbrowser.open(url_with_cache_buster)


def check_database_availability():
    """Check database availability and set environment variable accordingly"""
    import asyncio

    try:
        # Create a temporary event loop for database check
        loop = asyncio.new_event_loop()

        # Import the check function
        from app.core.db import create_db_engine

        # Try to establish database connection
        engines = loop.run_until_complete(create_db_engine())
        loop.close()

        print("Database connection successful")
        return True
    except Exception as e:
        print(f"Database connection check failed: {e}")
        return False


def clear_browser_cache():
    """Clear browser cache directories if possible"""
    if platform.system() == 'Windows':
        import subprocess
        try:
            # Try to clear Edge cache
            subprocess.run([
                "RunDll32.exe", "InetCpl.cpl,ClearMyTracksByProcess", "8"
            ], capture_output=True)
            print("Browser cache clearing attempted")
        except Exception as e:
            print(f"Failed to clear browser cache: {e}")


def update_service_worker(cache_version=None):
    """Update the service worker file with new cache version"""
    sw_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           "app", "static", "sw.js")

    if not cache_version:
        cache_version = generate_cache_version()

    if os.path.exists(sw_path):
        try:
            # Read the file with explicit UTF-8 encoding
            with open(sw_path, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read()

            # Check if the file contains the replacement target
            if "const CACHE_VERSION = '" in content:
                # Update cache version in service worker
                updated_content = content.replace(
                    "const CACHE_VERSION = '",
                    f"const CACHE_VERSION = '{cache_version}-"
                )

                # Write with the same encoding
                with open(sw_path, 'w', encoding='utf-8') as f:
                    f.write(updated_content)

                print(f"Updated service worker with cache version: {cache_version}")
                return cache_version
            else:
                print("Warning: Service worker doesn't contain expected version string, skipping update")
                print("Please make sure your sw.js file contains: const CACHE_VERSION = 'v1';")
                return cache_version

        except Exception as e:
            print(f"Error updating service worker: {e}")
            return cache_version  # Return the cache version even if update fails
    else:
        print(f"Warning: Service worker file not found at {sw_path}")
        return cache_version


def start_server():
    """Start the FastAPI server with optimized settings"""
    print("Starting application server...")

    # Generate cache version only once and use it consistently
    cache_version = generate_cache_version()

    try:
        # Update service worker with the same cache version
        update_service_worker(cache_version)
    except Exception as e:
        print(f"Warning: Failed to update service worker: {e}")

    try:
        # Attempt to clear browser cache
        clear_browser_cache()
    except Exception as e:
        print(f"Warning: Failed to clear browser cache: {e}")

    # Set environment variables for better performance
    env = os.environ.copy()
    env["PYTHONOPTIMIZE"] = "1"  # Enable optimizations
    env["PYTHONUNBUFFERED"] = "1"  # Unbuffered output
    env["CACHE_VERSION"] = cache_version  # Set cache version for app

    try:
        # Set cache version for app
        env["CACHE_VERSION"] = generate_cache_version()
    except Exception as e:
        print(f"Warning: Failed to generate cache version: {e}")
        # Fallback to timestamp if generation fails
        env["CACHE_VERSION"] = str(int(time.time()))

    # Check local database availability
    local_db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "local_data.db")
    if os.path.exists(local_db_path):
        print(f"Local database found at: {local_db_path}")

        # Check if we should use it (either through explicit setting or test connection)
        if os.environ.get("USE_LOCAL_DB", "").lower() in ("true", "1", "yes"):
            print("Using local database (explicitly set via environment variable)")
            env["USE_LOCAL_DB"] = "true"
        else:
            # Test PostgreSQL connection
            if not check_database_availability():
                print("PostgreSQL unavailable, switching to local database")
                env["USE_LOCAL_DB"] = "true"
    else:
        print(f"Warning: Local database not found at {local_db_path}")

    # Start uvicorn with optimal settings
    cmd = [
        sys.executable, "-m", "uvicorn",
        "app.main:app",
        "--host", "127.0.0.1",
        "--port", "8001",
        "--workers", "4",  # Use appropriate number of workers
        "--http", "httptools",
        "--log-level", "warning",
        "--no-access-log",  # Disable access logging for better performance
        "--reload"  # Add reload to ensure static files are reloaded
    ]

    process = subprocess.Popen(cmd, env=env)
    return process


def main():
    """Main function to start the application"""
    port = 8001
    url = f"http://localhost:{port}"

    # Check if server is already running
    if is_server_running(port):
        print(f"Server is already running on port {port}")
        launch_browser(url, delay=0)  # No delay needed
        return

    # Start the server
    server_process = start_server()

    # Handle graceful shutdown
    def signal_handler(sig, frame):
        print("\nShutting down server...")
        server_process.terminate()
        sys.exit(0)

    # Register signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    if platform.system() != 'Windows':
        signal.signal(signal.SIGTERM, signal_handler)

    # Launch browser in a separate thread
    threading.Thread(target=launch_browser, args=(url,)).start()

    try:
        # Wait for the server process to finish
        server_process.wait()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        server_process.terminate()


if __name__ == "__main__":
    main()
