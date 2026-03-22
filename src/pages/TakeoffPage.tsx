"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = TakeoffPage;
var react_1 = require("react");
var pdfjs_dist_1 = require("pdfjs-dist");
var pdf_worker_min_mjs_url_1 = require("pdfjs-dist/build/pdf.worker.min.mjs?url");
pdfjs_dist_1.GlobalWorkerOptions.workerSrc = pdf_worker_min_mjs_url_1.default;
function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
}
function dist(a, b) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
}
function parseFraction(input) {
    var s = input.trim();
    if (!s)
        return 0;
    // Accept: "1/2", "3/8", "0.25"
    if (/^\d+(\.\d+)?$/.test(s))
        return parseFloat(s);
    var m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (!m)
        return null;
    var a = parseInt(m[1], 10);
    var b = parseInt(m[2], 10);
    if (!b)
        return null;
    return a / b;
}
function feetFromFIS(feet, inches, frac) {
    return feet + (inches + frac) / 12;
}
function ScaleModal(props) {
    var open = props.open, onClose = props.onClose, onApply = props.onApply, canApply = props.canApply, _a = props.isCalibrating, isCalibrating = _a === void 0 ? false : _a, _b = props.calibPointsCount, calibPointsCount = _b === void 0 ? 0 : _b, _c = props.canConfirmCalibration, canConfirmCalibration = _c === void 0 ? false : _c, onCalibrationOk = props.onCalibrationOk, onCalibrationCancel = props.onCalibrationCancel;
    var _d = (0, react_1.useState)("standard"), tab = _d[0], setTab = _d[1];
    var _e = (0, react_1.useState)("10"), stdFeet = _e[0], setStdFeet = _e[1];
    var _f = (0, react_1.useState)(""), fisFeet = _f[0], setFisFeet = _f[1];
    var _g = (0, react_1.useState)(""), fisInch = _g[0], setFisInch = _g[1];
    var _h = (0, react_1.useState)(""), fisFrac = _h[0], setFisFrac = _h[1];
    var _j = (0, react_1.useState)("3"), metricMeters = _j[0], setMetricMeters = _j[1];
    var _k = (0, react_1.useState)(true), applyAllPages = _k[0], setApplyAllPages = _k[1];
    var _l = (0, react_1.useState)(true), autoDimLine = _l[0], setAutoDimLine = _l[1];
    var canStartCalibration = Number(stdFeet || 0) > 0;
    (0, react_1.useEffect)(function () {
        if (!open)
            return;
        setTab("standard");
    }, [open]);
    if (!open)
        return null;
    function apply() {
        var feet = null;
        if (tab === "standard") {
            var n = Number(stdFeet);
            if (Number.isFinite(n) && n > 0)
                feet = n;
        }
        if (tab === "fis") {
            var f = Number(fisFeet || 0);
            var i = Number(fisInch || 0);
            var fr = parseFraction(fisFrac);
            if (fr == null) {
                alert("Invalid fraction (use 1/2, 3/8, etc.)");
                return;
            }
            var total = feetFromFIS(f, i, fr);
            if (Number.isFinite(total) && total > 0)
                feet = total;
        }
        if (tab === "metric") {
            var m = Number(metricMeters);
            if (Number.isFinite(m) && m > 0)
                feet = m * 3.28084;
        }
        if (tab === "auto") {
            alert("Auto scale is coming next (read scale from title block).");
            return;
        }
        if (!feet) {
            alert("Please enter a valid scale distance.");
            return;
        }
        // Two-phase calibration: if calibrating, start point picking mode
        if (isCalibrating) {
            if (onCalibrationOk) {
                onCalibrationOk(feet);
            }
            return;
        }
        // Original behavior: apply scale directly
        onApply(feet, { applyAllPages: applyAllPages, autoDimLine: autoDimLine });
    }
    return (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-950 shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="text-lg font-semibold">Scale</div>
          <button onClick={onClose} className="px-2 py-1 rounded-lg hover:bg-slate-800/50">
            ✕
          </button>
        </div>

        <div className="px-5 pt-4">
          <div className="flex gap-2 text-sm">
            {[
            ["standard", "Standard"],
            ["fis", "F-I-S"],
            ["metric", "Metric"],
            ["auto", "Auto"],
        ].map(function (_a) {
            var k = _a[0], label = _a[1];
            return (<button key={k} onClick={function () { return setTab(k); }} className={"px-3 py-2 rounded-xl border " +
                    (tab === k ? "bg-slate-800 border-slate-700" : "bg-slate-950 border-slate-800 hover:bg-slate-900")}>
                {label}
              </button>);
        })}
          </div>

          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/20 p-4">
            {isCalibrating && (<div className="text-sm text-slate-300 mb-3">
                Calibration mode: Click {calibPointsCount}/2 points on the drawing
              </div>)}

            {tab === "standard" && (<div className="grid grid-cols-2 gap-3 items-end">
                <div className="col-span-2 text-sm text-slate-300">
                  Enter the real distance between your two clicked points:
                </div>
                <label className="text-xs text-slate-400">
                  Feet
                  <input value={stdFeet} onChange={function (e) { return setStdFeet(e.target.value); }} className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm" placeholder="10"/>
                </label>
                <div className="text-xs text-slate-400 flex items-center">ft</div>
              </div>)}

            {tab === "fis" && (<div className="grid grid-cols-3 gap-3 items-end">
                <label className="text-xs text-slate-400">
                  Feet
                  <input value={fisFeet} onChange={function (e) { return setFisFeet(e.target.value); }} className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm" placeholder="45"/>
                </label>

                <label className="text-xs text-slate-400">
                  Inch
                  <input value={fisInch} onChange={function (e) { return setFisInch(e.target.value); }} className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm" placeholder="6"/>
                </label>

                <label className="text-xs text-slate-400">
                  Fraction
                  <input value={fisFrac} onChange={function (e) { return setFisFrac(e.target.value); }} className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm" placeholder="1/2"/>
                </label>

                <div className="col-span-3 text-xs text-slate-500">
                  Tip: Fraction accepts 1/2, 3/8, 0.25, etc.
                </div>
              </div>)}

            {tab === "metric" && (<div className="grid grid-cols-2 gap-3 items-end">
                <div className="col-span-2 text-sm text-slate-300">Enter the distance in meters:</div>
                <label className="text-xs text-slate-400">
                  Meters
                  <input value={metricMeters} onChange={function (e) { return setMetricMeters(e.target.value); }} className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm" placeholder="3"/>
                </label>
                <div className="text-xs text-slate-400 flex items-center">m</div>
              </div>)}

            {tab === "auto" && (<div className="text-sm text-slate-300">
                Auto scale (read scale from drawing title block) — coming next.
              </div>)}
          </div>

          <div className="mt-4 space-y-2 text-sm">
            <label className="flex items-center gap-2 text-slate-300">
              <input type="checkbox" checked={applyAllPages} onChange={function (e) { return setApplyAllPages(e.target.checked); }}/>
              Apply scale to all pages
            </label>
            <label className="flex items-center gap-2 text-slate-300">
              <input type="checkbox" checked={autoDimLine} onChange={function (e) { return setAutoDimLine(e.target.checked); }}/>
              Automatically create dimension line
            </label>
          </div>

          <div className="mt-5 flex items-center justify-between pb-5">
            <button onClick={function () { return onApply(0, { applyAllPages: applyAllPages, autoDimLine: autoDimLine }); }} className="px-3 py-2 rounded-xl bg-slate-800/40 hover:bg-slate-800/60 text-sm">
              Clear Scale
            </button>

            <div className="flex gap-2">
              <button onClick={onCalibrationCancel || onClose} className="px-4 py-2 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 text-sm">
                Cancel
              </button>
              <button disabled={isCalibrating ? !canStartCalibration : !canApply} onClick={apply} className={"px-4 py-2 rounded-xl text-sm " +
            ((isCalibrating ? canStartCalibration : canApply) ? "bg-emerald-900/50 hover:bg-emerald-900/70 border border-emerald-900/40" : "bg-slate-800/20 text-slate-500")}>
                OK
              </button>
            </div>
          </div>

          {!(isCalibrating ? canConfirmCalibration : canApply) && (<div className="pb-5 text-xs text-slate-500">
              {isCalibrating
                ? "Click ".concat(2 - calibPointsCount, " more point").concat(calibPointsCount === 1 ? '' : 's', " on the drawing first, then press OK.")
                : "Click two points on the drawing first, then press OK."}
            </div>)}
        </div>
      </div>
    </div>);
}
var TakeoffErrorBoundary = /** @class */ (function (_super) {
    __extends(TakeoffErrorBoundary, _super);
    function TakeoffErrorBoundary(props) {
        var _this = _super.call(this, props) || this;
        _this.state = { err: null };
        return _this;
    }
    TakeoffErrorBoundary.getDerivedStateFromError = function (err) {
        return { err: err };
    };
    TakeoffErrorBoundary.prototype.componentDidCatch = function (err) {
        console.error("TAKEOFF PAGE CRASH:", err);
    };
    TakeoffErrorBoundary.prototype.render = function () {
        var _a, _b;
        if (this.state.err) {
            return (<div style={{ padding: 16, color: "#fff", background: "#111" }}>
          <h2 style={{ marginBottom: 8 }}>Takeoff crashed</h2>
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {String(((_a = this.state.err) === null || _a === void 0 ? void 0 : _a.message) || this.state.err)}
          </pre>
          <pre style={{ whiteSpace: "pre-wrap", opacity: 0.8 }}>
            {String(((_b = this.state.err) === null || _b === void 0 ? void 0 : _b.stack) || "")}
          </pre>
        </div>);
        }
        return this.props.children;
    };
    return TakeoffErrorBoundary;
}(react_1.default.Component));
function TakeoffPageInner() {
    var _this = this;
    var canvasRef = (0, react_1.useRef)(null);
    var viewerRef = (0, react_1.useRef)(null);
    var renderTaskRef = (0, react_1.useRef)(null);
    var renderSeqRef = (0, react_1.useRef)(0);
    var _a = (0, react_1.useState)(null), pdf = _a[0], setPdf = _a[1];
    var _b = (0, react_1.useState)(1), pageNumber = _b[0], setPageNumber = _b[1];
    var _c = (0, react_1.useState)(0), numPages = _c[0], setNumPages = _c[1];
    var _d = (0, react_1.useState)(1.0), scale = _d[0], setScale = _d[1];
    var _e = (0, react_1.useState)(0), panX = _e[0], setPanX = _e[1];
    var _f = (0, react_1.useState)(0), panY = _f[0], setPanY = _f[1];
    var _g = (0, react_1.useState)(false), calibrating = _g[0], setCalibrating = _g[1];
    var _h = (0, react_1.useState)([]), calPoints = _h[0], setCalPoints = _h[1];
    var _j = (0, react_1.useState)(null), feetPerPixel = _j[0], setFeetPerPixel = _j[1];
    var _k = (0, react_1.useState)(false), isCalibrating = _k[0], setIsCalibrating = _k[1];
    var _l = (0, react_1.useState)([]), calibPoints = _l[0], setCalibPoints = _l[1];
    var _m = (0, react_1.useState)(null), pendingCalibLength = _m[0], setPendingCalibLength = _m[1];
    function getEnteredFeet() {
        // This needs to be passed from ScaleModal - for now return 1 as placeholder
        return 1;
    }
    var canStartCalibration = getEnteredFeet() > 0;
    var _o = (0, react_1.useState)(null), error = _o[0], setError = _o[1];
    var _p = (0, react_1.useState)(false), loadingPdf = _p[0], setLoadingPdf = _p[1];
    var _q = (0, react_1.useState)(false), overViewer = _q[0], setOverViewer = _q[1];
    var _r = (0, react_1.useState)(false), scaleModalOpen = _r[0], setScaleModalOpen = _r[1];
    var fitScaleRef = (0, react_1.useRef)(null);
    // PlanSwift navigation refs
    var isSpaceDownRef = (0, react_1.useRef)(false);
    var isPanningRef = (0, react_1.useRef)(false);
    var panStartRef = (0, react_1.useRef)({ x: 0, y: 0, panX: 0, panY: 0 });
    var activePointerIdRef = (0, react_1.useRef)(null);
    var _s = (0, react_1.useState)("select"), tool = _s[0], setTool = _s[1];
    var _t = (0, react_1.useState)(null), lineStart = _t[0], setLineStart = _t[1];
    var _u = (0, react_1.useState)(null), lineEnd = _u[0], setLineEnd = _u[1];
    var _v = (0, react_1.useState)(null), hoverPt = _v[0], setHoverPt = _v[1];
    var _w = (0, react_1.useState)(null), feetPerPdfUnit = _w[0], setFeetPerPdfUnit = _w[1];
    function distFeet(a, b) {
        var dx = b.x - a.x;
        var dy = b.y - a.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (!d)
            return 0;
        // If calibration state is feetPerPdfUnit:
        if (!feetPerPdfUnit)
            return 0;
        return d * feetPerPdfUnit;
    }
    function formatFeetInches(totalFeet) {
        if (!isFinite(totalFeet) || totalFeet <= 0)
            return "";
        var feet = Math.floor(totalFeet);
        var inchesTotal = (totalFeet - feet) * 12;
        var inches = Math.floor(inchesTotal);
        var frac = inchesTotal - inches;
        // round to nearest 1/16
        var denom = 16;
        var num = Math.round(frac * denom);
        var fFeet = feet;
        var fIn = inches;
        if (num === denom) {
            num = 0;
            fIn += 1;
        }
        if (fIn === 12) {
            fIn = 0;
            fFeet += 1;
        }
        var fracStr = num === 0 ? "" : " ".concat(num, "/").concat(denom);
        return "".concat(fFeet, "' ").concat(fIn, "\"").concat(fracStr);
    }
    function onPickFile(file) {
        return __awaiter(this, void 0, void 0, function () {
            var arrayBuffer, task, loadedPdf, e_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        setError(null);
                        if (!file)
                            return [2 /*return*/];
                        if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
                            setError("Please upload a PDF file.");
                            return [2 /*return*/];
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, 5, 6]);
                        setLoadingPdf(true);
                        return [4 /*yield*/, file.arrayBuffer()];
                    case 2:
                        arrayBuffer = _a.sent();
                        task = (0, pdfjs_dist_1.getDocument)({ data: arrayBuffer });
                        return [4 /*yield*/, task.promise];
                    case 3:
                        loadedPdf = _a.sent();
                        setPdf(loadedPdf);
                        setNumPages(loadedPdf.numPages);
                        setPageNumber(1);
                        setFeetPerPixel(null);
                        setCalibrating(false);
                        setIsCalibrating(false);
                        setCalPoints([]);
                        setCalibPoints([]);
                        setPanX(0);
                        setPanY(0);
                        setTool("select");
                        setLineStart(null);
                        setLineEnd(null);
                        setHoverPt(null);
                        fitScaleRef.current = null;
                        setScale(1.0);
                        if (viewerRef.current) {
                            viewerRef.current.scrollLeft = 0;
                            viewerRef.current.scrollTop = 0;
                        }
                        return [3 /*break*/, 6];
                    case 4:
                        e_1 = _a.sent();
                        setError("PDF load failed: " + ((e_1 === null || e_1 === void 0 ? void 0 : e_1.message) || String(e_1)));
                        setPdf(null);
                        setNumPages(0);
                        setPageNumber(1);
                        return [3 /*break*/, 6];
                    case 5:
                        setLoadingPdf(false);
                        return [7 /*endfinally*/];
                    case 6: return [2 /*return*/];
                }
            });
        });
    }
    function computeFitScale() {
        return __awaiter(this, void 0, void 0, function () {
            var viewer, page, v, pad, vw, vh, fit;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!pdf)
                            return [2 /*return*/, null];
                        viewer = viewerRef.current;
                        if (!viewer)
                            return [2 /*return*/, null];
                        return [4 /*yield*/, pdf.getPage(pageNumber)];
                    case 1:
                        page = _a.sent();
                        v = page.getViewport({ scale: 1 });
                        pad = 24;
                        vw = Math.max(200, viewer.clientWidth - pad);
                        vh = Math.max(200, viewer.clientHeight - pad);
                        fit = Math.min(vw / v.width, vh / v.height) * 0.98;
                        return [2 /*return*/, clamp(fit, 0.3, 4)];
                }
            });
        });
    }
    function drawOverlay(ctx) {
        if (calPoints.length > 0) {
            ctx.save();
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#22c55e";
            ctx.fillStyle = "#22c55e";
            for (var _i = 0, calPoints_1 = calPoints; _i < calPoints_1.length; _i++) {
                var p = calPoints_1[_i];
                ctx.beginPath();
                ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
                ctx.fill();
            }
            if (calPoints.length === 2) {
                ctx.beginPath();
                ctx.moveTo(calPoints[0].x, calPoints[0].y);
                ctx.lineTo(calPoints[1].x, calPoints[1].y);
                ctx.stroke();
            }
            ctx.restore();
        }
        var a = lineStart;
        var b = lineEnd !== null && lineEnd !== void 0 ? lineEnd : (tool === "line" ? hoverPt : null);
        if (tool === "line" && a && b) {
            ctx.save();
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#60a5fa";
            ctx.fillStyle = "#60a5fa";
            ctx.beginPath();
            ctx.arc(a.x, a.y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            var px = dist(a, b);
            var totalFeet = distFeet(a, b);
            var label = totalFeet > 0 ? formatFeetInches(totalFeet) : "".concat(px.toFixed(0), " px (calibrate to get feet)");
            var midX_1 = (a.x + b.x) / 2;
            var midY_1 = (a.y + b.y) / 2;
            ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
            var pad = 6;
            var w_1 = ctx.measureText(label).width + pad * 2;
            var h_1 = 22;
            ctx.fillStyle = "rgba(2,6,23,0.85)";
            ctx.strokeStyle = "rgba(96,165,250,0.9)";
            ctx.lineWidth = 1;
            ctx.roundRect
                ? ctx.roundRect(midX_1 - w_1 / 2, midY_1 - h_1 - 8, w_1, h_1, 8)
                : (function () {
                    ctx.beginPath();
                    ctx.rect(midX_1 - w_1 / 2, midY_1 - h_1 - 8, w_1, h_1);
                })();
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "#e2e8f0";
            ctx.fillText(label, midX_1 - w_1 / 2 + pad, midY_1 - 12);
            ctx.restore();
        }
    }
    function render() {
        return __awaiter(this, void 0, void 0, function () {
            var canvas, viewer, seq, page, fit, viewport, ctx, task, err_1, e_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 9, , 10]);
                        if (!pdf)
                            return [2 /*return*/];
                        canvas = canvasRef.current;
                        viewer = viewerRef.current;
                        if (!canvas || !viewer)
                            return [2 /*return*/];
                        seq = ++renderSeqRef.current;
                        return [4 /*yield*/, pdf.getPage(pageNumber)];
                    case 1:
                        page = _a.sent();
                        if (!(fitScaleRef.current == null)) return [3 /*break*/, 3];
                        return [4 /*yield*/, computeFitScale()];
                    case 2:
                        fit = _a.sent();
                        if (fit != null) {
                            fitScaleRef.current = fit;
                            setScale(fit);
                            return [2 /*return*/];
                        }
                        _a.label = 3;
                    case 3:
                        viewport = page.getViewport({ scale: scale });
                        ctx = canvas.getContext("2d");
                        if (!ctx)
                            return [2 /*return*/];
                        canvas.width = Math.floor(viewport.width);
                        canvas.height = Math.floor(viewport.height);
                        canvas.style.width = canvas.width + "px";
                        canvas.style.height = canvas.height + "px";
                        canvas.style.maxWidth = "none";
                        canvas.style.maxHeight = "none";
                        canvas.style.display = "block";
                        if (renderTaskRef.current) {
                            try {
                                renderTaskRef.current.cancel();
                            }
                            catch (_b) { }
                            renderTaskRef.current = null;
                        }
                        task = page.render({ canvasContext: ctx, viewport: viewport });
                        renderTaskRef.current = task;
                        _a.label = 4;
                    case 4:
                        _a.trys.push([4, 6, 7, 8]);
                        return [4 /*yield*/, task.promise];
                    case 5:
                        _a.sent();
                        return [3 /*break*/, 8];
                    case 6:
                        err_1 = _a.sent();
                        if ((err_1 === null || err_1 === void 0 ? void 0 : err_1.name) !== "RenderingCancelledException")
                            throw err_1;
                        return [2 /*return*/];
                    case 7:
                        if (renderTaskRef.current === task)
                            renderTaskRef.current = null;
                        return [7 /*endfinally*/];
                    case 8:
                        if (seq !== renderSeqRef.current)
                            return [2 /*return*/];
                        drawOverlay(ctx);
                        return [3 /*break*/, 10];
                    case 9:
                        e_2 = _a.sent();
                        setError("Render failed: " + ((e_2 === null || e_2 === void 0 ? void 0 : e_2.message) || String(e_2)));
                        return [3 /*break*/, 10];
                    case 10: return [2 /*return*/];
                }
            });
        });
    }
    (0, react_1.useEffect)(function () {
        var cancelled = false;
        (function () { return __awaiter(_this, void 0, void 0, function () {
            var e_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        if (!!cancelled) return [3 /*break*/, 2];
                        return [4 /*yield*/, render()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [3 /*break*/, 4];
                    case 3:
                        e_3 = _a.sent();
                        if (!cancelled)
                            setError("Render failed: " + ((e_3 === null || e_3 === void 0 ? void 0 : e_3.message) || String(e_3)));
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        }); })();
        return function () {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pdf, pageNumber, scale, panX, panY, calPoints.length, calibPoints.length, tool, lineStart === null || lineStart === void 0 ? void 0 : lineStart.x, lineStart === null || lineStart === void 0 ? void 0 : lineStart.y, lineEnd === null || lineEnd === void 0 ? void 0 : lineEnd.x, lineEnd === null || lineEnd === void 0 ? void 0 : lineEnd.y, hoverPt === null || hoverPt === void 0 ? void 0 : hoverPt.x, hoverPt === null || hoverPt === void 0 ? void 0 : hoverPt.y]);
    // Remove old zoom anchor logic - now using pan system
    (0, react_1.useEffect)(function () {
        var onKeyDown = function (e) {
            if (e.code === "Space") {
                // prevent page scrolling when space is pressed
                e.preventDefault();
                isSpaceDownRef.current = true;
            }
        };
        var onKeyUp = function (e) {
            if (e.code === "Space") {
                isSpaceDownRef.current = false;
                isPanningRef.current = false;
                activePointerIdRef.current = null;
            }
        };
        window.addEventListener("keydown", onKeyDown, { passive: false });
        window.addEventListener("keyup", onKeyUp);
        return function () {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
        };
    }, []);
    (0, react_1.useEffect)(function () {
        function onWheel(e) {
            if (!overViewer)
                return;
            if (e.ctrlKey || e.metaKey)
                e.preventDefault();
        }
        function onKeyDown(e) {
            if (!overViewer)
                return;
            if (e.ctrlKey || e.metaKey) {
                var k = e.key.toLowerCase();
                if (k === "+" || k === "=" || k === "-" || k === "0")
                    e.preventDefault();
            }
        }
        window.addEventListener("wheel", onWheel, { passive: false, capture: true });
        window.addEventListener("keydown", onKeyDown, { capture: true });
        return function () {
            window.removeEventListener("wheel", onWheel, { capture: true });
            window.removeEventListener("keydown", onKeyDown, { capture: true });
        };
    }, [overViewer]);
    function nextPage() {
        if (pageNumber < numPages) {
            setPageNumber(function (p) { return p + 1; });
            fitScaleRef.current = null;
            setLineStart(null);
            setLineEnd(null);
            setHoverPt(null);
            setCalPoints([]);
            setCalibrating(false);
            setIsCalibrating(false);
            setCalibPoints([]);
        }
    }
    function prevPage() {
        if (pageNumber > 1) {
            setPageNumber(function (p) { return p - 1; });
            fitScaleRef.current = null;
            setLineStart(null);
            setLineEnd(null);
            setHoverPt(null);
            setCalPoints([]);
            setCalibrating(false);
            setIsCalibrating(false);
            setCalibPoints([]);
        }
    }
    function startCalibrate() {
        setError(null);
        setCalibrating(true);
        setIsCalibrating(true);
        setCalibPoints([]);
        setTool("select");
        setLineStart(null);
        setLineEnd(null);
        setHoverPt(null);
        setCalPoints([]);
        setScaleModalOpen(true);
    }
    function cancelCalibrate() {
        setCalibrating(false);
        setIsCalibrating(false);
        setCalibPoints([]);
        setCalPoints([]);
        setScaleModalOpen(false);
    }
    function canvasPointFromEvent(e) {
        var canvas = canvasRef.current;
        var rect = canvas.getBoundingClientRect();
        return {
            x: Math.round(e.clientX - rect.left),
            y: Math.round(e.clientY - rect.top),
        };
    }
    // PlanSwift navigation handlers
    function shouldStartPan(e) {
        var LEFT = 0;
        var MIDDLE = 1;
        // Middle mouse drag pans
        if (e.button === MIDDLE)
            return true;
        // Space + left drag pans
        if (e.button === LEFT && isSpaceDownRef.current)
            return true;
        return false;
    }
    function onViewerPointerDown(e) {
        // If calibration click-mode is ON, we must NOT pan unless it's explicitly a pan gesture
        // (space+drag or middle drag). Normal click should record points (your existing logic).
        var el = viewerRef.current;
        if (!el)
            return;
        if (!shouldStartPan(e))
            return; // let normal click flow continue
        e.preventDefault();
        e.stopPropagation();
        isPanningRef.current = true;
        activePointerIdRef.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        panStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            panX: panX,
            panY: panY,
        };
    }
    function onViewerPointerMove(e) {
        if (!isPanningRef.current)
            return;
        if (activePointerIdRef.current !== e.pointerId)
            return;
        e.preventDefault();
        var dx = e.clientX - panStartRef.current.x;
        var dy = e.clientY - panStartRef.current.y;
        // Pan in screen pixels
        setPanX(panStartRef.current.panX + dx);
        setPanY(panStartRef.current.panY + dy);
    }
    function endPan(e) {
        if (!isPanningRef.current)
            return;
        isPanningRef.current = false;
        if (e && activePointerIdRef.current === e.pointerId) {
            try {
                e.currentTarget.releasePointerCapture(e.pointerId);
            }
            catch (_a) { }
        }
        activePointerIdRef.current = null;
    }
    function onViewerPointerUp(e) {
        if (!isPanningRef.current)
            return;
        e.preventDefault();
        e.stopPropagation();
        endPan(e);
    }
    function onViewerPointerLeave(e) {
        endPan(e);
    }
    function onViewerWheel(e) {
        var el = viewerRef.current;
        if (!el)
            return;
        // Prevent page scroll when interacting with drawing
        e.preventDefault();
        // Trackpads usually emit small deltas; normalize zoom with a gentle factor
        var isZoomGesture = e.ctrlKey; // ctrl+wheel commonly equals pinch-to-zoom on trackpads
        if (!isZoomGesture) {
            // Two-finger scroll pans the drawing (PlanSwift feel)
            setPanX(function (v) { return v - e.deltaX; });
            setPanY(function (v) { return v - e.deltaY; });
            return;
        }
        // Zoom to cursor: keep content point under cursor stable
        var rect = el.getBoundingClientRect();
        var mx = e.clientX - rect.left;
        var my = e.clientY - rect.top;
        // current content coords under cursor
        var cx = (mx - panX) / scale;
        var cy = (my - panY) / scale;
        // Zoom step
        var direction = e.deltaY > 0 ? -1 : 1; // invert if needed
        var factor = Math.exp(direction * 0.08); // smooth
        var nextZoom = clamp(scale * factor, 0.2, 6); // adjust if you have your own bounds
        // new pan to keep (cx,cy) under cursor
        var nextPanX = mx - cx * nextZoom;
        var nextPanY = my - cy * nextZoom;
        setScale(nextZoom);
        setPanX(nextPanX);
        setPanY(nextPanY);
    }
    function onCanvasClick(e) {
        // Don't record calibration points when panning
        if (isPanningRef.current)
            return;
        if (isCalibrating) {
            e.preventDefault();
            e.stopPropagation();
            var el = viewerRef.current;
            if (!el)
                return;
            var rect = el.getBoundingClientRect();
            var mx = e.clientX - rect.left;
            var my = e.clientY - rect.top;
            var x = (mx - panX) / scale;
            var y = (my - panY) / scale;
            var newPoint_1 = { x: x, y: y };
            setCalibPoints(function (prev) {
                if (prev.length >= 2)
                    return [newPoint_1]; // restart if third click
                return __spreadArray(__spreadArray([], prev, true), [newPoint_1], false);
            });
            return; // IMPORTANT: stop normal takeoff logic
        }
        if (calibrating) {
            var p_1 = canvasPointFromEvent(e);
            setCalPoints(function (prev) {
                if (prev.length >= 2)
                    return [p_1];
                return __spreadArray(__spreadArray([], prev, true), [p_1], false);
            });
            return;
        }
        if (tool === "line") {
            var p = canvasPointFromEvent(e);
            if (!lineStart) {
                setLineStart(p);
                setLineEnd(null);
                return;
            }
            if (!lineEnd) {
                setLineEnd(p);
                return;
            }
            setLineStart(p);
            setLineEnd(null);
            return;
        }
    }
    function onCanvasMove(e) {
        if (tool !== "line")
            return;
        if (!lineStart)
            return;
        if (lineEnd)
            return;
        setHoverPt(canvasPointFromEvent(e));
    }
    function applyScaleFromModal(realFeet, opts) {
        // Clear scale
        if (realFeet === 0) {
            setFeetPerPixel(null);
            setCalibrating(false);
            setIsCalibrating(false);
            setCalPoints([]);
            setCalibPoints([]);
            setScaleModalOpen(false);
            setError(null);
            return;
        }
        // Use new calibration points if in calibration mode, otherwise use old points
        var pointsToUse = isCalibrating ? calibPoints : calPoints;
        var pointsLength = isCalibrating ? calibPoints.length : calPoints.length;
        if (pointsLength !== 2) {
            setError("Click two points on the drawing first.");
            return;
        }
        var pixelDist = dist(pointsToUse[0], pointsToUse[1]);
        if (pixelDist <= 0) {
            setError("Points too close.");
            return;
        }
        var fpp = realFeet / pixelDist;
        setFeetPerPixel(fpp);
        // NOTE: opts.applyAllPages and opts.autoDimLine are stored later when we save takeoff to DB.
        // For now, this is just UI behavior (we'll persist it in the next upgrade).
        setCalibrating(false);
        setIsCalibrating(false);
        setScaleModalOpen(false);
        setError(null);
        // keep overlay showing the 2 points until next click
        // (this feels like PlanSwift's "dimension line" behavior)
        if (!opts.autoDimLine) {
            setCalPoints([]);
            setCalibPoints([]);
        }
    }
    function handleCalibrationOk(lengthFeet) {
        if (!lengthFeet)
            return;
        setPendingCalibLength(lengthFeet);
        setCalibPoints([]);
        setIsCalibrating(true);
        setScaleModalOpen(false);
    }
    function onCalibrationCancel() {
        setIsCalibrating(false);
        setCalibPoints([]);
        setPendingCalibLength(null);
        setScaleModalOpen(false);
    }
    var canConfirmCalibration = calibPoints.length === 2;
    // Auto-apply when 2 points are selected
    (0, react_1.useEffect)(function () {
        if (!isCalibrating)
            return;
        if (calibPoints.length !== 2)
            return;
        if (!pendingCalibLength)
            return;
        var a = calibPoints[0], b = calibPoints[1];
        var dx = b.x - a.x;
        var dy = b.y - a.y;
        var pixelDist = Math.sqrt(dx * dx + dy * dy);
        if (!pixelDist || pixelDist <= 0)
            return;
        // Apply scale: feet per pixel
        var newFeetPerPixel = pendingCalibLength / pixelDist;
        setFeetPerPixel(newFeetPerPixel);
        setFeetPerPdfUnit(newFeetPerPixel);
        // Done
        setIsCalibrating(false);
        setPendingCalibLength(null);
        setCalibPoints([]);
    }, [isCalibrating, calibPoints, pendingCalibLength]);
    return (<div className="p-6 h-full flex flex-col">
      <ScaleModal open={scaleModalOpen} onClose={onCalibrationCancel} onApply={applyScaleFromModal} canApply={calPoints && calPoints.length === 2} isCalibrating={isCalibrating} calibPointsCount={calibPoints.length} canConfirmCalibration={canConfirmCalibration} onCalibrationOk={handleCalibrationOk} onCalibrationCancel={onCalibrationCancel}/>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Takeoff</h1>
          <p className="text-slate-400 text-sm">Fit-to-view on load. Ctrl+wheel zoom-to-cursor. Line tool measures.</p>
        </div>

        <div className="flex items-center gap-2">
          <label className="px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-sm cursor-pointer">
            Upload PDF
            <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={function (e) { var _a, _b; return onPickFile((_b = (_a = e.target.files) === null || _a === void 0 ? void 0 : _a[0]) !== null && _b !== void 0 ? _b : null); }}/>
          </label>

          {pdf && (<button onClick={startCalibrate} className="px-3 py-2 rounded-xl bg-emerald-900/25 hover:bg-emerald-900/40 border border-emerald-900/40 text-sm">
              Calibrate Scale
            </button>)}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button onClick={function () {
            setTool("select");
            setLineStart(null);
            setLineEnd(null);
            setHoverPt(null);
        }} className={"px-3 py-2 rounded-xl text-sm border " + (tool === "select" ? "bg-slate-800 border-slate-700" : "bg-slate-950 border-slate-800 hover:bg-slate-900")}>
          Select
        </button>

        <button onClick={function () {
            setTool("line");
            setLineStart(null);
            setLineEnd(null);
            setHoverPt(null);
        }} className={"px-3 py-2 rounded-xl text-sm border " + (tool === "line" ? "bg-slate-800 border-slate-700" : "bg-slate-950 border-slate-800 hover:bg-slate-900")}>
          Line
        </button>

        <div className="flex-1"/>

        {tool === "line" && <div className="text-xs text-slate-400">Click 2 points to measure. 3rd click starts new line.</div>}
      </div>

      {error && (<div className="mt-4 rounded-xl border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-200">
          {error}
        </div>)}

      {loadingPdf && <div className="mt-4 text-sm text-slate-400">Loading PDF…</div>}

      {pdf && (<div className="mt-4 flex items-center gap-2">
          <button onClick={prevPage} className="px-3 py-2 bg-slate-800 rounded-lg">
            Prev
          </button>

          <span className="text-sm">
            Page {pageNumber} / {numPages}
          </span>

          <button onClick={nextPage} className="px-3 py-2 bg-slate-800 rounded-lg">
            Next
          </button>

          <div className="flex-1"/>

          {feetPerPixel ? (<div className="text-xs text-emerald-300 border border-emerald-900/40 bg-emerald-950/20 px-2 py-1 rounded-lg">
              Scale set: {feetPerPixel.toFixed(4)} ft / px
            </div>) : (<div className="text-xs text-slate-400">Scale not set (calibrate before measuring)</div>)}

          <div className="w-3"/>
          <span className="text-sm">{Math.round(scale * 100)}%</span>

          <button onClick={function () { return __awaiter(_this, void 0, void 0, function () {
                var fit;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            fitScaleRef.current = null;
                            return [4 /*yield*/, computeFitScale()];
                        case 1:
                            fit = _a.sent();
                            if (fit != null) {
                                fitScaleRef.current = fit;
                                setScale(fit);
                                setPanX(0);
                                setPanY(0);
                            }
                            return [2 /*return*/];
                    }
                });
            }); }} className="ml-2 px-3 py-2 bg-slate-800 rounded-lg text-sm">
            Fit
          </button>
        </div>)}

      <div className="mt-4 flex-1 border border-slate-800 rounded-xl bg-slate-950 overflow-hidden">
        {pdf ? (<div ref={viewerRef} onPointerDown={onViewerPointerDown} onPointerMove={onViewerPointerMove} onPointerUp={onViewerPointerUp} onPointerLeave={onViewerPointerLeave} onWheel={onViewerWheel} onMouseEnter={function () { return setOverViewer(true); }} onMouseLeave={function () { return setOverViewer(false); }} className="p-3 h-full" style={{ touchAction: "none", cursor: "default" }}>
            <div style={{ display: "inline-block", transform: "translate(".concat(panX, "px, ").concat(panY, "px)") }}>
              <canvas ref={canvasRef} onClick={onCanvasClick} onMouseMove={onCanvasMove} className={calibrating || isPanningRef.current ? "cursor-crosshair" : tool === "line" ? "cursor-crosshair" : "cursor-default"} style={{ userSelect: "none" }}/>
            </div>

            <div className="mt-2 text-xs text-slate-400">
              {isCalibrating
                ? "Calibration: click 2 points on drawing (".concat(calibPoints.length, "/2).")
                : "Calibrate: open Scale, click 2 points on drawing, then OK."}
            </div>
          </div>) : (<div className="h-full flex items-center justify-center text-slate-500">Upload a PDF drawing to begin.</div>)}
      </div>
    </div>);
}
function TakeoffPage() {
    return (<TakeoffErrorBoundary>
      <TakeoffPageInner />
    </TakeoffErrorBoundary>);
}
