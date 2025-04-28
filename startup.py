# startup.py - Run this file to start the application
import os
import sys
import subprocess
import webbrowser
import threading
import time
import signal
import platform


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

    # Different approaches based on platform
    if platform.system() == 'Windows':
        # Use Edge on Windows in app mode
        edge_path = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
        if os.path.exists(edge_path):
            subprocess.Popen([
                edge_path,
                f"--app={url}",
                "--edge-kiosk-type=normal",
                "--disable-features=TranslateUI",
                "--disable-plugins-discovery",
                "--autoplay-policy=no-user-gesture-required",
                "--profile-directory=Default"
            ])
        else:
            webbrowser.open(url)
    elif platform.system() == 'Darwin':  # macOS
        # Try Chrome for macOS in app mode
        try:
            subprocess.Popen([
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                f"--app={url}",
                "--disable-features=TranslateUI"
            ])
        except:
            webbrowser.open(url)
    else:  # Linux and others
        try:
            subprocess.Popen([
                "google-chrome",
                f"--app={url}",
                "--disable-features=TranslateUI"
            ])
        except:
            webbrowser.open(url)


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


def start_server():
    """Start the FastAPI server with optimized settings"""
    print("Starting application server...")

    # Set environment variables for better performance
    env = os.environ.copy()
    env["PYTHONOPTIMIZE"] = "1"  # Enable optimizations
    env["PYTHONUNBUFFERED"] = "1"  # Unbuffered output

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
        "--port", "8000",
        "--workers", "4",  # Use appropriate number of workers
        "--http", "httptools",
        "--log-level", "warning",
        "--no-access-log"  # Disable access logging for better performance
    ]

    process = subprocess.Popen(cmd, env=env)
    return process


def main():
    """Main function to start the application"""
    port = 8000
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