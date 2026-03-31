echo =========================
echo MAGNUS SYSTEM DEPLOY
echo =========================

echo.
echo 1. Pushing database migrations...
npx supabase db push

echo.
echo 2. Building app...
npm run build

echo.
echo 3. Committing changes...
git add .
git commit -m "auto deploy update"

echo.
echo 4. Pushing to GitHub...
git push

echo.
echo DONE
pause
