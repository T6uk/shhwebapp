# PowerShell script to create a proper desktop shortcut

# Define paths
$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktopPath "Suur Andmetabel.lnk"
$appPath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$iconPath = "$PSScriptRoot\app\static\icons\icon-512x512.ico"  # You'll need to convert your PNG to ICO
$targetUrl = "http://localhost:8000/"

# Create a shortcut object
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($shortcutPath)

# Set shortcut properties
$Shortcut.TargetPath = $appPath
$Shortcut.Arguments = "--app=$targetUrl --edge-kiosk-type=normal --profile-directory=Default"
$Shortcut.Description = "Big Table App"
$Shortcut.WorkingDirectory = "$PSScriptRoot"
if (Test-Path $iconPath) {
    $Shortcut.IconLocation = $iconPath
}

# Save the shortcut
$Shortcut.Save()

Write-Host "Desktop shortcut created at: $shortcutPath"