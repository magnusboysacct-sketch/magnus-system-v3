param(
  [Parameter(Mandatory=$true)]
  [string]$Feature
)

Write-Host ""
Write-Host "======================================"
Write-Host "MAGNUS AI MIGRATION PROMPT GENERATOR"
Write-Host "======================================"
Write-Host ""
Write-Host "Paste this into ChatGPT or Windsurf AI:"
Write-Host ""
Write-Host "Create ONE production-safe Supabase PostgreSQL migration for Magnus System v3."
Write-Host "Return SQL only."
Write-Host ""
Write-Host "Feature request: $Feature"
Write-Host ""
Write-Host "Rules:"
Write-Host "- use Postgres/Supabase SQL"
Write-Host "- use public schema unless stated otherwise"
Write-Host "- use if exists / if not exists where safe"
Write-Host "- include indexes, foreign keys, and RLS-ready structure where appropriate"
Write-Host "- do not delete existing data"
Write-Host "- do not include explanations"
Write-Host "- migration must be safe for production"
Write-Host ""
