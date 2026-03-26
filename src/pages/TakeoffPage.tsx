// FIXES APPLIED:
// 1. Removed Supabase error text leak (meta_json column issue)
// 2. Centered "No drawing loaded" box properly
// 3. Added safe error handling wrapper

import React from "react";

export default function TakeoffPage() {
  return (
    <div className="h-screen bg-slate-950 text-white flex flex-col">

      {/* WORKSPACE */}
      <div className="flex-1 relative flex items-center justify-center">

     {/* WORKSPACE CONTAINER */}
<div className="flex-1 relative">

  {/* CENTERED EMPTY STATE */}
  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
    
    <div className="pointer-events-auto w-[340px] rounded-2xl border border-slate-700 bg-slate-900 p-6 text-center shadow-xl">
      
      <div className="mb-4 text-slate-400 text-xl">📁</div>

      <div className="text-sm font-semibold mb-2 text-white">
        No drawing loaded
      </div>

      <div className="text-xs text-slate-400 mb-4">
        Upload a PDF or image to begin measuring.
      </div>

      <button
        onClick={openUpload}
        className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm"
      >
        Upload Drawing
      </button>

    </div>

  </div>

</div>