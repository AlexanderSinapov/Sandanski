@echo off
rem Starts a local web server for the site and opens it in the browser.
rem Keep this window open while you use the site. Close it to stop the server.
cd /d "%~dp0"
start "" http://localhost:5173
where python >nul 2>nul && (python -m http.server 5173 & goto :eof)
where py >nul 2>nul && (py -m http.server 5173 & goto :eof)
where npx >nul 2>nul && (npx -y serve . -l 5173 & goto :eof)
echo Could not find Python or Node.js. Install one of them, or use the VS Code "Live Server" extension.
pause
