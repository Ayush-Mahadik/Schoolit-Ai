@echo off
REM ═══════════════════════════════════════════════════════════════════
REM  SchoolIT AI - Supabase Setup Script
REM  Run this AFTER logging into Supabase CLI: npx supabase login
REM ═══════════════════════════════════════════════════════════════════

echo.
echo === SchoolIT AI - Supabase Cloud Storage Setup ===
echo.

REM Step 1: Create a new Supabase project
echo Step 1: Creating Supabase project...
echo NOTE: If you already have a project, skip to Step 3.
echo.
echo Go to https://supabase.com/dashboard and create a FREE project.
echo Pick a name (e.g., "schoolit-ai") and a region near you.
echo Then come back and press any key to continue.
pause > nul

REM Step 2: Get project credentials
echo.
echo Step 2: Get your credentials
echo ─────────────────────────────
echo In Supabase Dashboard:
echo   1. Go to Project Settings (gear icon) → API
echo   2. Copy "Project URL" (starts with https://xxxx.supabase.co)
echo   3. Copy "anon public" key (starts with eyJhbG...)
echo.
set /p SUPABASE_URL="Paste your Project URL: "
set /p SUPABASE_KEY="Paste your anon public key: "

REM Step 3: Run the SQL migration
echo.
echo Step 3: Running database migration...
echo Please go to your Supabase Dashboard → SQL Editor
echo Paste and run the contents of:
echo   supabase\migrations\20250101000000_create_conversations.sql
echo.
echo Or use this direct link to your SQL editor:
echo   %SUPABASE_URL%/project/default/sql/new
echo.
pause

REM Step 4: Add env vars to Vercel
echo.
echo Step 4: Adding environment variables to Vercel...
call npx vercel env add NEXT_PUBLIC_SUPABASE_URL production < nul
echo %SUPABASE_URL%
call npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production < nul
echo %SUPABASE_KEY%

echo.
echo ═══════════════════════════════════════════════════════════
echo   SETUP COMPLETE! Redeploy to activate cloud storage:
echo   npx vercel deploy --prod --yes
echo ═══════════════════════════════════════════════════════════
echo.
echo Your env vars:
echo   NEXT_PUBLIC_SUPABASE_URL=%SUPABASE_URL%
echo   NEXT_PUBLIC_SUPABASE_ANON_KEY=%SUPABASE_KEY%
echo.
echo You can also add these manually at:
echo   https://vercel.com/leapeds-projects/frontend/settings/environment-variables
echo.
pause
