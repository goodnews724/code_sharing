@echo off
cd /d "%~dp0"
"C:\Users\OWNER\Desktop\archive\06_project\.venv\Scripts\python.exe" sm_auto.py >> "%~dp0sm_auto_log.txt" 2>&1
