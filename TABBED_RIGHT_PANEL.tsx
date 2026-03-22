        {rightPanelVisible && (
          <aside className="flex flex-col border-l border-slate-200 bg-white">
            {/* Tab Navigation */}
            <div className="flex border-b border-slate-200 bg-slate-50">
              <button
                onClick={() => setActiveTab("measurements")}
                className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
                  activeTab === "measurements"
                    ? "border-blue-600 bg-white text-blue-600"
                    : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Ruler className="h-4 w-4" />
                <span>Measurements</span>
              </button>
              <button
                onClick={() => setActiveTab("extracted")}
                className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
                  activeTab === "extracted"
                    ? "border-blue-600 bg-white text-blue-600"
                    : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <FileText className="h-4 w-4" />
                <span>Extracted</span>
              </button>
              <button
                onClick={() => setActiveTab("boq")}
                className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
                  activeTab === "boq"
                    ? "border-blue-600 bg-white text-blue-600"
                    : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Link2 className="h-4 w-4" />
                <span>BOQ</span>
              </button>
              <button
                onClick={() => setActiveTab("settings")}
                className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
                  activeTab === "settings"
                    ? "border-blue-600 bg-white text-blue-600"
                    : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden">
              {activeTab === "measurements" && (
                <TakeoffMeasurementsTab
                  groups={safeGroups}
                  measurements={safeMeasurements}
                  totalsByGroup={totalsByGroup}
                  selectedGroupId={selectedGroupId}
                  selectedMeasurementId={selectedMeasurementId}
                  highlightedGroupId={highlightedGroupId}
                  calibrationScale={calibrationScale}
                  calibrationUnit={calibrationUnit}
                  onSelectGroup={setSelectedGroupId}
                  onSelectMeasurement={setSelectedMeasurementId}
                  onHighlightGroup={setHighlightedGroupId}
                  onAddGroup={addGroup}
                  onDeleteGroup={deleteGroup}
                  onRemoveMeasurement={removeMeasurement}
                  onUpdateDimensions={updateMeasurementDimensions}
                  formatNumber={formatNumber}
                  getMeasurementBadge={getMeasurementBadge}
                />
              )}
              {activeTab === "extracted" && (
                <ExtractedDetailsTab
                  projectId={activeProjectId || ""}
                  companyId={companyId || ""}
                  currentSessionId={session?.id || null}
                />
              )}
              {activeTab === "boq" && <TakeoffBOQLinksTab />}
              {activeTab === "settings" && <TakeoffSettingsTab />}
            </div>
          </aside>
        )}
