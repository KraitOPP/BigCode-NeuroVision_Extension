@echo off
echo Stopping Ollama...
taskkill /f /im "ollama app.exe" 2>nul
taskkill /f /im ollama.exe 2>nul
ping 127.0.0.1 -n 3 >nul

echo Starting Ollama with chrome-extension CORS...
set OLLAMA_ORIGINS=chrome-extension://*
ollama serve
