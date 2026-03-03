"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var supabase_js_2_1 = require("https://esm.sh/@supabase/supabase-js@2");
var corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(status, body) {
    return new Response(JSON.stringify(body), {
        status: status,
        headers: __assign(__assign({}, corsHeaders), { "Content-Type": "application/json" }),
    });
}
Deno.serve(function (req) { return __awaiter(void 0, void 0, void 0, function () {
    var PROJECT_URL, SERVICE_ROLE_KEY, authHeader, hasBearer, admin, authed, _a, userData, userError, user, _b, prof, profErr, payload, _c, email, role, _d, linkData, inviteErr, inviteLink;
    var _e, _f, _g, _h, _j, _k, _l;
    return __generator(this, function (_m) {
        switch (_m.label) {
            case 0:
                if (req.method === "OPTIONS")
                    return [2 /*return*/, new Response("ok", { headers: corsHeaders })];
                if (req.method !== "POST")
                    return [2 /*return*/, json(405, { error: "Method not allowed" })];
                PROJECT_URL = (_e = Deno.env.get("PROJECT_URL")) !== null && _e !== void 0 ? _e : "";
                SERVICE_ROLE_KEY = (_f = Deno.env.get("SERVICE_ROLE_KEY")) !== null && _f !== void 0 ? _f : "";
                if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
                    return [2 /*return*/, json(500, {
                            error: "Missing secrets",
                            missing: { PROJECT_URL: !PROJECT_URL, SERVICE_ROLE_KEY: !SERVICE_ROLE_KEY },
                        })];
                }
                authHeader = req.headers.get("authorization") || "";
                hasBearer = authHeader.toLowerCase().startsWith("bearer ");
                if (!hasBearer) {
                    return [2 /*return*/, json(401, { error: "Missing bearer", hasAuthorizationHeader: Boolean(authHeader) })];
                }
                admin = (0, supabase_js_2_1.createClient)(PROJECT_URL, SERVICE_ROLE_KEY);
                authed = (0, supabase_js_2_1.createClient)(PROJECT_URL, SERVICE_ROLE_KEY, {
                    global: { headers: { Authorization: authHeader } },
                });
                return [4 /*yield*/, authed.auth.getUser()];
            case 1:
                _a = _m.sent(), userData = _a.data, userError = _a.error;
                user = userData === null || userData === void 0 ? void 0 : userData.user;
                console.log("caller user id:", user === null || user === void 0 ? void 0 : user.id, "email:", user === null || user === void 0 ? void 0 : user.email);
                if (userError || !user) {
                    return [2 /*return*/, json(401, {
                            error: "Invalid JWT",
                            details: (_g = userError === null || userError === void 0 ? void 0 : userError.message) !== null && _g !== void 0 ? _g : null,
                            authHeaderPrefix: authHeader.slice(0, 30),
                        })];
                }
                return [4 /*yield*/, admin
                        .from("user_profiles")
                        .select("role,status,company_id")
                        .eq("id", user.id)
                        .maybeSingle()];
            case 2:
                _b = _m.sent(), prof = _b.data, profErr = _b.error;
                if (profErr)
                    return [2 /*return*/, json(500, { error: profErr.message })];
                if (!prof)
                    return [2 /*return*/, json(403, { error: "Profile not found", userId: user.id })];
                if (prof.status !== "active")
                    return [2 /*return*/, json(403, { error: "User disabled" })];
                if (!["director", "office_user"].includes(prof.role))
                    return [2 /*return*/, json(403, { error: "Not allowed", role: prof.role, userId: user.id })];
                payload = null;
                _m.label = 3;
            case 3:
                _m.trys.push([3, 5, , 6]);
                return [4 /*yield*/, req.json()];
            case 4:
                payload = _m.sent();
                return [3 /*break*/, 6];
            case 5:
                _c = _m.sent();
                return [2 /*return*/, json(400, { error: "Invalid JSON body" })];
            case 6:
                email = String((_h = payload === null || payload === void 0 ? void 0 : payload.email) !== null && _h !== void 0 ? _h : "").trim().toLowerCase();
                role = String((_j = payload === null || payload === void 0 ? void 0 : payload.role) !== null && _j !== void 0 ? _j : "").trim();
                if (!email)
                    return [2 /*return*/, json(400, { error: "Missing email" })];
                if (!role)
                    return [2 /*return*/, json(400, { error: "Missing role" })];
                return [4 /*yield*/, admin.auth.admin.generateLink({
                        type: "invite",
                        email: email,
                        options: {
                            data: { role: role, company_id: prof.company_id },
                            redirectTo: "http://localhost:5173",
                        },
                    })];
            case 7:
                _d = _m.sent(), linkData = _d.data, inviteErr = _d.error;
                if (inviteErr)
                    return [2 /*return*/, json(400, { error: "Invite failed", details: inviteErr.message })];
                inviteLink = (_l = (_k = linkData === null || linkData === void 0 ? void 0 : linkData.properties) === null || _k === void 0 ? void 0 : _k.action_link) !== null && _l !== void 0 ? _l : null;
                return [2 /*return*/, json(200, { ok: true, invited: email, inviteLink: inviteLink })];
        }
    });
}); });
