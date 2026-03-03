"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = App;
var react_1 = require("react");
var react_router_dom_1 = require("react-router-dom");
var SidebarLayout_1 = require("./layout/SidebarLayout");
var DashboardPage_1 = require("./pages/DashboardPage");
var ClientsPage_1 = require("./pages/ClientsPage");
var ProjectsPage_1 = require("./pages/ProjectsPage");
var EstimatesPage_1 = require("./pages/EstimatesPage");
var BOQPage_1 = require("./pages/BOQPage");
var AssembliesPage_1 = require("./pages/AssembliesPage");
var RatesPage_1 = require("./pages/RatesPage");
var TakeoffPage_1 = require("./pages/TakeoffPage");
var ProcurementPage_1 = require("./pages/ProcurementPage");
var FinancePage_1 = require("./pages/FinancePage");
var ReportsPage_1 = require("./pages/ReportsPage");
var SettingsPage_1 = require("./pages/SettingsPage");
var SettingsMasterListsPage_1 = require("./pages/SettingsMasterListsPage");
var SettingsMasterCategoriesPage_1 = require("./pages/SettingsMasterCategoriesPage");
var LoginPage_1 = require("./pages/LoginPage");
var supabase_1 = require("./lib/supabase");
function RequireAuth(_a) {
    var children = _a.children;
    var loc = (0, react_router_dom_1.useLocation)();
    var _b = (0, react_1.useState)(true), checking = _b[0], setChecking = _b[1];
    var _c = (0, react_1.useState)(false), authed = _c[0], setAuthed = _c[1];
    (0, react_1.useEffect)(function () {
        var alive = true;
        function check() {
            return __awaiter(this, void 0, void 0, function () {
                var data;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, supabase_1.supabase.auth.getSession()];
                        case 1:
                            data = (_a.sent()).data;
                            if (!alive)
                                return [2 /*return*/];
                            setAuthed(!!data.session);
                            setChecking(false);
                            return [2 /*return*/];
                    }
                });
            });
        }
        check();
        var sub = supabase_1.supabase.auth.onAuthStateChange(function (_event, session) {
            if (!alive)
                return;
            setAuthed(!!session);
            setChecking(false);
        }).data;
        return function () {
            alive = false;
            sub.subscription.unsubscribe();
        };
    }, []);
    if (checking) {
        return <div className="p-6 text-sm opacity-70">Loading...</div>;
    }
    if (!authed) {
        var next = encodeURIComponent(loc.pathname + loc.search);
        return <react_router_dom_1.Navigate to={"/login?next=".concat(next)} replace/>;
    }
    return <>{children}</>;
}
function App() {
    return (<react_router_dom_1.BrowserRouter>
      <react_router_dom_1.Routes>
        {/* Public route (no sidebar) */}
        <react_router_dom_1.Route path="/login" element={<LoginPage_1.default />}/>

        {/* Protected routes (with sidebar) */}
        <react_router_dom_1.Route element={<RequireAuth>
              <SidebarLayout_1.default />
            </RequireAuth>}>
          <react_router_dom_1.Route path="/" element={<DashboardPage_1.default />}/>
          <react_router_dom_1.Route path="/clients" element={<ClientsPage_1.default />}/>
          <react_router_dom_1.Route path="/projects" element={<ProjectsPage_1.default />}/>
          <react_router_dom_1.Route path="/estimates" element={<EstimatesPage_1.default />}/>
          <react_router_dom_1.Route path="/boq" element={<BOQPage_1.default />}/>
          
        <react_router_dom_1.Route path="/assemblies" element={<AssembliesPage_1.default />}/>
    <react_router_dom_1.Route path="/rates" element={<RatesPage_1.default />}/>
          <react_router_dom_1.Route path="/takeoff" element={<TakeoffPage_1.default />}/>
          <react_router_dom_1.Route path="/procurement" element={<ProcurementPage_1.default />}/>
          <react_router_dom_1.Route path="/finance" element={<FinancePage_1.default />}/>
          <react_router_dom_1.Route path="/reports" element={<ReportsPage_1.default />}/>
          <react_router_dom_1.Route path="/settings" element={<SettingsPage_1.default />}/>
          <react_router_dom_1.Route path="/settings/master-categories" element={<SettingsMasterCategoriesPage_1.default />}/>
          <react_router_dom_1.Route path="/settings/master-lists" element={<SettingsMasterListsPage_1.default />}/>
          <react_router_dom_1.Route path="/settings/users" element={<react_router_dom_1.Navigate to="/settings" replace/>}/>
          <react_router_dom_1.Route path="/settings/company" element={<react_router_dom_1.Navigate to="/settings" replace/>}/>
        </react_router_dom_1.Route>

        {/* fallback */}
        <react_router_dom_1.Route path="*" element={<react_router_dom_1.Navigate to="/" replace/>}/>
      </react_router_dom_1.Routes>
    </react_router_dom_1.BrowserRouter>);
}
