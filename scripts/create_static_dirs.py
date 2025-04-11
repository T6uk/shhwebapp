#!/usr/bin/env python3
"""
Create required static directories for the application
"""
import os
import sys

# Get the project root directory
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Define the directories to create
directories = [
    os.path.join(project_root, "app", "static"),
    os.path.join(project_root, "app", "static", "css"),
    os.path.join(project_root, "app", "static", "js"),
    os.path.join(project_root, "app", "static", "img"),
]

# Create each directory if it doesn't exist
for directory in directories:
    if not os.path.exists(directory):
        os.makedirs(directory)
        print(f"Created directory: {directory}")
    else:
        print(f"Directory already exists: {directory}")

# Create an empty CSS file if it doesn't exist
css_file = os.path.join(project_root, "app", "static", "css", "style.css")
if not os.path.exists(css_file):
    with open(css_file, 'w') as f:
        f.write("""/* Custom styles for Big Data Web App */

/* General layout enhancements */
body {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
}

main {
    flex: 1;
}

/* Table styling */
.table-container {
    position: relative;
    max-height: 70vh;
    overflow-y: auto;
}

/* Make headers sticky */
thead th {
    position: sticky;
    top: 0;
    background-color: #f8f9fa;
    z-index: 1;
}

/* Style for edited cells */
td.edited {
    animation: highlight 3s;
}

@keyframes highlight {
    0% { background-color: rgba(255, 255, 0, 0.5); }
    100% { background-color: transparent; }
}

/* Responsive improvements */
@media (max-width: 768px) {
    .table-container {
        max-height: 50vh;
    }

    .card-body {
        padding: 0.75rem;
    }
}

/* Button improvements */
.btn-group-sm {
    display: flex;
}

/* Navbar tweaks */
.navbar-brand {
    font-weight: bold;
}

/* Footer adjustments */
.footer {
    margin-top: auto;
}
""")
    print(f"Created CSS file: {css_file}")
else:
    print(f"CSS file already exists: {css_file}")

print("Static directories and files setup complete.")