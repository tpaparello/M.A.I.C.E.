@echo off
echo Starting M.A.I.C.E...
cd /d "%~dp0"
start "" "chrome.exe" "http://localhost:8080/maice.html"
python -m http.server 8080
