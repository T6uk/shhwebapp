from fastapi.templating import Jinja2Templates
from datetime import datetime

# Create a single templates instance for the entire application
templates = Jinja2Templates(directory="app/templates")

# Add current_year as a global variable
templates.env.globals["current_year"] = datetime.now().year
