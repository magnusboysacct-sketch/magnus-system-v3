import React, { useState } from "react";
import { Link } from "react-router-dom";
import SettingsCompanyPage from "./SettingsCompanyPage";
import SettingsUsersPage from "./SettingsUsersPage";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"company" | "users" | "master-lists">("company");

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold">Settings</h1>
          <div className="text-sm opacity-70">Manage your system configuration and preferences.</div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 border-b border-white/10">
        <button
          onClick={() => setActiveTab("company")}
          className={`px-4 py-2 text-sm font-medium transition border-b-2 ${
            activeTab === "company"
              ? "border-white text-white bg-white/5"
              : "border-transparent text-white/60 hover:text-white hover:bg-white/5"
          }`}
        >
          Company
        </button>
        <button
          onClick={() => setActiveTab("users")}
          className={`px-4 py-2 text-sm font-medium transition border-b-2 ${
            activeTab === "users"
              ? "border-white text-white bg-white/5"
              : "border-transparent text-white/60 hover:text-white hover:bg-white/5"
          }`}
        >
          Users
        </button>
        <Link
          to="/settings/master-lists"
          className={`px-4 py-2 text-sm font-medium transition border-b-2 ${
            activeTab === "master-lists"
              ? "border-white text-white bg-white/5"
              : "border-transparent text-white/60 hover:text-white hover:bg-white/5"
          }`}
        >
          Master Lists
        </Link>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === "company" && <SettingsCompanyPage />}
        {activeTab === "users" && <SettingsUsersPage />}
      </div>
    </div>
  );
}
