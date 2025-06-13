# Start the application with optimized settings
$env:PYTHONOPTIMIZE = "1"
$env:PYTHONUNBUFFERED = "1"

# Start the FastAPI application with uvicorn
Start-Process -FilePath "python" -ArgumentList "-m uvicorn app.main:app --host 0.0.0.0 --port 8001 --workers 4 --log-level warning" -NoNewWindow