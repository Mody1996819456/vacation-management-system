import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ReactDOM from "react-dom";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import emailjs from "@emailjs/browser";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import {
  LayoutDashboard, Users, LogOut, Plus, Trash2, Calendar, CheckCircle,
  Clock, Search, Edit3, ShieldCheck, Download, Loader2,
  ArrowUpRight, CalendarDays, X, UserPlus, Upload, Bell, MessageSquare,
  FileDown, BarChart3, Building2, TrendingUp,
  AlertCircle, RefreshCw, PieChart, BarChart2,
  History, Mail, Briefcase, Smartphone, Wifi, WifiOff,
  Award, Target, Flame, Eye, KeyRound, Printer, Share2,
} from "lucide-react";

// ==================== SUPABASE CONFIG ====================
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || "https://rxeminlotawcfqalxoqy.supabase.co";
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY || "sb_publishable_nExTWl7CRubKfDuiqbX1Sw_EwyMdUoX";
const supabase = createClient(supabaseUrl, supabaseKey);

// ==================== EMAILJS CONFIG ====================
const EMAILJS_SERVICE_ID  = process.env.REACT_APP_EMAILJS_SERVICE_ID  || "service_1fmr5dt";
const EMAILJS_PUBLIC_KEY  = process.env.REACT_APP_EMAILJS_PUBLIC_KEY  || "huxXo8btK5U4v1zQd";
const EMAILJS_TEMPLATES = {
  approved:          "template_s3qqrew",
  rejected:          "template_aigwzle",
  return_reminder:   "template_return_reminder",
  new_request_admin: "template_new_request",
  pin_reset:         "template_pin_reset",
};

const ADMIN_EMAIL = "mohamedgamal199681945@gmail.com";

// ==================== EMAIL SENDER ====================
// منع تكرار إيميلات تلقائية (return_reminder) بس - مش إيميلات الموافقة/الرفض
const autoEmailCache = new Set<string>();

const hashPassword = async (password: string): Promise<string> => {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
};

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_PREFIX = "pbkdf2:";

const hashPin = async (pin: string): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial, 256
  );
  const toHex = (buf: ArrayBuffer) =>
    Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, "0")).join("");
  return `${PBKDF2_PREFIX}${saltHex}:${toHex(derived)}`;
};

const verifyPin = async (inputPin: string, storedValue: string): Promise<boolean> => {
  if (!storedValue) return false;
  if (storedValue.startsWith(PBKDF2_PREFIX)) {
    const parts = storedValue.slice(PBKDF2_PREFIX.length).split(":");
    if (parts.length !== 2) return false;
    const [saltHex, expectedHex] = parts;
    if (!/^[0-9a-f]{32}$/i.test(saltHex) || !/^[0-9a-f]{64}$/i.test(expectedHex)) return false;
    const saltBytes = saltHex.match(/.{2}/g)!.map(b => parseInt(b, 16));
    const salt = new Uint8Array(saltBytes);
    try {
      const keyMaterial = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode(inputPin), "PBKDF2", false, ["deriveBits"]
      );
      const derived = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
        keyMaterial, 256
      );
      const actualHex = Array.from(new Uint8Array(derived))
        .map(b => b.toString(16).padStart(2, "0")).join("");
      return actualHex === expectedHex;
    } catch {
      return false;
    }
  }
  return inputPin === storedValue;
};

const sendEmail = async (templateId: string, toEmail: string, params: Record<string, any>, preventDuplicate = false) => {
  if (!toEmail || !templateId) return;

  // منع التكرار فقط للإيميلات التلقائية (زي return_reminder)
  if (preventDuplicate) {
    const key = `${templateId}|${toEmail}|${params.request_id || params.start_date || ""}`;
    if (autoEmailCache.has(key)) return;
    autoEmailCache.add(key);
  }

  try {
    await emailjs.send(
      EMAILJS_SERVICE_ID,
      templateId,
      { to_email: toEmail, ...params },
      EMAILJS_PUBLIC_KEY
    );
    console.log(`✅ إيميل أُرسل لـ ${toEmail} - ${templateId}`);
  } catch (err: any) {
    console.error(`❌ فشل إرسال الإيميل:`, err?.text || err?.message || err);
  }
};

// ==================== HELPER FUNCTIONS ====================
const formatDate = (dateStr: string) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("ar-EG", {
    year: "numeric", month: "2-digit", day: "2-digit",
  });
};

const formatDateTime = (dateStr: string) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("ar-EG", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
};

const getCalculatedDates = (startDate: string, days: number) => {
  if (!startDate || !days) return { end: "", back: "" };
  const start = new Date(startDate);
  const end = new Date(start);
  end.setDate(start.getDate() + (Number(days) - 1));
  const back = new Date(end);
  back.setDate(end.getDate() + 1);
  return {
    end: end.toISOString().split("T")[0],
    back: back.toISOString().split("T")[0],
  };
};

// حساب أول يوم إجازة فعلي بناءً على موعد النزول
const getActualStartDate = (startDate: string, departureTime: string): string => {
  if (!startDate) return "";
  const d = new Date(startDate);
  if (departureTime === "after_work") d.setDate(d.getDate() + 2); // عمل + سفر + إجازة
  else if (departureTime === "morning") d.setDate(d.getDate() + 1); // سفر + إجازة
  // 'actual' = نفس اليوم
  return d.toISOString().split("T")[0];
};

const getDepartureLabel = (dep: string) => {
  if (dep === "after_work") return "بعد العمل (+يومان)";
  if (dep === "morning")    return "صباحاً (+يوم)";
  return "بداية الإجازة الفعلي";
};

// أيام العمل = من يوم العودة نفسه حتى اليوم (فقط إذا لم يكن في إجازة)
const calculateWorkedDays = (returnDate: string, isOnVacation: boolean = false) => {
  if (!returnDate || isOnVacation) return 0;
  const start = new Date(returnDate);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (start > today) return 0;
  const diffTime = today.getTime() - start.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
};

// أيام العمل بين تاريخين (من تاريخ العودة حتى تاريخ النزول) — تحسب جميع الأيام بدون استثناء
const calculateWorkDaysBetween = (fromDate: string, toDate: string, holidays: string[] = []) => {
  if (!fromDate || !toDate) return 0;
  const start = new Date(fromDate);
  const end = new Date(toDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  if (start >= end) return 0;
  const diffTime = end.getTime() - start.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
};

// ==================== PRINT HELPER (IFRAME — بدون نافذة منبثقة) ====================
// يحل مشكلة الشاشة السوداء/الرعشة عند الطباعة من الموبايل/التابلت (خصوصاً كتطبيق PWA مثبّت):
// فتح نافذة جديدة (window.open) واستدعاء print() عليها مباشرة غير مستقر على متصفحات
// الموبايل، فبدلنا الأسلوب لاستخدام iframe مخفي داخل نفس الصفحة — بدون نافذة ثانية إطلاقاً.
const printHTMLContent = (html: string) => {
  const old = document.getElementById("__vms_print_frame__");
  if (old) old.remove();

  const iframe = document.createElement("iframe");
  iframe.id = "__vms_print_frame__";
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";
  document.body.appendChild(iframe);

  const cleanup = () => {
    setTimeout(() => {
      const f = document.getElementById("__vms_print_frame__");
      if (f) f.remove();
    }, 1000);
  };

  iframe.onload = () => {
    try {
      const win = iframe.contentWindow;
      if (!win) { cleanup(); return; }
      win.focus();
      // تأخير بسيط ضروري على متصفحات الموبايل قبل استدعاء print
      setTimeout(() => {
        try { win.print(); } catch (e) { console.error("Print error:", e); }
      }, 250);
      win.onafterprint = cleanup;
      cleanup(); // نسخة احتياطية للتنظيف حتى لو لم يُطلق onafterprint
    } catch (e) {
      console.error("Print iframe error:", e);
      cleanup();
    }
  };

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) { alert("تعذر تجهيز الطباعة، حاول مرة أخرى"); iframe.remove(); return; }
  doc.open();
  doc.write(html);
  doc.close();
};

// ==================== PDF EXPORT HELPER ====================
// يحوّل أي HTML جاهز (نفس اللي بنطبعه) لصورة عالية الدقة ثم يحطها في ملف PDF قابل للتحميل.
// هذا الأسلوب يتجاوز مشاكل الخطوط العربية في jsPDF (لأنه بيصدّر كصورة).
const exportHTMLToPDF = async (html: string, fileName: string) => {
  const wrap = document.createElement("div");
  wrap.style.cssText = "position:fixed;top:-9999px;left:-9999px;background:#fff;";
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  // لو الـ html بيحتوي على body كامل نستخدمه، وإلا الـ wrap نفسه
  const target = (wrap.querySelector("body") as HTMLElement) || wrap;
  try {
    const canvas = await html2canvas(target, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    document.body.removeChild(wrap);
    const imgData = canvas.toDataURL("image/png");

    // نقسم الصورة على صفحات A4 لو طويلة جداً بدل ما تنضغط في صفحة واحدة مشوّهة
    const pageWidth = 595.28;  // A4 width in pt
    const pageHeight = 841.89; // A4 height in pt
    const imgWidthPt = pageWidth;
    const imgHeightPt = (canvas.height * imgWidthPt) / canvas.width;

    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

    if (imgHeightPt <= pageHeight) {
      pdf.addImage(imgData, "PNG", 0, 0, imgWidthPt, imgHeightPt);
    } else {
      // تقسيم لعدة صفحات
      let heightLeft = imgHeightPt;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, imgWidthPt, imgHeightPt);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position = heightLeft - imgHeightPt;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidthPt, imgHeightPt);
        heightLeft -= pageHeight;
      }
    }

    pdf.save(`${fileName}.pdf`);
  } catch (e: any) {
    document.body.removeChild(wrap);
    alert("خطأ في إنشاء PDF: " + (e?.message || e));
  }
};

// ==================== MAIN COMPONENT ====================
// ===== SortTh - عنوان عمود قابل للفرز بقائمة Excel =====
const SortTh = ({ label, field, sortField, sortDir, sortDropdown, onSort, onClear, onToggle, align="center" }: {
  label: string; field: string;
  sortField: string; sortDir: "asc"|"desc"; sortDropdown: string;
  onSort: (f: string, d: "asc"|"desc") => void;
  onClear: () => void;
  onToggle: (f: string) => void;
  align?: string;
}) => {
  const active = sortField === field;
  const open = sortDropdown === field;
  const thRef = useRef<HTMLTableCellElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; left: number; transform: string } | null>(null);

  // نحسب الموضع مباشرة لما نفتح الـ dropdown
  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && thRef.current) {
      const rect = thRef.current.getBoundingClientRect();
      const dropW = 165;
      const centered = rect.left + rect.width / 2;
      const vw = window.innerWidth;
      let left = centered;
      let transform = "translateX(-50%)";
      if (centered - dropW / 2 < 8) {
        left = rect.left;
        transform = "none";
      } else if (centered + dropW / 2 > vw - 8) {
        left = rect.right;
        transform = "translateX(-100%)";
      }
      setDropPos({ top: rect.bottom + 4, left, transform });
    }
    onToggle(field);
  };

  const dropdown = open && dropPos ? ReactDOM.createPortal(
    <div
      style={{
        position: "fixed",
        top: dropPos.top,
        left: dropPos.left,
        transform: dropPos.transform,
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: "10px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
        zIndex: 99999,
        minWidth: "165px",
        overflow: "hidden",
        direction: "rtl",
      }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <button
        onMouseDown={e => { e.stopPropagation(); onSort(field, "desc"); }}
        style={{ display:"flex", alignItems:"center", gap:"8px", width:"100%", padding:"10px 14px", background: active && sortDir==="desc" ? "#eef2ff" : "white", border:"none", borderBottom:"1px solid #f1f5f9", cursor:"pointer", fontSize:"13px", fontWeight:"700", color:"#1e293b", fontFamily:"inherit" }}>
        ↓ من الأعلى للأقل
      </button>
      <button
        onMouseDown={e => { e.stopPropagation(); onSort(field, "asc"); }}
        style={{ display:"flex", alignItems:"center", gap:"8px", width:"100%", padding:"10px 14px", background: active && sortDir==="asc" ? "#eef2ff" : "white", border:"none", borderBottom: active ? "1px solid #f1f5f9" : "none", cursor:"pointer", fontSize:"13px", fontWeight:"700", color:"#1e293b", fontFamily:"inherit" }}>
        ↑ من الأقل للأعلى
      </button>
      {active && (
        <button
          onMouseDown={e => { e.stopPropagation(); onClear(); }}
          style={{ display:"flex", alignItems:"center", gap:"8px", width:"100%", padding:"9px 14px", background:"#fff1f2", border:"none", cursor:"pointer", fontSize:"12px", fontWeight:"700", color:"#dc2626", fontFamily:"inherit" }}>
          ✕ إلغاء الفرز
        </button>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <th
      ref={thRef}
      style={{ border:"1px solid #94a3b8", padding:"12px 8px", backgroundColor:"#4f46e5", color:"white", fontWeight:"900", textAlign:"center", position:"relative" }}
    >
      <div
        style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:"8px", cursor:"pointer", userSelect:"none" }}
        onClick={handleToggle}
      >
        <span style={{ fontSize:"13px" }}>{label}</span>
        <span style={{
            background: active ? "#ffffff33" : "transparent",
            padding:"2px 4px", borderRadius:"4px", fontSize:"10px",
            border: active ? "1px solid white" : "1px solid #ffffff66"
        }}>
          {active ? (sortDir === "desc" ? "↓" : "↑") : "⇅"}
        </span>
      </div>
      {dropdown}
    </th>
  );
};

// ===== EmpEditModal - مودال تعديل طلب الموظف =====
const EmpEditModal = ({ req, vacationTypes, onClose, onChange, onSave }: {
  req: any;
  vacationTypes: any[];
  onClose: () => void;
  onChange: (updated: any) => void;
  onSave: () => void;
}) => {
  const created = new Date(req.created_at || Date.now());
  const daysOld = Math.floor((Date.now() - created.getTime()) / 86400000);
  const canEdit = daysOld <= 3 && req.status === "pending";
  const inp: React.CSSProperties = {
    width:"100%", padding:"11px 14px", border:"1px solid #e2e8f0",
    borderRadius:"12px", outline:"none", boxSizing:"border-box",
    fontSize:"13px", background:"white", direction:"rtl",
  };
  return (
    <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0, 0, 0, 0.65)", backdropFilter:"blur(6px)", display:"flex", alignItems:"center", justifyContent:"center", padding:"16px", zIndex:9999 }}
      onClick={onClose}>
      <div style={{ background:"white", borderRadius:"24px", width:"100%", maxWidth:"430px", padding:"24px", boxShadow:"0 32px 80px rgba(0, 0, 0, 0.3)" }}
        dir="rtl" onClick={e => e.stopPropagation()}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"18px" }}>
          <h3 style={{ margin:0, fontWeight:"900", fontSize:"17px" }}>✏️ تعديل طلبي</h3>
          <button onClick={onClose} style={{ border:"1px solid #e2e8f0", borderRadius:"8px", padding:"6px 12px", cursor:"pointer", background:"white", fontSize:"16px", fontWeight:"700" }}>✕</button>
        </div>
        {!canEdit ? (
          <div style={{ padding:"20px", textAlign:"center", background:"#fff1f2", borderRadius:"14px", color:"#dc2626", fontWeight:"700" }}>
            {daysOld > 3 ? "⏰ انتهت مهلة التعديل (3 أيام)" : "❌ لا يمكن تعديل طلب تمت مراجعته"}
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
            <div style={{ background:"#fffbeb", borderRadius:"12px", padding:"10px 14px", fontSize:"12px", color:"#d97706", fontWeight:"700", border:"1px solid #fde68a" }}>
              ⏰ متبقي {3 - daysOld} يوم للتعديل
            </div>
            <div>
              <label style={{ fontSize:"12px", color:"#64748b", fontWeight:"700", display:"block", marginBottom:"5px" }}>تاريخ البداية</label>
              <input type="date" style={inp} value={req.start_date || ""} onChange={e => onChange({...req, start_date: e.target.value})} />
            </div>
            <div>
              <label style={{ fontSize:"12px", color:"#64748b", fontWeight:"700", display:"block", marginBottom:"5px" }}>عدد الأيام</label>
              <input type="number" step="0.5" min="0.5" style={inp} value={req.days || ""} onChange={e => onChange({...req, days: Number(e.target.value)})} />
            </div>
            <div>
              <label style={{ fontSize:"12px", color:"#64748b", fontWeight:"700", display:"block", marginBottom:"5px" }}>نوع الإجازة</label>
              <select style={inp} value={req.vacation_type_id || ""} onChange={e => onChange({...req, vacation_type_id: e.target.value})}>
                <option value="">اختر النوع</option>
                {vacationTypes.map((vt: any) => <option key={vt.id} value={vt.id}>{vt.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:"12px", color:"#64748b", fontWeight:"700", display:"block", marginBottom:"5px" }}>ملاحظات</label>
              <textarea style={{ ...inp, resize:"none" } as any} rows={2} value={req.notes || ""} onChange={e => onChange({...req, notes: e.target.value})} />
            </div>
            <button onClick={onSave} style={{ padding:"13px", background:"linear-gradient(135deg, #4f46e5, #7c3aed)", color:"white", border:"none", borderRadius:"12px", fontWeight:"900", cursor:"pointer", fontSize:"14px" }}>
              💾 حفظ التعديل
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const VacationManagementSystem = () => {
  // ========== STATES ==========
  const [employees, setEmployees] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [vacationTypes, setVacationTypes] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [publicHolidays, setPublicHolidays] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [currentView, setCurrentView] = useState("login");
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Filters & Search
  const [empSearch, setEmpSearch] = useState("");
  const [vacSearch, setVacSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [vacationTypeFilter, setVacationTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [empStatusFilter, setEmpStatusFilter] = useState("all");
  const [empHireFrom, setEmpHireFrom] = useState(""); // فلتر تاريخ التعيين من
  const [empHireTo, setEmpHireTo] = useState("");     // فلتر تاريخ التعيين إلى
  const [holidayDateFrom, setHolidayDateFrom] = useState(""); // فلتر تاريخ العطلات من
  const [holidayDateTo, setHolidayDateTo] = useState("");     // فلتر تاريخ العطلات إلى
  const [empSortField, setEmpSortField] = useState(""); // فرز الموظفين
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusChangeEmp, setStatusChangeEmp] = useState<any>(null);
  const [statusChangeForm, setStatusChangeForm] = useState({ status: "إجازة", start_date: "", days: 1, notes: "", vacation_type_id: "" });
  const [empSortDir, setEmpSortDir] = useState<"asc"|"desc">("desc");
  const [empSortDropdown, setEmpSortDropdown] = useState("");
  const [reqSearch, setReqSearch] = useState(""); // بحث في طلبات الإجازة
  const [reqDateFrom, setReqDateFrom] = useState("");
  const [reqDateTo, setReqDateTo] = useState("");

  // Modals & Forms
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [empCodeInput, setEmpCodeInput] = useState("");
  const [empPinInput, setEmpPinInput] = useState("");
  const [showChangePinModal, setShowChangePinModal] = useState(false);
  const [changePinForm, setChangePinForm] = useState({ oldPin: "", newPin: "", confirmPin: "" });
  const [changePinLoading, setChangePinLoading] = useState(false);
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [editingEmp, setEditingEmp] = useState<any>(null);
  const [editingVac, setEditingVac] = useState<any>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [currentRequest, setCurrentRequest] = useState<any>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnData, setReturnData] = useState<any>(null);
  const [showAddDept, setShowAddDept] = useState(false);
  const [showAddHoliday, setShowAddHoliday] = useState(false);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [showBalanceLog, setShowBalanceLog] = useState(false);
  const balanceUpdatedRef = React.useRef(false);
  // ===== Extension Modal States =====
  const [showExtensionModal, setShowExtensionModal] = useState(false);
  const [extensionForm, setExtensionForm] = useState({
    original_request_id: "",
    additional_days: 1,
    notes: "",
  });

  const [showResetPinModal, setShowResetPinModal] = useState(false);
  const [resetPinEmp, setResetPinEmp] = useState<any>(null);
  const [resetPinValue, setResetPinValue] = useState("");
  const [resetPinLoading, setResetPinLoading] = useState(false);
  const [balanceLogs, setBalanceLogs] = useState<any[]>([]);
  const [balanceLogLoading, setBalanceLogLoading] = useState(false);

  // Calendar
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form Data - أضفنا return_date و email وحذفنا hire_date من الحساب
  const [newEmp, setNewEmp] = useState({
    name: "", code: "", position: "", balance: 21, monthly_balance: 0,
    department_id: "", hire_date: "", return_date: "", email: "",
  });

  const [newRequest, setNewRequest] = useState({
    start_date: "", days: 1, notes: "", vacation_type_id: "",
    departure_time: "actual", // 'morning' | 'after_work' | 'actual'
  });

  const [newDept, setNewDept] = useState({ name: "", description: "" });
  const [newHoliday, setNewHoliday] = useState({ name: "", date: "", is_recurring: false });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDirectVacModal, setShowDirectVacModal] = useState(false);
  const [directVacForm, setDirectVacForm] = useState({ employee_id: "", days: 1, start_date: "", notes: "", vacation_type_id: "" });
  const [vacSearch2, setVacSearch2] = useState("");
  const [vacTypeFilter2, setVacTypeFilter2] = useState("all");
  const [vacDeptFilter2, setVacDeptFilter2] = useState("all");
  const [empSearchDirect, setEmpSearchDirect] = useState("");
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<string | null>(null);
  const [showEmpDropdown, setShowEmpDropdown] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== "undefined" ? window.innerWidth >= 1024 : true);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" ? window.innerWidth < 1024 : false);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  // ===== States للميزات الجديدة =====
  const [showEditRequestModal, setShowEditRequestModal] = useState(false);
  const [empEditReq, setEmpEditReq] = useState<any>(null);
  const [showManagerEditModal, setShowManagerEditModal] = useState(false);
  const [mgrEditForm, setMgrEditForm] = useState({ id:"", empName:"", days:1, start_date:"", reason:"", oldDays:1 });
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printFrom, setPrintFrom] = useState("");
  const [printTo, setPrintTo] = useState("");
  const [printSelected, setPrintSelected] = useState<string[]>([]);
  const [expandedDeptGroups, setExpandedDeptGroups] = useState<Record<string,boolean>>({});
  const [showEmpInfoModal, setShowEmpInfoModal] = useState(false);
  const [empInfoTarget, setEmpInfoTarget] = useState<any>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [lastBackup, setLastBackup] = useState<string>(() => localStorage.getItem("lastBackup") || "");
  const GOOGLE_SCRIPT_URL = process.env.REACT_APP_GOOGLE_SCRIPT_URL || "";
  // ===== NEW FEATURES STATES =====
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pushEnabled, setPushEnabled] = useState(() => {
    try { return typeof Notification !== "undefined" && Notification.permission === "granted"; } catch { return false; }
  });
  const [showPWAGuide, setShowPWAGuide] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  // ===== States للاشعارات =====
  const [notifSearch, setNotifSearch] = useState("");
  const [notifDateFrom, setNotifDateFrom] = useState(""); // فلتر تاريخ القرار من
  const [notifDateTo, setNotifDateTo] = useState("");     // فلتر تاريخ القرار إلى
  const [notifSortDir, setNotifSortDir] = useState<"asc"|"desc">("desc");
  // ===== States للإجازات الفعلية (فلترة + ترتيب) =====
  const [activeVacDateFrom, setActiveVacDateFrom] = useState("");
  const [activeVacDateTo, setActiveVacDateTo] = useState("");
  const [activeVacSortField, setActiveVacSortField] = useState("back");
  const [selectedPrintIds, setSelectedPrintIds] = useState<Set<string>>(new Set());
  const [activeVacSortDir, setActiveVacSortDir] = useState<"asc"|"desc">("asc");
  const [activeVacSortDropdown, setActiveVacSortDropdown] = useState("");

  // ===== States للفرز في صفحة الطلبات =====
  const [reqSortField, setReqSortField] = useState("");
  const [reqSortDir, setReqSortDir] = useState<"asc"|"desc">("desc");
  const [reqSortDropdown, setReqSortDropdown] = useState("");

  // ===== States للفرز في سجل الإجازات =====
  const [histSortField, setHistSortField] = useState("");
  const [histSortDir, setHistSortDir] = useState<"asc"|"desc">("desc");
  const [histSortDropdown, setHistSortDropdown] = useState("");

  // إغلاق dropdown الفرز عند الضغط خارجه أو عند التمرير
  useEffect(() => {
    if (!empSortDropdown && !reqSortDropdown && !histSortDropdown && !activeVacSortDropdown) return;
    const handler = () => { setEmpSortDropdown(""); setReqSortDropdown(""); setHistSortDropdown(""); setActiveVacSortDropdown(""); };
    document.addEventListener("mousedown", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      document.removeEventListener("mousedown", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, [empSortDropdown, reqSortDropdown, histSortDropdown, activeVacSortDropdown]);

  // تحديث الساعة كل ثانية
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ===== Online/Offline Detection =====
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, []);

  // ===== AI Monthly Insights Generator =====

  // ===== Push Notifications Setup =====
  const enablePushNotifications = async () => {
    if (!("Notification" in window)) {
      alert("متصفحك لا يدعم الإشعارات. جرب Chrome أو Edge.");
      return;
    }
    // لو مرفوض مسبقاً
    if (Notification.permission === "denied") {
      alert("الإشعارات محجوبة في إعدادات المتصفح.\n\nعشان تفعّلها:\n1. اضغط على 🔒 في شريط العنوان\n2. اختر إعدادات الموقع\n3. فعّل الإشعارات");
      return;
    }
    // لو مفعّل أصلاً
    if (Notification.permission === "granted") {
      setPushEnabled(true);
      new Notification("🔔 الإشعارات مفعّلة", {
        body: "الإشعارات شغالة بالفعل!",
        icon: "/icon-192.png",
        dir: "rtl",
      });
      return;
    }
    // طلب الإذن
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      setPushEnabled(true);
      setTimeout(() => {
        new Notification("✅ تم تفعيل الإشعارات بنجاح!", {
          body: "هتوصلك إشعارات لما يتقبل أو يترفض أي طلب إجازة",
          icon: "/icon-192.png",
          dir: "rtl",
          tag: "welcome",
        });
      }, 500);
    } else {
      alert("لم يتم السماح بالإشعارات. يمكنك تفعيلها لاحقاً من إعدادات المتصفح.");
    }
  };

  // ===== Send Local Notification - بيتحقق من الإذن مباشرة مش من الـ state =====
  const sendLocalNotification = (title: string, body: string) => {
    try {
      if (!("Notification" in window)) return;
      if (Notification.permission !== "granted") return;
      new Notification(title, {
        body,
        icon: "/icon-192.png",
        dir: "rtl",
        tag: `${title}-${Date.now()}`,
        requireInteraction: false,
      });
    } catch (err) {
      console.log("Notification error:", err);
    }
  };

  // الحكم اليومية
  const dailyWisdoms = [
    "النجاح ليس نهاية المطاف، والفشل ليس قاتلاً، بل الشجاعة على الاستمرار هي ما يهم.",
    "العمل الجماعي يجعل الحلم يتحقق.",
    "أفضل طريقة للتنبؤ بالمستقبل هي صنعه.",
    "الإنجاز الكبير لا يأتي إلا بخطوات صغيرة متراكمة.",
    "من لا يُخطئ لا يتعلم، ومن لا يتعلم لا يتقدم.",
    "احرص على وقتك كما تحرص على مالك، فالوقت أثمن.",
    "التنظيم نصف النجاح، والجدية نصفه الآخر.",
    "خير الناس أنفعهم للناس.",
    "العقل السليم في الجسم السليم، فاعتنِ بصحتك.",
    "الصبر مفتاح الفرج، والإصرار طريق النجاح.",
    "ابدأ بما يجب، ثم افعل ما هو ممكن، وفجأة ستجد نفسك تفعل المستحيل.",
    "القائد الناجح هو من يبني فريقاً أقوى منه.",
  ];

  const getDailyWisdom = () => {
    const dayOfYear = Math.floor((currentTime.getTime() - new Date(currentTime.getFullYear(), 0, 0).getTime()) / 86400000);
    return dailyWisdoms[dayOfYear % dailyWisdoms.length];
  };

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour >= 5 && hour < 12) return { text: "صباح الخير", emoji: "🌅" };
    if (hour >= 12 && hour < 17) return { text: "مساء النور", emoji: "☀️" };
    if (hour >= 17 && hour < 21) return { text: "مساء الخير", emoji: "🌆" };
    return { text: "تصبح على خير", emoji: "🌙" };
  };

  const getHijriDate = () => {
    try {
      return currentTime.toLocaleDateString("ar-SA-u-ca-islamic", { year: "numeric", month: "long", day: "numeric" });
    } catch { return ""; }
  };

  // ========== RESTORE SESSION ==========
  useEffect(() => {
    try {
      const savedUser = localStorage.getItem("vms_currentUser");
      const savedView = localStorage.getItem("vms_currentView");
      if (savedUser && savedView && savedView !== "login") {
        setCurrentUser(JSON.parse(savedUser));
        setCurrentView(savedView);
      }
    } catch (e) {
      localStorage.removeItem("vms_currentUser");
      localStorage.removeItem("vms_currentView");
    }
  }, []);

  // ========== FETCH DATA ==========
  const scrollRef = React.useRef(0);

  const fetchData = useCallback(async () => {
    scrollRef.current = window.scrollY;
    setLoading(true);
    try {
      const [
        { data: emps }, { data: reqs }, { data: types },
        { data: depts }, { data: holidays }, { data: logs }
      ] = await Promise.all([
        supabase.from("employees").select("*").order("name"),
        supabase.from("vacation_requests").select("*").order("created_at", { ascending: false }),
        supabase.from("vacation_types").select("*"),
        supabase.from("departments").select("*"),
        supabase.from("public_holidays").select("*").order("date"),
        supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(100),
      ]);

      if (emps) setEmployees(emps);
      if (reqs) setRequests(reqs);
      if (types) setVacationTypes(types);
      if (depts) setDepartments(depts);
      if (holidays) setPublicHolidays(holidays);
      if (logs) setAuditLog(logs);

      if (currentUser && currentView === "employee") {
        const userNotifs = reqs?.filter(
          r => r.employee_id === currentUser.id && r.admin_notes && r.status !== "pending"
        ) || [];
        setNotifications(userNotifs);
      }

      if (currentView === "admin") {
        const pendingReqs = reqs?.filter(r =>
          r.status === "pending" || r.status === "dept_approved"
        ) || [];
        setNotifications(pendingReqs);
      }
    } catch (err) {
      console.error("Fetch Error:", err);
    }
    setLoading(false);
    // استعادة موضع التمرير بعد التحديث
    requestAnimationFrame(() => { window.scrollTo({ top: scrollRef.current, behavior: "auto" }); });
  }, [currentUser, currentView]);
useEffect(() => {
  fetchData();
}, [fetchData]);
  // ========== تذكير العودة التلقائي ==========
  useEffect(() => {
    if (currentView !== "admin" || requests.length === 0) return;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    requests.forEach(req => {
      if (req.status !== "approved") return;
      const { back } = getCalculatedDates(req.start_date, req.days);
      if (back === tomorrowStr) {
        const emp = employees.find(e => e.id === req.employee_id);
        if (emp?.email) {
          sendEmail(EMAILJS_TEMPLATES.return_reminder, emp.email, {
            employee_name: emp.name,
            back_date: formatDate(back),
          }, true); // منع التكرار للإيميل التلقائي
        }
      }
    });
  }, [requests, employees, currentView]);

  // ========== تحديث حالة الموظف تلقائياً بناءً على موعد النزول ==========
  useEffect(() => {
    const autoUpdateStatuses = async () => {
      const today = new Date().toISOString().split("T")[0];
      const idsToUpdate: string[] = [];
      for (const emp of employees) {
        if (emp.status === "إجازة") continue;
        const activeReq = requests.find(r => {
          if (r.employee_id !== emp.id || r.status !== "approved") return false;
          // إذا سُجّلت عودة فعلية — لا تعيده إجازة
          if (r.actual_return_date) return false;
          const actualStart = getActualStartDate(r.start_date, r.departure_time || "actual");
          const { back } = getCalculatedDates(r.start_date, r.days);
          return today >= actualStart && today < back;
        });
        if (activeReq) idsToUpdate.push(emp.id);
      }
      if (idsToUpdate.length > 0) {
        await supabase.from("employees").update({ status: "إجازة" }).in("id", idsToUpdate);
      }
    };
    if (employees.length > 0 && requests.length > 0 && currentView === "admin") {
      autoUpdateStatuses();
    }
  }, [employees, requests, currentView]);

  // ========== حالة الموظف تلقائياً ==========
  const getEmployeeStatus = (emp: any) => {
    // الحالة تُقرأ مباشرة من قاعدة البيانات - لا تغيير تلقائي
    return emp.status === "إجازة" ? "إجازة" : "عمل";
  };

  // ========== AUDIT LOG ==========
  const logAction = async (action: string, tableName: string, recordId: any = null, oldData: any = null, newData: any = null) => {
    try {
      await supabase.from("audit_log").insert([{
        user_id: currentUser?.id || null,
        user_name: currentUser?.name || "النظام",
        action, table_name: tableName, record_id: recordId,
        old_data: oldData, new_data: newData,
      }]);
    } catch (err) { console.error("Audit log error:", err); }
  };

  // ========== RESET EMPLOYEE PIN ==========
  const handleResetPin = async () => {
    if (!resetPinEmp) return;
    if (!/^\d{4}$/.test(resetPinValue)) {
      alert("يرجى إدخال رقم PIN مكون من 4 أرقام");
      return;
    }
    setResetPinLoading(true);
    try {
      const hashedResetPin = await hashPin(resetPinValue);
      const { error } = await supabase
        .from("employees")
        .update({ pin: hashedResetPin })
        .eq("id", resetPinEmp.id);
      if (error) throw error;
      await logAction("reset_pin", "employees", resetPinEmp.id, null, { admin_reset: true });

      if (resetPinEmp.email) {
        const resetTimestamp = new Date().toLocaleString("ar-EG", {
          year: "numeric", month: "long", day: "numeric",
          hour: "2-digit", minute: "2-digit",
        });
        sendEmail(EMAILJS_TEMPLATES.pin_reset, resetPinEmp.email, {
          employee_name: resetPinEmp.name,
          admin_name: currentUser?.name || "المدير",
          reset_time: resetTimestamp,
        });
      }

      setShowResetPinModal(false);
      setResetPinEmp(null);
      setResetPinValue("");
      alert(`✅ تم إعادة تعيين الرقم السري للموظف ${resetPinEmp.name} بنجاح`);
    } catch (err) {
      console.error("Error resetting PIN:", err);
      alert("حدث خطأ أثناء إعادة تعيين الرقم السري");
    } finally {
      setResetPinLoading(false);
    }
  };

  // ========== FETCH BALANCE LOGS ==========
  const fetchBalanceLogs = async () => {
    setBalanceLogLoading(true);
    const { data } = await supabase
      .from("balance_updates")
      .select("*, employees(name, code)")
      .order("update_date", { ascending: false })
      .limit(200);
    if (data) setBalanceLogs(data);
    setBalanceLogLoading(false);
  };

  // ========== MONTHLY BALANCE UPDATE ==========
  useEffect(() => {
    const updateMonthlyBalances = async () => {
      const today = new Date();
      const monthNames = ['يناير','فبراير','مارس','إبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
      const currentMonthName = monthNames[today.getMonth()];
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0];

      // فلتر الموظفين المحتاجين تحديث فقط
      const toUpdate = employees.filter(emp =>
        emp.monthly_balance > 0 &&
        (!emp.last_balance_update || emp.last_balance_update < firstDayOfMonth)
      );

      if (toUpdate.length === 0) return; // مفيش حاجة تتعمل

      console.log(`🔄 جاري تحديث رصيد ${toUpdate.length} موظف...`);

      // Bulk update — كل الموظفين دفعة واحدة بدل واحد واحد
      await Promise.all(toUpdate.map(async (emp) => {
        // حساب الرصيد الجديد مع الأخذ بعين الاعتبار الديون
        let newBalance = emp.balance + emp.monthly_balance;
        let description = `تم إضافة ${emp.monthly_balance} يوم للموظف ${emp.name} - رصيد دوري لشهر ${currentMonthName}`;
        
        // إذا كان الموظف عنده ديون (رصيد سالب)
        if (emp.balance < 0) {
          const debt = Math.abs(emp.balance);
          const debtPayment = Math.min(debt, emp.monthly_balance);
          newBalance = emp.balance + emp.monthly_balance;
          description = `تم إضافة ${emp.monthly_balance} يوم - منها ${debtPayment} يوم لسداد دين سابق والباقي ${emp.monthly_balance - debtPayment} يوم رصيد جديد`;
        }
        
        newBalance = parseFloat(newBalance.toFixed(2));

        const { error: updateError } = await supabase
          .from("employees")
          .update({ balance: newBalance, last_balance_update: firstDayOfMonth })
          .eq("id", emp.id);

        if (updateError) {
          console.error(`❌ خطأ في تحديث رصيد ${emp.name}:`, updateError.message);
          return;
        }

        await Promise.all([
          supabase.from("balance_updates").insert([{
            employee_id: emp.id,
            amount: emp.monthly_balance,
            update_date: firstDayOfMonth,
            description,
          }]),
          logAction(
            "monthly_balance_update",
            "employees",
            emp.id,
            { balance: emp.balance },
            { balance: newBalance, description }
          ),
        ]);

        console.log(`✅ ${description}`);
      }));

      console.log(`🎉 تم تحديث رصيد ${toUpdate.length} موظف بنجاح`);
    };

    if (employees.length > 0 && currentView === "admin" && !balanceUpdatedRef.current) {
      balanceUpdatedRef.current = true;
      updateMonthlyBalances();
    }
  }, [employees, currentView]);

  // ========== STATISTICS ==========
  const stats = useMemo(() => {
    const totalEmployees = employees.length;
    const pendingRequests = requests.filter(r => r.status === "pending").length;
    const approvedThisMonth = requests.filter(r => {
      const reqDate = new Date(r.created_at);
      const now = new Date();
      return r.status === "approved" && reqDate.getMonth() === now.getMonth() && reqDate.getFullYear() === now.getFullYear();
    }).length;
    // الحالة مباشرة من DB
    const onVacationNow = employees.filter(e => e.status === "إجازة").length;
    const atWorkNow = employees.filter(e => e.status !== "إجازة").length;
    const avgBalance = employees.length > 0
      ? (employees.reduce((sum, e) => sum + Number(e.balance), 0) / employees.length).toFixed(1) : 0;
    const totalVacationDays = requests.filter(r => r.status === "approved").reduce((sum, r) => sum + Number(r.days), 0);
    return { totalEmployees, pendingRequests, approvedThisMonth, onVacationNow, atWorkNow, avgBalance, totalVacationDays };
  }, [employees, requests]);

  const topBalances = useMemo(() => [...employees].sort((a, b) => b.balance - a.balance).slice(0, 5), [employees]);
  const lowBalances = useMemo(() => [...employees].sort((a, b) => a.balance - b.balance).slice(0, 5), [employees]);
  const comingBackSoon = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return requests.filter(r => r.status === "approved")
      .map(r => ({ ...r, backDate: getCalculatedDates(r.start_date, r.days).back }))
      .filter(r => r.backDate > today).sort((a, b) => a.backDate.localeCompare(b.backDate)).slice(0, 8);
  }, [requests]);

  const vacationByType = useMemo(() => vacationTypes.map(vt => ({
    name: vt.name, color: vt.color,
    count: requests.filter(r => r.vacation_type_id === vt.id && r.status === "approved").length,
  })), [requests, vacationTypes]);

  const vacationByDepartment = useMemo(() => departments.map(dept => {
    const deptEmps = employees.filter(e => e.department_id === dept.id);
    const deptReqs = requests.filter(r => deptEmps.some(e => e.id === r.employee_id) && r.status === "approved");
    return { name: dept.name, count: deptReqs.length, days: deptReqs.reduce((s, r) => s + Number(r.days), 0), employees: deptEmps.length };
  }), [employees, departments, requests]);

  // ========== LOGIN ==========
  const handleLogin = async () => {
    // 1️⃣ Owner
    if (loginData.email === ADMIN_EMAIL && loginData.password === process.env.REACT_APP_OWNER_PASSWORD) {
      const ownerUser = { role: "owner", name: "محمد جمال" };
      setCurrentUser(ownerUser);
      setCurrentView("admin");
      localStorage.setItem("vms_currentUser", JSON.stringify(ownerUser));
      localStorage.setItem("vms_currentView", "admin");
      await logAction("login", "users", null, null, { role: "owner" });
      return;
    }

    // 2️⃣ أدمن
    if (loginData.email && loginData.password) {
      const hashedInput = await hashPassword(loginData.password);
      const { data: admin } = await supabase.rpc("verify_admin_login", {
        p_email: loginData.email.trim(),
        p_password_hash: hashedInput,
      });
      if (admin) {
        const adminUser = {
          role: "admin",
          id: admin.id,
          name: admin.name,
          email: admin.email,
        };
        setCurrentUser(adminUser);
        setCurrentView("admin");
        localStorage.setItem("vms_currentUser", JSON.stringify(adminUser));
        localStorage.setItem("vms_currentView", "admin");
        await logAction("login", "users", admin.id, null, { role: "admin" });
        return;
      }
    }

    // 3️⃣ مدير قسم
    if (loginData.email && loginData.password) {
      const hashedPw2 = await hashPassword(loginData.password);
      // جرّب SHA256 أولاً (الكلمات المخزنة بشكل آمن)
      let { data: mgr } = await supabase
        .from("department_managers")
        .select("*, departments(name)")
        .eq("email", loginData.email.trim())
        .eq("password", hashedPw2)
        .single();
      // fallback: plain text (حسابات قديمة لم تُهاش بعد)
      if (!mgr) {
        const { data: mgrPlain } = await supabase
          .from("department_managers")
          .select("*, departments(name)")
          .eq("email", loginData.email.trim())
          .eq("password", loginData.password)
          .single();
        if (mgrPlain) {
          mgr = mgrPlain;
          // auto-upgrade: احفظ الكلمة مهاشة
          await supabase.from("department_managers").update({ password: hashedPw2 }).eq("id", mgrPlain.id);
        }
      }
      if (mgr) {
        // Parse multiple department ids if stored
        let deptIds: string[] = [];
        if (mgr.department_ids) {
          try {
            const parsed = typeof mgr.department_ids === "string"
              ? JSON.parse(mgr.department_ids)
              : mgr.department_ids;
            if (Array.isArray(parsed)) deptIds = parsed.map(String);
          } catch {}
        }
        if (deptIds.length === 0 && mgr.department_id) deptIds = [String(mgr.department_id)];

        const mgrUser = {
          role: "dept_manager",
          id: mgr.id,
          name: mgr.name,
          email: mgr.email,
          dept_id: mgr.department_id,
          dept_ids: deptIds,
          dept_name: mgr.departments?.name || "",
        };
        setCurrentUser(mgrUser);
        setCurrentView("admin");
        localStorage.setItem("vms_currentUser", JSON.stringify(mgrUser));
        localStorage.setItem("vms_currentView", "admin");
        await logAction("login", "department_managers", mgr.id, null, { role: "dept_manager" });
        return;
      }
    }

    // 3️⃣-B مدير الشؤون الإدارية (admin_affairs_manager)
    if (loginData.email && loginData.password) {
      const hashedPwAA = await hashPassword(loginData.password);
      let { data: aaMgr } = await supabase
        .from("admin_affairs_managers")
        .select("*")
        .eq("email", loginData.email.trim())
        .eq("password", hashedPwAA)
        .single();
      if (!aaMgr) {
        const { data: aaMgrPlain } = await supabase
          .from("admin_affairs_managers")
          .select("*")
          .eq("email", loginData.email.trim())
          .eq("password", loginData.password)
          .single();
        if (aaMgrPlain) {
          aaMgr = aaMgrPlain;
          await supabase.from("admin_affairs_managers").update({ password: hashedPwAA }).eq("id", aaMgrPlain.id);
        }
      }
      if (aaMgr) {
        const aaMgrUser = {
          role: "admin_affairs_manager",
          id: aaMgr.id,
          name: aaMgr.name,
          email: aaMgr.email,
        };
        setCurrentUser(aaMgrUser);
        setCurrentView("admin");
        localStorage.setItem("vms_currentUser", JSON.stringify(aaMgrUser));
        localStorage.setItem("vms_currentView", "admin");
        await logAction("login", "admin_affairs_managers", aaMgr.id, null, { role: "admin_affairs_manager" });
        return;
      }
    }

    // 4️⃣ موظف بالكود + PIN
    if (empCodeInput.trim()) {
      if (!/^\d{4}$/.test(empPinInput)) {
        alert("أدخل رقم PIN المكون من 4 أرقام ❌");
        return;
      }
      const { data: emp } = await supabase.from("employees").select("*").eq("code", empCodeInput.trim()).single();
      if (emp) {
        if (!emp.pin) {
          alert("لم يتم تعيين رقم PIN لهذا الحساب. يرجى التواصل مع الإدارة ❌");
          return;
        }
        const pinValid = await verifyPin(empPinInput, emp.pin);
        if (!pinValid) {
          alert("الكود أو PIN غير صحيح ❌");
          return;
        }
        if (!emp.pin.startsWith(PBKDF2_PREFIX)) {
          const upgraded = await hashPin(empPinInput);
          await supabase.from("employees").update({ pin: upgraded }).eq("id", emp.id);
        }
        const { pin: _pin, ...empWithoutPin } = emp;
        const empUser = { ...empWithoutPin, role: "employee" };
        setCurrentUser(empUser);
        setCurrentView("employee");
        localStorage.setItem("vms_currentUser", JSON.stringify(empUser));
        localStorage.setItem("vms_currentView", "employee");
        await logAction("login", "employees", emp.id);
        return;
      }
    }

    alert("بيانات الدخول غير صحيحة ❌");
  };

  // ========== تغيير PIN الموظف ==========
  const handleChangePin = async () => {
    const { oldPin, newPin, confirmPin } = changePinForm;
    if (!oldPin || !newPin || !confirmPin) { alert("يرجى تعبئة جميع الحقول ❌"); return; }
    if (!/^\d{4}$/.test(oldPin) || !/^\d{4}$/.test(newPin) || !/^\d{4}$/.test(confirmPin)) {
      alert("كل الأرقام يجب أن تكون 4 أرقام فقط ❌"); return;
    }
    if (newPin !== confirmPin) { alert("PIN الجديد وتأكيده غير متطابقين ❌"); return; }
    if (newPin === oldPin) { alert("PIN الجديد يجب أن يختلف عن القديم ❌"); return; }
    setChangePinLoading(true);
    const { data: emp } = await supabase.from("employees").select("pin").eq("id", currentUser.id).single();
    if (!emp?.pin) {
      alert("لم يتم تعيين رقم PIN لهذا الحساب. يرجى التواصل مع الإدارة ❌");
      setChangePinLoading(false);
      return;
    }
    const oldPinValid = await verifyPin(oldPin, emp.pin);
    if (!oldPinValid) {
      alert("PIN الحالي غير صحيح ❌");
      setChangePinLoading(false);
      return;
    }
    const hashedNewPin = await hashPin(newPin);
    const { error } = await supabase.from("employees").update({ pin: hashedNewPin }).eq("id", currentUser.id);
    setChangePinLoading(false);
    if (error) { alert("حدث خطأ أثناء التحديث ❌"); return; }
    setShowChangePinModal(false);
    setChangePinForm({ oldPin: "", newPin: "", confirmPin: "" });
    alert("تم تغيير PIN بنجاح ✅");
  };

  // ========== EXCEL OPERATIONS ==========
  const downloadExcelTemplate = () => {
    const template = [
      {
        "الكود الوظيفي": "1001",
        "الاسم الكامل": "محمد أحمد علي",
        "المنصب": "محاسب",
        "البريد الإلكتروني": "mohamed@example.com",
        "الرصيد الحالي": 21,
        "الرصيد الشهري": 2,
        "تاريخ التعيين": "2020-01-01",
        "تاريخ العودة": "2025-01-15",
        "القسم": "المحاسبة",
      },
      {
        "الكود الوظيفي": "1002",
        "الاسم الكامل": "سارة محمود",
        "المنصب": "مهندسة",
        "البريد الإلكتروني": "sara@example.com",
        "الرصيد الحالي": 15,
        "الرصيد الشهري": 2,
        "تاريخ التعيين": "2021-06-01",
        "تاريخ العودة": "",
        "القسم": "الهندسة",
      },
      {
        "الكود الوظيفي": "1003",
        "الاسم الكامل": "",
        "المنصب": "",
        "البريد الإلكتروني": "",
        "الرصيد الحالي": 10,
        "الرصيد الشهري": "",
        "تاريخ التعيين": "",
        "تاريخ العودة": "",
        "القسم": "",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    // تنسيق عرض الأعمدة
    ws["!cols"] = [
      { wch: 14 }, { wch: 22 }, { wch: 16 }, { wch: 28 },
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "نموذج الموظفين");
    XLSX.writeFile(wb, "نموذج_استيراد_الموظفين.xlsx");
  };

  // ========== دالة تحويل التواريخ من أي صيغة ==========
  const parseFlexibleDate = (value: any): string | null => {
    if (value === null || value === undefined || value === "") return null;

    // 1) Excel serial number (رقم تسلسلي من Excel)
    if (typeof value === "number") {
      if (value <= 0) return null;
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + value * 86400000);
      if (!isNaN(date.getTime())) return date.toISOString().split("T")[0];
      return null;
    }

    // تحويل الأرقام العربية/الهندية إلى أرقام إنجليزية
    const arabicToEnglish = (s: string) =>
      s.replace(/[٠١٢٣٤٥٦٧٨٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)))
       .replace(/[۰۱۲۳۴۵۶۷۸۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)));

    const str = arabicToEnglish(String(value).trim());
    if (!str) return null;

    // 2) YYYY-MM-DD أو YYYY/MM/DD
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(str)) {
      const normalized = str.replace(/\//g, "-");
      const parts = normalized.split("-");
      const iso = `${parts[0]}-${parts[1].padStart(2,"0")}-${parts[2].padStart(2,"0")}`;
      const d = new Date(iso);
      if (!isNaN(d.getTime())) return iso;
    }

    // 3) DD-MM-YYYY أو DD/MM/YYYY
    if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(str)) {
      const parts = str.split(/[-/]/);
      const iso = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      const d = new Date(iso);
      if (!isNaN(d.getTime())) return iso;
    }

    // 4) MM/DD/YYYY (American format)
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
      const parts = str.split("/");
      const iso = `${parts[2]}-${parts[0].padStart(2,"0")}-${parts[1].padStart(2,"0")}`;
      const d = new Date(iso);
      if (!isNaN(d.getTime())) return iso;
    }

    // 5) أي صيغة أخرى يقدر JavaScript يفهمها
    const fallback = new Date(str);
    if (!isNaN(fallback.getTime())) return fallback.toISOString().split("T")[0];

    return null;
  };

  // ========== دالة رفع الملف المحسّنة (تحديث جزئي + كل صيغ التواريخ) ==========
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: false });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: true });

      // تجهيز البيانات من الملف — فقط الحقول الموجودة فعلاً
      const fileRows = jsonData.map((row: any) => {
        const deptName = row["القسم"] || "";
        const dept = departments.find(d => d.name === deptName);

        const parsed: any = {};

        // الحقول الإجبارية
        const name = row["الاسم الكامل"] || row["name"] || row["الاسم"];
        const code = String(row["الكود الوظيفي"] || row["code"] || row["الكود"] || "").trim();
        if (name) parsed.name = String(name).trim();
        if (code) parsed.code = code;

        // الحقول الاختيارية — فقط لو موجودة في الملف
        const position = row["المنصب"] || row["position"];
        if (position !== undefined && position !== "") parsed.position = String(position).trim();

        const email = row["البريد الإلكتروني"] || row["email"] || row["البريد"];
        if (email !== undefined && email !== "") parsed.email = String(email).trim();

        const balance = row["الرصيد الحالي"] || row["balance"] || row["الرصيد"];
        if (balance !== undefined && balance !== "") parsed.balance = Number(balance);

        const monthlyBalance = row["الرصيد الشهري"] || row["monthly_balance"];
        if (monthlyBalance !== undefined && monthlyBalance !== "") parsed.monthly_balance = Number(monthlyBalance);

        const hireDate = row["تاريخ التعيين"] || row["hire_date"];
        if (hireDate !== undefined && hireDate !== "") parsed.hire_date = parseFlexibleDate(hireDate);

        const returnDate = row["تاريخ العودة"] || row["return_date"];
        if (returnDate !== undefined && returnDate !== "") parsed.return_date = parseFlexibleDate(returnDate);

        if (dept) parsed.department_id = dept.id;
        else if (deptName) parsed.department_id = null;

        return parsed;
      });

      // الاعتماد على الكود الوظيفي فقط كمعرّف أساسي
      const validRows = fileRows.filter((r: any) => r.code); // الكود فقط مطلوب
      const rowsWithoutCode = fileRows.length - validRows.length;

      if (validRows.length === 0) {
        alert("❌ لم يتم العثور على بيانات صحيحة!\nتأكد من وجود عمود 'الكود الوظيفي' في الملف.");
        setUploadingFile(false);
        return;
      }

      // جلب الموظفين الحاليين بالكود
      const codes = validRows.map((r: any) => r.code);
      const { data: existingEmps } = await supabase
        .from("employees")
        .select("*")
        .in("code", codes);

      const existingMap = new Map((existingEmps || []).map((e: any) => [String(e.code).trim(), e]));

      let addedCount = 0;
      let updatedCount = 0;
      const skippedRows: string[] = [];

      const toAdd: any[] = [];
      const toUpdate: any[] = [];

      for (const row of validRows) {
        const existing = existingMap.get(String(row.code).trim());
        if (existing) {
          // تحديث جزئي — فقط الحقول الموجودة في الملف (لا تمسح الحقول الفارغة)
          const updatePayload: any = { id: existing.id };
          if (row.name !== undefined)             updatePayload.name = row.name;
          if (row.position !== undefined)         updatePayload.position = row.position;
          if (row.email !== undefined)            updatePayload.email = row.email;
          if (row.balance !== undefined)          updatePayload.balance = row.balance;
          if (row.monthly_balance !== undefined)  updatePayload.monthly_balance = row.monthly_balance;
          if (row.hire_date !== undefined)        updatePayload.hire_date = row.hire_date || null;
          if (row.return_date !== undefined)      updatePayload.return_date = row.return_date || null;
          if (row.department_id !== undefined)    updatePayload.department_id = row.department_id;
          toUpdate.push(updatePayload);
          updatedCount++;
        } else {
          // إضافة موظف جديد — الاسم مطلوب للإضافة
          if (!row.name) {
            skippedRows.push(row.code);
            continue;
          }
          toAdd.push({
            name: row.name,
            code: row.code,
            position: row.position || null,
            email: row.email || null,
            balance: row.balance ?? 21,
            monthly_balance: row.monthly_balance ?? 0,
            hire_date: row.hire_date || null,
            return_date: row.return_date || null,
            department_id: row.department_id || null,
          });
          addedCount++;
        }
      }

      let errorMsg = "";

      // إضافة الجدد
      if (toAdd.length > 0) {
        const { error: addErr } = await supabase.from("employees").insert(toAdd);
        if (addErr) errorMsg += "\n⚠️ خطأ في الإضافة: " + addErr.message;
      }

      // تحديث الموجودين — كل سجل على حدة لضمان التحديث الجزئي
      for (const upd of toUpdate) {
        const { id, ...fields } = upd;
        const { error: updErr } = await supabase.from("employees").update(fields).eq("id", id);
        if (updErr) errorMsg += "\n⚠️ خطأ في تحديث كود " + id + ": " + updErr.message;
      }

      const summary = [
        `✅ تمت المعالجة!`,
        `• موظفون جدد مُضافون: ${addedCount}`,
        `• موظفون مُحدَّثون: ${updatedCount}`,
        rowsWithoutCode > 0 ? `• صفوف بدون كود (تم تجاهلها): ${rowsWithoutCode}` : "",
        skippedRows.length > 0 ? `• موظفون جدد بدون اسم (تجاهل): ${skippedRows.join(", ")}` : "",
        errorMsg || "",
      ].filter(Boolean).join("\n");
      alert(summary);
      if (!errorMsg) setShowImportModal(false);
      fetchData();
      await logAction("bulk_import", "employees", null, null, { added: addedCount, updated: updatedCount });
    } catch (err) {
      alert("خطأ في قراءة الملف — تأكد من أن الملف بصيغة Excel صحيحة");
      console.error(err);
    }
    setUploadingFile(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const exportToExcel = (data: any[], fileName: string) => {
    // تحويل بيانات الموظفين لأعمدة النظام
    const isEmpData = data.length > 0 && "name" in data[0] && "code" in data[0] && "balance" in data[0];
    const exportData = isEmpData ? data.map(emp => {
      const dept = departments.find((d: any) => d.id === emp.department_id);
      const status = getEmployeeStatus(emp);
      const workedDays = calculateWorkedDays(emp.return_date, status === "إجازة");
      return {
        "الاسم الكامل": emp.name || "",
        "الكود الوظيفي": emp.code || "",
        "المنصب": emp.position || "",
        "البريد الإلكتروني": emp.email || "",
        "القسم": dept?.name || "",
        "الرصيد الحالي": emp.balance ?? 0,
        "الرصيد الشهري": emp.monthly_balance ?? 0,
        "تاريخ التعيين": emp.hire_date || null,
        "تاريخ العودة": emp.return_date || null,
        "أيام العمل بعد العودة": workedDays,
        "حالة الموظف": status,
      };
    }) : data;
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "البيانات");
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  };

  const exportDetailedReport = () => {
    const reportData = employees.map(emp => {
      const empRequests = requests.filter(r => r.employee_id === emp.id && r.status === "approved");
      const totalVacDays = empRequests.reduce((sum, r) => sum + Number(r.days), 0);
      const dept = departments.find(d => d.id === emp.department_id);
      const status = getEmployeeStatus(emp);
      const workedDays = calculateWorkedDays(emp.return_date, status === "إجازة");
      return {
        "الاسم": emp.name, "الكود الوظيفي": emp.code, "المنصب": emp.position,
        "البريد الإلكتروني": emp.email || "-",
        "القسم": dept?.name || "-",
        "تاريخ التعيين": formatDate(emp.hire_date),
        "تاريخ العودة": formatDate(emp.return_date),
        "الرصيد الحالي": emp.balance, "الرصيد الشهري": emp.monthly_balance,
        "إجمالي أيام الإجازة": totalVacDays,
        "أيام العمل بعد العودة": workedDays,
        "حالة الموظف": status,
        "عدد الطلبات": empRequests.length,
      };
    });
    exportToExcel(reportData, `تقرير_شامل_${new Date().toISOString().split('T')[0]}`);
  };

  // ========== EMPLOYEE OPERATIONS ==========
  const handleAddEmployee = async () => {
    if (!newEmp.name || !newEmp.code) return alert("الاسم والكود الوظيفي مطلوبان ❌");
    setIsSubmitting(true);
    const empToInsert = {
      name: newEmp.name.trim(),
      code: newEmp.code.trim(),
      position: newEmp.position.trim() || null,
      email: newEmp.email.trim() || null,
      balance: newEmp.balance || 0,
      monthly_balance: newEmp.monthly_balance || 0,
      department_id: newEmp.department_id || null,
      hire_date: newEmp.hire_date || null,
      return_date: newEmp.return_date || null,
    };
    const { error } = await supabase.from("employees").insert([empToInsert]);
    setIsSubmitting(false);
    if (error) {
      if (error.message.includes("unique") || error.message.includes("duplicate")) {
        alert("❌ الكود الوظيفي مستخدم بالفعل — اختار كود تاني");
      } else {
        alert("❌ حصل خطأ: " + error.message);
      }
      return;
    }
    setShowAddEmp(false);
    setNewEmp({ name: "", code: "", position: "", balance: 21, monthly_balance: 0, department_id: "", hire_date: "", return_date: "", email: "" });
    await fetchData();
    await logAction("create", "employees", null, null, empToInsert);
    alert("✅ تمت إضافة الموظف بنجاح!");
  };

  const handleDeleteEmployee = async (id: string) => {
    if (window.confirm("حذف الموظف نهائياً؟")) {
      const emp = employees.find(e => e.id === id);
      await supabase.from("vacation_requests").delete().eq("employee_id", id);
      await supabase.from("balance_updates").delete().eq("employee_id", id);
      await supabase.from("employees").delete().eq("id", id);
      await logAction("delete", "employees", id, emp);
      fetchData();
      alert("تم حذف الموظف وكل بياناته ✅");
    }
  };

  const handleUpdateEmployee = async () => {
    const oldData = employees.find(e => e.id === editingEmp.id);
    const { error } = await supabase.from("employees").update({
      name: editingEmp.name, code: editingEmp.code, position: editingEmp.position,
      email: editingEmp.email || "",
      balance: editingEmp.balance, monthly_balance: editingEmp.monthly_balance || 0,
      department_id: editingEmp.department_id,
      hire_date: editingEmp.hire_date,
      return_date: editingEmp.return_date,
    }).eq("id", editingEmp.id);
    if (!error) {
      setEditingEmp(null);
      fetchData();
      alert("تم التحديث ✅");
      await logAction("update", "employees", editingEmp.id, oldData, editingEmp);
    }
  };

  // ========== VACATION OPERATIONS ==========
  const openApprovalModal = (req: any, action: "approved" | "rejected") => {
    setCurrentRequest({ ...req, action });
    setAdminNotes("");
    setShowApprovalModal(true);
  };

  const handleActionWithNotes = async () => {
    if (!currentRequest) return;
    const { id, action, employee_id, days } = currentRequest;
    const oldData = requests.find(r => r.id === id);
    const emp = employees.find(e => e.id === employee_id);
    const approvedBy = currentUser?.name || "المدير";

    if (action === "approved") {
      if (!emp) return;
      if (Number(emp.balance) < Number(days)) {
        alert("رصيد الموظف غير كاف (" + emp.balance + " يوم متاح)");
        setShowApprovalModal(false); return;
      }
      const { back: backDate } = getCalculatedDates(currentRequest.start_date, days);
      const todayStr = new Date().toISOString().split("T")[0];
      const actualStart = getActualStartDate(currentRequest.start_date, currentRequest.departure_time || "actual");
      const empUpdatePayload: any = {
        balance: Number(emp.balance) - Number(days),
        return_date: backDate,
      };
      if (todayStr >= actualStart) {
        empUpdatePayload.status = "إجازة";
      }
      await supabase.from("employees").update(empUpdatePayload).eq("id", emp.id);
      if (emp.email) {
        const { back } = getCalculatedDates(currentRequest.start_date, days);
        sendEmail(EMAILJS_TEMPLATES.approved, emp.email, {
          employee_name: emp.name, start_date: formatDate(currentRequest.start_date),
          days, back_date: formatDate(back),
          admin_notes: adminNotes || "لا توجد ملاحظات", request_id: id,
        });
      }
      const { error } = await supabase.from("vacation_requests").update({
        status: "approved", admin_notes: adminNotes || null,
        owner_approved_by: approvedBy, owner_approved_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) { alert("خطا: " + error.message); return; }
      sendLocalNotification("تمت الموافقة على اجازة", emp.name + " - " + days + " يوم");
      setShowApprovalModal(false); setCurrentRequest(null); setAdminNotes("");
      fetchData();
      await logAction("approved", "vacation_requests", id, oldData, { status: "approved", approved_by: approvedBy });
      return;
    }

    if (action === "rejected") {
      if (emp?.email) sendEmail(EMAILJS_TEMPLATES.rejected, emp.email, {
        employee_name: emp?.name, start_date: formatDate(currentRequest.start_date),
        admin_notes: adminNotes || "تم رفض الطلب", request_id: id,
      });
      const { error } = await supabase.from("vacation_requests").update({
        status: "rejected", admin_notes: adminNotes || null,
        owner_approved_by: approvedBy, owner_approved_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) { alert("خطا: " + error.message); return; }
      sendLocalNotification("تم رفض طلب اجازة", (emp?.name || "") + " - " + currentRequest.days + " يوم");
      setShowApprovalModal(false); setCurrentRequest(null); setAdminNotes("");
      fetchData();
      await logAction("rejected", "vacation_requests", id, oldData, { status: "rejected", rejected_by: approvedBy });
      return;
    }
  };;



  const handleDeleteVacation = async (id: string) => {
    if (!window.confirm("حذف هذا السجل من القائمة فقط؟\n⚠️ لن يتأثر رصيد الموظف أو حالته.")) return;
    const req = requests.find(r => r.id === id);
    // الحذف من السجل فقط - لا تعديل على رصيد الموظف أو حالته
    await supabase.from("vacation_requests").delete().eq("id", id);
    await logAction("delete", "vacation_requests", id, req);
    fetchData();
    alert("✅ تم حذف السجل.\nملاحظة: رصيد الموظف وحالته لم يتغيرا.");
  };

  const handleUpdateVacation = async () => {
    const oldData = requests.find(r => r.id === editingVac.id);
    const { error } = await supabase.from("vacation_requests").update({
      start_date: editingVac.start_date, days: editingVac.days,
      notes: editingVac.notes, vacation_type_id: editingVac.vacation_type_id,
    }).eq("id", editingVac.id);
    if (error) {
      alert("❌ حصل خطأ في التحديث: " + error.message);
      return;
    }
    setEditingVac(null);
    fetchData();
    alert("تم التحديث ✅");
    await logAction("update", "vacation_requests", editingVac.id, oldData, editingVac);
  };

  // ========== RETURN FROM VACATION ==========
  const openReturnModal = (request: any) => {
    setReturnData({ ...request, actual_return_date: new Date().toISOString().split("T")[0] });
    setShowReturnModal(true);
  };

  const handleReturnFromVacation = async () => {
    if (!returnData) return;
    const emp = employees.find(e => e.id === returnData.employee_id);
    if (!emp) return;

    // حساب موعد العودة المخطط (back_date)
    const backDate = getCalculatedDates(returnData.start_date, returnData.days).back;
    const actualReturn = new Date(returnData.actual_return_date).toISOString().split("T")[0];
    
    // حساب الفرق إذا كانت العودة متأخرة
    let latenessPenalty = 0;
    if (actualReturn > backDate) {
      const backDateObj = new Date(backDate);
      const actualReturnObj = new Date(actualReturn);
      latenessPenalty = Math.ceil((actualReturnObj.getTime() - backDateObj.getTime()) / (1000 * 60 * 60 * 24));
    }

    // حساب الرصيد الجديد بعد الخصم (يمكن أن يكون سالباً)
    const newBalance = emp.balance - latenessPenalty;
    
    // تسجيل تاريخ العودة الفعلي + حالة الموظف = عمل + خصم الأيام
    const { error: empUpdateError } = await supabase.from("employees").update({
      return_date: returnData.actual_return_date,
      status: "عمل",
      balance: newBalance,
    }).eq("id", emp.id);
    
    if (empUpdateError) {
      alert("خطأ في تحديث بيانات الموظف: " + empUpdateError.message);
      return;
    }
    
    const { error: reqUpdateError } = await supabase.from("vacation_requests").update({ 
      actual_return_date: returnData.actual_return_date,
      lateness_days: latenessPenalty,
    }).eq("id", returnData.id);
    
    if (reqUpdateError) {
      alert("خطأ في تحديث الطلب: " + reqUpdateError.message);
      return;
    }

    // تسجيل العملية في السجل إذا كان هناك تأخير
    if (latenessPenalty > 0) {
      const description = `خصم ${latenessPenalty} يوم تأخير عن موعد العودة - الرصيد: ${emp.balance} → ${newBalance}`;
      await supabase.from("balance_updates").insert([{
        employee_id: emp.id,
        amount: -latenessPenalty,
        update_date: actualReturn,
        description,
      }]);
      await logAction("lateness_penalty", "vacation_requests", returnData.id, { penalty_days: latenessPenalty, new_balance: newBalance });
    }

    setShowReturnModal(false);
    setReturnData(null);
    fetchData();
    
    const msg = latenessPenalty > 0 
      ? `تم تسجيل العودة ✅\n⚠️ تأخير ${latenessPenalty} يوم - تم خصمها من الرصيد\nالرصيد الجديد: ${newBalance} يوم`
      : "تم تسجيل العودة وتحديث تاريخ العودة ✅";
    alert(msg);
    await logAction("return_from_vacation", "vacation_requests", returnData.id);
  };

  // ========== EMPLOYEE PORTAL ==========
  const submitVacationRequest = async () => {
    if (!newRequest.start_date) return alert("حدد تاريخ البداية");
    if (!newRequest.vacation_type_id) return alert("اختر نوع الإجازة");

    // ===== منع الطلب المكرر =====
    const pendingReq = requests.find(r =>
      r.employee_id === currentUser.id && (r.status === "pending" || r.status === "dept_approved")
    );
    if (pendingReq) {
      const submittedAt = new Date(pendingReq.created_at || Date.now());
      const daysSince = Math.floor((Date.now() - submittedAt.getTime()) / 86400000);
      if (daysSince <= 3) {
        const edit = window.confirm(
          "لديك طلب قيد المراجعة بتاريخ " + formatDate(pendingReq.start_date) + "\n" +
          "لا يمكن تقديم طلب جديد.\n\n" +
          "هل تريد تعديل طلبك الحالي؟ (متبقي " + (3 - daysSince) + " يوم للتعديل)"
        );
        if (edit) {
          setEmpEditReq({ ...pendingReq });
          setShowEditRequestModal(true);
        }
      } else {
        alert("لديك طلب إجازة قيد المراجعة. لا يمكن تقديم طلب جديد حتى يتم البت في طلبك.");
      }
      return;
    }

    // ===== التحقق من الرصيد مع مراعاة الرصيد الشهري =====
    const reqDays = Number(newRequest.days);
    const currentBalance = Number(currentUser.balance || 0);
    const monthlyBalance = Number(currentUser.monthly_balance || 0);
    if (currentBalance < reqDays) {
      const projected = currentBalance + monthlyBalance;
      if (projected >= reqDays) {
        const ok = window.confirm(
          "رصيدك الحالي (" + currentBalance + " يوم) أقل من المطلوب (" + reqDays + " يوم).\n" +
          "بعد إضافة رصيدك الشهري (" + monthlyBalance + " يوم) سيصبح " + projected + " يوم وهو كافٍ.\n\n" +
          "هل تريد المتابعة؟"
        );
        if (!ok) return;
      } else {
        return alert(
          "رصيدك الحالي " + currentBalance + " يوم غير كافٍ للطلب (" + reqDays + " يوم).\n" +
          "حتى بعد إضافة الرصيد الشهري (" + monthlyBalance + " يوم) لن يكفي."
        );
      }
    }

    setIsSubmitting(true);
    const actualStartDate = getActualStartDate(newRequest.start_date, newRequest.departure_time);

    const { error } = await supabase.from("vacation_requests").insert([{
      employee_id: currentUser.id, employee_name: currentUser.name,
      start_date: actualStartDate,
      departure_date: newRequest.start_date,
      departure_time: newRequest.departure_time,
      days: newRequest.days,
      notes: newRequest.notes, vacation_type_id: newRequest.vacation_type_id, status: "pending",
    }]);
    if (!error) {
      setNewRequest({ start_date: "", days: 1, notes: "", vacation_type_id: "", departure_time: "actual" });
      setIsSubmitting(false);
      fetchData();
      alert("✅ تم إرسال طلب الإجازة بنجاح!");
      sendEmail(EMAILJS_TEMPLATES.new_request_admin, ADMIN_EMAIL, {
        employee_name: currentUser.name,
        start_date: formatDate(actualStartDate),
        days: newRequest.days,
        notes: newRequest.notes || "لا توجد ملاحظات",
      });
      sendLocalNotification(
        "🔔 طلب إجازة جديد",
        `${currentUser.name} طلب ${newRequest.days} يوم من ${formatDate(actualStartDate)}`
      );
      logAction("create", "vacation_requests", null, null, newRequest);
      return;
    }
    alert("❌ حصل خطأ في إرسال الطلب — حاول تاني");
    setIsSubmitting(false);
  };


  // ========== SUBMIT EXTENSION REQUEST ==========
  const submitExtensionRequest = async () => {
    if (!extensionForm.original_request_id) return alert("اختر الإجازة الأصلية ❌");
    if (!extensionForm.additional_days || extensionForm.additional_days < 0.5) return alert("حدد عدد أيام صحيح");

    const addDays = Number(extensionForm.additional_days);
    const currentBalance = Number(currentUser.balance || 0);

    const originalReq = requests.find(r => r.id === extensionForm.original_request_id);
    if (!originalReq) return alert("الإجازة الأصلية غير موجودة");

    if (currentBalance < addDays) {
      return alert(`رصيدك الحالي ${currentBalance} يوم غير كافٍ للامتداد (${addDays} يوم)`);
    }

    setIsSubmitting(true);

    const { error } = await supabase.from("vacation_requests").insert([{
      employee_id: currentUser.id,
      employee_name: currentUser.name,
      start_date: originalReq.start_date,
      days: addDays,
      notes: `امتداد لإجازة سابقة: ${extensionForm.notes || ""}`,
      vacation_type_id: vacationTypes.find(vt => vt.name === "امتداد")?.id,
      status: "pending",
      is_extension: true,
      original_request_id: extensionForm.original_request_id,
    }]);

    if (!error) {
      setExtensionForm({ original_request_id: "", additional_days: 1, notes: "" });
      setShowExtensionModal(false);
      setIsSubmitting(false);
      fetchData();
      alert("✅ تم إرسال طلب الامتداد بنجاح!");
      sendEmail(EMAILJS_TEMPLATES.new_request_admin, ADMIN_EMAIL, {
        employee_name: currentUser.name,
        start_date: formatDate(originalReq.start_date),
        days: addDays,
        notes: `امتداد - ${extensionForm.notes || "لا توجد ملاحظات"}`,
      });
      sendLocalNotification(
        "🔔 طلب امتداد إجازة جديد",
        `${currentUser.name} طلب امتداد ${addDays} يوم على إجازة سابقة`
      );
      logAction("create", "vacation_requests", null, null, { is_extension: true, original_request_id: extensionForm.original_request_id, days: addDays });
      return;
    }
    alert("❌ حصل خطأ: " + error.message);
    setIsSubmitting(false);
  };

  // ===== Handler: الموظف يعدّل طلبه (خلال 3 أيام) =====
  const handleEmpEditRequest = async () => {
    if (!empEditReq) return alert("لا يوجد طلب محدد");
    if (!empEditReq.id) return alert("خطأ: معرّف الطلب مفقود");
    if (!empEditReq.start_date) return alert("حدد تاريخ البداية");
    if (!empEditReq.days || Number(empEditReq.days) < 0.5) return alert("عدد الأيام يجب أن يكون 0.5 على الأقل");

    // محاولة update أولاً
    const { data: updData, error: updError } = await supabase
      .from("vacation_requests")
      .update({
        start_date: empEditReq.start_date,
        days: Number(empEditReq.days),
        notes: empEditReq.notes || null,
        vacation_type_id: empEditReq.vacation_type_id || null,
        departure_time: empEditReq.departure_time || "actual",
      })
      .eq("id", empEditReq.id)
      .select();

    // لو فشل الـ update بسبب RLS، نحذف ونعيد إنشاء
    if (updError || !updData || updData.length === 0) {
      const { error: delError } = await supabase
        .from("vacation_requests")
        .delete()
        .eq("id", empEditReq.id)
        .eq("employee_id", currentUser.id);

      if (delError) {
        alert("❌ لا يمكن تعديل الطلب. يرجى التواصل مع المدير.\nالخطأ: " + (updError?.message || delError.message));
        return;
      }

      const { error: insError } = await supabase
        .from("vacation_requests")
        .insert([{
          employee_id: currentUser.id,
          employee_name: currentUser.name,
          start_date: empEditReq.start_date,
          departure_date: empEditReq.start_date,
          departure_time: empEditReq.departure_time || "actual",
          days: Number(empEditReq.days),
          notes: empEditReq.notes || null,
          vacation_type_id: empEditReq.vacation_type_id || null,
          status: "pending",
        }]);

      if (insError) {
        alert("❌ خطأ في إعادة إنشاء الطلب: " + insError.message);
        return;
      }
    }

    setShowEditRequestModal(false);
    setEmpEditReq(null);
    await fetchData();
    alert("✅ تم تعديل الطلب بنجاح");
  };

  // ===== Handler: المدير يعدّل الإجازة (أيام + تاريخ + سبب) =====
  const handleManagerEditRequest = async () => {
    if (!mgrEditForm.reason.trim()) return alert("يرجى كتابة سبب التعديل");
    if (Number(mgrEditForm.days) < 0.5) return alert("عدد الأيام يجب أن يكون 0.5 على الأقل");
    const req = requests.find(r => r.id === mgrEditForm.id);
    if (!req) return;
    const emp = employees.find(e => e.id === req.employee_id);
    if (!emp) return;
    const daysDiff = Number(mgrEditForm.days) - Number(mgrEditForm.oldDays);
    const { error } = await supabase.from("vacation_requests").update({
      days: mgrEditForm.days,
      start_date: mgrEditForm.start_date,
      admin_notes: "تعديل بواسطة " + currentUser?.name + ": من " + mgrEditForm.oldDays + " إلى " + mgrEditForm.days + " يوم" + (mgrEditForm.reason ? " - السبب: " + mgrEditForm.reason : ""),
    }).eq("id", mgrEditForm.id);
    if (error) return alert(error.message);
    if (req.status === "approved" && daysDiff !== 0) {
      await supabase.from("employees").update({ balance: Math.max(0, Number(emp.balance) - daysDiff) }).eq("id", emp.id);
    }
    await logAction("manager_edit", "vacation_requests", mgrEditForm.id, req, { newDays: mgrEditForm.days, reason: mgrEditForm.reason });
    setShowManagerEditModal(false);
    setMgrEditForm({ id:"", empName:"", days:1, start_date:"", reason:"", oldDays:1 });
    await fetchData();
    alert("✅ تم تعديل الإجازة بنجاح");
  };

  // ========== تغيير حالة الموظف يدوياً ==========
  const handleManualStatusChange = async () => {
    if (!statusChangeEmp) return;
    const emp = statusChangeEmp;

    if (statusChangeForm.status === "إجازة") {
      // التحقق من الرصيد
      const days = Number(statusChangeForm.days);
      if (days > 0 && Number(emp.balance) < days) {
        if (!window.confirm(`رصيد ${emp.name} (${emp.balance} يوم) أقل من المطلوب (${days} يوم).\nهل تريد المتابعة؟`)) return;
      }
      // تحديث حالة الموظف
      await supabase.from("employees").update({
        status: "إجازة",
        return_date: statusChangeForm.start_date && days > 0
          ? getCalculatedDates(statusChangeForm.start_date, days).back
          : null,
        ...(days > 0 ? { balance: Number(emp.balance) - days } : {}),
      }).eq("id", emp.id);
      // إضافة سجل إجازة لو كانت فيه بيانات
      if (statusChangeForm.start_date && statusChangeForm.vacation_type_id) {
        await supabase.from("vacation_requests").insert([{
          employee_id: emp.id,
          employee_name: emp.name,
          start_date: statusChangeForm.start_date,
          days,
          notes: statusChangeForm.notes || "تم تغيير الحالة يدوياً",
          vacation_type_id: statusChangeForm.vacation_type_id,
          status: "approved",
          owner_approved_by: currentUser?.name,
          owner_approved_at: new Date().toISOString(),
        }]);
      }
      await logAction("manual_status", "employees", emp.id, { status: emp.status }, { status: "إجازة" });
      alert(`✅ تم تغيير حالة ${emp.name} إلى إجازة`);
    } else {
      // تغيير إلى عمل
      await supabase.from("employees").update({
        status: "عمل",
        return_date: new Date().toISOString().split("T")[0],
      }).eq("id", emp.id);
      await logAction("manual_status", "employees", emp.id, { status: emp.status }, { status: "عمل" });
      alert(`✅ تم تغيير حالة ${emp.name} إلى عمل`);
    }
    setShowStatusModal(false);
    setStatusChangeEmp(null);
    setStatusChangeForm({ status: "إجازة", start_date: "", days: 1, notes: "", vacation_type_id: "" });
    await fetchData();
  };

  // ========== DIRECT VACATION (إجازة مباشرة) ==========
  const handleDirectVacation = async () => {
    if (!directVacForm.employee_id) return alert("اختر الموظف ❌");
    if (!directVacForm.start_date) return alert("حدد تاريخ البداية ❌");
    if (!directVacForm.vacation_type_id) return alert("اختر نوع الإجازة ❌");
    setIsSubmitting(true);
    const emp = employees.find(e => e.id === directVacForm.employee_id);
    if (!emp) { setIsSubmitting(false); return; }
    const days = Number(directVacForm.days);
    const { back } = getCalculatedDates(directVacForm.start_date, days);
    // إضافة الطلب مباشرة بحالة approved
    const { error: reqErr } = await supabase.from("vacation_requests").insert([{
      employee_id: emp.id,
      employee_name: emp.name,
      start_date: directVacForm.start_date,
      days,
      notes: directVacForm.notes || "إجازة مضافة مباشرة من الإدارة",
      vacation_type_id: directVacForm.vacation_type_id,
      status: "approved",
      owner_approved_by: currentUser?.name,
      owner_approved_at: new Date().toISOString(),
    }]);
    if (reqErr) { alert("❌ " + reqErr.message); setIsSubmitting(false); return; }
    // خصم الرصيد وتغيير الحالة
    await supabase.from("employees").update({
      balance: emp.balance - days,
      status: "إجازة",
    }).eq("id", emp.id);
    await logAction("direct_vacation", "vacation_requests", null, null, { employee: emp.name, days, start_date: directVacForm.start_date });
    setShowDirectVacModal(false);
    setDirectVacForm({ employee_id: "", days: 1, start_date: "", notes: "", vacation_type_id: "" });
    setIsSubmitting(false);
    await fetchData();
    alert(`✅ تمت إضافة إجازة ${emp.name} بنجاح!
تاريخ العودة: ${formatDate(back)}`);
  };

  // ========== DEPARTMENT OPERATIONS ==========
  const handleAddDepartment = async () => {
    if (!newDept.name) return alert("أدخل اسم القسم");
    const { error } = await supabase.from("departments").insert([newDept]);
    if (error) {
      alert("❌ حصل خطأ: " + error.message);
      return;
    }
    setShowAddDept(false);
    setNewDept({ name: "", description: "" });
    fetchData();
    await logAction("create", "departments", null, null, newDept);
    alert("تم إضافة القسم ✅");
  };

  const deleteDepartment = async (id: string) => {
    if (window.confirm("حذف القسم؟")) {
      await supabase.from("departments").delete().eq("id", id);
      fetchData();
      await logAction("delete", "departments", id);
      alert("تم الحذف ✅");
    }
  };

  // ========== HOLIDAY OPERATIONS ==========
  const handleAddHoliday = async () => {
    if (!newHoliday.name || !newHoliday.date) return alert("أدخل بيانات العطلة");
    const { error } = await supabase.from("public_holidays").insert([newHoliday]);
    if (!error) {
      setShowAddHoliday(false);
      setNewHoliday({ name: "", date: "", is_recurring: false });
      fetchData();
      await logAction("create", "public_holidays", null, null, newHoliday);
      alert("تم إضافة العطلة ✅");
    }
  };

  const deleteHoliday = async (id: string) => {
    if (window.confirm("حذف العطلة؟")) {
      await supabase.from("public_holidays").delete().eq("id", id);
      fetchData();
      await logAction("delete", "public_holidays", id);
    }
  };

  // ========== CALENDAR RENDER ==========
  const renderCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    const dayNames = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) days.push(<div key={`e-${i}`} className="p-2"></div>);
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const dayRequests = requests.filter(r => {
        if (r.status !== "approved") return false;
        const { back } = getCalculatedDates(r.start_date, r.days);
        return r.start_date <= dateStr && back > dateStr;
      });
      const isHoliday = publicHolidays.some(h => h.date === dateStr);
      const isToday = dateStr === new Date().toISOString().split('T')[0];
      days.push(
        <div key={day} onClick={() => dayRequests.length > 0 && setSelectedCalendarDay(dateStr)}
          className={`p-2 border rounded-lg min-h-[70px] text-sm ${isToday ? 'bg-indigo-50 border-indigo-300 font-bold' : 'border-slate-100'} ${isHoliday ? 'bg-red-50' : ''} ${dayRequests.length > 0 ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}>
          <div className={`text-xs mb-1 ${isToday ? 'text-indigo-600' : ''}`}>{day}</div>
          {dayRequests.length > 0 && (
            <div className="space-y-0.5">
              {dayRequests.slice(0, 2).map((req, idx) => {
                const vacType = vacationTypes.find(vt => vt.id === req.vacation_type_id);
                return (<div key={idx} className="text-[9px] px-1 py-0.5 rounded truncate" style={{ backgroundColor: vacType?.color+'30', color: vacType?.color }} title={req.employee_name}>{req.employee_name.split(' ')[0]}</div>);
              })}
              {dayRequests.length > 2 && <div className="text-[9px] text-slate-400">+{dayRequests.length - 2}</div>}
            </div>
          )}
          {isHoliday && <div className="text-[9px] text-red-600 font-bold">عطلة</div>}
        </div>
      );
    }
    return (
      <div style={{ width:"100%", boxSizing:"border-box" }} className="bg-white p-6 rounded-[2rem] shadow-sm border">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setCurrentMonth(new Date(year, month-1))} className="p-2 hover:bg-slate-100 rounded-xl">❯</button>
          <h3 className="text-lg font-black">{currentMonth.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })}</h3>
          <button onClick={() => setCurrentMonth(new Date(year, month+1))} className="p-2 hover:bg-slate-100 rounded-xl">❮</button>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {dayNames.map(n => <div key={n} className="text-center font-bold text-xs text-slate-600 p-1">{n}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">{days}</div>
        <div className="mt-4 flex gap-3 text-xs flex-wrap">
          {vacationTypes.map(vt => (
            <div key={vt.id} className="flex items-center gap-1">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: vt.color }}></div>
              <span>{vt.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ========== ROLE HELPERS ==========
  const isOwner   = currentUser?.role === "owner" || currentUser?.role === "admin";
  const isAdmin   = currentUser?.role === "admin";
  const isDeptMgr = currentUser?.role === "dept_manager";
  const isAdminAffairsMgr = currentUser?.role === "admin_affairs_manager";
  // مدير قسم الشؤون الإدارية (dept_manager لكن قسمه هو الشؤون الإدارية)
  const isDeptAdminAffairsMgr = isDeptMgr && (
    currentUser?.dept_name?.includes("الشؤون الإدارية") ||
    currentUser?.dept_name?.includes("الشؤون") ||
    currentUser?.dept_name?.includes("شؤون")
  );
  const myDeptId  = currentUser?.dept_id ?? null;
  // Support multiple departments for a manager
  const myDeptIds: string[] = currentUser?.dept_ids
    ? currentUser.dept_ids.map(String)
    : (myDeptId ? [String(myDeptId)] : []);

  // Owner يرى الكل — مدير القسم يرى أقسامه
  const scopedEmployees = isDeptMgr
    ? employees.filter(e => myDeptIds.includes(String(e.department_id)))
    : employees;
  const scopedRequests = isDeptMgr
    ? requests.filter(r => scopedEmployees.some(e => e.id === r.employee_id))
    : requests;

  // ========== FILTERED DATA ==========
  const filteredEmployees = useMemo(() => {
    let result = scopedEmployees.filter(emp => {
      const matchSearch = emp.name.includes(empSearch) || emp.code.includes(empSearch) || (emp.position||"").includes(empSearch);
      const matchDept = departmentFilter === "all" || emp.department_id === departmentFilter;
      // الحالة تُقرأ مباشرة من قاعدة البيانات
      const empStatus = emp.status === "إجازة" ? "إجازة" : "عمل";
      const matchStatus = empStatusFilter === "all" || empStatus === empStatusFilter;
      const matchHireFrom = !empHireFrom || (emp.hire_date && emp.hire_date >= empHireFrom);
      const matchHireTo = !empHireTo || (emp.hire_date && emp.hire_date <= empHireTo);
      return matchSearch && matchDept && matchStatus && matchHireFrom && matchHireTo;
    });
    // فرز حسب العمود المحدد
    if (empSortField) {
      result = [...result].sort((a, b) => {
        let va: any, vb: any;
        if (empSortField === "balance")      { va = Number(a.balance ?? 0);      vb = Number(b.balance ?? 0); }
        else if (empSortField === "monthly") { va = Number(a.monthly_balance ?? 0); vb = Number(b.monthly_balance ?? 0); }
        else if (empSortField === "workedDays") {
          va = calculateWorkedDays(a.return_date, a.status === "إجازة");
          vb = calculateWorkedDays(b.return_date, b.status === "إجازة");
        }
        else if (empSortField === "name")     { va = (a.name||"").toLowerCase();   vb = (b.name||"").toLowerCase(); }
        else if (empSortField === "code")     { va = (a.code||"");                 vb = (b.code||""); }
        else if (empSortField === "position") { va = (a.position||"").toLowerCase(); vb = (b.position||"").toLowerCase(); }
        else if (empSortField === "dept")     {
          const da = departments.find((d:any)=>d.id===a.department_id);
          const db = departments.find((d:any)=>d.id===b.department_id);
          va = (da?.name||"").toLowerCase(); vb = (db?.name||"").toLowerCase();
        }
        else if (empSortField === "status")   { va = getEmployeeStatus(a); vb = getEmployeeStatus(b); }
        else if (empSortField === "hire")     { va = a.hire_date||""; vb = b.hire_date||""; }
        else                                  { va = 0; vb = 0; }
        if (typeof va === "number") return empSortDir === "desc" ? vb - va : va - vb;
        return empSortDir === "desc" ? vb.localeCompare(va, "ar") : va.localeCompare(vb, "ar");
      });
    }
    return result;
  }, [scopedEmployees, empSearch, departmentFilter, empStatusFilter, empHireFrom, empHireTo, empSortField, empSortDir, requests]);

  const filteredRequests = useMemo(() => {
    return scopedRequests.filter(req => {
      const searchTerm = (vacSearch || reqSearch).trim();
      const emp = employees.find(e => e.id === req.employee_id);
      const matchSearch = !searchTerm ||
        req.employee_name?.includes(searchTerm) ||
        req.notes?.includes(searchTerm) ||
        (emp?.code || "").includes(searchTerm);
      const matchType = vacationTypeFilter === "all" || req.vacation_type_id === vacationTypeFilter;
      const matchStatus = statusFilter === "all" || req.status === statusFilter;
      const matchDateFrom = !reqDateFrom || req.start_date >= reqDateFrom;
      const matchDateTo = !reqDateTo || req.start_date <= reqDateTo;
      return matchSearch && matchType && matchStatus && matchDateFrom && matchDateTo;
    }).sort((a, b) => {
      // ترتيب صفحة الطلبات
      if (reqSortField) {
        let va: any = "", vb: any = "";
        if (reqSortField === "name")    { va = a.employee_name || ""; vb = b.employee_name || ""; }
        else if (reqSortField === "type")   { va = a.vacation_type_id || ""; vb = b.vacation_type_id || ""; }
        else if (reqSortField === "start")  { va = a.start_date || ""; vb = b.start_date || ""; }
        else if (reqSortField === "days")   { va = Number(a.days || 0); vb = Number(b.days || 0); }
        else if (reqSortField === "status") { va = a.status || ""; vb = b.status || ""; }
        else if (reqSortField === "dept")   {
          const da = employees.find(e => e.id === a.employee_id);
          const db = employees.find(e => e.id === b.employee_id);
          va = da?.department_id || ""; vb = db?.department_id || "";
        }
        else if (reqSortField === "workdays") {
          const ea = employees.find(e => e.id === a.employee_id);
          const eb = employees.find(e => e.id === b.employee_id);
          const hd = publicHolidays.map((h: any) => h.date);
          va = Number(calculateWorkDaysBetween(ea?.return_date || "", a.start_date, hd));
          vb = Number(calculateWorkDaysBetween(eb?.return_date || "", b.start_date, hd));
        }
        if (typeof va === "number") return reqSortDir === "desc" ? vb - va : va - vb;
        return reqSortDir === "desc" ? vb.localeCompare(va, "ar") : va.localeCompare(vb, "ar");
      }
      // ترتيب سجل الإجازات
      if (histSortField) {
        let va: any = "", vb: any = "";
        if (histSortField === "name")    { va = a.employee_name || ""; vb = b.employee_name || ""; }
        else if (histSortField === "type")   { va = a.vacation_type_id || ""; vb = b.vacation_type_id || ""; }
        else if (histSortField === "start")  { va = a.start_date || ""; vb = b.start_date || ""; }
        else if (histSortField === "days")   { va = Number(a.days || 0); vb = Number(b.days || 0); }
        else if (histSortField === "status") { va = a.status || ""; vb = b.status || ""; }
        else if (histSortField === "workdays") {
          const ea = employees.find(e => e.id === a.employee_id);
          const eb = employees.find(e => e.id === b.employee_id);
          const hd = publicHolidays.map((h: any) => h.date);
          va = Number(calculateWorkDaysBetween(ea?.return_date || "", a.start_date, hd));
          vb = Number(calculateWorkDaysBetween(eb?.return_date || "", b.start_date, hd));
        }
        if (typeof va === "number") return histSortDir === "desc" ? vb - va : va - vb;
        return histSortDir === "desc" ? vb.localeCompare(va, "ar") : va.localeCompare(vb, "ar");
      }
      return 0;
    });
  }, [scopedRequests, vacSearch, reqSearch, vacationTypeFilter, statusFilter, reqDateFrom, reqDateTo, employees, reqSortField, reqSortDir, histSortField, histSortDir, publicHolidays]);

  // ==================== GOOGLE SHEETS BACKUP ====================
  const handleBackup = async () => {
    if (!GOOGLE_SCRIPT_URL) {
      alert("❌ لم يتم إعداد REACT_APP_GOOGLE_SCRIPT_URL بعد!\nراجع خطوات الإعداد في إعدادات Vercel.");
      return;
    }
    setBackupLoading(true);
    try {
      const backupData = {
        timestamp: new Date().toISOString(),
        employees: employees.map(emp => ({
          الاسم: emp.name,
          الكود: emp.code,
          المنصب: emp.position || "-",
          البريد: emp.email || "-",
          القسم: departments.find(d => d.id === emp.department_id)?.name || "-",
          الرصيد: emp.balance,
          الرصيد_الشهري: emp.monthly_balance || 0,
          تاريخ_التعيين: emp.hire_date || "-",
          تاريخ_العودة: emp.return_date || "-",
          الحالة: getEmployeeStatus(emp),
        })),
        requests: requests.map(req => ({
          الموظف: req.employee_name,
          نوع_الإجازة: vacationTypes.find(v => v.id === req.vacation_type_id)?.name || "-",
          تاريخ_البداية: req.start_date,
          المدة: req.days,
          الحالة: req.status === "approved" ? "مقبول" : req.status === "rejected" ? "مرفوض" : "معلق",
          ملاحظات: req.admin_notes || "-",
        })),
        stats: {
          إجمالي_الموظفين: stats.totalEmployees,
          في_إجازة_الآن: stats.onVacationNow,
          طلبات_معلقة: stats.pendingRequests,
          متوسط_الرصيد: stats.avgBalance,
          إجمالي_أيام_الإجازة: stats.totalVacationDays,
        }
      };
      await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(backupData),
      });
      const now = new Date().toLocaleString("ar-EG");
      setLastBackup(now);
      localStorage.setItem("lastBackup", now);
      alert("✅ تم النسخ الاحتياطي بنجاح إلى Google Sheets!");
    } catch (err) {
      alert("❌ فشل النسخ الاحتياطي. تأكد من إعداد Google Apps Script.");
    }
    setBackupLoading(false);
  };

  // ==================== LOGIN VIEW ====================
  if (currentView === "login") {
    return (
      <div dir="rtl" style={{
        minHeight: "100vh",
        background: currentView === "login" ? "linear-gradient(135deg, #0f0c29, #302b63, #24243e)" : "#f0f2f5",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        position: "relative",
        overflow: "hidden",
        fontFamily: "Cairo, sans-serif",
      }}>
        {/* خلفية دوائر متحركة */}
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
          @keyframes float1 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(30px,-40px) scale(1.05)} }
          @keyframes float2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-20px,30px) scale(0.95)} }
          @keyframes float3 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(15px,-20px)} }
          @keyframes shimmer { 0%{opacity:0.3} 50%{opacity:0.7} 100%{opacity:0.3} }
          .orb1 { animation: float1 8s ease-in-out infinite; }
          .orb2 { animation: float2 10s ease-in-out infinite; }
          .orb3 { animation: float3 6s ease-in-out infinite; }
          .login-card { backdrop-filter: blur(20px); transition: all 0.3s ease; }
          .login-btn { transition: all 0.2s ease; }
          .login-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0,0,0,0.3); }
          .login-input:focus { outline: none; }
          @media (max-width: 768px) {
            .login-main-grid { grid-template-columns: 1fr !important; }
            .login-card { padding: 32px 24px !important; }
          }
        `}</style>

        {/* كرات ضوئية في الخلفية */}
        <div className="orb1" style={{ position:"absolute", top:"-10%", right:"-5%", width:"500px", height:"500px", borderRadius:"50%", background:"radial-gradient(circle, rgba(99, 102, 241, 0.4) 0%, transparent 70%)", filter:"blur(40px)" }} />
        <div className="orb2" style={{ position:"absolute", bottom:"-15%", left:"-10%", width:"600px", height:"600px", borderRadius:"50%", background:"radial-gradient(circle, rgba(16, 185, 129, 0.3) 0%, transparent 70%)", filter:"blur(50px)" }} />
        <div className="orb3" style={{ position:"absolute", top:"40%", left:"30%", width:"300px", height:"300px", borderRadius:"50%", background:"radial-gradient(circle, rgba(139, 92, 246, 0.25) 0%, transparent 70%)", filter:"blur(30px)" }} />

        {/* شبكة نقاط خلفية */}
        <div style={{ position:"absolute", inset:0, backgroundImage:"radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px)", backgroundSize:"40px 40px", pointerEvents:"none" }} />

        {/* الكارت الرئيسي */}
        <div className="login-main-grid" style={{ width:"100%", maxWidth:"900px", display:"grid", gridTemplateColumns:"1fr 1fr", borderRadius:"32px", overflow:"hidden", boxShadow:"0 30px 80px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)", position:"relative", zIndex:10 }}>
          
          {/* قسم الموظفين - يمين */}
          <div className="login-card" style={{ padding:"52px 40px", background:"rgba(255, 255, 255, 0.04)", borderLeft:"1px solid rgba(255, 255, 255, 0.08)" }}>
            <div style={{ width:"60px", height:"60px", borderRadius:"18px", background:"linear-gradient(135deg, #6366f1, #8b5cf6)", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:"24px", boxShadow:"0 8px 20px rgba(99, 102, 241, 0.4)" }}>
              <Users className="text-white" size={28} />
            </div>
            <h2 style={{ color:"white", fontSize:"26px", fontWeight:"900", marginBottom:"8px", fontFamily:"Cairo, sans-serif" }}>دخول الموظفين</h2>
            <p style={{ color:"rgba(255, 255, 255, 0.4)", fontSize:"14px", marginBottom:"32px" }}>أدخل كودك الوظيفي للمتابعة</p>
            <div style={{ position:"relative", marginBottom:"16px" }}>
              <input
                className="login-input"
                style={{ width:"100%", background:"rgba(255, 255, 255, 0.07)", border:"1px solid rgba(255, 255, 255, 0.12)", borderRadius:"14px", padding:"14px 18px", color:"white", fontSize:"15px", boxSizing:"border-box", fontFamily:"Cairo, sans-serif" }}
                placeholder="الكود الوظيفي"
                value={empCodeInput}
                onChange={(e) => setEmpCodeInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>
            <input
              className="login-input"
              type="password"
              inputMode="numeric"
              maxLength={4}
              style={{ width:"100%", background:"rgba(255, 255, 255, 0.07)", border:"1px solid rgba(255, 255, 255, 0.12)", borderRadius:"14px", padding:"14px 18px", color:"white", fontSize:"15px", marginBottom:"16px", boxSizing:"border-box", fontFamily:"Cairo, sans-serif" }}
              placeholder="PIN (4 أرقام)"
              value={empPinInput}
              onChange={(e) => setEmpPinInput(e.target.value.replace(/\D/g, "").slice(0,4))}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            />
            <button className="login-btn" onClick={handleLogin} style={{ width:"100%", background:"linear-gradient(135deg, #6366f1, #8b5cf6)", border:"none", borderRadius:"14px", padding:"15px", color:"white", fontSize:"16px", fontWeight:"700", cursor:"pointer", fontFamily:"Cairo, sans-serif" }}>
              دخول
            </button>
          </div>

          {/* قسم الإدارة - يسار */}
          <div className="login-card" style={{ padding:"52px 40px", background:"rgba(0, 0, 0, 0.25)" }}>
            <div style={{ width:"60px", height:"60px", borderRadius:"18px", background:"linear-gradient(135deg, #10b981, #059669)", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:"24px", boxShadow:"0 8px 20px rgba(16, 185, 129, 0.4)" }}>
              <ShieldCheck className="text-white" size={28} />
            </div>
            <h2 style={{ color:"white", fontSize:"26px", fontWeight:"900", marginBottom:"8px", fontFamily:"Cairo, sans-serif" }}>لوحة الإدارة</h2>
            <p style={{ color:"rgba(255, 255, 255, 0.4)", fontSize:"14px", marginBottom:"32px" }}>صلاحيات خاصة للمسؤولين فقط</p>
            <input
              className="login-input"
              style={{ width:"100%", background:"rgba(255, 255, 255, 0.07)", border:"1px solid rgba(255, 255, 255, 0.12)", borderRadius:"14px", padding:"14px 18px", color:"white", fontSize:"15px", marginBottom:"12px", display:"block", boxSizing:"border-box", fontFamily:"Cairo, sans-serif" }}
              placeholder="البريد الإلكتروني"
              value={loginData.email}
              onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
            />
            <input
              type="password"
              className="login-input"
              style={{ width:"100%", background:"rgba(255, 255, 255, 0.07)", border:"1px solid rgba(255, 255, 255, 0.12)", borderRadius:"14px", padding:"14px 18px", color:"white", fontSize:"15px", marginBottom:"16px", display:"block", boxSizing:"border-box", fontFamily:"Cairo, sans-serif" }}
              placeholder="كلمة المرور"
              value={loginData.password}
              onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            />
            <button className="login-btn" onClick={handleLogin} style={{ width:"100%", background:"linear-gradient(135deg, #10b981, #059669)", border:"none", borderRadius:"14px", padding:"15px", color:"white", fontSize:"16px", fontWeight:"700", cursor:"pointer", fontFamily:"Cairo, sans-serif" }}>
              دخول
            </button>
          </div>
        </div>

        {/* شعار النظام */}
        <div style={{ position:"absolute", top:"32px", right:"50%", transform:"translateX(50%)", display:"flex", alignItems:"center", gap:"12px", zIndex:10 }}>
          <div style={{ width:"40px", height:"40px", borderRadius:"12px", background:"linear-gradient(135deg, #6366f1, #8b5cf6)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <CalendarDays size={20} className="text-white" />
          </div>
          <span style={{ color:"white", fontWeight:"900", fontSize:"18px", fontFamily:"Cairo, sans-serif" }}>نظام إدارة الإجازات</span>
        </div>
      </div>
    );
  }

  // ==================== ADMIN VIEW ====================
  if (currentView === "admin") {
    return (
      <div className="min-h-screen bg-slate-50 flex" dir="rtl">

        {/* Overlay للموبايل */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-10 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* زرار toggle دايماً ظاهر في الكورنر */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="fixed top-4 right-4 z-30 text-white p-3 rounded-2xl shadow-lg transition-all"
          style={{ background: sidebarOpen ? "rgba(99, 102, 241, 0.9)" : "#6366f1", backdropFilter:"blur(10px)" }}
          title={sidebarOpen ? "إغلاق القائمة" : "فتح القائمة"}
        >
          {sidebarOpen ? <X size={22} /> : <LayoutDashboard size={22} />}
        </button>

        {/* Sidebar - ضيق واحترافي */}
        <aside style={{
          width: sidebarOpen ? "220px" : "0",
          minWidth: sidebarOpen ? "220px" : "0",
          background:"#0f172a",
          height:"100vh",
          position:"fixed",
          right:0, top:0,
          display:"flex",
          flexDirection:"column",
          zIndex:20,
          transition:"all 0.3s ease",
          overflow:"hidden",
          boxShadow: sidebarOpen ? "4px 0 24px rgba(0,0,0,0.3)" : "none",
        }}>
          {/* الشعار */}
          <div style={{ padding:"24px 16px 16px", borderBottom:"1px solid rgba(255, 255, 255, 0.07)", marginTop:"48px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
              <div style={{ background: isOwner ? "#4f46e5" : "#059669", borderRadius:"10px", padding:"8px", flexShrink:0 }}>
                <CalendarDays size={18} className="text-white" />
              </div>
              <div>
                <div style={{ color:"white", fontWeight:"900", fontSize:"13px", lineHeight:"1.2" }}>نظام الإجازات</div>
                <div style={{ fontSize:"10px", fontWeight:"700", color: isOwner ? "#a5b4fc" : "#6ee7b7" }}>
                  {isAdmin ? "⚙️ ادمن" : isOwner ? "👑 المالك" : isAdminAffairsMgr ? "🏛️ مدير الشؤون الإدارية" : `🏢 ${currentUser?.dept_name || "مدير قسم"}`}
                </div>
              </div>
            </div>
          </div>

          {/* القائمة */}
          <nav style={{ flex:1, padding:"12px 10px", display:"flex", flexDirection:"column", gap:"4px", overflowY:"auto" }}>
            {([
              { id: "dashboard",   label: "الرئيسية",       icon: LayoutDashboard, ownerOnly: false, managerAllowed: true  },
              { id: "employees",   label: "الموظفين",        icon: Users,           ownerOnly: false, managerAllowed: true  },
              { id: "requests",    label: "الطلبات",         icon: Clock,           ownerOnly: false, managerAllowed: true  },
              { id: "calendar",    label: "التقويم",          icon: Calendar,        ownerOnly: false, managerAllowed: false },
              { id: "reports",     label: "التقارير",         icon: BarChart3,       ownerOnly: false, managerAllowed: false },
              { id: "departments", label: "الأقسام",          icon: Building2,       ownerOnly: true,  managerAllowed: false },
              { id: "managers",    label: "مديرو الأقسام",   icon: ShieldCheck,     ownerOnly: true,  managerAllowed: false },
              { id: "admins",      label: "الادمن",          icon: Users,           ownerOnly: true,  managerAllowed: false },
              { id: "holidays",    label: "العطلات",          icon: CalendarDays,    ownerOnly: true,  managerAllowed: false },
              { id: "history",     label: "السجل",            icon: History,         ownerOnly: false, managerAllowed: true  },
              { id: "active_vacations", label: "الإجازات الفعلية", icon: CheckCircle, ownerOnly: false, managerAllowed: true  },
              { id: "notifications_center", label: "الاشعارات",   icon: Bell,            ownerOnly: false, managerAllowed: false },
              { id: "admin_affairs", label: "الشؤون الإدارية", icon: Briefcase, ownerOnly: true, managerAllowed: false, adminAffairsManager: true, deptAdminAffairs: true },
            ] as {id:string,label:string,icon:any,ownerOnly:boolean,managerAllowed:boolean,adminAffairsManager?:boolean,deptAdminAffairs?:boolean}[])
              .filter(item => {
                if (isOwner) return true; // المالك والادمن يرى كل شيء
                if (item.adminAffairsManager && isAdminAffairsMgr) return true; // مدير الشؤون الإدارية
                if (item.deptAdminAffairs && isDeptAdminAffairsMgr) return true; // مدير قسم الشؤون الإدارية
                if (isDeptMgr) return item.managerAllowed; // مدير القسم يرى الصفحات المحددة له فقط
                return false;
              })
              .map((item) => (
              <button key={item.id}
                onClick={() => { setActiveTab(item.id); if (window.innerWidth < 1024) setSidebarOpen(false); }}
                style={{
                  width:"100%", display:"flex", alignItems:"center", gap:"10px",
                  padding:"10px 12px", borderRadius:"10px", border:"none", cursor:"pointer",
                  background: activeTab === item.id ? "#4f46e5" : "transparent",
                  color: activeTab === item.id ? "white" : "#94a3b8",
                  fontWeight:"700", fontSize:"13px", transition:"all 0.15s", textAlign:"right",
                  position:"relative",
                }}
                onMouseEnter={e => { if(activeTab !== item.id) e.currentTarget.style.background = "#1e293b"; e.currentTarget.style.color = "white"; }}
                onMouseLeave={e => { if(activeTab !== item.id) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#94a3b8"; } }}
              >
                <item.icon size={17} style={{ flexShrink:0 }} />
                <span style={{ whiteSpace:"nowrap" }}>{item.label}</span>
                {item.id === "requests" && notifications.length > 0 && (
                  <span style={{ marginRight:"auto", background:"#ef4444", color:"white", fontSize:"10px", padding:"1px 6px", borderRadius:"10px", fontWeight:"900" }}>{notifications.length}</span>
                )}
                {item.id === "notifications_center" && (() => {
                  const approvedOrRejected = requests.filter(r => (r.status === "approved" || r.status === "rejected") && r.admin_notes);
                  return approvedOrRejected.length > 0 ? (
                    <span style={{ marginRight:"auto", background:"#f59e0b", color:"white", fontSize:"10px", padding:"1px 6px", borderRadius:"10px", fontWeight:"900" }}>{approvedOrRejected.length}</span>
                  ) : null;
                })()}
              </button>
            ))}
          </nav>

          {/* PWA + خروج */}
          <div style={{ padding:"10px", borderTop:"1px solid rgba(255, 255, 255, 0.07)", display:"flex", flexDirection:"column", gap:"6px" }}>
            {/* زر تثبيت التطبيق */}
            <button onClick={() => setShowPWAGuide(true)} style={{
              width:"100%", display:"flex", alignItems:"center", gap:"10px",
              padding:"10px 12px", borderRadius:"10px", border:"1px solid rgba(99,102,241,0.3)",
              background:"rgba(99,102,241,0.1)", color:"#a5b4fc", cursor:"pointer",
              fontWeight:"700", fontSize:"13px",
            }}>
              <Smartphone size={17}/><span>تثبيت التطبيق 📱</span>
            </button>
            <button onClick={() => { localStorage.removeItem("vms_currentUser"); localStorage.removeItem("vms_currentView"); setCurrentView("login"); setCurrentUser(null); setLoginData({ email: "", password: "" }); setEmpCodeInput(""); }} style={{
              width:"100%", display:"flex", alignItems:"center", gap:"10px",
              padding:"10px 12px", borderRadius:"10px", border:"1px solid rgba(239,68,68,0.2)",
              background:"rgba(239,68,68,0.05)", color:"#f87171", cursor:"pointer",
              fontWeight:"700", fontSize:"13px",
            }}>
              <LogOut size={17} /><span>خروج</span>
            </button>
          </div>

          {/* PWA Guide Modal */}
          {showPWAGuide && (
            <div style={{ position:"fixed", inset:0, background:"rgba(0, 0, 0, 0.7)", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center", padding:"20px" }} onClick={() => setShowPWAGuide(false)}>
              <div style={{ background:"white", borderRadius:"24px", padding:"32px", maxWidth:"440px", width:"100%", direction:"rtl" }} onClick={e => e.stopPropagation()}>
                <div style={{ textAlign:"center", marginBottom:"24px" }}>
                  <div style={{ fontSize:"48px", marginBottom:"12px" }}>📱</div>
                  <h2 style={{ margin:0, fontWeight:"900", fontSize:"22px", color:"#1e293b" }}>تثبيت التطبيق</h2>
                  <p style={{ color:"#64748b", fontSize:"14px", marginTop:"8px" }}>وصول سريع من شاشتك الرئيسية</p>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:"16px" }}>
                  <div style={{ background:"#f8fafc", borderRadius:"16px", padding:"16px" }}>
                    <p style={{ fontWeight:"800", fontSize:"14px", color:"#1e293b", marginBottom:"8px" }}>🤖 Android (Chrome):</p>
                    <ol style={{ margin:0, padding:"0 20px", fontSize:"13px", color:"#475569", lineHeight:"2" }}>
                      <li>اضغط على ⋮ (القائمة) في Chrome</li>
                      <li>اختر "إضافة إلى الشاشة الرئيسية"</li>
                      <li>اضغط "إضافة"</li>
                    </ol>
                  </div>
                  <div style={{ background:"#f8fafc", borderRadius:"16px", padding:"16px" }}>
                    <p style={{ fontWeight:"800", fontSize:"14px", color:"#1e293b", marginBottom:"8px" }}>🍎 iPhone (Safari):</p>
                    <ol style={{ margin:0, padding:"0 20px", fontSize:"13px", color:"#475569", lineHeight:"2" }}>
                      <li>اضغط على زر المشاركة ⬆️</li>
                      <li>اختر "إضافة إلى الشاشة الرئيسية"</li>
                      <li>اضغط "إضافة"</li>
                    </ol>
                  </div>
                  <div style={{ background:"#ede9fe", borderRadius:"16px", padding:"16px", textAlign:"center" }}>
                    <p style={{ margin:0, fontSize:"13px", color:"#7c3aed", fontWeight:"700" }}>
                      ✅ بعد التثبيت: التطبيق هيشتغل زي أي app عادي حتى بدون نت!
                    </p>
                  </div>
                </div>
                <button onClick={() => setShowPWAGuide(false)} style={{ width:"100%", marginTop:"20px", background:"#4f46e5", color:"white", border:"none", borderRadius:"14px", padding:"14px", fontWeight:"900", fontSize:"15px", cursor:"pointer", fontFamily:"inherit" }}>
                  فهمت! ✅
                </button>
              </div>
            </div>
          )}
        </aside>

        {/* Main Content */}
        <main style={{ 
          marginRight: (!isMobile && sidebarOpen) ? "220px" : "0", 
          width: (!isMobile && sidebarOpen) ? "calc(100% - 220px)" : "100%",
          transition:"all 0.3s ease", 
          padding: isMobile ? "12px 12px" : "16px 24px", 
          minHeight:"100vh", 
          paddingTop:"60px",
          boxSizing:"border-box",
        }}>
          {loading && <div className="flex items-center justify-center h-screen"><Loader2 className="animate-spin text-indigo-600" size={48} /></div>}

          {!loading && (
            <>
              {/* ===== DASHBOARD ===== */}
              {activeTab === "dashboard" && (
                <div style={{ width:"100%", boxSizing:"border-box" }} className="space-y-8">
                  {/* ===== داشبورد مدير القسم المخصص ===== */}
                  {isDeptMgr && (() => {
                    const today = new Date().toISOString().split("T")[0];
                    const deptEmps = employees.filter(e => myDeptIds.includes(String(e.department_id)));
                    const onVacNow = deptEmps.filter(emp => emp.status === "إجازة");
                    const atWork = deptEmps.filter(emp => emp.status !== "إجازة").length;
                    const pendingDept = requests.filter(r => r.status === "pending" && deptEmps.some(e => e.id === r.employee_id));
                    const deptRequests = requests.filter(r => deptEmps.some(e => e.id === r.employee_id) && r.status === "approved");
                    const vacPct = deptEmps.length > 0 ? Math.round((onVacNow.length / deptEmps.length) * 100) : 0;
                    const workPct = 100 - vacPct;

                    // هيكل القسم - تصنيف الموظفين حسب المنصب
                    const getRank = (pos: string) => {
                      if (!pos) return 4;
                      if (pos.includes("مدير")) return 1;
                      if (pos.includes("مهندس")) return 2;
                      if (pos.includes("مشرف")) return 3;
                      return 4;
                    };
                    const getRankLabel = (rank: number) => {
                      if (rank === 1) return { label: "المديرون", icon: "👔", color: "#7c3aed", bg: "linear-gradient(135deg,#ede9fe,#ddd6fe)" };
                      if (rank === 2) return { label: "المهندسون", icon: "👷", color: "#0369a1", bg: "linear-gradient(135deg,#e0f2fe,#bae6fd)" };
                      if (rank === 3) return { label: "المشرفون", icon: "👮", color: "#065f46", bg: "linear-gradient(135deg,#d1fae5,#a7f3d0)" };
                      return { label: "الموظفون", icon: "👨‍💼", color: "#92400e", bg: "linear-gradient(135deg,#fef3c7,#fde68a)" };
                    };
                    const grouped = [1,2,3,4].map(rank => ({
                      rank,
                      ...getRankLabel(rank),
                      emps: deptEmps.filter(e => getRank(e.position) === rank)
                    })).filter(g => g.emps.length > 0);

                    // أقرب عودة
                    const upcoming = requests
                      .filter(r => r.status === "approved" && deptEmps.some(e => e.id === r.employee_id))
                      .map(r => ({ ...r, backDate: getCalculatedDates(r.start_date, r.days).back }))
                      .filter(r => r.backDate > today)
                      .sort((a,b) => a.backDate.localeCompare(b.backDate))
                      .slice(0,5);

                    const greeting = getGreeting();

                    return (
                      <div style={{ display:"flex", flexDirection:"column", gap:"20px" }}>

                        {/* ===== بانر الترحيب الاحترافي ===== */}
                        <div style={{
                          background:"linear-gradient(135deg,#0f172a 0%,#1e1b4b 40%,#312e81 70%,#4338ca 100%)",
                          borderRadius:"24px", padding:"28px", color:"white", position:"relative", overflow:"hidden",
                          boxShadow:"0 20px 60px rgba(99,102,241,0.35)"
                        }}>
                          {/* دوائر زخرفية */}
                          <div style={{ position:"absolute", top:"-30px", left:"-30px", width:"180px", height:"180px", borderRadius:"50%", background:"rgba(255, 255, 255, 0.04)" }}/>
                          <div style={{ position:"absolute", bottom:"-50px", left:"20%", width:"220px", height:"220px", borderRadius:"50%", background:"rgba(255, 255, 255, 0.03)" }}/>
                          <div style={{ position:"absolute", top:"10px", right:"10px", width:"80px", height:"80px", borderRadius:"50%", background:"rgba(255, 255, 255, 0.05)" }}/>

                          <div style={{ position:"relative", zIndex:1 }}>
                            {/* التحية والاسم */}
                            <div style={{ display:"flex", alignItems:"center", gap:"12px", marginBottom:"6px" }}>
                              <span style={{ fontSize:"32px" }}>{greeting.emoji}</span>
                              <div>
                                <div style={{ fontSize:"11px", color:"rgba(255, 255, 255, 0.5)", marginBottom:"2px" }}>{greeting.text}</div>
                                <h2 style={{ margin:0, fontSize:"20px", fontWeight:"900" }}>{currentUser.name}</h2>
                              </div>
                            </div>
                            <div style={{ display:"inline-flex", alignItems:"center", gap:"6px", background:"rgba(255, 255, 255, 0.12)", borderRadius:"20px", padding:"4px 12px", marginBottom:"20px", border:"1px solid rgba(255, 255, 255, 0.15)" }}>
                              <Building2 size={13} style={{ color:"#a5b4fc" }}/>
                              <span style={{ fontSize:"12px", color:"#a5b4fc", fontWeight:"700" }}>{currentUser.dept_name}</span>
                            </div>

                            {/* الإحصائيات الـ 4 */}
                            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(100px, 1fr))", gap:"10px" }}>
                              {[
                                { label:"إجمالي الموظفين", value: deptEmps.length, color:"#a5b4fc", icon:"👥" },
                                { label:"في عمل الآن",      value: atWork,          color:"#6ee7b7", icon:"✅" },
                                { label:"في إجازة الآن",   value: onVacNow.length, color:"#fca5a5", icon:"🏖️" },
                                { label:"طلبات معلقة",     value: pendingDept.length, color: pendingDept.length > 0 ? "#fde68a" : "#6ee7b7", icon:"⏳" },
                              ].map(s => (
                                <div key={s.label} style={{ background:"rgba(255, 255, 255, 0.09)", borderRadius:"14px", padding:"14px 10px", textAlign:"center", border:"1px solid rgba(255, 255, 255, 0.1)", backdropFilter:"blur(10px)" }}>
                                  <div style={{ fontSize:"20px", marginBottom:"4px" }}>{s.icon}</div>
                                  <div style={{ fontSize:"26px", fontWeight:"900", color:s.color, lineHeight:1 }}>{s.value}</div>
                                  <div style={{ fontSize:"10px", color:"rgba(255, 255, 255, 0.6)", marginTop:"4px" }}>{s.label}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* ===== Pie Chart + شريط نسبة الحضور ===== */}
                        <div style={{ background:"white", borderRadius:"20px", border:"1px solid #e2e8f0", padding:"20px", boxShadow:"0 2px 8px rgba(0, 0, 0, 0.06)" }}>
                          <div style={{ fontWeight:"900", fontSize:"15px", marginBottom:"16px", display:"flex", alignItems:"center", gap:"8px" }}>
                            <PieChart size={18} style={{ color:"#4f46e5" }}/> حالة موظفي القسم
                          </div>
                          <div style={{ display:"flex", alignItems:"center", gap:"24px", flexWrap:"wrap" }}>
                            <svg width="110" height="110" viewBox="0 0 120 120">
                              {deptEmps.length === 0 ? (
                                <circle cx="60" cy="60" r="50" fill="#e2e8f0"/>
                              ) : onVacNow.length === 0 ? (
                                <circle cx="60" cy="60" r="50" fill="#10b981"/>
                              ) : onVacNow.length === deptEmps.length ? (
                                <circle cx="60" cy="60" r="50" fill="#ef4444"/>
                              ) : (() => {
                                const angle = (onVacNow.length / deptEmps.length) * 2 * Math.PI;
                                const x1 = 60 + 50 * Math.sin(angle);
                                const y1 = 60 - 50 * Math.cos(angle);
                                const large = angle > Math.PI ? 1 : 0;
                                return <>
                                  <path d={`M60,60 L60,10 A50,50 0 ${large},1 ${x1},${y1} Z`} fill="#ef4444"/>
                                  <path d={`M60,60 L${x1},${y1} A50,50 0 ${1-large},1 60,10 Z`} fill="#10b981"/>
                                </>;
                              })()}
                              <circle cx="60" cy="60" r="32" fill="white"/>
                              <text x="60" y="57" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#1e293b">{workPct}%</text>
                              <text x="60" y="70" textAnchor="middle" fontSize="8" fill="#94a3b8">حضور</text>
                            </svg>
                            <div style={{ flex:1, display:"flex", flexDirection:"column", gap:"10px" }}>
                              <div>
                                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"4px" }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                                    <div style={{ width:"10px", height:"10px", borderRadius:"2px", background:"#10b981" }}/>
                                    <span style={{ fontSize:"12px", fontWeight:"700", color:"#374151" }}>في عمل</span>
                                  </div>
                                  <span style={{ fontSize:"12px", fontWeight:"900", color:"#10b981" }}>{atWork} موظف</span>
                                </div>
                                <div style={{ height:"6px", background:"#f1f5f9", borderRadius:"3px" }}>
                                  <div style={{ height:"100%", width:`${workPct}%`, background:"linear-gradient(90deg, #10b981, #34d399)", borderRadius:"3px" }}/>
                                </div>
                              </div>
                              <div>
                                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"4px" }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                                    <div style={{ width:"10px", height:"10px", borderRadius:"2px", background:"#ef4444" }}/>
                                    <span style={{ fontSize:"12px", fontWeight:"700", color:"#374151" }}>في إجازة</span>
                                  </div>
                                  <span style={{ fontSize:"12px", fontWeight:"900", color:"#ef4444" }}>{onVacNow.length} موظف</span>
                                </div>
                                <div style={{ height:"6px", background:"#f1f5f9", borderRadius:"3px" }}>
                                  <div style={{ height:"100%", width:`${vacPct}%`, background:"linear-gradient(90deg, #ef4444, #f87171)", borderRadius:"3px" }}/>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* ===== هيكل القسم - قائمة منسدلة ===== */}
                        <div style={{ background:"white", borderRadius:"20px", border:"1px solid #e2e8f0", overflow:"hidden", boxShadow:"0 2px 8px rgba(0, 0, 0, 0.06)" }}>
                          <div style={{ padding:"16px 20px", borderBottom:"1px solid #e2e8f0", fontWeight:"900", fontSize:"15px", display:"flex", alignItems:"center", gap:"8px" }}>
                            <Briefcase size={17} style={{ color:"#7c3aed" }}/> هيكل القسم
                          </div>
                          <div style={{ padding:"12px", display:"flex", flexDirection:"column", gap:"8px" }}>
                            {grouped.map(group => {
                              const groupKey = (myDeptId || "dept") + "_" + group.rank;
                              const isOpen = expandedDeptGroups[groupKey] !== false;
                              return (
                              <div key={group.rank} style={{ border:"1px solid #f1f5f9", borderRadius:"14px", overflow:"hidden" }}>
                                {/* رأس الفئة - قابل للطي */}
                                <div
                                  onClick={() => setExpandedDeptGroups(prev => ({ ...prev, [groupKey]: !isOpen }))}
                                  style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", cursor:"pointer", background: isOpen ? group.bg : "white", transition:"background 0.2s" }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                                    <span style={{ fontSize:"16px" }}>{group.icon}</span>
                                    <span style={{ fontSize:"13px", fontWeight:"900", color:group.color }}>{group.label}</span>
                                    <span style={{ background:group.color+"20", color:group.color, fontSize:"11px", fontWeight:"700", padding:"2px 8px", borderRadius:"20px" }}>{group.emps.length}</span>
                                  </div>
                                  <span style={{ fontSize:"12px", color:group.color, transition:"transform 0.2s", display:"inline-block", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
                                </div>
                                {/* محتوى الفئة */}
                                {isOpen && (
                                  <div style={{ display:"flex", flexDirection:"column", gap:"4px", padding:"8px", borderTop:"1px solid #f1f5f9" }}>
                                    {group.emps.map(emp => {
                                      const isVac = onVacNow.some(e => e.id === emp.id);
                                      return (
                                        <div key={emp.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 12px", borderRadius:"10px", background: isVac ? "#fff1f2" : "#f8fafc", border:`1px solid ${isVac ? "#fecdd3" : "#f1f5f9"}` }}>
                                          <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                                            <div style={{ width:"32px", height:"32px", borderRadius:"50%", background:`linear-gradient(135deg, ${group.color}30, ${group.color}15)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"13px", fontWeight:"900", color:group.color, flexShrink:0 }}>
                                              {emp.name.charAt(0)}
                                            </div>
                                            <div>
                                              <div style={{ fontWeight:"700", fontSize:"13px", color:"#1e293b" }}>{emp.name}</div>
                                              <div style={{ fontSize:"10px", color:"#94a3b8" }}>{emp.position}</div>
                                            </div>
                                          </div>
                                          <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                                            <span style={{ fontSize:"10px", fontWeight:"700", color:"#64748b" }}>{emp.balance} يوم</span>
                                            <span style={{ padding:"2px 8px", borderRadius:"20px", fontSize:"10px", fontWeight:"700", background: isVac ? "#fee2e2" : "#dcfce7", color: isVac ? "#dc2626" : "#16a34a" }}>
                                              {isVac ? "إجازة" : "عمل"}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )})}
                          </div>
                        </div>

                        {/* ===== 3 جداول في Row ===== */}
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(260px, 1fr))", gap:"16px" }}>

                          {/* أعلى رصيد */}
                          <div style={{ background:"white", borderRadius:"20px", border:"1px solid #e2e8f0", overflow:"hidden", boxShadow:"0 2px 8px rgba(0, 0, 0, 0.06)" }}>
                            <div style={{ padding:"14px 16px", background:"linear-gradient(135deg, #eef2ff, #e0e7ff)", borderBottom:"1px solid #e2e8f0", fontWeight:"900", fontSize:"13px", color:"#4f46e5", display:"flex", alignItems:"center", gap:"6px" }}>
                              🏆 أعلى رصيد في القسم
                            </div>
                            {[...deptEmps].sort((a,b) => b.balance - a.balance).slice(0,5).map((emp,i) => (
                              <div key={emp.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderBottom:"1px solid #f8fafc" }}>
                                <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                                  <span style={{ fontWeight:"900", color: i === 0 ? "#f59e0b" : "#cbd5e1", fontSize:"14px" }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i+1}`}</span>
                                  <div>
                                    <div style={{ fontWeight:"700", fontSize:"12px" }}>{emp.name}</div>
                                    <div style={{ fontSize:"10px", color:"#94a3b8" }}>{emp.position || "-"}</div>
                                  </div>
                                </div>
                                <span style={{ background:"#eef2ff", color:"#4f46e5", borderRadius:"20px", padding:"3px 10px", fontSize:"11px", fontWeight:"700" }}>{emp.balance} يوم</span>
                              </div>
                            ))}
                          </div>

                          {/* أكتر أيام عمل */}
                          <div style={{ background:"white", borderRadius:"20px", border:"1px solid #e2e8f0", overflow:"hidden", boxShadow:"0 2px 8px rgba(0, 0, 0, 0.06)" }}>
                            <div style={{ padding:"14px 16px", background:"linear-gradient(135deg, #f0fdf4, #dcfce7)", borderBottom:"1px solid #e2e8f0", fontWeight:"900", fontSize:"13px", color:"#16a34a", display:"flex", alignItems:"center", gap:"6px" }}>
                              💪 أكثر أيام عمل بعد العودة
                            </div>
                            {(() => {
                              const ranked = [...deptEmps]
                                .map(emp => ({ ...emp, workedDays: calculateWorkedDays(emp.return_date, emp.status === "إجازة") }))
                                .filter(emp => emp.workedDays > 0)
                                .sort((a,b) => b.workedDays - a.workedDays)
                                .slice(0,5);
                              return ranked.length > 0 ? ranked.map((emp,i) => (
                                <div key={emp.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderBottom:"1px solid #f8fafc" }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                                    <span style={{ fontWeight:"900", color:"#94a3b8", fontSize:"11px" }}>#{i+1}</span>
                                    <div>
                                      <div style={{ fontWeight:"700", fontSize:"12px" }}>{emp.name}</div>
                                      <div style={{ fontSize:"10px", color:"#94a3b8" }}>{emp.position || "-"}</div>
                                    </div>
                                  </div>
                                  <span style={{ background:"#dcfce7", color:"#16a34a", borderRadius:"20px", padding:"3px 10px", fontSize:"11px", fontWeight:"700" }}>{emp.workedDays} يوم</span>
                                </div>
                              )) : <div style={{ padding:"20px", textAlign:"center", color:"#94a3b8", fontSize:"12px" }}>لا توجد بيانات</div>;
                            })()}
                          </div>

                          {/* أقرب عودة */}
                          <div style={{ background:"white", borderRadius:"20px", border:"1px solid #e2e8f0", overflow:"hidden", boxShadow:"0 2px 8px rgba(0, 0, 0, 0.06)" }}>
                            <div style={{ padding:"14px 16px", background:"linear-gradient(135deg, #fff7ed, #fef3c7)", borderBottom:"1px solid #e2e8f0", fontWeight:"900", fontSize:"13px", color:"#ea580c", display:"flex", alignItems:"center", gap:"6px" }}>
                              📅 أقرب مواعيد العودة
                            </div>
                            {upcoming.length > 0 ? upcoming.map((r,i) => (
                              <div key={r.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderBottom:"1px solid #f8fafc" }}>
                                <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                                  <span style={{ fontWeight:"900", color:"#94a3b8", fontSize:"11px" }}>#{i+1}</span>
                                  <div style={{ fontWeight:"700", fontSize:"12px" }}>{r.employee_name}</div>
                                </div>
                                <span style={{ background:"#fff7ed", color:"#ea580c", borderRadius:"20px", padding:"3px 10px", fontSize:"11px", fontWeight:"700" }}>{formatDate(r.backDate)}</span>
                              </div>
                            )) : <div style={{ padding:"20px", textAlign:"center", color:"#94a3b8", fontSize:"12px" }}>لا يوجد موظفون في إجازة</div>}
                          </div>

                        </div>
                      </div>
                    );
                  })()}

                  {/* ===== داشبورد الأدمن العادي ===== */}
                  {!isDeptMgr && <>
                  {/* ===== رسالة الترحيب ===== */}
                  {(() => {
                    const greeting = getGreeting();
                    return (
                      <div style={{
                        background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4338ca 100%)",
                        borderRadius: "2rem",
                        padding: "36px 40px",
                        position: "relative",
                        overflow: "hidden",
                        boxShadow: "0 20px 60px rgba(99,102,241,0.3)",
                      }}>
                        {/* دوائر زخرفية */}
                        <div style={{ position:"absolute", top:"-40px", left:"-40px", width:"200px", height:"200px", borderRadius:"50%", background:"rgba(255, 255, 255, 0.04)" }} />
                        <div style={{ position:"absolute", bottom:"-60px", left:"30%", width:"250px", height:"250px", borderRadius:"50%", background:"rgba(255, 255, 255, 0.03)" }} />

                        <div style={{ position:"relative", zIndex:1, display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:"24px" }}>
                          {/* يمين - الترحيب */}
                          <div>
                            <div style={{ display:"flex", alignItems:"center", gap:"12px", marginBottom:"8px" }}>
                              <span style={{ fontSize:"36px" }}>{greeting.emoji}</span>
                              <h2 style={{ color:"white", fontSize:"28px", fontWeight:"900", margin:0 }}>{greeting.text}، {currentUser.name}</h2>
                            </div>
                            <p style={{ color:"rgba(255, 255, 255, 0.6)", fontSize:"15px", marginBottom:"20px" }}>نظرة عامة على حالة الإجازات</p>

                            {/* التاريخ والوقت */}
                            <div style={{ display:"flex", gap:"16px", flexWrap:"wrap" }}>
                              <div style={{ background:"rgba(255, 255, 255, 0.1)", backdropFilter:"blur(10px)", borderRadius:"12px", padding:"10px 18px", border:"1px solid rgba(255, 255, 255, 0.15)" }}>
                                <div style={{ color:"rgba(255, 255, 255, 0.5)", fontSize:"11px", marginBottom:"2px" }}>الوقت</div>
                                <div style={{ color:"white", fontSize:"22px", fontWeight:"900", fontVariantNumeric:"tabular-nums", direction:"ltr" }}>
                                  {currentTime.toLocaleTimeString("ar-EG", { hour:"2-digit", minute:"2-digit", second:"2-digit" })}
                                </div>
                              </div>
                              <div style={{ background:"rgba(255, 255, 255, 0.1)", backdropFilter:"blur(10px)", borderRadius:"12px", padding:"10px 18px", border:"1px solid rgba(255, 255, 255, 0.15)" }}>
                                <div style={{ color:"rgba(255, 255, 255, 0.5)", fontSize:"11px", marginBottom:"2px" }}>ميلادي</div>
                                <div style={{ color:"white", fontSize:"14px", fontWeight:"700" }}>
                                  {currentTime.toLocaleDateString("ar-EG", { weekday:"long", year:"numeric", month:"long", day:"numeric" })}
                                </div>
                              </div>
                              <div style={{ background:"rgba(255, 255, 255, 0.1)", backdropFilter:"blur(10px)", borderRadius:"12px", padding:"10px 18px", border:"1px solid rgba(255, 255, 255, 0.15)" }}>
                                <div style={{ color:"rgba(255, 255, 255, 0.5)", fontSize:"11px", marginBottom:"2px" }}>هجري</div>
                                <div style={{ color:"#a5b4fc", fontSize:"14px", fontWeight:"700" }}>{getHijriDate()}</div>
                              </div>
                            </div>
                          </div>

                          {/* يسار - الحكمة اليومية */}
                          <div style={{ maxWidth:"340px", background:"rgba(255, 255, 255, 0.07)", borderRadius:"16px", padding:"20px 24px", border:"1px solid rgba(255, 255, 255, 0.12)", backdropFilter:"blur(10px)" }}>
                            <div style={{ color:"#fbbf24", fontSize:"12px", fontWeight:"700", marginBottom:"10px", display:"flex", alignItems:"center", gap:"6px" }}>
                              <span>💡</span> حكمة اليوم
                            </div>
                            <p style={{ color:"rgba(255, 255, 255, 0.85)", fontSize:"14px", lineHeight:"1.8", margin:0 }}>
                              "{getDailyWisdom()}"
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  {/* شريط الأدوات العلوي */}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:"12px", flexWrap:"wrap" }}>
                    {/* حالة الاتصال */}
                    <div style={{ display:"flex", alignItems:"center", gap:"8px", padding:"8px 16px", borderRadius:"20px", background: isOnline ? "#dcfce7" : "#fee2e2", color: isOnline ? "#16a34a" : "#dc2626", fontSize:"13px", fontWeight:"700" }}>
                      {isOnline ? <Wifi size={16}/> : <WifiOff size={16}/>}
                      {isOnline ? "متصل" : "غير متصل"}
                    </div>

                    <div style={{ display:"flex", gap:"10px", flexWrap:"wrap" }}>
                      {/* زر الإشعارات - بيعرض الحالة الحقيقية */}
                      {(() => {
                        const permission = typeof Notification !== "undefined" ? Notification.permission : "default";
                        const isGranted = permission === "granted";
                        const isDenied = permission === "denied";
                        return (
                          <button onClick={enablePushNotifications} style={{
                            display:"flex", alignItems:"center", gap:"8px",
                            background: isGranted ? "#dcfce7" : isDenied ? "#fee2e2" : "#f1f5f9",
                            color: isGranted ? "#16a34a" : isDenied ? "#dc2626" : "#64748b",
                            border: `1px solid ${isGranted ? "#bbf7d0" : isDenied ? "#fecaca" : "#e2e8f0"}`,
                            borderRadius:"14px", padding:"10px 18px",
                            fontWeight:"700", cursor:"pointer", fontSize:"13px", fontFamily:"inherit",
                          }}>
                            <Bell size={16}/>
                            {isGranted ? "إشعارات المتصفح مفعّلة ✅" : isDenied ? "الإشعارات محجوبة ⚠️" : "تفعيل إشعارات المتصفح 🔔"}
                          </button>
                        );
                      })()}

                      {/* زر النسخ الاحتياطي */}
                      {lastBackup && <span style={{ color:"#64748b", fontSize:"12px", alignSelf:"center" }}>آخر نسخة: {lastBackup}</span>}
                      <button onClick={handleBackup} disabled={backupLoading} style={{
                        display:"flex", alignItems:"center", gap:"8px",
                        background: backupLoading ? "#94a3b8" : "linear-gradient(135deg, #10b981, #059669)",
                        color:"white", border:"none", borderRadius:"14px",
                        padding:"10px 18px", fontWeight:"700", cursor: backupLoading ? "not-allowed" : "pointer",
                        fontSize:"13px", fontFamily:"inherit",
                      }}>
                        {backupLoading ? <><RefreshCw size={16} style={{ animation:"spin 1s linear infinite" }}/> جاري...</> : <><Download size={16}/> Google Sheets</>}
                      </button>
                    </div>
                  </div>


                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(150px, 1fr))", gap:"14px" }}>
                    <div className="bg-white p-6 rounded-[2rem] shadow-sm border flex items-center gap-4">
                      <div className="p-4 bg-blue-50 text-blue-600 rounded-xl"><Users size={28} /></div>
                      <div><p className="text-slate-500 font-bold text-sm">إجمالي الموظفين</p><h3 className="text-3xl font-black">{stats.totalEmployees}</h3></div>
                    </div>
                    <div className="bg-white p-6 rounded-[2rem] shadow-sm border flex items-center gap-4">
                      <div className="p-4 bg-amber-50 text-amber-600 rounded-xl"><Clock size={28} /></div>
                      <div><p className="text-slate-500 font-bold text-sm">طلبات معلقة</p><h3 className="text-3xl font-black text-amber-600">{stats.pendingRequests}</h3></div>
                    </div>
                    <div className="bg-white p-6 rounded-[2rem] shadow-sm border flex items-center gap-4">
                      <div className="p-4 bg-emerald-50 text-emerald-600 rounded-xl"><CheckCircle size={28} /></div>
                      <div><p className="text-slate-500 font-bold text-sm">في إجازة الآن</p><h3 className="text-3xl font-black text-emerald-600">{stats.onVacationNow}</h3></div>
                    </div>
                    <div className="bg-white p-6 rounded-[2rem] shadow-sm border flex items-center gap-4">
                      <div className="p-4 bg-purple-50 text-purple-600 rounded-xl"><TrendingUp size={28} /></div>
                      <div><p className="text-slate-500 font-bold text-sm">متوسط الرصيد</p><h3 className="text-3xl font-black text-purple-600">{stats.avgBalance}</h3></div>
                    </div>
                  </div>
                  {/* ===== Advanced Analytics Strip ===== */}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(140px, 1fr))", gap:"12px" }}>
                    {/* نسبة الحضور */}
                    {(() => {
                      const attendRate = stats.totalEmployees > 0 ? Math.round((stats.atWorkNow / stats.totalEmployees) * 100) : 0;
                      return (
                        <div style={{ background:"white", borderRadius:"16px", padding:"20px", border:"1px solid #e2e8f0", boxShadow:"0 1px 4px rgba(0, 0, 0, 0.05)" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"12px" }}>
                            <Target size={16} style={{ color:"#4f46e5" }}/>
                            <span style={{ fontSize:"12px", color:"#64748b", fontWeight:"700" }}>نسبة الحضور</span>
                          </div>
                          <div style={{ fontSize:"28px", fontWeight:"900", color:"#4f46e5" }}>{attendRate}%</div>
                          <div style={{ marginTop:"8px", height:"6px", background:"#e2e8f0", borderRadius:"3px" }}>
                            <div style={{ height:"100%", width:`${attendRate}%`, background:"linear-gradient(90deg, #4f46e5, #7c3aed)", borderRadius:"3px" }}/>
                          </div>
                        </div>
                      );
                    })()}
                    {/* إجمالي أيام الإجازات */}
                    <div style={{ background:"white", borderRadius:"16px", padding:"20px", border:"1px solid #e2e8f0", boxShadow:"0 1px 4px rgba(0, 0, 0, 0.05)" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"12px" }}>
                        <Award size={16} style={{ color:"#f59e0b" }}/>
                        <span style={{ fontSize:"12px", color:"#64748b", fontWeight:"700" }}>إجمالي أيام الإجازات</span>
                      </div>
                      <div style={{ fontSize:"28px", fontWeight:"900", color:"#f59e0b" }}>{stats.totalVacationDays}</div>
                      <div style={{ fontSize:"11px", color:"#94a3b8", marginTop:"4px" }}>يوم مجموع مُوافق عليه</div>
                    </div>
                    {/* موظفين رصيدهم منخفض */}
                    {(() => {
                      const lowCount = employees.filter(e => e.balance < 5).length;
                      return (
                        <div style={{ background: lowCount > 0 ? "#fff7ed" : "white", borderRadius:"16px", padding:"20px", border:`1px solid ${lowCount > 0 ? "#fed7aa" : "#e2e8f0"}`, boxShadow:"0 1px 4px rgba(0, 0, 0, 0.05)" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"12px" }}>
                            <Flame size={16} style={{ color: lowCount > 0 ? "#ea580c" : "#64748b" }}/>
                            <span style={{ fontSize:"12px", color:"#64748b", fontWeight:"700" }}>رصيد منخفض</span>
                          </div>
                          <div style={{ fontSize:"28px", fontWeight:"900", color: lowCount > 0 ? "#ea580c" : "#10b981" }}>{lowCount}</div>
                          <div style={{ fontSize:"11px", color:"#94a3b8", marginTop:"4px" }}>موظف أقل من 5 أيام</div>
                        </div>
                      );
                    })()}
                    {/* معدل الموافقة */}
                    {(() => {
                      const total = requests.length;
                      const approved = requests.filter(r => r.status === "approved").length;
                      const rate = total > 0 ? Math.round((approved / total) * 100) : 0;
                      return (
                        <div style={{ background:"white", borderRadius:"16px", padding:"20px", border:"1px solid #e2e8f0", boxShadow:"0 1px 4px rgba(0, 0, 0, 0.05)" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"12px" }}>
                            <Eye size={16} style={{ color:"#10b981" }}/>
                            <span style={{ fontSize:"12px", color:"#64748b", fontWeight:"700" }}>معدل الموافقة</span>
                          </div>
                          <div style={{ fontSize:"28px", fontWeight:"900", color:"#10b981" }}>{rate}%</div>
                          <div style={{ fontSize:"11px", color:"#94a3b8", marginTop:"4px" }}>{approved} من {total} طلب</div>
                        </div>
                      );
                    })()}
                  </div>

                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))", gap:"16px" }}>
                    <div className="bg-white rounded-[2rem] shadow-sm border">
                      <div className="p-6 border-b bg-slate-50/50"><h4 className="font-black text-slate-800 flex items-center gap-2"><ArrowUpRight className="text-indigo-600" size={20} /> الأعلى رصيداً</h4></div>
                      <div className="p-4">
                        {topBalances.map((emp, idx) => (
                          <div key={emp.id} className="flex justify-between items-center p-3 hover:bg-slate-50 rounded-xl">
                            <div className="flex items-center gap-3"><span className="text-lg font-bold text-slate-400">#{idx+1}</span><span className="font-bold text-slate-800">{emp.name}</span></div>
                            <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full font-bold text-sm">{emp.balance} يوم</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-white rounded-[2rem] shadow-sm border">
                      <div className="p-6 border-b bg-slate-50/50"><h4 className="font-black text-slate-800 flex items-center gap-2"><Calendar className="text-emerald-600" size={20} /> أقرب مواعيد العودة</h4></div>
                      <div className="p-4 space-y-2">
                        {comingBackSoon.map(req => (
                          <div key={req.id} className="flex justify-between items-center p-3 hover:bg-slate-50 rounded-xl">
                            <span className="font-bold text-slate-800">{req.employee_name}</span>
                            <span className="text-emerald-600 font-bold text-sm">{formatDate(req.backDate)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(250px, 1fr))", gap:"16px" }}>
                    <div className="bg-white p-6 rounded-[2rem] shadow-sm border col-span-2">
                      <h4 className="font-black mb-4 flex items-center gap-2"><BarChart2 size={20} className="text-indigo-600" /> أكثر الموظفين أيام عمل بعد العودة</h4>
                      <div className="space-y-3">
                        {(() => {
                          const topWorked = [...employees]
                            .map(emp => ({ ...emp, workedDays: calculateWorkedDays(emp.return_date, emp.status === "إجازة") }))
                            .filter(emp => emp.workedDays > 0)
                            .sort((a: any, b: any) => b.workedDays - a.workedDays)
                            .slice(0, 7);
                          const maxDays = (topWorked[0] as any)?.workedDays || 1;
                          return topWorked.length > 0 ? topWorked.map((emp: any, i) => (
                            <div key={emp.id} style={{ display:"flex", alignItems:"center", gap:"12px" }}>
                              <span style={{ color:"#94a3b8", fontWeight:"800", fontSize:"13px", minWidth:"24px" }}>#{i+1}</span>
                              <div style={{ flex:1 }}>
                                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"4px" }}>
                                  <span style={{ fontWeight:"700", fontSize:"13px", color:"#1e293b" }}>{emp.name}</span>
                                  <span style={{ color:"#4f46e5", fontWeight:"800", fontSize:"13px" }}>{emp.workedDays} يوم</span>
                                </div>
                                <div style={{ height:"8px", background:"#e2e8f0", borderRadius:"99px", overflow:"hidden" }}>
                                  <div style={{ height:"100%", background:"linear-gradient(90deg, #6366f1, #8b5cf6)", borderRadius:"99px", width:`${(emp.workedDays / maxDays) * 100}%`, transition:"width 0.4s" }}></div>
                                </div>
                              </div>
                            </div>
                          )) : <div style={{ textAlign:"center", color:"#94a3b8", padding:"32px 0", fontSize:"13px" }}>لا توجد بيانات عودة بعد</div>;
                        })()}
                      </div>
                    </div>
                    <div className="bg-white p-6 rounded-[2rem] shadow-sm border">
                      <h4 className="font-black mb-4 flex items-center gap-2"><PieChart size={20} className="text-purple-600" /> أنواع الإجازات</h4>
                      <div className="space-y-3">
                        {vacationByType.map(item => (
                          <div key={item.name} className="flex justify-between items-center">
                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded" style={{ backgroundColor: item.color }}></div><span className="text-sm">{item.name}</span></div>
                            <span className="font-bold">{item.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  </>}
                </div>
              )}

              {/* ===== EMPLOYEES ===== */}
              {activeTab === "employees" && (
                <div className="space-y-5">
                  {/* شريط الأدوات */}
                  <div style={{ background:"white", borderRadius:"20px", padding:"16px 20px", border:"1px solid #e2e8f0", display:"flex", alignItems:"center", gap:"12px", flexWrap:"wrap", boxShadow:"0 1px 4px rgba(0, 0, 0, 0.05)" }}>
                    {/* بحث */}
                    <div style={{ position:"relative", flex:"1", minWidth:"200px" }}>
                      <Search style={{ position:"absolute", right:"14px", top:"50%", transform:"translateY(-50%)", color:"#94a3b8" }} size={16} />
                      <input
                        style={{ width:"100%", paddingRight:"40px", paddingLeft:"14px", paddingTop:"10px", paddingBottom:"10px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:"12px", fontSize:"13px", outline:"none", boxSizing:"border-box" }}
                        placeholder="ابحث بالاسم أو الكود..."
                        value={empSearch}
                        onChange={(e) => setEmpSearch(e.target.value)}
                      />
                    </div>
                    {/* فلاتر - المالك فقط يرى dropdown الأقسام */}
                    {!isDeptMgr && departments.length > 0 && (
                      <select style={{ padding:"10px 14px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:"12px", fontSize:"13px", outline:"none", color:"#475569" }} value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
                        <option value="all">كل الأقسام</option>
                        {departments.map(dept => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
                      </select>
                    )}
                    <select style={{ padding:"10px 14px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:"12px", fontSize:"13px", outline:"none", color:"#475569" }} value={empStatusFilter} onChange={(e) => setEmpStatusFilter(e.target.value)}>
                      <option value="all">كل الحالات</option>
                      <option value="عمل">🟢 في العمل</option>
                      <option value="إجازة">🟡 في إجازة</option>
                    </select>
                    {/* فلترة بتاريخ التعيين */}
                    <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                      <label style={{ fontSize:"12px", color:"#64748b", fontWeight:"600", whiteSpace:"nowrap" }}>تعيين من:</label>
                      <input type="date" style={{ padding:"9px 10px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:"10px", fontSize:"12px", outline:"none" }}
                        value={empHireFrom} onChange={e => setEmpHireFrom(e.target.value)} />
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                      <label style={{ fontSize:"12px", color:"#64748b", fontWeight:"600", whiteSpace:"nowrap" }}>إلى:</label>
                      <input type="date" style={{ padding:"9px 10px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:"10px", fontSize:"12px", outline:"none" }}
                        value={empHireTo} onChange={e => setEmpHireTo(e.target.value)} />
                    </div>
                    {(empHireFrom || empHireTo) && (
                      <button onClick={() => { setEmpHireFrom(""); setEmpHireTo(""); }}
                        style={{ padding:"9px 14px", background:"#fee2e2", color:"#dc2626", border:"none", borderRadius:"10px", fontSize:"12px", fontWeight:"700", cursor:"pointer" }}>
                        ✕ مسح التاريخ
                      </button>
                    )}
                    {/* أزرار */}
                    <div style={{ display:"flex", gap:"8px", marginRight:"auto" }}>
                      <button onClick={() => setShowImportModal(true)} style={{ display:"flex", alignItems:"center", gap:"6px", padding:"10px 16px", background:"#059669", color:"white", border:"none", borderRadius:"12px", fontSize:"13px", fontWeight:"700", cursor:"pointer" }}>
                        <Upload size={15} /> Excel
                      </button>
                      <button onClick={() => setShowAddEmp(true)} style={{ display:"flex", alignItems:"center", gap:"6px", padding:"10px 16px", background:"#4f46e5", color:"white", border:"none", borderRadius:"12px", fontSize:"13px", fontWeight:"700", cursor:"pointer" }}>
                        <UserPlus size={15} /> موظف جديد
                      </button>
                      <button onClick={() => exportToExcel(filteredEmployees, "قائمة_الموظفين")} style={{ display:"flex", alignItems:"center", gap:"6px", padding:"10px 16px", background:"#1e293b", color:"white", border:"none", borderRadius:"12px", fontSize:"13px", fontWeight:"700", cursor:"pointer" }}>
                        <Download size={15} /> تصدير
                      </button>
                      <button onClick={() => { setShowBalanceLog(true); fetchBalanceLogs(); }} style={{ display:"flex", alignItems:"center", gap:"6px", padding:"10px 16px", background:"#059669", color:"white", border:"none", borderRadius:"12px", fontSize:"13px", fontWeight:"700", cursor:"pointer" }}>
                        💰 سجل حركات الرصيد
                      </button>
                    </div>
                  </div>

                  {/* عداد النتائج */}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 4px" }}>
                    <span style={{ fontSize:"13px", color:"#64748b", fontWeight:"600" }}>
                      إجمالي: <span style={{ color:"#4f46e5", fontWeight:"900" }}>{filteredEmployees.length}</span> موظف
                      {filteredEmployees.filter(e => getEmployeeStatus(e) === "إجازة").length > 0 && (
                        <span style={{ marginRight:"12px", color:"#d97706" }}>
                          🟡 في إجازة: <strong>{filteredEmployees.filter(e => getEmployeeStatus(e) === "إجازة").length}</strong>
                        </span>
                      )}
                    </span>
                  </div>

                  {/* الجدول مع scroll أفقي */}
                  <div style={{ background:"white", borderRadius:"20px", border:"1px solid #e2e8f0", boxShadow:"0 1px 4px rgba(0, 0, 0, 0.05)", overflow:"hidden" }}>
                    <div style={{ overflowX:"auto", overflowY:"auto", maxHeight:"calc(100vh - 280px)" }}>
                      <table style={{ width:"100%", borderCollapse:"collapse", border:"2px solid #94a3b8", fontSize:"13px", backgroundColor:"#ffffff" }}>
                        <thead>
                          <tr style={{ background:"linear-gradient(90deg, #3b82f6 0%, #f59e0b 14%, #a855f7 28%, #ef4444 42%, #10b981 56%, #eab308 70%, #06b6d4 84%, #14b8a6 100%)", borderBottom:"2px solid #cbd5e1", position:"sticky", top:0, zIndex:5 }}>
                            <SortTh label="الاسم"      field="name"       align="right"  sortField={empSortField} sortDir={empSortDir} sortDropdown={empSortDropdown} onSort={(f,d)=>{setEmpSortField(f);setEmpSortDir(d);setEmpSortDropdown("");}} onClear={()=>{setEmpSortField("");setEmpSortDropdown("");}} onToggle={f=>setEmpSortDropdown(d=>d===f?"":f)} />
                            <SortTh label="الكود"      field="code"       align="center" sortField={empSortField} sortDir={empSortDir} sortDropdown={empSortDropdown} onSort={(f,d)=>{setEmpSortField(f);setEmpSortDir(d);setEmpSortDropdown("");}} onClear={()=>{setEmpSortField("");setEmpSortDropdown("");}} onToggle={f=>setEmpSortDropdown(d=>d===f?"":f)} />
                            <SortTh label="المنصب"     field="position"   align="right"  sortField={empSortField} sortDir={empSortDir} sortDropdown={empSortDropdown} onSort={(f,d)=>{setEmpSortField(f);setEmpSortDir(d);setEmpSortDropdown("");}} onClear={()=>{setEmpSortField("");setEmpSortDropdown("");}} onToggle={f=>setEmpSortDropdown(d=>d===f?"":f)} />
                            <SortTh label="القسم"      field="dept"       align="center" sortField={empSortField} sortDir={empSortDir} sortDropdown={empSortDropdown} onSort={(f,d)=>{setEmpSortField(f);setEmpSortDir(d);setEmpSortDropdown("");}} onClear={()=>{setEmpSortField("");setEmpSortDropdown("");}} onToggle={f=>setEmpSortDropdown(d=>d===f?"":f)} />
                            <SortTh label="الرصيد"     field="balance"    align="center" sortField={empSortField} sortDir={empSortDir} sortDropdown={empSortDropdown} onSort={(f,d)=>{setEmpSortField(f);setEmpSortDir(d);setEmpSortDropdown("");}} onClear={()=>{setEmpSortField("");setEmpSortDropdown("");}} onToggle={f=>setEmpSortDropdown(d=>d===f?"":f)} />
                            <SortTh label="شهري"       field="monthly"    align="center" sortField={empSortField} sortDir={empSortDir} sortDropdown={empSortDropdown} onSort={(f,d)=>{setEmpSortField(f);setEmpSortDir(d);setEmpSortDropdown("");}} onClear={()=>{setEmpSortField("");setEmpSortDropdown("");}} onToggle={f=>setEmpSortDropdown(d=>d===f?"":f)} />
                            <SortTh label="أيام العمل" field="workedDays" align="center" sortField={empSortField} sortDir={empSortDir} sortDropdown={empSortDropdown} onSort={(f,d)=>{setEmpSortField(f);setEmpSortDir(d);setEmpSortDropdown("");}} onClear={()=>{setEmpSortField("");setEmpSortDropdown("");}} onToggle={f=>setEmpSortDropdown(d=>d===f?"":f)} />
                            <SortTh label="الحالة"     field="status"     align="center" sortField={empSortField} sortDir={empSortDir} sortDropdown={empSortDropdown} onSort={(f,d)=>{setEmpSortField(f);setEmpSortDir(d);setEmpSortDropdown("");}} onClear={()=>{setEmpSortField("");setEmpSortDropdown("");}} onToggle={f=>setEmpSortDropdown(d=>d===f?"":f)} />
                            <th style={{ border:"1px solid #94a3b8", padding:"12px 8px", backgroundColor:"#4f46e5", color:"white", fontWeight:"900", textAlign:"center" }}>إجراءات</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredEmployees.map((emp, idx) => {
                            const empStatus = getEmployeeStatus(emp);
                            const workedDays = calculateWorkedDays(emp.return_date, empStatus === "إجازة");
                            const dept = departments.find(d => d.id === emp.department_id);
                            const isOnLeave = empStatus === "إجازة";
                            return (
                              <tr key={emp.id} style={{ borderBottom:"1px solid #f1f5f9", background: isOnLeave ? "#fffbeb" : (idx % 2 === 0 ? "white" : "#fafafa"), transition:"background 0.15s" }}
                                onMouseEnter={e => (e.currentTarget.style.background = "#f0f4ff")}
                                onMouseLeave={e => (e.currentTarget.style.background = isOnLeave ? "#fffbeb" : (idx % 2 === 0 ? "white" : "#fafafa"))}>
                                {/* الاسم */}
                                <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>
                                  <div style={{ fontWeight:"700", color:"#1e293b", fontSize:"13px" }}>{emp.name}</div>
                                  {emp.email && <a href={`mailto:${emp.email}`} style={{ color:"#6366f1", fontSize:"11px", textDecoration:"none" }}>{emp.email}</a>}
                                </td>
                                {/* الكود */}
                                <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>
                                  <span style={{ fontFamily:"monospace", background:"#f1f5f9", padding:"3px 8px", borderRadius:"6px", fontSize:"12px", color:"#475569", fontWeight:"600" }}>{emp.code}</span>
                                </td>
                                {/* المنصب */}
                                <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>{emp.position || "-"}</td>
                                {/* القسم */}
                                <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>
                                  {dept ? <span style={{ background:"#ede9fe", color:"#7c3aed", padding:"3px 10px", borderRadius:"20px", fontSize:"11px", fontWeight:"700" }}>{dept.name}</span> : <span style={{ color:"#cbd5e1" }}>-</span>}
                                </td>
                                {/* الرصيد */}
                                <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>
                                  <span style={{ fontWeight:"900", fontSize:"16px", color: emp.balance < 5 ? "#dc2626" : emp.balance < 10 ? "#d97706" : "#4f46e5" }}>{emp.balance}</span>
                                  <div style={{ fontSize:"10px", color:"#94a3b8" }}>يوم</div>
                                </td>
                                {/* شهري */}
                                <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>
                                  {emp.monthly_balance > 0
                                    ? <span style={{ background:"#dcfce7", color:"#16a34a", padding:"3px 8px", borderRadius:"20px", fontSize:"11px", fontWeight:"700" }}>+{emp.monthly_balance}</span>
                                    : <span style={{ color:"#cbd5e1", fontSize:"12px" }}>-</span>}
                                </td>
                                {/* أيام العمل */}
                                <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>{workedDays > 0 ? workedDays : "-"}</td>
                                {/* الحالة */}
                                <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>
                                  <span style={{ padding:"4px 12px", borderRadius:"20px", fontSize:"11px", fontWeight:"800", background: isOnLeave ? "#fef3c7" : "#dcfce7", color: isOnLeave ? "#92400e" : "#166534" }}>
                                    {isOnLeave ? "🟡 إجازة" : "🟢 عمل"}
                                  </span>
                                </td>
                                {/* إجراءات */}
                                <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>
                                  <div style={{ display:"flex", justifyContent:"center", gap:"6px" }}>
                                    <button
                                      title={empStatus === "إجازة" ? "تغيير إلى عمل" : "تغيير إلى إجازة"}
                                      onClick={() => {
                                        setStatusChangeEmp(emp);
                                        setStatusChangeForm({ status: empStatus === "إجازة" ? "عمل" : "إجازة", start_date: "", days: 1, notes: "", vacation_type_id: "" });
                                        setShowStatusModal(true);
                                      }}
                                      style={{ padding:"6px 8px", background: empStatus === "إجازة" ? "#fef3c7" : "#dcfce7", border:"none", borderRadius:"8px", cursor:"pointer", fontSize:"14px" }}>
                                      {empStatus === "إجازة" ? "🏢" : "🏖️"}
                                    </button>
                                    <button onClick={() => setEditingEmp(emp)} style={{ padding:"6px", background:"#eff6ff", border:"none", borderRadius:"8px", cursor:"pointer", color:"#3b82f6", display:"flex", alignItems:"center" }} title="تعديل"><Edit3 size={14} /></button>
                                    <button onClick={() => { setResetPinEmp(emp); setResetPinValue(""); setShowResetPinModal(true); }} style={{ padding:"6px", background:"#fdf4ff", border:"none", borderRadius:"8px", cursor:"pointer", color:"#9333ea", display:"flex", alignItems:"center" }} title="إعادة تعيين الرقم السري"><KeyRound size={14} /></button>
                                    <button onClick={() => handleDeleteEmployee(emp.id)} style={{ padding:"6px", background:"#fff1f2", border:"none", borderRadius:"8px", cursor:"pointer", color:"#ef4444", display:"flex", alignItems:"center" }} title="حذف"><Trash2 size={14} /></button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {filteredEmployees.length === 0 && (
                        <div style={{ padding:"60px", textAlign:"center", color:"#94a3b8" }}>
                          <Users size={48} style={{ margin:"0 auto 16px", opacity:0.3 }} />
                          <p style={{ fontWeight:"700", fontSize:"16px" }}>لا يوجد موظفون مطابقون للبحث</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ===== REQUESTS ===== */}
              {activeTab === "requests" && (
                <div style={{ width:"100%", boxSizing:"border-box" }} className="space-y-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <h2 className="text-2xl font-black">طلبات الإجازات</h2>
                    <button onClick={() => { setPrintSelected([]); setPrintFrom(""); setPrintTo(""); setShowPrintModal(true); }}
                      style={{ padding:"10px 16px", background:"linear-gradient(135deg, #1d4ed8, #3b82f6)", color:"white", border:"none", borderRadius:"12px", fontWeight:"700", cursor:"pointer", fontSize:"13px", display:"flex", alignItems:"center", gap:"6px", whiteSpace:"nowrap" }}>
                      🖨️ طباعة / مشاركة
                    </button>
                  </div>
                      {isDeptMgr && <p className="text-sm text-emerald-600 font-bold mt-1">🏢 تعرض طلبات قسم: {currentUser?.dept_name}</p>}
                    </div>
                  </div>
                  {/* شريط بحث وفلتر في الطلبات */}
                  <div style={{ background:"white", borderRadius:"16px", padding:"12px 16px", border:"1px solid #e2e8f0", display:"flex", gap:"10px", flexWrap:"wrap", alignItems:"center" }}>
                    <div style={{ position:"relative", flex:"2", minWidth:"180px" }}>
                      <Search style={{ position:"absolute", right:"12px", top:"50%", transform:"translateY(-50%)", color:"#94a3b8" }} size={15}/>
                      <input style={{ width:"100%", padding:"10px 36px 10px 12px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:"10px", fontSize:"13px", outline:"none", boxSizing:"border-box" as any }}
                        placeholder="بحث بالاسم..."
                        value={reqSearch} onChange={e => setReqSearch(e.target.value)} />
                    </div>
                    <select style={{ padding:"10px 12px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:"10px", fontSize:"13px", outline:"none" }}
                      value={vacationTypeFilter} onChange={e => setVacationTypeFilter(e.target.value)}>
                      <option value="all">كل الأنواع</option>
                      {vacationTypes.map(vt => <option key={vt.id} value={vt.id}>{vt.name}</option>)}
                    </select>
                    <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                      <label style={{ fontSize:"12px", color:"#64748b", fontWeight:"600", whiteSpace:"nowrap" }}>من:</label>
                      <input type="date" style={{ padding:"9px 10px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:"10px", fontSize:"12px", outline:"none" }}
                        value={reqDateFrom} onChange={e => setReqDateFrom(e.target.value)} />
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                      <label style={{ fontSize:"12px", color:"#64748b", fontWeight:"600", whiteSpace:"nowrap" }}>إلى:</label>
                      <input type="date" style={{ padding:"9px 10px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:"10px", fontSize:"12px", outline:"none" }}
                        value={reqDateTo} onChange={e => setReqDateTo(e.target.value)} />
                    </div>
                    {(reqSearch || vacationTypeFilter !== "all" || reqDateFrom || reqDateTo) && (
                      <button onClick={() => { setReqSearch(""); setVacationTypeFilter("all"); setReqDateFrom(""); setReqDateTo(""); }}
                        style={{ padding:"9px 14px", background:"#fee2e2", color:"#dc2626", border:"none", borderRadius:"10px", fontSize:"12px", fontWeight:"700", cursor:"pointer" }}>
                        ✕ مسح
                      </button>
                    )}
                    <span style={{ fontSize:"12px", color:"#64748b", marginRight:"auto" }}>
                      {filteredRequests.length} طلب
                    </span>
                  </div>

                  {/* طلبات بانتظار مدير القسم (للدور: مدير قسم) - جدول مثل المالك */}
                  {isDeptMgr && filteredRequests.filter(r => r.status === "pending").length > 0 && (
                    <>
                      <h3 className="font-black text-lg text-amber-600">⏳ بانتظار موافقتك ({filteredRequests.filter(r => r.status === "pending").length})</h3>
                      <div style={{ background:"white", borderRadius:"20px", border:"1px solid #e2e8f0", overflowX:"auto" }}>
                        <table style={{ width:"100%", borderCollapse:"collapse", border:"2px solid #94a3b8", fontSize:"13px", backgroundColor:"#ffffff" }}>
                          <thead>
                            <tr style={{ background:"linear-gradient(135deg, #fffbeb, #fef3c7)", borderBottom:"2px solid #fde68a" }}>
                              <SortTh label="الموظف"    field="name"     align="right"  sortField={reqSortField} sortDir={reqSortDir} sortDropdown={reqSortDropdown} onSort={(f,d)=>{setReqSortField(f);setReqSortDir(d);setReqSortDropdown("");}} onClear={()=>{setReqSortField("");setReqSortDropdown("");}} onToggle={f=>setReqSortDropdown(d=>d===f?"":f)} />
                              <SortTh label="النوع"     field="type"     align="center" sortField={reqSortField} sortDir={reqSortDir} sortDropdown={reqSortDropdown} onSort={(f,d)=>{setReqSortField(f);setReqSortDir(d);setReqSortDropdown("");}} onClear={()=>{setReqSortField("");setReqSortDropdown("");}} onToggle={f=>setReqSortDropdown(d=>d===f?"":f)} />
                              <SortTh label="البداية"   field="start"    align="center" sortField={reqSortField} sortDir={reqSortDir} sortDropdown={reqSortDropdown} onSort={(f,d)=>{setReqSortField(f);setReqSortDir(d);setReqSortDropdown("");}} onClear={()=>{setReqSortField("");setReqSortDropdown("");}} onToggle={f=>setReqSortDropdown(d=>d===f?"":f)} />
                              <SortTh label="نهاية الإجازة" field="end" align="center" sortField={reqSortField} sortDir={reqSortDir} sortDropdown={reqSortDropdown} onSort={(f,d)=>{setReqSortField(f);setReqSortDir(d);setReqSortDropdown("");}} onClear={()=>{setReqSortField("");setReqSortDropdown("");}} onToggle={f=>setReqSortDropdown(d=>d===f?"":f)} />
                              <SortTh label="الأيام"    field="days"     align="center" sortField={reqSortField} sortDir={reqSortDir} sortDropdown={reqSortDropdown} onSort={(f,d)=>{setReqSortField(f);setReqSortDir(d);setReqSortDropdown("");}} onClear={()=>{setReqSortField("");setReqSortDropdown("");}} onToggle={f=>setReqSortDropdown(d=>d===f?"":f)} />
                              <SortTh label="أيام العمل" field="workdays" align="center" sortField={reqSortField} sortDir={reqSortDir} sortDropdown={reqSortDropdown} onSort={(f,d)=>{setReqSortField(f);setReqSortDir(d);setReqSortDropdown("");}} onClear={()=>{setReqSortField("");setReqSortDropdown("");}} onToggle={f=>setReqSortDropdown(d=>d===f?"":f)} />
                              <SortTh label="الحالة"    field="status"   align="center" sortField={reqSortField} sortDir={reqSortDir} sortDropdown={reqSortDropdown} onSort={(f,d)=>{setReqSortField(f);setReqSortDir(d);setReqSortDropdown("");}} onClear={()=>{setReqSortField("");setReqSortDropdown("");}} onToggle={f=>setReqSortDropdown(d=>d===f?"":f)} />
                              <th style={{ border:"1px solid #94a3b8", padding:"12px 8px", backgroundColor:"#4f46e5", color:"white", fontWeight:"900", textAlign:"center" }}>الإجراءات</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredRequests.filter(r => r.status === "pending").map((req, idx) => {
                              const vacType = vacationTypes.find((vt: any) => vt.id === req.vacation_type_id);
                              const emp = employees.find((e: any) => e.id === req.employee_id);
                              const { end } = getCalculatedDates(req.start_date, req.days);
                              return (
                                <tr key={req.id}
                                  style={{ borderBottom:"1px solid #f1f5f9", background: idx % 2 === 0 ? "white" : "#fafafa" }}
                                  onMouseEnter={e => (e.currentTarget.style.background = "#fffbeb")}
                                  onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? "white" : "#fafafa")}>
                                  <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>
                                    <button onClick={() => { setEmpInfoTarget({...emp, req}); setShowEmpInfoModal(true); }}
                                      style={{ background:"none", border:"none", padding:0, cursor:"pointer", textAlign:"right" }}>
                                      <div style={{ fontWeight:"800", color:"#1e293b", fontSize:"13px" }}>{req.employee_name}</div>
                                      {emp?.email && <div style={{ fontSize:"10px", color:"#94a3b8" }}>{emp.email}</div>}
                                    </button>
                                  </td>
                                  <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>
                                    {vacType && <span style={{ padding:"3px 10px", borderRadius:"20px", fontSize:"11px", fontWeight:"700", background:(vacType as any).color+"22", color:(vacType as any).color }}>{(vacType as any).name}</span>}
                                  </td>
                                  <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>{formatDate(req.start_date)}</td>
                                  <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>{formatDate(end)}</td>
                                  <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>
                                    <span style={{ fontWeight:"900", color:"#059669", fontSize:"14px" }}>{req.days}</span>
                                    <span style={{ fontSize:"10px", color:"#94a3b8" }}> يوم</span>
                                  </td>
                                  <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>
                                    {(() => {
                                      const holidayDates = publicHolidays.map(h => h.date);
                                      const days = calculateWorkDaysBetween(emp?.return_date || "", req.start_date, holidayDates);
                                      return days > 0 ? days : "-";
                                    })()}
                                  </td>
                                  <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>
                                    {req.notes && <div style={{ fontSize:"11px", color:"#64748b", fontStyle:"italic", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"100px" }} title={req.notes}>"{req.notes}"</div>}
                                  </td>
                                  <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>
                                    <div style={{ display:"flex", gap:"6px", justifyContent:"center" }}>
                                      <button onClick={() => openApprovalModal(req, "approved")}
                                        style={{ padding:"6px 14px", background:"linear-gradient(135deg, #f59e0b, #d97706)", color:"white", border:"none", borderRadius:"8px", fontWeight:"800", cursor:"pointer", fontSize:"12px", fontFamily:"inherit" }}>
                                        ✓ موافقة
                                      </button>
                                      <button onClick={() => openApprovalModal(req, "rejected")}
                                        style={{ padding:"6px 14px", background:"#fee2e2", color:"#dc2626", border:"none", borderRadius:"8px", fontWeight:"800", cursor:"pointer", fontSize:"12px", fontFamily:"inherit" }}>
                                        ✗ رفض
                                      </button>
                                      <button onClick={() => { setMgrEditForm({ id:req.id, empName:req.employee_name, days:req.days, start_date:req.start_date, reason:"", oldDays:req.days }); setShowManagerEditModal(true); }}
                                        style={{ padding:"6px 10px", background:"#f5f3ff", border:"1px solid #e0e7ff", borderRadius:"8px", cursor:"pointer", fontSize:"11px", color:"#6d28d9", fontFamily:"inherit" }}>
                                        ✏️
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                  {isDeptMgr && filteredRequests.filter(r => r.status === "pending").length === 0 && (
                    <div style={{ padding:"32px", textAlign:"center", background:"white", borderRadius:"20px", border:"1px dashed #e2e8f0", color:"#94a3b8", fontWeight:"700" }}>
                      لا توجد طلبات معلقة ✅
                    </div>
                  )}

                  {/* Owner: جميع الطلبات المعلقة - موافقة مباشرة بدون مرحلتين */}
                  {isOwner && filteredRequests.filter(r => r.status === "pending" || r.status === "dept_approved").length > 0 && (
                    <>
                      <h3 className="font-black text-lg text-emerald-600">
                        طلبات تحتاج موافقتك ({filteredRequests.filter(r => r.status === "pending" || r.status === "dept_approved").length})
                      </h3>
                       <div style={{ background:"white", borderRadius:"20px", border:"1px solid #e2e8f0", overflowX:"auto" }}>
                        <table style={{ width:"100%", borderCollapse:"collapse", border:"2px solid #94a3b8", fontSize:"13px", backgroundColor:"#ffffff" }}>
                          <thead>
                            <tr style={{ background:"linear-gradient(135deg, #f0fdf4, #dcfce7)", borderBottom:"2px solid #bbf7d0" }}>
                              <SortTh label="الموظف"    field="name"     align="right"  sortField={reqSortField} sortDir={reqSortDir} sortDropdown={reqSortDropdown} onSort={(f,d)=>{setReqSortField(f);setReqSortDir(d);setReqSortDropdown("");}} onClear={()=>{setReqSortField("");setReqSortDropdown("");}} onToggle={f=>setReqSortDropdown(d=>d===f?"":f)} />
                              <SortTh label="النوع"     field="type"     align="center" sortField={reqSortField} sortDir={reqSortDir} sortDropdown={reqSortDropdown} onSort={(f,d)=>{setReqSortField(f);setReqSortDir(d);setReqSortDropdown("");}} onClear={()=>{setReqSortField("");setReqSortDropdown("");}} onToggle={f=>setReqSortDropdown(d=>d===f?"":f)} />
                              <SortTh label="القسم"     field="dept"     align="center" sortField={reqSortField} sortDir={reqSortDir} sortDropdown={reqSortDropdown} onSort={(f,d)=>{setReqSortField(f);setReqSortDir(d);setReqSortDropdown("");}} onClear={()=>{setReqSortField("");setReqSortDropdown("");}} onToggle={f=>setReqSortDropdown(d=>d===f?"":f)} />
                              <SortTh label="البداية"   field="start"    align="center" sortField={reqSortField} sortDir={reqSortDir} sortDropdown={reqSortDropdown} onSort={(f,d)=>{setReqSortField(f);setReqSortDir(d);setReqSortDropdown("");}} onClear={()=>{setReqSortField("");setReqSortDropdown("");}} onToggle={f=>setReqSortDropdown(d=>d===f?"":f)} />
                              <SortTh label="نهاية الإجازة" field="end" align="center" sortField={reqSortField} sortDir={reqSortDir} sortDropdown={reqSortDropdown} onSort={(f,d)=>{setReqSortField(f);setReqSortDir(d);setReqSortDropdown("");}} onClear={()=>{setReqSortField("");setReqSortDropdown("");}} onToggle={f=>setReqSortDropdown(d=>d===f?"":f)} />
                              <SortTh label="الأيام"    field="days"     align="center" sortField={reqSortField} sortDir={reqSortDir} sortDropdown={reqSortDropdown} onSort={(f,d)=>{setReqSortField(f);setReqSortDir(d);setReqSortDropdown("");}} onClear={()=>{setReqSortField("");setReqSortDropdown("");}} onToggle={f=>setReqSortDropdown(d=>d===f?"":f)} />
                              <SortTh label="أيام العمل" field="workdays" align="center" sortField={reqSortField} sortDir={reqSortDir} sortDropdown={reqSortDropdown} onSort={(f,d)=>{setReqSortField(f);setReqSortDir(d);setReqSortDropdown("");}} onClear={()=>{setReqSortField("");setReqSortDropdown("");}} onToggle={f=>setReqSortDropdown(d=>d===f?"":f)} />
                              <SortTh label="الحالة"    field="status"   align="center" sortField={reqSortField} sortDir={reqSortDir} sortDropdown={reqSortDropdown} onSort={(f,d)=>{setReqSortField(f);setReqSortDir(d);setReqSortDropdown("");}} onClear={()=>{setReqSortField("");setReqSortDropdown("");}} onToggle={f=>setReqSortDropdown(d=>d===f?"":f)} />
                              <th style={{ border:"1px solid #94a3b8", padding:"12px 8px", backgroundColor:"#4f46e5", color:"white", fontWeight:"900", textAlign:"center" }}>الإجراءات</th>
                            </tr>
                          </thead>
                          <tbody>
                        {filteredRequests.filter(r => r.status === "pending" || r.status === "dept_approved").map((req, idx) => {
                          const vacType = vacationTypes.find((vt:any) => vt.id === req.vacation_type_id);
                          const emp = employees.find((e:any) => e.id === req.employee_id);
                          const dept = departments.find((d:any) => d.id === emp?.department_id);
                          const { end } = getCalculatedDates(req.start_date, req.days);
                          const isDeptApp = req.status === "dept_approved";
                          return (
                            <tr key={req.id}
                              style={{ borderBottom:"1px solid #f1f5f9", background: isDeptApp ? "#faf5ff" : (idx%2===0 ? "white" : "#fafafa") }}
                              onMouseEnter={e=>(e.currentTarget.style.background="#f0fdf4")}
                              onMouseLeave={e=>(e.currentTarget.style.background= isDeptApp ? "#faf5ff" : (idx%2===0 ? "white" : "#fafafa"))}>
                              {/* الموظف */}
                              <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>
                                <button onClick={() => { setEmpInfoTarget({...emp, req}); setShowEmpInfoModal(true); }}
                                  style={{ background:"none", border:"none", padding:0, cursor:"pointer", textAlign:"right" }}>
                                  <div style={{ fontWeight:"800", color:"#1e293b", fontSize:"13px" }}>{req.employee_name}</div>
                                  {isDeptApp && <div style={{ fontSize:"10px", color:"#7c3aed", fontWeight:"700", marginTop:"2px" }}>◑ موافقة قسم</div>}
                                  {emp?.email && <div style={{ fontSize:"10px", color:"#94a3b8" }}>{emp.email}</div>}
                                </button>
                              </td>
                              {/* النوع */}
                              <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>
                                {vacType && <span style={{ padding:"3px 10px", borderRadius:"20px", fontSize:"11px", fontWeight:"700", background: (vacType as any).color+"22", color:(vacType as any).color }}>{(vacType as any).name}</span>}
                              </td>
                              {/* القسم */}
                              <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>{dept?.name||"-"}</td>
                              {/* البداية */}
                              <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>{formatDate(req.start_date)}</td>
                              {/* نهاية الإجازة */}
                              <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>{formatDate(end)}</td>
                              {/* الأيام */}
                              <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>
                                <span style={{ fontWeight:"900", color:"#059669", fontSize:"14px" }}>{req.days}</span>
                                <span style={{ fontSize:"10px", color:"#94a3b8" }}> يوم</span>
                              </td>
                              {/* أيام العمل من العودة للنزول */}
                              <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>
                                {(() => {
                                  const holidayDates = publicHolidays.map(h => h.date);
                                  const days = calculateWorkDaysBetween(emp?.return_date || "", req.start_date, holidayDates);
                                  return days > 0 ? days : "-";
                                })()}
                              </td>
                              {/* الحالة / ملاحظات */}
                              <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>
                                {req.notes && <div style={{ fontSize:"11px", color:"#64748b", fontStyle:"italic", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"100px" }} title={req.notes}>"{req.notes}"</div>}
                              </td>
                              {/* الإجراءات */}
                              <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>
                                <div style={{ display:"flex", gap:"6px", justifyContent:"center", flexWrap:"nowrap" }}>
                                  <button onClick={() => openApprovalModal(req, "approved")}
                                    style={{ padding:"6px 14px", background:"linear-gradient(135deg, #059669, #16a34a)", color:"white", border:"none", borderRadius:"8px", fontWeight:"800", cursor:"pointer", fontSize:"12px", fontFamily:"inherit", whiteSpace:"nowrap" }}>
                                    ✓ موافقة
                                  </button>
                                  <button onClick={() => openApprovalModal(req, "rejected")}
                                    style={{ padding:"6px 14px", background:"#fee2e2", color:"#dc2626", border:"none", borderRadius:"8px", fontWeight:"800", cursor:"pointer", fontSize:"12px", fontFamily:"inherit", whiteSpace:"nowrap" }}>
                                    ✗ رفض
                                  </button>
                                  <button onClick={() => { setMgrEditForm({ id:req.id, empName:req.employee_name, start_date:req.start_date, days:req.days, reason:req.notes||"", oldDays:req.days }); setShowManagerEditModal(true); }}
                                    style={{ padding:"6px 10px", background:"#f5f3ff", border:"1px solid #e0e7ff", borderRadius:"8px", cursor:"pointer", fontSize:"11px", color:"#6d28d9", fontFamily:"inherit" }}>
                                    ✏️
                                  </button>
                                  <button onClick={() => handleDeleteVacation(req.id)}
                                    style={{ padding:"6px 10px", background:"#fff1f2", border:"none", borderRadius:"8px", cursor:"pointer", fontSize:"11px", color:"#dc2626" }}>
                                    🗑️
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                          </tbody>
                        </table>
                       </div>
                    </>
                  )}
                </div>
              )}

              {/* ===== CALENDAR ===== */}
              {activeTab === "calendar" && isOwner && (
                <div style={{ width:"100%", boxSizing:"border-box" }} className="space-y-6">
                  <h2 className="text-2xl font-black">التقويم الشهري</h2>
                  {renderCalendar()}
                </div>
              )}

              {/* ===== REPORTS ===== */}
              {activeTab === "reports" && isOwner && (
                <div style={{ width:"100%", boxSizing:"border-box" }} className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-black">التقارير والإحصائيات</h2>
                    <button onClick={exportDetailedReport} className="bg-emerald-600 text-white px-6 py-3 rounded-2xl flex items-center gap-2 font-bold shadow-lg"><Download size={20} /> تصدير التقرير الشامل</button>
                  </div>
                  {vacationByDepartment.length > 0 && (
                    <div className="bg-white p-6 rounded-[2rem] shadow-sm border">
                      <h4 className="font-black mb-4 flex items-center gap-2"><Building2 size={20} className="text-indigo-600" /> إحصائيات الأقسام</h4>
                      <div className="grid grid-cols-3 gap-4">
                        {vacationByDepartment.map(dept => (
                          <div key={dept.name} className="p-4 bg-slate-50 rounded-xl">
                            <h5 className="font-bold text-slate-800 mb-2">{dept.name}</h5>
                            <div className="space-y-1 text-sm">
                              <div className="flex justify-between"><span className="text-slate-500">عدد الموظفين:</span><span className="font-bold">{dept.employees}</span></div>
                              <div className="flex justify-between"><span className="text-slate-500">عدد الإجازات:</span><span className="font-bold">{dept.count}</span></div>
                              <div className="flex justify-between"><span className="text-slate-500">إجمالي الأيام:</span><span className="font-bold text-indigo-600">{dept.days}</span></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="bg-white p-6 rounded-[2rem] shadow-sm border">
                    <h4 className="font-black mb-4 flex items-center gap-2"><AlertCircle size={20} className="text-amber-600" /> تحذير: رصيد منخفض</h4>
                    <div className="grid grid-cols-5 gap-3">
                      {lowBalances.map(emp => (
                        <div key={emp.id} className="p-3 bg-amber-50 rounded-xl text-center border border-amber-100">
                          <p className="font-bold text-sm mb-1">{emp.name}</p>
                          <p className="text-2xl font-black text-amber-600">{emp.balance}</p>
                          <p className="text-xs text-amber-600">يوم متبقي</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ===== DEPARTMENTS ===== */}
              {activeTab === "departments" && isOwner && (
                <div style={{ width:"100%", boxSizing:"border-box" }} className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-black">إدارة الأقسام</h2>
                    <button onClick={() => setShowAddDept(true)} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl flex items-center gap-2 font-bold"><Plus size={20} /> إضافة قسم</button>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(250px, 1fr))", gap:"16px" }}>
                    {departments.map(dept => {
                      const deptEmps = employees.filter(e => e.department_id === dept.id);
                      return (
                        <div key={dept.id} className="bg-white p-6 rounded-[2rem] shadow-sm border">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <h4 className="font-black text-lg">{dept.name}</h4>
                              <p className="text-sm text-slate-500">{dept.description || "لا يوجد وصف"}</p>
                            </div>
                            <button onClick={() => deleteDepartment(dept.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-xl"><Trash2 size={16} /></button>
                          </div>
                          <div className="flex items-center gap-2 text-slate-600"><Users size={16} /><span className="font-bold">{deptEmps.length} موظف</span></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ===== HOLIDAYS ===== */}
              {activeTab === "holidays" && isOwner && (
                <div style={{ width:"100%", boxSizing:"border-box" }} className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-black">العطلات الرسمية</h2>
                    <button onClick={() => setShowAddHoliday(true)} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl flex items-center gap-2 font-bold"><Plus size={20} /> إضافة عطلة</button>
                  </div>
                  {/* فلترة بالتاريخ */}
                  <div style={{ background:"white", borderRadius:"16px", padding:"12px 16px", border:"1px solid #e2e8f0", display:"flex", gap:"10px", flexWrap:"wrap", alignItems:"center" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                      <label style={{ fontSize:"12px", color:"#64748b", fontWeight:"600", whiteSpace:"nowrap" }}>من:</label>
                      <input type="date" style={{ padding:"9px 10px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:"10px", fontSize:"12px", outline:"none" }}
                        value={holidayDateFrom} onChange={e => setHolidayDateFrom(e.target.value)} />
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                      <label style={{ fontSize:"12px", color:"#64748b", fontWeight:"600", whiteSpace:"nowrap" }}>إلى:</label>
                      <input type="date" style={{ padding:"9px 10px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:"10px", fontSize:"12px", outline:"none" }}
                        value={holidayDateTo} onChange={e => setHolidayDateTo(e.target.value)} />
                    </div>
                    {(holidayDateFrom || holidayDateTo) && (
                      <button onClick={() => { setHolidayDateFrom(""); setHolidayDateTo(""); }}
                        style={{ padding:"9px 14px", background:"#fee2e2", color:"#dc2626", border:"none", borderRadius:"10px", fontSize:"12px", fontWeight:"700", cursor:"pointer" }}>
                        ✕ مسح
                      </button>
                    )}
                    <span style={{ fontSize:"12px", color:"#64748b", marginRight:"auto" }}>
                      {publicHolidays.filter(h => (!holidayDateFrom || h.date >= holidayDateFrom) && (!holidayDateTo || h.date <= holidayDateTo)).length} عطلة
                    </span>
                  </div>
                  <div className="bg-white rounded-[2rem] shadow-sm border overflow-x-auto">
                    <table className="w-full" style={{ width:"100%", borderCollapse:"collapse", border:"2px solid #94a3b8", fontSize:"13px", backgroundColor:"#ffffff" }}>
                      <thead className="bg-slate-50 border-b">
                        <tr>
                          <th className="p-4 text-right">اسم العطلة</th>
                          <th className="p-4 text-center">التاريخ</th>
                          <th className="p-4 text-center">متكررة سنوياً</th>
                          <th className="p-4 text-center">إجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {publicHolidays.filter(h => (!holidayDateFrom || h.date >= holidayDateFrom) && (!holidayDateTo || h.date <= holidayDateTo)).map(holiday => (
                          <tr key={holiday.id} style={{ border:"1px solid #cbd5e1", backgroundColor:"#ffffff" }} className="hover:bg-slate-50">
                            <td className="p-4 font-bold">{holiday.name}</td>
                            <td className="p-4 text-center">{formatDate(holiday.date)}</td>
                            <td className="p-4 text-center">{holiday.is_recurring ? <CheckCircle size={18} className="text-green-600 mx-auto" /> : <X size={18} className="text-slate-300 mx-auto" />}</td>
                            <td className="p-4 text-center"><button onClick={() => deleteHoliday(holiday.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-xl"><Trash2 size={16} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ===== MANAGERS ===== */}
              {/* ===== ACTIVE VACATIONS ===== */}
              {activeTab === "active_vacations" && (() => {
                // ===== بناء قائمة الإجازات الفعلية من مصدرين =====
                // 1. موظفون حالتهم "إجازة" في DB (سواء يدوي أو بطلب)
                const empOnVac = (isDeptMgr
                  ? employees.filter(e => myDeptIds.includes(String(e.department_id)))
                  : employees
                ).filter(e => e.status === "إجازة");

                // 2. لكل موظف في إجازة، نجيب آخر طلب approved له لو وجد
                const vacRows = empOnVac.map(emp => {
                  const lastReq = requests
                    .filter(r => r.employee_id === emp.id && r.status === "approved")
                    .sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
                  const dept = departments.find(d => d.id === emp.department_id);
                  const vacType = lastReq ? vacationTypes.find(vt => vt.id === lastReq.vacation_type_id) : null;
                  const calcDates = lastReq ? getCalculatedDates(lastReq.start_date, lastReq.days) : { end: "", back: "" };
                  const back = lastReq ? calcDates.back : (emp.return_date || "");
                  const end = lastReq ? calcDates.end : (emp.return_date || "");
                  const today = new Date().toISOString().split("T")[0];
                  const daysLeft = back ? Math.ceil((new Date(back).getTime() - new Date(today).getTime()) / 86400000) : null;
                  return { emp, lastReq, dept, vacType, back, end, daysLeft, source: lastReq ? "طلب" : "يدوي" };
                });

                // فلترة بحث وقسم
                const filtered = vacRows.filter(row => {
                  const matchSearch = !vacSearch2 || row.emp.name?.includes(vacSearch2) || (row.emp.code||"").includes(vacSearch2);
                  const matchDept = vacDeptFilter2 === "all" || row.emp.department_id === vacDeptFilter2;
                  const matchType = !vacTypeFilter2 || vacTypeFilter2 === "all" || row.lastReq?.vacation_type_id === vacTypeFilter2;
                  const matchDateFrom = !activeVacDateFrom || (row.lastReq?.start_date || "") >= activeVacDateFrom;
                  const matchDateTo = !activeVacDateTo || (row.lastReq?.start_date || "") <= activeVacDateTo;
                  return matchSearch && matchDept && matchType && matchDateFrom && matchDateTo;
                }).sort((a, b) => {
                  let va: any = "", vb: any = "";
                  if (activeVacSortField === "back"  || activeVacSortField === "") { va = a.back || ""; vb = b.back || ""; }
                  else if (activeVacSortField === "start") { va = a.lastReq?.start_date || ""; vb = b.lastReq?.start_date || ""; }
                  else if (activeVacSortField === "name")  { va = a.emp.name || ""; vb = b.emp.name || ""; }
                  else if (activeVacSortField === "days")  { va = Number(a.lastReq?.days || 0); vb = Number(b.lastReq?.days || 0); }
                  if (typeof va === "number") return activeVacSortDir === "desc" ? vb - va : va - vb;
                  return activeVacSortDir === "desc" ? vb.localeCompare(va, "ar") : va.localeCompare(vb, "ar");
                });

                const exportActiveToExcel = () => {
                  const data = filtered.map(row => {
                    return {
                      "اسم الموظف": row.emp.name,
                      "الكود الوظيفي": row.emp.code || "",
                      "القسم": row.dept?.name || "",
                      "نوع الإجازة": (row.vacType as any)?.name || "غير محدد",
                      "تاريخ البداية": row.lastReq?.start_date || "",
                      "عدد الأيام": row.lastReq?.days || "",
                      "تاريخ العودة المتوقع": row.back || "",
                      "الرصيد المتبقي": row.emp.balance,
                      "المصدر": row.source,
                      "ملاحظات": row.lastReq?.notes || "",
                    };
                  });
                  const ws = XLSX.utils.json_to_sheet(data);
                  ws["!cols"] = [{ wch:22 },{ wch:12 },{ wch:18 },{ wch:16 },{ wch:14 },{ wch:10 },{ wch:16 },{ wch:12 },{ wch:10 },{ wch:24 }];
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, "الإجازات الفعلية");
                  XLSX.writeFile(wb, `الإجازات-الفعلية-${new Date().toISOString().split("T")[0]}.xlsx`);
                };

                // ===== تصدير القالب الرسمي (بيان اجازات يومي - لينا) =====
                const exportLinahTemplate = () => {
                  const wb = XLSX.utils.book_new();
                  const todayStr = new Date().toLocaleDateString("ar-EG", { year:"numeric", month:"2-digit", day:"2-digit" });

                  // ---- بناء البيانات بالتنسيق الرسمي ----
                  // الصف 1: عنوان + تاريخ
                  // الصف 2: رؤوس الأعمدة
                  // الصف 3+: بيانات
                  // آخر صف: توقيعات

                  const headers = ["م","الكود","اسم الموظف","الوظيفه","رصيد الاجازات","تاريخ بدايه الاجازة","تاريخ نهايه الاجازة","مدة الاجازة","نوع الاجازة","تسجيل اودوو"];
                  const rows: any[][] = filtered.map((row, idx) => {
                    const endDate = row.end ? row.end : "";
                    return [
                      idx + 1,
                      row.emp.code || "",
                      row.emp.name || "",
                      row.emp.position || "",
                      row.emp.balance ?? "",
                      row.lastReq?.start_date ? new Date(row.lastReq.start_date).toLocaleDateString("ar-EG") : "",
                      endDate ? new Date(endDate).toLocaleDateString("ar-EG") : "",
                      row.lastReq?.days ? `${row.lastReq.days} يوم` : "",
                      (row.vacType as any)?.name || "",
                      "",  // تسجيل اودوو - فارغ للتعبئة
                    ];
                  });

                  // ضمان 10 صفوف على الأقل في الجدول
                  while (rows.length < 10) {
                    rows.push([rows.length + 1, "", "", "", "", "", "", "", "", ""]);
                  }

                  // بناء الـ worksheet يدوياً عبر aoa (array of arrays)
                  const aoaData: any[][] = [
                    // الصف 1: عنوان
                    ["شركة لينا السياحية والتطوير العمراني", "", `بيان اجازات يومي قسم : الإدارة الفنية`, "", "", "", "", "", `تاريخ اليوم: ${todayStr}`, ""],
                    // الصف 2: رؤوس الأعمدة
                    headers,
                    // الصفوف 3+: البيانات
                    ...rows,
                    // صف التوقيعات
                    ["مدير القسم/", "", "", "شئون العاملين/", "", "", "", "اعتماد نهائي/", "", ""],
                  ];

                  const ws: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet(aoaData, { cellDates: false });

                  // ---- عرض الأعمدة ----
                  ws["!cols"] = [
                    { wch: 5  },  // م
                    { wch: 12 },  // الكود
                    { wch: 28 },  // اسم الموظف
                    { wch: 22 },  // الوظيفه
                    { wch: 14 },  // رصيد الاجازات
                    { wch: 20 },  // تاريخ البداية
                    { wch: 20 },  // تاريخ النهاية
                    { wch: 12 },  // مدة الاجازة
                    { wch: 18 },  // نوع الاجازة
                    { wch: 16 },  // تسجيل اودوو
                  ];

                  // ---- دمج خلايا العنوان ----
                  ws["!merges"] = [
                    { s:{r:0,c:0}, e:{r:0,c:1} },   // لينا (عنوان الشركة)
                    { s:{r:0,c:2}, e:{r:0,c:7} },   // بيان اجازات يومي
                    { s:{r:0,c:8}, e:{r:0,c:9} },   // تاريخ اليوم
                    // صف التوقيعات
                    { s:{r:aoaData.length-1,c:0}, e:{r:aoaData.length-1,c:2} },
                    { s:{r:aoaData.length-1,c:3}, e:{r:aoaData.length-1,c:6} },
                    { s:{r:aoaData.length-1,c:7}, e:{r:aoaData.length-1,c:9} },
                  ];

                  // ---- تنسيق الخلايا ----
                  const orange = "F4B36A";
                  const totalRows = aoaData.length;
                  const totalCols = 10;

                  for (let r = 0; r < totalRows; r++) {
                    for (let c = 0; c < totalCols; c++) {
                      const addr = XLSX.utils.encode_cell({r, c});
                      if (!ws[addr]) ws[addr] = { t:"s", v:"" };
                      const cell = ws[addr];

                      // تنسيق مشترك
                      cell.s = {
                        alignment: { horizontal:"center", vertical:"center", wrapText:true, readingOrder:2 },
                        font: { name:"Arial", sz:10, color:{rgb:"000000"} },
                        border: {
                          top: { style:"thin", color:{rgb:"AAAAAA"} },
                          bottom: { style:"thin", color:{rgb:"AAAAAA"} },
                          left: { style:"thin", color:{rgb:"AAAAAA"} },
                          right: { style:"thin", color:{rgb:"AAAAAA"} },
                        },
                      };

                      // صف العنوان (الصف 0)
                      if (r === 0) {
                        cell.s.font = { name:"Arial", sz:14, bold:true, color:{rgb:"1B2A87"} };
                        cell.s.fill = { patternType:"solid", fgColor:{rgb:"FFFFFF"} };
                        if (c === 2) {
                          cell.s.font = { name:"Arial", sz:14, bold:true, color:{rgb:"000000"} };
                        }
                      }
                      // صف الرؤوس (الصف 1)
                      else if (r === 1) {
                        cell.s.fill = { patternType:"solid", fgColor:{rgb:orange} };
                        cell.s.font = { name:"Arial", sz:10, bold:true, color:{rgb:"000000"} };
                        cell.s.border = {
                          top:    { style:"medium", color:{rgb:"888888"} },
                          bottom: { style:"medium", color:{rgb:"888888"} },
                          left:   { style:"medium", color:{rgb:"888888"} },
                          right:  { style:"medium", color:{rgb:"888888"} },
                        };
                      }
                      // صفوف البيانات
                      else if (r >= 2 && r < totalRows - 1) {
                        // عمود م (c===0) برتقالي
                        if (c === 0) {
                          cell.s.fill = { patternType:"solid", fgColor:{rgb:orange} };
                          cell.s.font = { name:"Arial", sz:10, bold:true, color:{rgb:"000000"} };
                        } else {
                          cell.s.fill = { patternType:"solid", fgColor:{rgb:"FFFFFF"} };
                        }
                      }
                      // صف التوقيعات
                      else if (r === totalRows - 1) {
                        cell.s.font = { name:"Arial", sz:11, bold:true, color:{rgb:"000000"} };
                        cell.s.fill = { patternType:"solid", fgColor:{rgb:"FFFFFF"} };
                      }
                    }
                  }

                  // ---- ارتفاعات الصفوف ----
                  ws["!rows"] = [
                    { hpx: 52 },  // صف العنوان
                    { hpx: 36 },  // صف الرؤوس
                    ...Array(rows.length).fill({ hpx: 26 }),
                    { hpx: 30 },  // صف التوقيعات
                  ];

                  // ---- إعدادات الطباعة ----
                  ws["!pageSetup"] = { orientation:"landscape", paperSize:9, fitToPage:true, fitToWidth:1, fitToHeight:0 };
                  ws["!printArea"] = `A1:J${totalRows}`;

                  XLSX.utils.book_append_sheet(wb, ws, "بيان اجازات يومي");
                  XLSX.writeFile(wb, `بيان-اجازات-يومي-${new Date().toISOString().split("T")[0]}.xlsx`);
                };

                const buildLinahTemplateHTML = (selectedRows: any[]) => {
                  const todayStr = new Date().toLocaleDateString("ar-EG", { year:"numeric", month:"2-digit", day:"2-digit" });
                  const dataRows = [...selectedRows];
                  while (dataRows.length < 10) dataRows.push(null as any);

                  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8"/>
<title>بيان اجازات يومي</title>
<style>
  @page { size:A4 portrait; margin:8mm; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Segoe UI', Arial, sans-serif; direction:rtl; background:#fff; padding:0; margin:0; }
  
  .container { width:100%; padding:0; }
  
  /* صف الشركة والعنوان والتاريخ */
  .header-top { display:flex; border:1px solid #333; }
  
  .logo-section { flex:0 0 240px; background:#fff; display:flex; align-items:center; justify-content:center; border-left:1px solid #333; padding:6px; }
  .logo-section-content { text-align:center; }
  .logo-section-content .company-name { font-size:13px; font-weight:bold; color:#1B3B7F; line-height:1.2; }
  .logo-section-content .company-desc { font-size:7px; color:#666; }
  
  .title-section { flex:1; display:flex; align-items:center; justify-content:center; padding:8px; border-left:1px solid #333; }
  .title-section h1 { font-size:14px; font-weight:bold; color:#000; text-align:center; line-height:1.4; }
  
  .date-section { flex:0 0 140px; display:flex; align-items:center; justify-content:center; padding:8px; }
  .date-section .label { font-size:11px; font-weight:bold; }
  
  /* الجدول */
  table { width:100%; border-collapse:collapse; margin:0; border:1px solid #333; }
  thead { background:#F4B36A; }
  th { padding:6px 3px; border:1px solid #333; font-weight:bold; font-size:9px; text-align:center; color:#000; }
  td { padding:5px 3px; border:1px solid #333; text-align:center; font-size:9px; }
  tbody tr { border:1px solid #333; }
  tbody td { border:1px solid #333; }
  
  .col-num { background:#F4B36A; font-weight:bold; width:4%; }
  .col-code { width:8%; }
  .col-name { width:18%; text-align:right; padding-right:6px; }
  .col-position { width:14%; }
  .col-balance { width:8%; font-weight:bold; }
  .col-date { width:10%; }
  .col-date-end { width:10%; }
  .col-days { width:6%; }
  .col-type { width:12%; }
  .col-record { width:10%; }
  
  tfoot { border:none; }
  tfoot td { padding:16px 6px; font-weight:bold; font-size:10px; border:none; }
  
  @media print {
    body { margin:0; padding:0; }
  }
</style>
</head>
<body>
<div class="container">
  <!-- صف العنوان والتاريخ -->
  <div class="header-top">
    <div class="logo-section">
      <div class="logo-section-content">
        <div class="company-name">شركة لينة للتنمية السياحية والعمرانية</div>
        <div class="company-desc">LINAH TOURISTIC & URBAN DEVELOPMENT</div>
      </div>
    </div>
    <div class="title-section">
      <h1>بيان اجازات يومي قسم : الإدارة الفنية</h1>
    </div>
    <div class="date-section">
      <div class="label">تاريخ اليوم: ${todayStr}</div>
    </div>
  </div>

  <!-- جدول البيانات -->
  <table>
    <thead>
      <tr>
        <th class="col-num">م</th>
        <th class="col-code">الكود</th>
        <th class="col-name">اسم الموظف</th>
        <th class="col-position">الوظيفه</th>
        <th class="col-balance">رصيد الاجازات</th>
        <th class="col-date">تاريخ بدايه الاجازة</th>
        <th class="col-date-end">تاريخ نهايه الاجازة</th>
        <th class="col-days">مدة الاجازة</th>
        <th class="col-type">نوع الاجازة</th>
        <th class="col-record">تسجيل اودوو</th>
      </tr>
    </thead>
    <tbody>
      ${dataRows.map((row, i) => {
        const originalBalance = row ? Math.round((row.emp?.balance || 0) + (row.lastReq?.days || 0)) : "";
        return `
      <tr>
        <td class="col-num">${i+1}</td>
        <td class="col-code">${row?.emp?.code||""}</td>
        <td class="col-name">${row?.emp?.name||""}</td>
        <td class="col-position">${row?.emp?.position||""}</td>
        <td class="col-balance">${originalBalance}</td>
        <td class="col-date">${row?.lastReq?.start_date ? new Date(row.lastReq.start_date).toLocaleDateString("ar-EG") : ""}</td>
        <td class="col-date-end">${row?.end ? new Date(row.end).toLocaleDateString("ar-EG") : ""}</td>
        <td class="col-days">${row?.lastReq?.days ? row.lastReq.days : ""}</td>
        <td class="col-type">${row?.vacType?.name||""}</td>
        <td class="col-record"></td>
      </tr>`;
      }).join("")}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="10" style="padding:25px 6px; text-align:center; border:none;">
          <div style="display:flex; justify-content:space-around; font-size:10px; font-weight:bold;">
            <div>مدير القسم/</div>
            <div>شئون العاملين/</div>
            <div>اعتماد نهائي/</div>
          </div>
        </td>
      </tr>
    </tfoot>
  </table>
</div>
</body>
</html>`;
                };

                const printLinahTemplate = () => {
                  // إذا ما اختار حد، طبع كل الموجودين
                  const selectedRows = selectedPrintIds.size > 0
                    ? filtered.filter(f => selectedPrintIds.has(f.emp.id))
                    : filtered;

                  if (selectedRows.length === 0) {
                    alert("⚠️ اختر موظفين للطباعة أولاً");
                    return;
                  }

                  printHTMLContent(buildLinahTemplateHTML(selectedRows));
                };

                // ===== تصدير المحدد كملف PDF =====
                const exportLinahTemplatePDF = () => {
                  const selectedRows = selectedPrintIds.size > 0
                    ? filtered.filter(f => selectedPrintIds.has(f.emp.id))
                    : filtered;

                  if (selectedRows.length === 0) {
                    alert("⚠️ اختر موظفين للتصدير أولاً");
                    return;
                  }

                  exportHTMLToPDF(
                    buildLinahTemplateHTML(selectedRows),
                    `بيان-اجازات-يومي-${new Date().toISOString().split("T")[0]}`
                  );
                };

                // ===== مشاركة القالب =====
                const shareLinahTemplate = async () => {
                  const todayStr = new Date().toLocaleDateString("ar-EG", { year:"numeric", month:"2-digit", day:"2-digit" });
                  const shareText = `📋 بيان اجازات يومي - ${todayStr}\n\n` +
                    filtered.map((row, i) => `${i+1}. ${row.emp.name} | ${(row.vacType as any)?.name||"إجازة"} | ${row.lastReq?.start_date||""} ← ${row.end||""} | ${row.lastReq?.days||""} يوم`).join("\n") +
                    `\n\nإجمالي: ${filtered.length} موظف في إجازة`;
                  if (navigator.share) {
                    try { await navigator.share({ title:"بيان اجازات يومي", text:shareText }); } catch {}
                  } else {
                    navigator.clipboard.writeText(shareText).then(() => alert("✅ تم نسخ البيان — الصقه في أي تطبيق مشاركة"));
                  }
                };


                return (
                  <div className="space-y-5">
                    {/* Header */}
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:"12px" }}>
                      <div>
                        <h2 style={{ margin:0, fontSize:"22px", fontWeight:"900" }}>🏖️ الإجازات الفعلية</h2>
                        <p style={{ margin:"4px 0 0", color:"#64748b", fontSize:"13px" }}>
                          الموظفون في إجازة حالياً — من طلبات أو تغيير يدوي
                        </p>
                      </div>
                      <div style={{ display:"flex", gap:"10px", flexWrap:"wrap", alignItems:"center" }}>
                        {/* أزرار الاختيار */}
                        {filtered.length > 0 && (
                          <div style={{ display:"flex", gap:"8px" }}>
                            <button onClick={() => setSelectedPrintIds(new Set(filtered.map(f => f.emp.id)))}
                              style={{ display:"flex", alignItems:"center", gap:"6px", padding:"10px 14px", background:"#f0f4ff", color:"#4f46e5", border:"1px solid #4f46e5", borderRadius:"12px", fontWeight:"700", cursor:"pointer", fontSize:"12px", fontFamily:"inherit" }}>
                              ✓ اختر الكل ({filtered.length})
                            </button>
                            <button onClick={() => setSelectedPrintIds(new Set())}
                              style={{ display:"flex", alignItems:"center", gap:"6px", padding:"10px 14px", background:"#fff5f5", color:"#dc2626", border:"1px solid #dc2626", borderRadius:"12px", fontWeight:"700", cursor:"pointer", fontSize:"12px", fontFamily:"inherit" }}>
                              ✕ إلغاء الاختيار
                            </button>
                            {selectedPrintIds.size > 0 && (
                              <span style={{ fontSize:"12px", color:"#64748b", fontWeight:"600", paddingLeft:"8px", borderLeft:"1px solid #e2e8f0" }}>
                                {selectedPrintIds.size} مختار
                              </span>
                            )}
                          </div>
                        )}
                        {/* الأزرار الأصلية */}
                        <button onClick={exportActiveToExcel}
                          style={{ display:"flex", alignItems:"center", gap:"6px", padding:"10px 16px", background:"linear-gradient(135deg, #059669, #16a34a)", color:"white", border:"none", borderRadius:"12px", fontWeight:"700", cursor:"pointer", fontSize:"13px", fontFamily:"inherit" }}>
                          <FileDown size={16}/> تصدير الإجازات الحالية
                        </button>
                        {/* ===== زر القالب الرسمي (بيان اجازات يومي - لينا) ===== */}
                        <button onClick={exportLinahTemplate}
                          style={{ display:"flex", alignItems:"center", gap:"6px", padding:"10px 16px", background:"linear-gradient(135deg, #F4B36A, #e69320)", color:"white", border:"none", borderRadius:"12px", fontWeight:"700", cursor:"pointer", fontSize:"13px", fontFamily:"inherit" }}
                          title="تصدير القالب الرسمي بتنسيق بيان اجازات يومي">
                          <FileDown size={16}/> 📋 القالب الرسمي
                        </button>
                        {/* ===== زر الطباعة ===== */}
                        <button onClick={printLinahTemplate}
                          style={{ display:"flex", alignItems:"center", gap:"6px", padding:"10px 16px", background:"linear-gradient(135deg, #4f46e5, #7c3aed)", color:"white", border:"none", borderRadius:"12px", fontWeight:"700", cursor:"pointer", fontSize:"13px", fontFamily:"inherit" }}
                          title="طباعة القالب الرسمي">
                          <Printer size={16}/> طباعة
                        </button>
                        {/* ===== زر تصدير المحدد PDF ===== */}
                        <button onClick={exportLinahTemplatePDF}
                          style={{ display:"flex", alignItems:"center", gap:"6px", padding:"10px 16px", background:"linear-gradient(135deg, #dc2626, #b91c1c)", color:"white", border:"none", borderRadius:"12px", fontWeight:"700", cursor:"pointer", fontSize:"13px", fontFamily:"inherit" }}
                          title="تصدير المحدد كملف PDF">
                          <FileDown size={16}/> {selectedPrintIds.size > 0 ? `PDF (${selectedPrintIds.size})` : "تصدير PDF"}
                        </button>
                        {/* ===== زر المشاركة ===== */}
                        <button onClick={shareLinahTemplate}
                          style={{ display:"flex", alignItems:"center", gap:"6px", padding:"10px 16px", background:"linear-gradient(135deg, #0ea5e9, #0284c7)", color:"white", border:"none", borderRadius:"12px", fontWeight:"700", cursor:"pointer", fontSize:"13px", fontFamily:"inherit" }}
                          title="مشاركة البيان">
                          <Share2 size={16}/> مشاركة
                        </button>
                        <button onClick={() => setShowDirectVacModal(true)}
                          style={{ display:"flex", alignItems:"center", gap:"6px", padding:"10px 16px", background:"linear-gradient(135deg, #f59e0b, #d97706)", color:"white", border:"none", borderRadius:"12px", fontWeight:"700", cursor:"pointer", fontSize:"13px", fontFamily:"inherit" }}>
                          <Plus size={16}/> إضافة إجازة مباشرة
                        </button>
                      </div>
                    </div>

                    {/* شريط الفلاتر */}
                    <div style={{ background:"white", borderRadius:"16px", padding:"14px 18px", border:"1px solid #e2e8f0", display:"flex", gap:"10px", flexWrap:"wrap", alignItems:"center" }}>
                      <div style={{ position:"relative", flex:1, minWidth:"180px" }}>
                        <Search style={{ position:"absolute", right:"12px", top:"50%", transform:"translateY(-50%)", color:"#94a3b8" }} size={16}/>
                        <input
                          style={{ width:"100%", paddingRight:"36px", paddingLeft:"12px", padding:"10px 36px 10px 12px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:"10px", outline:"none", fontSize:"13px", boxSizing:"border-box" as any }}
                          placeholder="ابحث بالاسم أو الكود..."
                          value={vacSearch2}
                          onChange={e => setVacSearch2(e.target.value)}
                        />
                      </div>
                      {!isDeptMgr && (
                        <select style={{ padding:"10px 14px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:"10px", outline:"none", fontSize:"13px", fontFamily:"inherit" }}
                          value={vacDeptFilter2} onChange={e => setVacDeptFilter2(e.target.value)}>
                          <option value="all">كل الأقسام</option>
                          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      )}
                      <select style={{ padding:"10px 14px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:"10px", outline:"none", fontSize:"13px", fontFamily:"inherit" }}
                        value={vacTypeFilter2 || "all"} onChange={e => setVacTypeFilter2(e.target.value)}>
                        <option value="all">كل أنواع الإجازات</option>
                        {vacationTypes.map(vt => <option key={vt.id} value={vt.id}>{vt.name}</option>)}
                      </select>
                      <div style={{ background:"#eef2ff", color:"#4f46e5", borderRadius:"10px", padding:"10px 16px", fontWeight:"800", fontSize:"13px", whiteSpace:"nowrap" }}>
                        {filtered.length} موظف في إجازة
                      </div>
                    </div>
                    {/* صف ثاني: فلتر تاريخ + ترتيب */}
                    <div style={{ background:"white", borderRadius:"16px", padding:"10px 18px", border:"1px solid #e2e8f0", display:"flex", gap:"10px", flexWrap:"wrap", alignItems:"center" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                        <label style={{ fontSize:"12px", color:"#64748b", fontWeight:"600", whiteSpace:"nowrap" }}>من تاريخ البداية:</label>
                        <input type="date" style={{ padding:"8px 10px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:"10px", fontSize:"12px", outline:"none" }}
                          value={activeVacDateFrom} onChange={e => setActiveVacDateFrom(e.target.value)} />
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                        <label style={{ fontSize:"12px", color:"#64748b", fontWeight:"600", whiteSpace:"nowrap" }}>إلى:</label>
                        <input type="date" style={{ padding:"8px 10px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:"10px", fontSize:"12px", outline:"none" }}
                          value={activeVacDateTo} onChange={e => setActiveVacDateTo(e.target.value)} />
                      </div>

                      {(activeVacDateFrom || activeVacDateTo) && (
                        <button onClick={() => { setActiveVacDateFrom(""); setActiveVacDateTo(""); }}
                          style={{ padding:"8px 14px", background:"#fee2e2", color:"#dc2626", border:"none", borderRadius:"10px", fontSize:"12px", fontWeight:"700", cursor:"pointer" }}>
                          ✕ مسح التاريخ
                        </button>
                      )}
                    </div>

                    {/* جدول الإجازات الفعلية */}
                    <div style={{ background:"white", borderRadius:"16px", border:"1px solid #e2e8f0", overflow:"hidden" }}>
                      {filtered.length === 0 ? (
                        <div style={{ padding:"60px", textAlign:"center", color:"#94a3b8" }}>
                          <CheckCircle size={48} style={{ margin:"0 auto 12px", opacity:0.3, display:"block" }}/>
                          <p style={{ fontWeight:"700", fontSize:"16px" }}>لا يوجد موظفون في إجازة الآن ✅</p>
                        </div>
                      ) : (
                        <div style={{ overflowX:"auto" }}>
                          <table style={{ width:"100%", borderCollapse:"collapse", border:"2px solid #94a3b8", fontSize:"13px", backgroundColor:"#ffffff" }}>
                            <thead style={{ border:"1px solid #94a3b8", padding:"12px 8px", backgroundColor:"#4f46e5", color:"white", fontWeight:"900", textAlign:"center" }}>
                              <tr>
                                <th style={{ border:"1px solid #94a3b8", padding:"12px 8px", backgroundColor:"#4f46e5", color:"white", fontWeight:"900", textAlign:"center", width:"40px" }}>✓</th>
                                <SortTh label="الموظف"        field="name"  align="right"  sortField={activeVacSortField} sortDir={activeVacSortDir} sortDropdown={activeVacSortDropdown} onSort={(f,d)=>{setActiveVacSortField(f);setActiveVacSortDir(d);setActiveVacSortDropdown("");}} onClear={()=>{setActiveVacSortField("");setActiveVacSortDropdown("");}} onToggle={f=>setActiveVacSortDropdown(d=>d===f?"":f)} />
                              <th style={{ border:"1px solid #94a3b8", padding:"12px 8px", backgroundColor:"#4f46e5", color:"white", fontWeight:"900", textAlign:"center" }}>القسم</th>
                              <th style={{ border:"1px solid #94a3b8", padding:"12px 8px", backgroundColor:"#4f46e5", color:"white", fontWeight:"900", textAlign:"center" }}>نوع الإجازة</th>
                              <SortTh label="تاريخ البداية" field="start" align="center" sortField={activeVacSortField} sortDir={activeVacSortDir} sortDropdown={activeVacSortDropdown} onSort={(f,d)=>{setActiveVacSortField(f);setActiveVacSortDir(d);setActiveVacSortDropdown("");}} onClear={()=>{setActiveVacSortField("");setActiveVacSortDropdown("");}} onToggle={f=>setActiveVacSortDropdown(d=>d===f?"":f)} />
                              <SortTh label="المدة"         field="days"  align="center" sortField={activeVacSortField} sortDir={activeVacSortDir} sortDropdown={activeVacSortDropdown} onSort={(f,d)=>{setActiveVacSortField(f);setActiveVacSortDir(d);setActiveVacSortDropdown("");}} onClear={()=>{setActiveVacSortField("");setActiveVacSortDropdown("");}} onToggle={f=>setActiveVacSortDropdown(d=>d===f?"":f)} />
                              <SortTh label="نهاية الإجازة" field="back" align="center" sortField={activeVacSortField} sortDir={activeVacSortDir} sortDropdown={activeVacSortDropdown} onSort={(f,d)=>{setActiveVacSortField(f);setActiveVacSortDir(d);setActiveVacSortDropdown("");}} onClear={()=>{setActiveVacSortField("");setActiveVacSortDropdown("");}} onToggle={f=>setActiveVacSortDropdown(d=>d===f?"":f)} />
                              <th style={{ border:"1px solid #94a3b8", padding:"12px 8px", backgroundColor:"#4f46e5", color:"white", fontWeight:"900", textAlign:"center" }}>الرصيد</th>
                              <th style={{ border:"1px solid #94a3b8", padding:"12px 8px", backgroundColor:"#4f46e5", color:"white", fontWeight:"900", textAlign:"center" }}>المصدر</th>
                              <th style={{ border:"1px solid #94a3b8", padding:"12px 8px", backgroundColor:"#4f46e5", color:"white", fontWeight:"900", textAlign:"center" }}>الإجراءات</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filtered.map(row => {
                                const { emp, lastReq, dept, vacType, back, end, daysLeft, source } = row;
                                return (
                                  <tr key={emp.id} style={{ borderBottom:"1px solid #f1f5f9" }}
                                    onMouseEnter={e => (e.currentTarget.style.background="#f8fafc")}
                                    onMouseLeave={e => (e.currentTarget.style.background="white")}>
                                    <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", textAlign:"center" }}>
                                      <input type="checkbox" checked={selectedPrintIds.has(emp.id)} 
                                        onChange={(e) => {
                                          const newSet = new Set(selectedPrintIds);
                                          if (e.target.checked) newSet.add(emp.id);
                                          else newSet.delete(emp.id);
                                          setSelectedPrintIds(newSet);
                                        }}
                                        style={{ width:"18px", height:"18px", cursor:"pointer" }}/>
                                    </td>
                                    <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>
                                      <div style={{ fontWeight:"700", color:"#1e293b" }}>{emp.name}</div>
                                      <div style={{ fontSize:"11px", color:"#94a3b8" }}>{emp.code}</div>
                                    </td>
                                    <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>{dept?.name || "-"}</td>
                                    <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>
                                      {vacType
                                        ? <span style={{ padding:"3px 10px", borderRadius:"20px", fontSize:"11px", fontWeight:"700", background:(vacType as any).color+"22", color:(vacType as any).color }}>{(vacType as any).name}</span>
                                        : <span style={{ color:"#94a3b8", fontSize:"11px" }}>غير محدد</span>}
                                    </td>
                                    <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>
                                      {lastReq ? formatDate(lastReq.start_date) : "-"}
                                    </td>
                                    <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>
                                      {lastReq ? `${lastReq.days} يوم` : "-"}
                                    </td>
                                    <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>
                                      {end ? (
                                        <>
                                          <div style={{ fontWeight:"700", color:"#4f46e5" }}>{formatDate(end)}</div>
                                          {daysLeft !== null && (
                                            <div style={{ fontSize:"11px", color: daysLeft <= 0 ? "#ef4444" : daysLeft <= 2 ? "#f59e0b" : "#94a3b8" }}>
                                              {daysLeft <= 0 ? "اليوم" : `بعد ${daysLeft} يوم`}
                                            </div>
                                          )}
                                        </>
                                      ) : <span style={{ color:"#94a3b8" }}>-</span>}
                                    </td>
                                    <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>
                                      <span style={{ fontWeight:"700", color: (emp.balance || 0) < 5 ? "#ef4444" : "#374151" }}>{emp.balance}</span>
                                    </td>
                                    <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>
                                      <span style={{
                                        padding:"3px 10px", borderRadius:"20px", fontSize:"11px", fontWeight:"700",
                                        background: source === "طلب" ? "#eef2ff" : "#fef3c7",
                                        color: source === "طلب" ? "#4f46e5" : "#d97706"
                                      }}>{source}</span>
                                    </td>
                                    <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>
                                      <div style={{ display:"flex", gap:"6px", justifyContent:"center" }}>
                                        {lastReq && (
                                          <button onClick={() => openReturnModal(lastReq)}
                                            style={{ padding:"6px 10px", background:"#dcfce7", color:"#16a34a", border:"none", borderRadius:"8px", fontWeight:"700", cursor:"pointer", fontSize:"12px", fontFamily:"inherit", whiteSpace:"nowrap" }}>
                                            ✅ عودة
                                          </button>
                                        )}
                                        {!lastReq && (
                                          <button onClick={async () => {
                                            if (!window.confirm(`تسجيل عودة ${emp.name} إلى العمل؟`)) return;
                                            await supabase.from("employees").update({ status:"عمل", return_date: new Date().toISOString().split("T")[0] }).eq("id", emp.id);
                                            fetchData();
                                          }}
                                            style={{ padding:"6px 10px", background:"#dcfce7", color:"#16a34a", border:"none", borderRadius:"8px", fontWeight:"700", cursor:"pointer", fontSize:"12px", fontFamily:"inherit", whiteSpace:"nowrap" }}>
                                            ✅ عودة
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                  </div>
                );
              })()}

              {/* Modal إضافة إجازة مباشرة */}
              {showDirectVacModal && (
                <div style={{ position:"fixed", inset:0, background:"rgba(0, 0, 0, 0.5)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", padding:"20px", zIndex:200 }} onClick={() => { setShowDirectVacModal(false); setEmpSearchDirect(""); setShowEmpDropdown(false); }}>
                  <div style={{ background:"white", borderRadius:"24px", width:"100%", maxWidth:"480px", padding:"28px", boxShadow:"0 20px 60px rgba(0, 0, 0, 0.2)" }} dir="rtl" onClick={e => e.stopPropagation()}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"20px" }}>
                      <h3 style={{ margin:0, fontWeight:"900", fontSize:"18px" }}>➕ إضافة إجازة مباشرة</h3>
                      <button onClick={() => { setShowDirectVacModal(false); setEmpSearchDirect(""); setShowEmpDropdown(false); }} style={{ background:"#f1f5f9", border:"none", borderRadius:"8px", padding:"6px 10px", cursor:"pointer" }}><X size={18}/></button>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
                      <div style={{ position:"relative" }}>
                        <label style={{ fontSize:"13px", fontWeight:"700", color:"#64748b", display:"block", marginBottom:"6px" }}>الموظف *</label>
                        <div style={{ position:"relative" }}>
                          <Search style={{ position:"absolute", right:"12px", top:"50%", transform:"translateY(-50%)", color:"#94a3b8" }} size={15}/>
                          <input
                            style={{ width:"100%", padding:"12px 36px 12px 12px", border:"1px solid #e2e8f0", borderRadius:"12px", fontSize:"14px", outline:"none", background:"#f8fafc", boxSizing:"border-box" }}
                            placeholder="ابحث بالاسم أو الكود..."
                            value={empSearchDirect}
                            onChange={e => { setEmpSearchDirect(e.target.value); setShowEmpDropdown(true); if(!e.target.value) { setDirectVacForm({...directVacForm, employee_id:""}); } }}
                            onFocus={() => setShowEmpDropdown(true)}
                          />
                        </div>
                        {showEmpDropdown && empSearchDirect && (() => {
                          const filtered = (isDeptMgr ? employees.filter(e => myDeptIds.includes(String(e.department_id))) : employees)
                            .filter(e => e.name.includes(empSearchDirect) || e.code.includes(empSearchDirect))
                            .slice(0, 6);
                          return filtered.length > 0 ? (
                            <div style={{ position:"absolute", top:"100%", right:0, left:0, background:"white", border:"1px solid #e2e8f0", borderRadius:"12px", boxShadow:"0 8px 24px rgba(0, 0, 0, 0.12)", zIndex:300, maxHeight:"200px", overflowY:"auto", marginTop:"4px" }}>
                              {filtered.map(e => (
                                <div key={e.id}
                                  onClick={() => { setDirectVacForm({...directVacForm, employee_id: e.id}); setEmpSearchDirect(e.name + " (" + e.code + ")"); setShowEmpDropdown(false); }}
                                  style={{ padding:"10px 14px", cursor:"pointer", borderBottom:"1px solid #f1f5f9", display:"flex", justifyContent:"space-between", alignItems:"center" }}
                                  onMouseEnter={ev => ev.currentTarget.style.background="#f8fafc"}
                                  onMouseLeave={ev => ev.currentTarget.style.background="white"}
                                >
                                  <div>
                                    <div style={{ fontWeight:"700", fontSize:"13px" }}>{e.name}</div>
                                    <div style={{ fontSize:"11px", color:"#94a3b8" }}>كود: {e.code}</div>
                                  </div>
                                  <span style={{ fontSize:"12px", fontWeight:"700", color:"#4f46e5" }}>رصيد: {e.balance} يوم</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ position:"absolute", top:"100%", right:0, left:0, background:"white", border:"1px solid #e2e8f0", borderRadius:"12px", padding:"12px", textAlign:"center", color:"#94a3b8", fontSize:"13px", zIndex:300, marginTop:"4px" }}>
                              لا توجد نتائج
                            </div>
                          );
                        })()}
                        {directVacForm.employee_id && (() => {
                          const emp = employees.find(e => e.id === directVacForm.employee_id);
                          return emp ? (
                            <div style={{ marginTop:"6px", background:"#eef2ff", borderRadius:"8px", padding:"8px 12px", fontSize:"12px", color:"#4f46e5", fontWeight:"700" }}>
                              ✅ {emp.name} | رصيد: {emp.balance} يوم
                            </div>
                          ) : null;
                        })()}
                      </div>
                      <div>
                        <label style={{ fontSize:"13px", fontWeight:"700", color:"#64748b", display:"block", marginBottom:"6px" }}>نوع الإجازة *</label>
                        <select
                          style={{ width:"100%", padding:"12px", border:"1px solid #e2e8f0", borderRadius:"12px", fontSize:"14px", outline:"none", background:"#f8fafc", boxSizing:"border-box" }}
                          value={directVacForm.vacation_type_id}
                          onChange={e => setDirectVacForm({...directVacForm, vacation_type_id: e.target.value})}
                        >
                          <option value="">اختر النوع...</option>
                          {vacationTypes.map(vt => <option key={vt.id} value={vt.id}>{vt.name}</option>)}
                        </select>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" }}>
                        <div>
                          <label style={{ fontSize:"13px", fontWeight:"700", color:"#64748b", display:"block", marginBottom:"6px" }}>تاريخ البداية *</label>
                          <input type="date" style={{ width:"100%", padding:"12px", border:"1px solid #e2e8f0", borderRadius:"12px", fontSize:"14px", outline:"none", background:"#f8fafc", boxSizing:"border-box" }} value={directVacForm.start_date} onChange={e => setDirectVacForm({...directVacForm, start_date: e.target.value})}/>
                        </div>
                        <div>
                          <label style={{ fontSize:"13px", fontWeight:"700", color:"#64748b", display:"block", marginBottom:"6px" }}>عدد الأيام *</label>
                          <input type="number" min="1" style={{ width:"100%", padding:"12px", border:"1px solid #e2e8f0", borderRadius:"12px", fontSize:"14px", outline:"none", background:"#f8fafc", boxSizing:"border-box" }} value={directVacForm.days} onChange={e => setDirectVacForm({...directVacForm, days: Number(e.target.value)})}/>
                        </div>
                      </div>
                      {directVacForm.start_date && directVacForm.days > 0 && (
                        <div style={{ background:"#eef2ff", borderRadius:"10px", padding:"10px 14px", fontSize:"13px", color:"#4f46e5", fontWeight:"700" }}>
                          📅 تاريخ العودة: {formatDate(getCalculatedDates(directVacForm.start_date, directVacForm.days).back)}
                        </div>
                      )}
                      <div>
                        <label style={{ fontSize:"13px", fontWeight:"700", color:"#64748b", display:"block", marginBottom:"6px" }}>ملاحظات</label>
                        <textarea style={{ width:"100%", padding:"12px", border:"1px solid #e2e8f0", borderRadius:"12px", fontSize:"14px", outline:"none", background:"#f8fafc", resize:"none", boxSizing:"border-box" }} rows={2} placeholder="ملاحظات اختيارية..." value={directVacForm.notes} onChange={e => setDirectVacForm({...directVacForm, notes: e.target.value})}/>
                      </div>
                      <button onClick={handleDirectVacation} disabled={isSubmitting} style={{ width:"100%", padding:"14px", background:"#4f46e5", color:"white", border:"none", borderRadius:"12px", fontSize:"15px", fontWeight:"900", cursor:"pointer", opacity: isSubmitting ? 0.7 : 1 }}>
                        {isSubmitting ? "جاري الحفظ..." : "✅ تأكيد الإجازة"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Modal يوم التقويم */}
              {selectedCalendarDay && (() => {
                const dayReqs = requests.filter(r => {
                  if (r.status !== "approved") return false;
                  const { back } = getCalculatedDates(r.start_date, r.days);
                  return r.start_date <= selectedCalendarDay && back > selectedCalendarDay;
                });
                return (
                  <div style={{ position:"fixed", inset:0, background:"rgba(0, 0, 0, 0.5)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", padding:"20px", zIndex:200 }} onClick={() => setSelectedCalendarDay(null)}>
                    <div style={{ background:"white", borderRadius:"24px", width:"100%", maxWidth:"480px", padding:"24px", boxShadow:"0 20px 60px rgba(0, 0, 0, 0.2)", maxHeight:"80vh", overflow:"hidden", display:"flex", flexDirection:"column" }} onClick={e => e.stopPropagation()}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"16px" }}>
                        <div>
                          <h3 style={{ margin:0, fontWeight:"900", fontSize:"17px" }}>📅 موظفو الإجازة</h3>
                          <p style={{ margin:"2px 0 0", fontSize:"12px", color:"#64748b" }}>{formatDate(selectedCalendarDay)} — {dayReqs.length} موظف</p>
                        </div>
                        <button onClick={() => setSelectedCalendarDay(null)} style={{ background:"#f1f5f9", border:"none", borderRadius:"8px", padding:"6px 10px", cursor:"pointer" }}><X size={16}/></button>
                      </div>
                      <div style={{ overflowY:"auto", display:"flex", flexDirection:"column", gap:"8px" }}>
                        {dayReqs.map(req => {
                          const emp = employees.find(e => e.id === req.employee_id);
                          const dept = departments.find(d => d.id === emp?.department_id);
                          const vacType = vacationTypes.find(vt => vt.id === req.vacation_type_id);
                          const { back } = getCalculatedDates(req.start_date, req.days);
                          return (
                            <div key={req.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 14px", borderRadius:"12px", background:"#f8fafc", border:"1px solid #e2e8f0" }}>
                              <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                                <div style={{ width:"36px", height:"36px", borderRadius:"50%", background:"linear-gradient(135deg, #4f46e5, #7c3aed)", display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontWeight:"900", fontSize:"14px", flexShrink:0 }}>
                                  {req.employee_name?.charAt(0)}
                                </div>
                                <div>
                                  <div style={{ fontWeight:"700", fontSize:"13px" }}>{req.employee_name}</div>
                                  <div style={{ fontSize:"11px", color:"#94a3b8" }}>{dept?.name || "-"} | {emp?.position || "-"}</div>
                                </div>
                              </div>
                              <div style={{ textAlign:"left" }}>
                                {vacType && <div style={{ padding:"2px 8px", borderRadius:"20px", fontSize:"10px", fontWeight:"700", backgroundColor:vacType.color+"20", color:vacType.color, marginBottom:"3px" }}>{vacType.name}</div>}
                                {req.is_extension && <div style={{ padding:"2px 8px", borderRadius:"20px", fontSize:"10px", fontWeight:"700", background:"#ede9fe", color:"#7c3aed", marginBottom:"3px" }}>🔗 امتداد</div>}
                                <div style={{ fontSize:"10px", color:"#94a3b8" }}>عودة: {formatDate(back)}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {activeTab === "managers" && isOwner && (
                <ManagersTab departments={departments} supabase={supabase} logAction={logAction} currentUser={currentUser} />
              )}

              {activeTab === "admins" && isOwner && (
                <AdminsTab supabase={supabase} logAction={logAction} currentUser={currentUser} />
              )}

              {/* ===== NOTIFICATIONS CENTER ===== */}
              {activeTab === "notifications_center" && isOwner && (() => {
                const allNotifs = requests.filter(r => r.status === "approved" || r.status === "rejected");
                const filtered = allNotifs
                  .filter(r => {
                    const emp = employees.find(e => e.id === r.employee_id);
                    const matchSearch = !notifSearch ||
                      r.employee_name?.includes(notifSearch) ||
                      (emp?.code || "").includes(notifSearch) ||
                      (r.admin_notes || "").includes(notifSearch);
                    const approvedDate = (r.owner_approved_at || "").split("T")[0];
                    const matchDateFrom = !notifDateFrom || approvedDate >= notifDateFrom;
                    const matchDateTo = !notifDateTo || approvedDate <= notifDateTo;
                    return matchSearch && matchDateFrom && matchDateTo;
                  })
                  .sort((a, b) => {
                    const da = a.owner_approved_at || a.created_at || "";
                    const db = b.owner_approved_at || b.created_at || "";
                    return notifSortDir === "desc" ? db.localeCompare(da) : da.localeCompare(db);
                  });
                return (
                  <div className="space-y-5">
                    {/* Header */}
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:"12px" }}>
                      <div>
                        <h2 style={{ margin:0, fontSize:"22px", fontWeight:"900" }}>🔔 الاشعارات</h2>
                        <p style={{ margin:"4px 0 0", color:"#64748b", fontSize:"13px" }}>
                          جميع قرارات الموافقة والرفض على طلبات الإجازة
                        </p>
                      </div>
                      <div style={{ background: allNotifs.length > 0 ? "#eef2ff" : "#f1f5f9", color: allNotifs.length > 0 ? "#4f46e5" : "#94a3b8", borderRadius:"10px", padding:"10px 18px", fontWeight:"800", fontSize:"13px" }}>
                        {filtered.length} اشعار
                      </div>
                    </div>

                    {/* شريط الفلاتر */}
                    <div style={{ background:"white", borderRadius:"16px", padding:"14px 18px", border:"1px solid #e2e8f0", display:"flex", gap:"10px", flexWrap:"wrap", alignItems:"center" }}>
                      {/* بحث */}
                      <div style={{ position:"relative", flex:"2", minWidth:"180px" }}>
                        <Search style={{ position:"absolute", right:"12px", top:"50%", transform:"translateY(-50%)", color:"#94a3b8" }} size={15}/>
                        <input
                          style={{ width:"100%", padding:"10px 36px 10px 12px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:"10px", fontSize:"13px", outline:"none", boxSizing:"border-box" as any }}
                          placeholder="بحث بالاسم أو الكود أو الملاحظات..."
                          value={notifSearch} onChange={e => setNotifSearch(e.target.value)} />
                      </div>
                      {/* فلتر تاريخ */}
                      <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                        <label style={{ fontSize:"12px", color:"#64748b", fontWeight:"600", whiteSpace:"nowrap" }}>من:</label>
                        <input type="date" style={{ padding:"9px 10px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:"10px", fontSize:"12px", outline:"none" }}
                          value={notifDateFrom} onChange={e => setNotifDateFrom(e.target.value)} />
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                        <label style={{ fontSize:"12px", color:"#64748b", fontWeight:"600", whiteSpace:"nowrap" }}>إلى:</label>
                        <input type="date" style={{ padding:"9px 10px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:"10px", fontSize:"12px", outline:"none" }}
                          value={notifDateTo} onChange={e => setNotifDateTo(e.target.value)} />
                      </div>
                      {/* ترتيب */}
                      <button
                        onClick={() => setNotifSortDir(d => d === "desc" ? "asc" : "desc")}
                        style={{ display:"flex", alignItems:"center", gap:"6px", padding:"9px 14px", background:"#eef2ff", border:"none", borderRadius:"10px", fontSize:"12px", fontWeight:"700", cursor:"pointer", color:"#4f46e5" }}>
                        {notifSortDir === "desc" ? "↓ الأحدث أولاً" : "↑ الأقدم أولاً"}
                      </button>
                      {(notifSearch || notifDateFrom || notifDateTo) && (
                        <button onClick={() => { setNotifSearch(""); setNotifDateFrom(""); setNotifDateTo(""); }}
                          style={{ padding:"9px 14px", background:"#fee2e2", color:"#dc2626", border:"none", borderRadius:"10px", fontSize:"12px", fontWeight:"700", cursor:"pointer" }}>
                          ✕ مسح
                        </button>
                      )}
                    </div>

                    {/* قائمة الاشعارات */}
                    {filtered.length === 0 ? (
                      <div style={{ background:"white", borderRadius:"20px", padding:"60px", textAlign:"center", border:"2px dashed #e2e8f0" }}>
                        <div style={{ fontSize:"48px", marginBottom:"12px" }}>🔔</div>
                        <p style={{ color:"#94a3b8", fontWeight:"700" }}>لا توجد اشعارات</p>
                      </div>
                    ) : (
                      <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
                        {filtered.map(r => {
                          const emp = employees.find(e => e.id === r.employee_id);
                          const dept = departments.find(d => d.id === emp?.department_id);
                          const vacType = vacationTypes.find(vt => vt.id === r.vacation_type_id);
                          const { end, back } = getCalculatedDates(r.start_date, r.days);
                          const isApproved = r.status === "approved";
                          const approvedAt = r.owner_approved_at ? formatDateTime(r.owner_approved_at) : "-";
                          return (
                            <div key={r.id} style={{
                              background:"white", borderRadius:"18px", padding:"18px 22px",
                              border:`1.5px solid ${isApproved ? "#bbf7d0" : "#fecdd3"}`,
                              boxShadow:"0 2px 8px rgba(0,0,0,0.04)",
                              display:"flex", flexDirection:"column", gap:"10px",
                            }}>
                              {/* الصف العلوي */}
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:"8px" }}>
                                <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
                                  <div style={{
                                    width:"42px", height:"42px", borderRadius:"50%", flexShrink:0,
                                    background: isApproved ? "linear-gradient(135deg,#059669,#10b981)" : "linear-gradient(135deg,#dc2626,#ef4444)",
                                    display:"flex", alignItems:"center", justifyContent:"center",
                                    color:"white", fontWeight:"900", fontSize:"18px",
                                  }}>
                                    {isApproved ? "✓" : "✗"}
                                  </div>
                                  <div>
                                    <div style={{ fontWeight:"800", fontSize:"15px", color:"#1e293b" }}>{r.employee_name}</div>
                                    <div style={{ fontSize:"11px", color:"#94a3b8" }}>
                                      {emp?.code && `#${emp.code}`} {dept?.name && `· ${dept.name}`}
                                    </div>
                                  </div>
                                </div>
                                <span style={{
                                  padding:"5px 14px", borderRadius:"20px", fontSize:"12px", fontWeight:"800",
                                  background: isApproved ? "#dcfce7" : "#fee2e2",
                                  color: isApproved ? "#16a34a" : "#dc2626",
                                }}>
                                  {isApproved ? "✓ مقبول" : "✗ مرفوض"}
                                </span>
                              </div>

                              {/* تفاصيل الطلب */}
                              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(130px, 1fr))", gap:"8px" }}>
                                {[
                                  { label:"تاريخ البداية", val: formatDate(r.start_date) },
                                  { label:"المدة", val: `${r.days} يوم` },
                                  { label:"تاريخ نهاية الإجازة", val: formatDate(end) },
                                  { label:"نوع الإجازة", val: (vacType as any)?.name || "-" },
                                  { label:"تم بواسطة", val: r.owner_approved_by || "-" },
                                  { label:"وقت القرار", val: approvedAt },
                                ].map(item => (
                                  <div key={item.label} style={{ background:"#f8fafc", borderRadius:"10px", padding:"8px 12px" }}>
                                    <div style={{ fontSize:"10px", color:"#94a3b8", marginBottom:"2px" }}>{item.label}</div>
                                    <div style={{ fontWeight:"700", fontSize:"12px", color:"#1e293b" }}>{item.val}</div>
                                  </div>
                                ))}
                              </div>

                              {/* ملاحظات */}
                              {r.admin_notes && (
                                <div style={{ background: isApproved ? "#f0fdf4" : "#fff1f2", borderRadius:"10px", padding:"10px 14px", fontSize:"12px", color: isApproved ? "#15803d" : "#dc2626", fontWeight:"600" }}>
                                  💬 {r.admin_notes}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()} 
              {activeTab === "history" && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-black">سجل الإجازات</h2>
                    <div style={{ display:"flex", gap:"8px", flexWrap:"wrap" }}>
                      <button onClick={() => {
                        const data = filteredRequests.map(r => {
                          const emp = employees.find((e: any) => e.id === r.employee_id);
                          const dept = departments.find((d: any) => d.id === emp?.department_id);
                          const vt = vacationTypes.find((v: any) => v.id === r.vacation_type_id);
                          const { back } = getCalculatedDates(r.start_date, r.days);
                          const statusMap: any = { pending:"معلق", dept_approved:"موافقة مبدئية", approved:"مقبول", rejected:"مرفوض" };
                          const holidayDates = publicHolidays.map(h => h.date);
                          const workDays = calculateWorkDaysBetween(emp?.return_date || "", r.start_date, holidayDates);
                          return {
                            "اسم الموظف": r.employee_name,
                            "الكود الوظيفي": emp?.code || "",
                            "القسم": dept?.name || "",
                            "نوع الإجازة": (vt as any)?.name || "",
                            "تاريخ التقديم": r.created_at ? r.created_at.split("T")[0] : "",
                            "تاريخ البداية": r.start_date,
                            "عدد الأيام": r.days,
                            "تاريخ العودة المتوقع": back,
                            "أيام العمل من العودة": workDays > 0 ? workDays : 0,
                            "تاريخ العودة الفعلي": r.actual_return_date || "",
                            "الحالة": statusMap[r.status] || r.status,
                            "تمت الموافقة بواسطة": r.owner_approved_by || "",
                            "تاريخ الموافقة": r.owner_approved_at ? r.owner_approved_at.split("T")[0] : "",
                            "ملاحظات الموظف": r.notes || "",
                            "ملاحظات الإدارة": r.admin_notes || "",
                          };
                        });
                        const ws = XLSX.utils.json_to_sheet(data);
                        ws["!cols"] = Array(15).fill({ wch:18 });
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, ws, "سجل الإجازات");
                        XLSX.writeFile(wb, `سجل-الإجازات-${new Date().toISOString().split("T")[0]}.xlsx`);
                      }}
                        style={{ padding:"8px 16px", background:"linear-gradient(135deg, #4f46e5, #7c3aed)", color:"white", border:"none", borderRadius:"10px", fontWeight:"700", cursor:"pointer", fontSize:"13px", display:"flex", alignItems:"center", gap:"6px", fontFamily:"inherit" }}>
                        <FileDown size={15}/> تصدير السجل
                      </button>
                      {isOwner && <button onClick={() => setShowAuditLog(true)} className="bg-purple-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold text-sm"><History size={16} /> سجل التعديلات</button>}
                      {isOwner && <button onClick={() => { setShowBalanceLog(true); fetchBalanceLogs(); }} className="bg-emerald-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold text-sm">💰 سجل الرصيد</button>}
                    </div>
                  </div>
                  {/* شريط بحث وفلتر متقدم */}
                  <div style={{ background:"white", borderRadius:"16px", padding:"14px 16px", border:"1px solid #e2e8f0", display:"flex", gap:"10px", flexWrap:"wrap", alignItems:"center" }}>
                    <div style={{ position:"relative", flex:"2", minWidth:"180px" }}>
                      <Search style={{ position:"absolute", right:"12px", top:"50%", transform:"translateY(-50%)", color:"#94a3b8" }} size={15}/>
                      <input style={{ width:"100%", padding:"10px 36px 10px 12px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:"10px", fontSize:"13px", outline:"none", boxSizing:"border-box" as any }}
                        placeholder="بحث بالاسم أو الملاحظات أو الكود..."
                        value={reqSearch} onChange={e => setReqSearch(e.target.value)} />
                    </div>
                    <select style={{ padding:"10px 12px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:"10px", fontSize:"13px", outline:"none" }}
                      value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                      <option value="all">كل الحالات</option>
                      <option value="approved">✓ مقبول</option>
                      <option value="rejected">✗ مرفوض</option>
                      <option value="dept_approved">◑ موافقة مبدئية</option>
                      <option value="pending">⏳ معلق</option>
                    </select>
                    <select style={{ padding:"10px 12px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:"10px", fontSize:"13px", outline:"none" }}
                      value={vacationTypeFilter} onChange={e => setVacationTypeFilter(e.target.value)}>
                      <option value="all">كل الأنواع</option>
                      {vacationTypes.map(vt => <option key={vt.id} value={vt.id}>{vt.name}</option>)}
                    </select>
                    <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                      <label style={{ fontSize:"12px", color:"#64748b", fontWeight:"600", whiteSpace:"nowrap" }}>من:</label>
                      <input type="date" style={{ padding:"9px 10px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:"10px", fontSize:"12px", outline:"none" }}
                        value={reqDateFrom} onChange={e => setReqDateFrom(e.target.value)} />
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                      <label style={{ fontSize:"12px", color:"#64748b", fontWeight:"600", whiteSpace:"nowrap" }}>إلى:</label>
                      <input type="date" style={{ padding:"9px 10px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:"10px", fontSize:"12px", outline:"none" }}
                        value={reqDateTo} onChange={e => setReqDateTo(e.target.value)} />
                    </div>
                    {(reqSearch || statusFilter !== "all" || vacationTypeFilter !== "all" || reqDateFrom || reqDateTo) && (
                      <button onClick={() => { setReqSearch(""); setStatusFilter("all"); setVacationTypeFilter("all"); setReqDateFrom(""); setReqDateTo(""); }}
                        style={{ padding:"9px 14px", background:"#fee2e2", color:"#dc2626", border:"none", borderRadius:"10px", fontSize:"12px", fontWeight:"700", cursor:"pointer" }}>
                        ✕ مسح الفلاتر
                      </button>
                    )}
                    <span style={{ fontSize:"12px", color:"#64748b", marginRight:"auto" }}>
                      {filteredRequests.length} طلب
                    </span>
                  </div>
                  <div className="bg-white rounded-[2rem] shadow-sm border overflow-x-auto">
                    <table className="w-full text-sm" style={{ width:"100%", borderCollapse:"collapse", border:"2px solid #94a3b8", fontSize:"13px", backgroundColor:"#ffffff" }}>
                      <thead className="bg-slate-50 border-b text-xs">
                        <tr>
                          <SortTh label="الموظف"         field="name"     align="right"  sortField={histSortField} sortDir={histSortDir} sortDropdown={histSortDropdown} onSort={(f,d)=>{setHistSortField(f);setHistSortDir(d);setHistSortDropdown("");}} onClear={()=>{setHistSortField("");setHistSortDropdown("");}} onToggle={f=>setHistSortDropdown(d=>d===f?"":f)} />
                          <SortTh label="نوع الإجازة"    field="type"     align="center" sortField={histSortField} sortDir={histSortDir} sortDropdown={histSortDropdown} onSort={(f,d)=>{setHistSortField(f);setHistSortDir(d);setHistSortDropdown("");}} onClear={()=>{setHistSortField("");setHistSortDropdown("");}} onToggle={f=>setHistSortDropdown(d=>d===f?"":f)} />
                          <SortTh label="تاريخ البداية"  field="start"    align="center" sortField={histSortField} sortDir={histSortDir} sortDropdown={histSortDropdown} onSort={(f,d)=>{setHistSortField(f);setHistSortDir(d);setHistSortDropdown("");}} onClear={()=>{setHistSortField("");setHistSortDropdown("");}} onToggle={f=>setHistSortDropdown(d=>d===f?"":f)} />
                          <SortTh label="المدة"          field="days"     align="center" sortField={histSortField} sortDir={histSortDir} sortDropdown={histSortDropdown} onSort={(f,d)=>{setHistSortField(f);setHistSortDir(d);setHistSortDropdown("");}} onClear={()=>{setHistSortField("");setHistSortDropdown("");}} onToggle={f=>setHistSortDropdown(d=>d===f?"":f)} />
                          <th className="p-4 text-center" style={{ border:"1px solid #94a3b8", padding:"12px 8px", backgroundColor:"#4f46e5", color:"white", fontWeight:"900", textAlign:"center" }}>تاريخ العودة المتوقع</th>
                          <SortTh label="أيام العمل"     field="workdays" align="center" sortField={histSortField} sortDir={histSortDir} sortDropdown={histSortDropdown} onSort={(f,d)=>{setHistSortField(f);setHistSortDir(d);setHistSortDropdown("");}} onClear={()=>{setHistSortField("");setHistSortDropdown("");}} onToggle={f=>setHistSortDropdown(d=>d===f?"":f)} />
                          <th className="p-4 text-center" style={{ border:"1px solid #94a3b8", padding:"12px 8px", backgroundColor:"#4f46e5", color:"white", fontWeight:"900", textAlign:"center" }}>تاريخ العودة الفعلي</th>
                          <SortTh label="الحالة"         field="status"   align="center" sortField={histSortField} sortDir={histSortDir} sortDropdown={histSortDropdown} onSort={(f,d)=>{setHistSortField(f);setHistSortDir(d);setHistSortDropdown("");}} onClear={()=>{setHistSortField("");setHistSortDropdown("");}} onToggle={f=>setHistSortDropdown(d=>d===f?"":f)} />
                          <th className="p-4 text-center" style={{ border:"1px solid #94a3b8", padding:"12px 8px", backgroundColor:"#4f46e5", color:"white", fontWeight:"900", textAlign:"center" }}>ملاحظات</th>
                          <th className="p-4 text-center" style={{ border:"1px solid #94a3b8", padding:"12px 8px", backgroundColor:"#4f46e5", color:"white", fontWeight:"900", textAlign:"center" }}>إجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRequests.map(req => {
                          const { back } = getCalculatedDates(req.start_date, req.days);
                          const vacType = vacationTypes.find(vt => vt.id === req.vacation_type_id);
                          const today = new Date().toISOString().split("T")[0];
                          const isOnVacation = req.status === "approved" && req.start_date <= today && back > today;
                          return (
                            <tr key={req.id} style={{ border:"1px solid #cbd5e1", backgroundColor:"#ffffff" }} className="hover:bg-slate-50">
                              <td className="p-4" style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>
                                <button onClick={() => { const e=employees.find(em=>em.id===req.employee_id); setEmpInfoTarget({...e, req}); setShowEmpInfoModal(true); }}
                                  style={{ background:"none", border:"none", cursor:"pointer", textAlign:"right", padding:0 }}>
                                  <span style={{ fontWeight:"800", color:"#1e293b" }}>{req.employee_name}</span>
                                  <span style={{ display:"block", fontSize:"10px", color:"#4f46e5", fontWeight:"700" }}>👁 عرض البيانات</span>
                                </button>
                              </td>
                              <td className="p-4" style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>{vacType && <span className="px-2 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: vacType.color+'20', color: vacType.color }}>{vacType.name}</span>}{req.is_extension && <span className="mr-1 px-2 py-1 rounded-full text-xs font-bold" style={{ background: "#ede9fe", color: "#7c3aed" }}>🔗 امتداد</span>}</td>
                              <td className="p-4 text-center">{formatDate(req.start_date)}</td>
                              <td className="p-4 text-center font-bold">{req.days}</td>
                              <td className="p-4 text-center text-indigo-600 font-bold">{formatDate(back)}</td>
                              <td className="p-4 text-center">
                                {(() => {
                                  const emp = employees.find(e => e.id === req.employee_id);
                                  const holidayDates = publicHolidays.map(h => h.date);
                                  const days = calculateWorkDaysBetween(emp?.return_date || "", req.start_date, holidayDates);
                                  return days > 0 ? <span className="font-bold text-amber-600">{days}</span> : <span style={{ color:"#94a3b8" }}>-</span>;
                                })()}
                              </td>
                              <td className="p-4 text-center">
                                {req.actual_return_date ? (
                                  <span className="text-green-600 font-bold">{formatDate(req.actual_return_date)}</span>
                                ) : isOnVacation ? (
                                  <button onClick={() => openReturnModal(req)} className="text-blue-600 hover:underline font-bold">تسجيل العودة</button>
                                ) : "-"}
                              </td>
                              <td className="p-4 text-center">
                                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                  req.status === "approved" ? "bg-emerald-100 text-emerald-700" :
                                  req.status === "rejected" ? "bg-red-100 text-red-700" :
                                  req.status === "dept_approved" ? "bg-indigo-100 text-indigo-700" :
                                  "bg-amber-100 text-amber-700"
                                }`}>
                                  {req.status === "approved" ? "✓ مقبول" :
                                   req.status === "rejected" ? "✗ مرفوض" :
                                   req.status === "dept_approved" ? "◑ موافقة مبدئية" :
                                   "⏳ معلق"}
                                </span>
                              </td>
                              <td className="p-4 text-center">{req.admin_notes && <button className="text-blue-600" title={req.admin_notes}><MessageSquare size={16} /></button>}</td>
                              <td className="p-4 text-center">
                                {!req.actual_return_date && back > today && (
                                  <div className="flex justify-center gap-1">
                                    <button onClick={() => setEditingVac(req)} className="text-blue-500 hover:bg-blue-50 p-2 rounded-xl"><Edit3 size={16} /></button>
                                    <button onClick={() => handleDeleteVacation(req.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-xl"><Trash2 size={16} /></button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {/* ===== الشؤون الإدارية ===== */}
              {activeTab === "admin_affairs" && (
                <AdminAffairsTab supabase={supabase} logAction={logAction} currentUser={currentUser} userRole={currentUser?.role} />
              )}
            </>
          )}
        </main>

        {/* ==================== MODALS ==================== */}

        {/* Import Excel Modal */}
        {showImportModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 z-[100]" onClick={() => setShowImportModal(false)}>
            <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-2xl shadow-2xl" dir="rtl" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between mb-8">
                <h3 className="text-2xl font-black flex items-center gap-3"><Upload className="text-emerald-600" /> استيراد من Excel</h3>
                <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-red-500"><X size={28} /></button>
              </div>
              <div className="space-y-4">

                {/* قواعد الاستيراد */}
                <div style={{ background:"#f0fdf4", borderRadius:"16px", padding:"16px 18px", border:"1px solid #bbf7d0" }}>
                  <div style={{ fontWeight:"900", color:"#15803d", marginBottom:"10px", display:"flex", alignItems:"center", gap:"6px" }}>
                    ✅ قواعد رفع الملف
                  </div>
                  <ul style={{ margin:0, padding:"0 18px", display:"flex", flexDirection:"column", gap:"5px", fontSize:"13px", color:"#166534" }}>
                    <li><b>الكود الوظيفي</b> — الحقل الوحيد المطلوب دائماً (هو المعرّف الأساسي)</li>
                    <li>لو الكود موجود مسبقاً → سيتم <b>تحديث</b> الحقول المكتوبة فقط دون المساس بالباقي</li>
                    <li>لو الكود جديد → سيتم <b>إضافة</b> موظف جديد (الاسم مطلوب في هذه الحالة)</li>
                    <li>الخلايا الفارغة = لا تغيير على البيانات الموجودة في النظام</li>
                  </ul>
                </div>

                {/* تحذيرات */}
                <div style={{ background:"#fffbeb", borderRadius:"16px", padding:"14px 18px", border:"1px solid #fde68a" }}>
                  <div style={{ fontWeight:"900", color:"#d97706", marginBottom:"8px" }}>⚠️ تنبيهات مهمة</div>
                  <ul style={{ margin:0, padding:"0 18px", display:"flex", flexDirection:"column", gap:"4px", fontSize:"12px", color:"#92400e" }}>
                    <li>الكود الوظيفي يجب أن يكون <b>أرقام أو حروف بدون مسافات</b> (مثال: 1001 أو EMP001)</li>
                    <li>التواريخ بصيغة: <b>YYYY-MM-DD</b> مثال: 2024-01-15</li>
                    <li>الرصيد وعدد الأيام بالأرقام فقط (يمكن استخدام 0.5 لنصف يوم)</li>
                    <li>اسم القسم يجب أن يطابق <b>بالظبط</b> اسم القسم في النظام</li>
                  </ul>
                </div>

                {/* أعمدة الملف */}
                <div style={{ background:"#f8fafc", borderRadius:"16px", padding:"14px 18px", border:"1px solid #e2e8f0" }}>
                  <div style={{ fontWeight:"900", color:"#475569", marginBottom:"8px", fontSize:"13px" }}>📋 الأعمدة المتاحة</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"4px 16px", fontSize:"12px" }}>
                    {[
                      ["الكود الوظيفي","مطلوب دائماً ⭐"],
                      ["الاسم الكامل","مطلوب للإضافة الجديدة"],
                      ["المنصب","اختياري"],
                      ["البريد الإلكتروني","اختياري"],
                      ["الرصيد الحالي","اختياري - رقم"],
                      ["الرصيد الشهري","اختياري - رقم"],
                      ["تاريخ التعيين","اختياري - YYYY-MM-DD"],
                      ["تاريخ العودة","اختياري - YYYY-MM-DD"],
                      ["القسم","اختياري - اسم القسم"],
                    ].map(([col, note]) => (
                      <div key={col} style={{ display:"flex", gap:"6px", alignItems:"center", padding:"3px 0", borderBottom:"1px solid #f1f5f9" }}>
                        <span style={{ fontWeight:"700", color:"#1e293b", minWidth:"130px" }}>{col}</span>
                        <span style={{ color:"#94a3b8" }}>{note}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* الخطوات */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" }}>
                  <div style={{ background:"#eff6ff", borderRadius:"14px", padding:"14px", border:"1px solid #bfdbfe" }}>
                    <div style={{ fontWeight:"900", color:"#1d4ed8", marginBottom:"8px" }}>الخطوة 1: تحميل النموذج</div>
                    <p style={{ fontSize:"12px", color:"#1e40af", margin:"0 0 10px" }}>حمّل النموذج الجاهز يحتوي على أمثلة توضيحية</p>
                    <button onClick={downloadExcelTemplate} style={{ display:"flex", alignItems:"center", gap:"6px", background:"#1d4ed8", color:"white", border:"none", borderRadius:"10px", padding:"9px 14px", fontWeight:"700", cursor:"pointer", fontSize:"13px" }}>
                      <FileDown size={16} /> تحميل النموذج
                    </button>
                  </div>
                  <div style={{ background:"#f0fdf4", borderRadius:"14px", padding:"14px", border:"1px solid #bbf7d0" }}>
                    <div style={{ fontWeight:"900", color:"#15803d", marginBottom:"8px" }}>الخطوة 2: رفع الملف</div>
                    <p style={{ fontSize:"12px", color:"#166534", margin:"0 0 10px" }}>بعد تعبئة البيانات، ارفع الملف هنا</p>
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()} disabled={uploadingFile}
                      style={{ display:"flex", alignItems:"center", gap:"6px", background: uploadingFile ? "#94a3b8" : "#16a34a", color:"white", border:"none", borderRadius:"10px", padding:"9px 14px", fontWeight:"700", cursor: uploadingFile ? "not-allowed" : "pointer", fontSize:"13px" }}>
                      {uploadingFile ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                      {uploadingFile ? "جاري الرفع..." : "اختر ملف Excel"}
                    </button>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* Modal تغيير حالة الموظف يدوياً */}
        {showStatusModal && statusChangeEmp && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0, 0, 0, 0.6)", backdropFilter:"blur(6px)", display:"flex", alignItems:"center", justifyContent:"center", padding:"16px", zIndex:9999 }}
            onClick={() => setShowStatusModal(false)}>
            <div style={{ background:"white", borderRadius:"24px", width:"100%", maxWidth:"420px", padding:"28px", boxShadow:"0 32px 80px rgba(0, 0, 0, 0.25)" }}
              dir="rtl" onClick={e => e.stopPropagation()}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"20px" }}>
                <h3 style={{ margin:0, fontWeight:"900", fontSize:"18px" }}>
                  {statusChangeForm.status === "إجازة" ? "🏖️ تغيير إلى إجازة" : "🏢 تغيير إلى عمل"}
                </h3>
                <button onClick={() => setShowStatusModal(false)} style={{ border:"1px solid #e2e8f0", borderRadius:"8px", padding:"6px 12px", cursor:"pointer", background:"white", fontSize:"16px" }}>✕</button>
              </div>
              <div style={{ background:"#f8fafc", borderRadius:"14px", padding:"12px 16px", marginBottom:"18px", fontSize:"13px" }}>
                <span style={{ fontWeight:"700", color:"#1e293b" }}>{statusChangeEmp.name}</span>
                <span style={{ color:"#64748b", marginRight:"8px" }}>• الرصيد الحالي: <b style={{ color:"#4f46e5" }}>{statusChangeEmp.balance} يوم</b></span>
              </div>
              {statusChangeForm.status === "إجازة" ? (
                <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
                  <div>
                    <label style={{ fontSize:"12px", fontWeight:"700", color:"#64748b", display:"block", marginBottom:"5px" }}>نوع الإجازة</label>
                    <select style={{ width:"100%", padding:"11px 14px", border:"1px solid #e2e8f0", borderRadius:"12px", outline:"none", fontSize:"13px", fontFamily:"inherit" }}
                      value={statusChangeForm.vacation_type_id}
                      onChange={e => setStatusChangeForm({...statusChangeForm, vacation_type_id: e.target.value})}>
                      <option value="">بدون تسجيل نوع</option>
                      {vacationTypes.map((vt:any) => <option key={vt.id} value={vt.id}>{vt.name}</option>)}
                    </select>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px" }}>
                    <div>
                      <label style={{ fontSize:"12px", fontWeight:"700", color:"#64748b", display:"block", marginBottom:"5px" }}>تاريخ البداية</label>
                      <input type="date" style={{ width:"100%", padding:"10px 12px", border:"1px solid #e2e8f0", borderRadius:"12px", outline:"none", fontSize:"13px", boxSizing:"border-box" as any }}
                        value={statusChangeForm.start_date}
                        onChange={e => setStatusChangeForm({...statusChangeForm, start_date: e.target.value})} />
                    </div>
                    <div>
                      <label style={{ fontSize:"12px", fontWeight:"700", color:"#64748b", display:"block", marginBottom:"5px" }}>عدد الأيام</label>
                      <input type="number" min="0" step="0.5" style={{ width:"100%", padding:"10px 12px", border:"1px solid #e2e8f0", borderRadius:"12px", outline:"none", fontSize:"13px", boxSizing:"border-box" as any }}
                        value={statusChangeForm.days}
                        onChange={e => setStatusChangeForm({...statusChangeForm, days: Number(e.target.value)})} />
                    </div>
                  </div>
                  <div style={{ background:"#fffbeb", borderRadius:"10px", padding:"10px 12px", fontSize:"12px", color:"#92400e", border:"1px solid #fde68a" }}>
                    ⚠️ لو عدد الأيام = 0 لن يُخصم من الرصيد ولن يُضاف سجل إجازة
                  </div>
                  <div>
                    <label style={{ fontSize:"12px", fontWeight:"700", color:"#64748b", display:"block", marginBottom:"5px" }}>ملاحظات</label>
                    <textarea rows={2} style={{ width:"100%", padding:"10px 12px", border:"1px solid #e2e8f0", borderRadius:"12px", outline:"none", fontSize:"13px", resize:"none", fontFamily:"inherit", boxSizing:"border-box" as any }}
                      placeholder="سبب التغيير..."
                      value={statusChangeForm.notes}
                      onChange={e => setStatusChangeForm({...statusChangeForm, notes: e.target.value})} />
                  </div>
                  <button onClick={handleManualStatusChange}
                    style={{ padding:"13px", background:"linear-gradient(135deg, #f59e0b, #d97706)", color:"white", border:"none", borderRadius:"12px", fontWeight:"900", cursor:"pointer", fontSize:"14px", fontFamily:"inherit" }}>
                    🏖️ تحويل إلى إجازة
                  </button>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
                  <div style={{ background:"#f0fdf4", borderRadius:"12px", padding:"14px", border:"1px solid #bbf7d0", fontSize:"13px", color:"#15803d" }}>
                    ✅ سيتم تغيير حالة الموظف إلى <b>عمل</b> وتسجيل تاريخ اليوم كتاريخ عودة.
                  </div>
                  <div>
                    <label style={{ fontSize:"12px", fontWeight:"700", color:"#64748b", display:"block", marginBottom:"5px" }}>ملاحظات (اختياري)</label>
                    <textarea rows={2} style={{ width:"100%", padding:"10px 12px", border:"1px solid #e2e8f0", borderRadius:"12px", outline:"none", fontSize:"13px", resize:"none", fontFamily:"inherit", boxSizing:"border-box" as any }}
                      placeholder="سبب التغيير..."
                      value={statusChangeForm.notes}
                      onChange={e => setStatusChangeForm({...statusChangeForm, notes: e.target.value})} />
                  </div>
                  <button onClick={handleManualStatusChange}
                    style={{ padding:"13px", background:"linear-gradient(135deg, #059669, #16a34a)", color:"white", border:"none", borderRadius:"12px", fontWeight:"900", cursor:"pointer", fontSize:"14px", fontFamily:"inherit" }}>
                    🏢 تحويل إلى عمل
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Add Employee Modal */}
        {showAddEmp && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 z-[100]" onClick={() => setShowAddEmp(false)}>
            <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-lg shadow-2xl" dir="rtl" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between mb-8">
                <h3 className="text-2xl font-black">إضافة موظف جديد</h3>
                <button onClick={() => setShowAddEmp(false)}><X size={28} /></button>
              </div>
              <div className="space-y-4">
                <input className="w-full p-4 border rounded-2xl outline-none focus:border-indigo-500" placeholder="الاسم الكامل *" value={newEmp.name} onChange={(e) => setNewEmp({...newEmp, name: e.target.value})} />
                <div className="grid grid-cols-2 gap-4">
                  <input className="p-4 border rounded-2xl outline-none" placeholder="الكود الوظيفي *" value={newEmp.code} onChange={(e) => setNewEmp({...newEmp, code: e.target.value})} />
                  <input className="p-4 border rounded-2xl outline-none" placeholder="المنصب" value={newEmp.position} onChange={(e) => setNewEmp({...newEmp, position: e.target.value})} />
                </div>
                <input type="email" className="w-full p-4 border rounded-2xl outline-none focus:border-indigo-500" placeholder="البريد الإلكتروني" value={newEmp.email} onChange={(e) => setNewEmp({...newEmp, email: e.target.value})} />
                {departments.length > 0 && (
                  <select className="w-full p-4 border rounded-2xl outline-none" value={newEmp.department_id} onChange={(e) => setNewEmp({...newEmp, department_id: e.target.value})}>
                    <option value="">اختر القسم</option>
                    {departments.map(dept => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
                  </select>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-500 font-bold mb-1 block">تاريخ التعيين (بيان فقط)</label>
                    <input type="date" className="w-full p-4 border rounded-2xl outline-none" value={newEmp.hire_date} onChange={(e) => setNewEmp({...newEmp, hire_date: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-xs text-indigo-600 font-bold mb-1 block">تاريخ العودة (لحساب أيام العمل)</label>
                    <input type="date" className="w-full p-4 border-2 border-indigo-300 rounded-2xl outline-none focus:border-indigo-500" value={newEmp.return_date} onChange={(e) => setNewEmp({...newEmp, return_date: e.target.value})} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <input type="number" step="0.5" className="p-4 border rounded-2xl outline-none" placeholder="الرصيد" value={newEmp.balance} onChange={(e) => setNewEmp({...newEmp, balance: Number(e.target.value)})} />
                  <input type="number" step="0.5" className="p-4 border rounded-2xl outline-none" placeholder="الرصيد الشهري" value={newEmp.monthly_balance} onChange={(e) => setNewEmp({...newEmp, monthly_balance: Number(e.target.value)})} />
                </div>
                <button onClick={handleAddEmployee} disabled={isSubmitting} className="w-full bg-indigo-600 text-white p-5 rounded-2xl font-black disabled:opacity-60">{isSubmitting ? "جاري الحفظ..." : "💾 حفظ"}</button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Employee Modal */}
        {editingEmp && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 z-[100]" onClick={() => setEditingEmp(null)}>
            <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-lg shadow-2xl" dir="rtl" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between mb-8">
                <h3 className="text-2xl font-black">تعديل بيانات الموظف</h3>
                <button onClick={() => setEditingEmp(null)}><X size={28} /></button>
              </div>
              <div className="space-y-4">
                <input className="w-full p-4 border rounded-2xl" placeholder="الاسم" value={editingEmp.name || ''} onChange={(e) => setEditingEmp({...editingEmp, name: e.target.value})} />
                <div className="grid grid-cols-2 gap-4">
                  <input className="p-4 border rounded-2xl" placeholder="الكود" value={editingEmp.code || ''} onChange={(e) => setEditingEmp({...editingEmp, code: e.target.value})} />
                  <input className="p-4 border rounded-2xl" placeholder="المنصب" value={editingEmp.position || ''} onChange={(e) => setEditingEmp({...editingEmp, position: e.target.value})} />
                </div>
                <input type="email" className="w-full p-4 border rounded-2xl" placeholder="البريد الإلكتروني" value={editingEmp.email || ''} onChange={(e) => setEditingEmp({...editingEmp, email: e.target.value})} />
                {departments.length > 0 && (
                  <select className="w-full p-4 border rounded-2xl" value={editingEmp.department_id || ''} onChange={(e) => setEditingEmp({...editingEmp, department_id: e.target.value})}>
                    <option value="">بدون قسم</option>
                    {departments.map(dept => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
                  </select>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-500 font-bold mb-1 block">تاريخ التعيين (بيان فقط)</label>
                    <input type="date" className="w-full p-4 border rounded-2xl" value={editingEmp.hire_date || ''} onChange={(e) => setEditingEmp({...editingEmp, hire_date: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-xs text-indigo-600 font-bold mb-1 block">تاريخ العودة (لحساب أيام العمل)</label>
                    <input type="date" className="w-full p-4 border-2 border-indigo-300 rounded-2xl" value={editingEmp.return_date || ''} onChange={(e) => setEditingEmp({...editingEmp, return_date: e.target.value})} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <input type="number" step="0.5" className="p-4 border rounded-2xl" placeholder="الرصيد" value={editingEmp.balance || 0} onChange={(e) => setEditingEmp({...editingEmp, balance: Number(e.target.value)})} />
                  <input type="number" step="0.5" className="p-4 border rounded-2xl" placeholder="الرصيد الشهري" value={editingEmp.monthly_balance || 0} onChange={(e) => setEditingEmp({...editingEmp, monthly_balance: Number(e.target.value)})} />
                </div>
                <button onClick={handleUpdateEmployee} className="w-full bg-indigo-600 text-white p-5 rounded-2xl font-black">تحديث</button>
              </div>
            </div>
          </div>
        )}

        {/* Approval Modal - مع بيانات الموظف الكاملة */}
        {showApprovalModal && currentRequest && (() => {
          const empInfo = employees.find(e => e.id === currentRequest.employee_id);
          const empStatus = empInfo ? getEmployeeStatus(empInfo) : "عمل";
          const workedDays = calculateWorkedDays(empInfo?.return_date, empStatus === "إجازة");
          const totalApproved = requests.filter(r => r.employee_id === empInfo?.id && r.status === "approved").reduce((s,r) => s + Number(r.days), 0);
          const balanceOk = Number(empInfo?.balance || 0) >= Number(currentRequest.days);
          return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-[100]" onClick={() => setShowApprovalModal(false)}>
            <div style={{ background:"white", borderRadius:"24px", width:"100%", maxWidth:"480px", padding:"24px", boxShadow:"0 24px 60px rgba(0, 0, 0, 0.18)", maxHeight:"90vh", overflowY:"auto" }} dir="rtl" onClick={e => e.stopPropagation()}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"18px" }}>
                <h3 style={{ margin:0, fontWeight:"900", fontSize:"18px" }}>
                  {currentRequest.action === "approved" ? "✅ موافقة على الطلب" : "❌ رفض الطلب"}
                </h3>
                <button onClick={() => setShowApprovalModal(false)} style={{ border:"1px solid #e2e8f0", borderRadius:"10px", padding:"6px 10px", cursor:"pointer", background:"white" }}><X size={16}/></button>
              </div>

              {/* بطاقة الموظف */}
              {empInfo && (
                <div style={{ background:"linear-gradient(135deg, #f8faff, #f0f4ff)", borderRadius:"18px", padding:"16px", marginBottom:"14px", border:"1px solid #e0e7ff" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:"12px", marginBottom:"14px" }}>
                    <div style={{ width:"50px", height:"50px", borderRadius:"50%", background:"linear-gradient(135deg, #4f46e5, #7c3aed)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:"900", fontSize:"20px", color:"white", flexShrink:0 }}>
                      {empInfo.name?.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontWeight:"900", fontSize:"16px", color:"#1e293b" }}>{empInfo.name}</div>
                      <div style={{ fontSize:"12px", color:"#64748b" }}>{empInfo.position || "-"} {empInfo.code ? "· كود: " + empInfo.code : ""}</div>
                      {empInfo.hire_date && <div style={{ fontSize:"11px", color:"#94a3b8" }}>تاريخ التعيين: {formatDate(empInfo.hire_date)}</div>}
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:"8px" }}>
                    <div style={{ background: balanceOk ? "#f0fdf4" : "#fff1f2", borderRadius:"12px", padding:"10px", textAlign:"center", border: balanceOk ? "1px solid #bbf7d0" : "2px solid #fecdd3" }}>
                      <div style={{ fontSize:"22px", fontWeight:"900", color: balanceOk ? "#16a34a" : "#dc2626" }}>{empInfo.balance}</div>
                      <div style={{ fontSize:"10px", color:"#64748b", marginTop:"2px" }}>رصيد الإجازة</div>
                      {!balanceOk && <div style={{ fontSize:"9px", color:"#dc2626", fontWeight:"700" }}>⚠️ غير كافٍ!</div>}
                    </div>
                    <div style={{ background:"#fffbeb", borderRadius:"12px", padding:"10px", textAlign:"center", border:"1px solid #fde68a" }}>
                      <div style={{ fontSize:"22px", fontWeight:"900", color:"#d97706" }}>{workedDays}</div>
                      <div style={{ fontSize:"10px", color:"#64748b", marginTop:"2px" }}>أيام العمل</div>
                    </div>
                    <div style={{ background:"#f5f3ff", borderRadius:"12px", padding:"10px", textAlign:"center", border:"1px solid #ddd6fe" }}>
                      <div style={{ fontSize:"22px", fontWeight:"900", color:"#7c3aed" }}>{totalApproved}</div>
                      <div style={{ fontSize:"10px", color:"#64748b", marginTop:"2px" }}>إجمالي الإجازات</div>
                    </div>
                  </div>
                  <div style={{ marginTop:"10px", display:"flex", justifyContent:"space-between", fontSize:"11px", color:"#94a3b8" }}>
                    <span>الرصيد الشهري: <b style={{ color:"#059669" }}>{empInfo.monthly_balance || 0} يوم</b></span>
                    {empInfo.email
                      ? <span style={{ color:"#4f46e5", display:"flex", alignItems:"center", gap:"3px" }}><Mail size={11}/> {empInfo.email}</span>
                      : <span style={{ color:"#f59e0b" }}>⚠️ لا يوجد بريد إلكتروني</span>
                    }
                  </div>
                </div>
              )}

              {/* تفاصيل الطلب */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px", marginBottom:"14px" }}>
                <div style={{ background:"#f8fafc", borderRadius:"12px", padding:"12px" }}>
                  <div style={{ fontSize:"11px", color:"#94a3b8", marginBottom:"3px" }}>تاريخ البداية</div>
                  <div style={{ fontWeight:"800", fontSize:"14px" }}>{formatDate(currentRequest.start_date)}</div>
                </div>
                <div style={{ background:"#f8fafc", borderRadius:"12px", padding:"12px" }}>
                  <div style={{ fontSize:"11px", color:"#94a3b8", marginBottom:"3px" }}>المدة المطلوبة</div>
                  <div style={{ fontWeight:"900", fontSize:"22px", color:"#4f46e5" }}>{currentRequest.days} يوم</div>
                </div>
              </div>

              <textarea style={{ width:"100%", padding:"12px", border:"1px solid #e2e8f0", borderRadius:"12px", outline:"none", resize:"none", boxSizing:"border-box", fontSize:"13px", marginBottom:"12px" }}
                rows={3} placeholder="ملاحظات للموظف (اختياري)..." value={adminNotes} onChange={e => setAdminNotes(e.target.value)}/>

              <button onClick={handleActionWithNotes}
                style={{ width:"100%", padding:"14px", borderRadius:"14px", fontWeight:"900", fontSize:"15px", border:"none", cursor:"pointer", color:"white",
                  background: currentRequest.action === "approved" ? "linear-gradient(135deg,#059669,#10b981)" : "linear-gradient(135deg,#dc2626,#ef4444)" }}>
                {currentRequest.action === "approved" ? "✅ تأكيد الموافقة وإرسال الإشعار" : "❌ تأكيد الرفض وإرسال الإشعار"}
              </button>
            </div>
          </div>
          );
        })()}

        {/* Modal: المدير يعدّل الإجازة */}
        {showManagerEditModal && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0, 0, 0, 0.5)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", padding:"16px", zIndex:200 }} onClick={() => setShowManagerEditModal(false)}>
            <div style={{ background:"white", borderRadius:"24px", width:"100%", maxWidth:"420px", padding:"24px" }} dir="rtl" onClick={e => e.stopPropagation()}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"18px" }}>
                <div>
                  <h3 style={{ margin:0, fontWeight:"900", fontSize:"17px" }}>✏️ تعديل الإجازة</h3>
                  <div style={{ fontSize:"12px", color:"#64748b", marginTop:"3px" }}>{mgrEditForm.empName}</div>
                </div>
                <button onClick={() => setShowManagerEditModal(false)} style={{ border:"1px solid #e2e8f0", borderRadius:"8px", padding:"5px 9px", cursor:"pointer" }}><X size={16}/></button>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
                {[
                  { label:"تاريخ البداية", type:"date", val:mgrEditForm.start_date, set:(v:string) => setMgrEditForm({...mgrEditForm, start_date:v}) },
                ].map(f => (
                  <div key={f.label}><label style={{ fontSize:"12px", color:"#64748b", fontWeight:"700", display:"block", marginBottom:"5px" }}>{f.label}</label>
                    <input type={f.type} style={{ width:"100%", padding:"11px 14px", border:"1px solid #e2e8f0", borderRadius:"12px", outline:"none", boxSizing:"border-box", fontSize:"13px" }} value={f.val} onChange={e => f.set(e.target.value)}/></div>
                ))}
                <div><label style={{ fontSize:"12px", color:"#64748b", fontWeight:"700", display:"block", marginBottom:"5px" }}>عدد الأيام الجديد</label>
                  <input type="number" step="0.5" min="0.5" style={{ width:"100%", padding:"11px 14px", border:"1px solid #e2e8f0", borderRadius:"12px", outline:"none", boxSizing:"border-box", fontSize:"20px", fontWeight:"900", textAlign:"center" }}
                    value={mgrEditForm.days} onChange={e => setMgrEditForm({...mgrEditForm, days: Number(e.target.value)})}/>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:"12px", color:"#94a3b8", marginTop:"5px" }}>
                    <span>كان: <b>{mgrEditForm.oldDays} يوم</b></span>
                    <span>سيصبح: <b style={{ color: mgrEditForm.days > mgrEditForm.oldDays ? "#dc2626" : "#16a34a" }}>{mgrEditForm.days} يوم</b></span>
                  </div>
                </div>
                <div><label style={{ fontSize:"12px", color:"#64748b", fontWeight:"700", display:"block", marginBottom:"5px" }}>سبب التعديل *</label>
                  <textarea style={{ width:"100%", padding:"11px 14px", border:"1px solid #e2e8f0", borderRadius:"12px", outline:"none", resize:"none", boxSizing:"border-box", fontSize:"13px" }}
                    rows={3} placeholder="اكتب سبب التعديل..." value={mgrEditForm.reason} onChange={e => setMgrEditForm({...mgrEditForm, reason: e.target.value})}/></div>
                <button onClick={handleManagerEditRequest} style={{ padding:"13px", background:"linear-gradient(135deg, #059669, #10b981)", color:"white", border:"none", borderRadius:"12px", fontWeight:"900", cursor:"pointer", fontSize:"14px" }}>
                  💾 حفظ التعديل
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: طباعة ومشاركة الطلبات */}
        {showPrintModal && (() => {
          const approvedReqs = requests.filter(r => {
            if (r.status !== "approved") return false;
            if (printFrom && r.start_date < printFrom) return false;
            if (printTo && r.start_date > printTo) return false;
            return true;
          });
          const allSel = approvedReqs.length > 0 && printSelected.length === approvedReqs.length;
          return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0, 0, 0, 0.6)", backdropFilter:"blur(5px)", display:"flex", alignItems:"center", justifyContent:"center", padding:"16px", zIndex:200 }} onClick={() => setShowPrintModal(false)}>
            <div style={{ background:"white", borderRadius:"24px", width:"100%", maxWidth:"580px", padding:"24px", maxHeight:"90vh", display:"flex", flexDirection:"column" }} dir="rtl" onClick={e => e.stopPropagation()}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"16px" }}>
                <h3 style={{ margin:0, fontWeight:"900", fontSize:"17px" }}>🖨️ طباعة ومشاركة الطلبات المقبولة</h3>
                <button onClick={() => setShowPrintModal(false)} style={{ border:"1px solid #e2e8f0", borderRadius:"8px", padding:"5px 9px", cursor:"pointer" }}><X size={16}/></button>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px", marginBottom:"12px" }}>
                {[{ label:"من تاريخ", val:printFrom, set:setPrintFrom }, { label:"إلى تاريخ", val:printTo, set:setPrintTo }].map(f => (
                  <div key={f.label}><label style={{ fontSize:"11px", color:"#64748b", fontWeight:"700", display:"block", marginBottom:"4px" }}>{f.label}</label>
                    <input type="date" style={{ width:"100%", padding:"9px 12px", border:"1px solid #e2e8f0", borderRadius:"10px", outline:"none", boxSizing:"border-box" }}
                      value={f.val} onChange={e => { f.set(e.target.value); setPrintSelected([]); }}/></div>
                ))}
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"8px" }}>
                <span style={{ fontSize:"12px", color:"#64748b" }}>{approvedReqs.length} طلب · <b style={{ color:"#4f46e5" }}>{printSelected.length} محدد</b></span>
                <button onClick={() => setPrintSelected(allSel ? [] : approvedReqs.map(r => r.id))}
                  style={{ background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:"8px", padding:"5px 12px", cursor:"pointer", fontSize:"12px", fontWeight:"700" }}>
                  {allSel ? "إلغاء الكل" : "تحديد الكل"}
                </button>
              </div>
              <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:"6px", marginBottom:"14px" }}>
                {approvedReqs.length === 0
                  ? <div style={{ textAlign:"center", padding:"30px", color:"#94a3b8" }}>لا توجد طلبات مقبولة في هذه الفترة</div>
                  : approvedReqs.map(req => {
                    const isSel = printSelected.includes(req.id);
                    const vt = vacationTypes.find(v => v.id === req.vacation_type_id);
                    const { end } = getCalculatedDates(req.start_date, req.days);
                    return (
                      <div key={req.id} onClick={() => setPrintSelected(prev => isSel ? prev.filter(i => i !== req.id) : [...prev, req.id])}
                        style={{ display:"flex", alignItems:"center", gap:"10px", padding:"10px 12px", borderRadius:"12px", border:`2px solid ${isSel ? "#4f46e5" : "#e2e8f0"}`, background: isSel ? "#f5f3ff" : "white", cursor:"pointer" }}>
                        <div style={{ width:"18px", height:"18px", borderRadius:"5px", border:`2px solid ${isSel ? "#4f46e5" : "#cbd5e1"}`, background: isSel ? "#4f46e5" : "white", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                          {isSel && <span style={{ color:"white", fontSize:"11px" }}>✓</span>}
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:"700", fontSize:"13px" }}>{req.employee_name}</div>
                          <div style={{ fontSize:"11px", color:"#64748b" }}>
                            {formatDate(req.start_date)} ← {formatDate(end)} | {req.days} يوم
                            {vt && <span style={{ marginRight:"6px", padding:"1px 7px", borderRadius:"20px", background:vt.color+"20", color:vt.color, fontSize:"10px", fontWeight:"700" }}>{vt.name}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })
                }
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"10px" }}>
                <button disabled={!printSelected.length}
                  onClick={() => {
                    const sel = requests.filter(r => printSelected.includes(r.id));
                    const rows = sel.map((r,i) => {
                      const vt = vacationTypes.find(v => v.id === r.vacation_type_id);
                      const { end } = getCalculatedDates(r.start_date, r.days);
                      return "<tr style=\"background:" + (i%2?"#f9fafb":"white") + "\"><td>" + (i+1) + "</td><td>" + r.employee_name + "</td><td>" + (vt?.name||"-") + "</td><td>" + formatDate(r.start_date) + "</td><td>" + r.days + "</td><td>" + formatDate(end) + "</td></tr>";
                    }).join("");
                    const html = "<html dir=\"rtl\"><head><title>تقرير الإجازات</title><style>*{font-family:Arial,sans-serif}body{padding:30px}h2{color:#1e1b4b;border-bottom:3px solid #4f46e5;padding-bottom:10px}table{width:100%;border-collapse:collapse;margin-top:20px}th{background:#4f46e5;color:white;padding:12px;text-align:right}td{padding:10px;border-bottom:1px solid #e5e7eb;text-align:right}.meta{color:#6b7280;font-size:13px;margin-bottom:20px}</style></head><body><h2>📋 تقرير الإجازات المقبولة</h2><div class=\"meta\">الفترة: " + (printFrom||"الكل") + " — " + (printTo||"الكل") + " | عدد الطلبات: " + sel.length + "</div><table><thead><tr><th>#</th><th>الموظف</th><th>نوع الإجازة</th><th>تاريخ البداية</th><th>المدة</th><th>نهاية الإجازة</th></tr></thead><tbody>" + rows + "</tbody></table></body></html>";
                    printHTMLContent(html);
                  }}
                  style={{ padding:"13px", background:!printSelected.length?"#f1f5f9":"linear-gradient(135deg, #1d4ed8, #3b82f6)", color:!printSelected.length?"#94a3b8":"white", border:"none", borderRadius:"12px", fontWeight:"800", cursor:!printSelected.length?"not-allowed":"pointer", fontSize:"13px" }}>
                  🖨️ طباعة ({printSelected.length})
                </button>
                <button disabled={!printSelected.length}
                  onClick={async () => {
                    const sel = requests.filter(r => printSelected.includes(r.id));
                    const rows = sel.map((r,i) => {
                      const vt = vacationTypes.find(v => v.id === r.vacation_type_id);
                      const { end } = getCalculatedDates(r.start_date, r.days);
                      return "<tr style=\"background:" + (i%2?"#f9fafb":"white") + "\"><td>" + (i+1) + "</td><td>" + r.employee_name + "</td><td>" + (vt?.name||"-") + "</td><td>" + formatDate(r.start_date) + "</td><td>" + r.days + "</td><td>" + formatDate(end) + "</td></tr>";
                    }).join("");
                    const html = "<html dir=\"rtl\"><head><title>تقرير الإجازات</title><style>*{font-family:Arial,sans-serif}body{padding:30px}h2{color:#1e1b4b;border-bottom:3px solid #4f46e5;padding-bottom:10px}table{width:100%;border-collapse:collapse;margin-top:20px}th{background:#4f46e5;color:white;padding:12px;text-align:right}td{padding:10px;border-bottom:1px solid #e5e7eb;text-align:right}.meta{color:#6b7280;font-size:13px;margin-bottom:20px}</style></head><body><h2>📋 تقرير الإجازات المقبولة</h2><div class=\"meta\">الفترة: " + (printFrom||"الكل") + " — " + (printTo||"الكل") + " | عدد الطلبات: " + sel.length + "</div><table><thead><tr><th>#</th><th>الموظف</th><th>نوع الإجازة</th><th>تاريخ البداية</th><th>المدة</th><th>نهاية الإجازة</th></tr></thead><tbody>" + rows + "</tbody></table></body></html>";
                    await exportHTMLToPDF(html, `تقرير-الإجازات-${new Date().toISOString().split("T")[0]}`);
                  }}
                  style={{ padding:"13px", background:!printSelected.length?"#f1f5f9":"linear-gradient(135deg, #dc2626, #b91c1c)", color:!printSelected.length?"#94a3b8":"white", border:"none", borderRadius:"12px", fontWeight:"800", cursor:!printSelected.length?"not-allowed":"pointer", fontSize:"13px", fontFamily:"inherit" }}>
                  📄 PDF ({printSelected.length})
                </button>
                <button disabled={!printSelected.length}
                  onClick={async () => {
                    const sel = requests.filter(r => printSelected.includes(r.id));
                    const rows = sel.map((r:any,i:number) => {
                      const vt = vacationTypes.find((v:any) => v.id === r.vacation_type_id);
                      const { end } = getCalculatedDates(r.start_date, r.days);
                      const bg = i%2 ? "#f8fafc" : "white";
                      return `<tr style="background:${bg}"><td style="padding:10px 14px;font-weight:800;color:#1e293b;border-bottom:1px solid #f1f5f9">${i+1}</td><td style="padding:10px 14px;font-weight:700;color:#1e293b;border-bottom:1px solid #f1f5f9">${r.employee_name}</td><td style="padding:10px 14px;color:#4f46e5;font-weight:700;border-bottom:1px solid #f1f5f9">${(vt as any)?.name||"-"}</td><td style="padding:10px 14px;color:#374151;border-bottom:1px solid #f1f5f9">${formatDate(r.start_date)}</td><td style="padding:10px 14px;color:#374151;border-bottom:1px solid #f1f5f9">${formatDate(end)}</td><td style="padding:10px 14px;font-weight:900;color:#059669;border-bottom:1px solid #f1f5f9">${r.days} يوم</td></tr>`;
                    }).join("");
                    const html = `<div style="font-family:Arial,sans-serif;direction:rtl;background:white;padding:28px;min-width:640px"><div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;padding-bottom:14px;border-bottom:3px solid #4f46e5"><div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:10px 18px;border-radius:10px;color:white;font-weight:900;font-size:17px">📋 تقرير الإجازات المقبولة</div><div style="color:#64748b;font-size:12px">${printFrom||"الكل"} ← ${printTo||"الكل"} | ${sel.length} طلب</div></div><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:linear-gradient(135deg,#4f46e5,#7c3aed);color:white"><th style="padding:10px 14px;text-align:right">#</th><th style="padding:10px 14px;text-align:right">الموظف</th><th style="padding:10px 14px;text-align:right">نوع الإجازة</th><th style="padding:10px 14px;text-align:right">تاريخ البداية</th><th style="padding:10px 14px;text-align:right">نهاية الإجازة</th><th style="padding:10px 14px;text-align:right">الأيام</th></tr></thead><tbody>${rows}</tbody></table><div style="margin-top:14px;font-size:11px;color:#94a3b8;text-align:center">تم الإنشاء: ${new Date().toLocaleDateString("ar-EG")}</div></div>`;
                    try {
                      const wrap = document.createElement("div");
                      wrap.style.cssText = "position:fixed;top:-9999px;left:-9999px";
                      wrap.innerHTML = html;
                      document.body.appendChild(wrap);
                      const el = wrap.firstElementChild as HTMLElement;
                      if ((window as any).html2canvas) {
                        const canvas = await (window as any).html2canvas(el, { scale:2, useCORS:true, backgroundColor:"#ffffff" });
                        document.body.removeChild(wrap);
                        canvas.toBlob(async (blob:Blob|null) => {
                          if (!blob) return;
                          const file = new File([blob], "تقرير-الإجازات.png", { type:"image/png" });
                          if (navigator.canShare?.({ files:[file] })) { await navigator.share({ files:[file], title:"تقرير الإجازات" }); }
                          else { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href=url; a.download="تقرير-الإجازات.png"; a.click(); URL.revokeObjectURL(url); }
                        }, "image/png");
                      } else {
                        document.body.removeChild(wrap);
                        printHTMLContent(`<html dir="rtl"><head><title>تقرير الإجازات</title></head><body style="margin:20px">${html}</body></html>`);
                      }
                    } catch(e:any) { alert("خطأ: " + e?.message); }
                  }}
                  style={{ padding:"13px", background:!printSelected.length?"#f1f5f9":"linear-gradient(135deg, #8b5cf6, #6366f1)", color:!printSelected.length?"#94a3b8":"white", border:"none", borderRadius:"12px", fontWeight:"900", cursor:!printSelected.length?"not-allowed":"pointer", fontSize:"14px", fontFamily:"inherit" }}>
                  📤 مشاركة صورة ({printSelected.length})
                </button>
              </div>
            </div>
          </div>
          );
        })()}

        {/* ===== Employee Info Modal ===== */}
        {showEmpInfoModal && empInfoTarget && (() => {
          const e = empInfoTarget;
          const eStatus = getEmployeeStatus(e);
          const workedDays = calculateWorkedDays(e.return_date, eStatus === "إجازة");
          const dept = departments.find(d => d.id === e.department_id);
          const totalApproved = requests.filter(r => r.employee_id === e.id && r.status === "approved").reduce((s,r)=>s+Number(r.days),0);
          const pendingCount = requests.filter(r => r.employee_id === e.id && (r.status==="pending"||r.status==="dept_approved")).length;
          const req = e.req;
          const vacType = req ? vacationTypes.find(vt=>vt.id===req.vacation_type_id) : null;
          const reqEnd = req ? getCalculatedDates(req.start_date, req.days).end : null;
          return (
          <div style={{ position:"fixed", inset:0, background:"rgba(15, 23, 42, 0.65)", backdropFilter:"blur(6px)", display:"flex", alignItems:"center", justifyContent:"center", padding:"16px", zIndex:300 }}
            onClick={() => { setShowEmpInfoModal(false); setEmpInfoTarget(null); }}>
            <div style={{ background:"white", borderRadius:"28px", width:"100%", maxWidth:"440px", overflow:"hidden", boxShadow:"0 32px 80px rgba(0, 0, 0, 0.25)" }}
              dir="rtl" onClick={ev => ev.stopPropagation()}>

              {/* Header بالـ gradient */}
              <div style={{ background:"linear-gradient(135deg, #1e1b4b 0%, #4f46e5 60%, #7c3aed 100%)", padding:"24px 24px 20px", position:"relative" }}>
                <button onClick={() => { setShowEmpInfoModal(false); setEmpInfoTarget(null); }}
                  style={{ position:"absolute", top:"16px", left:"16px", background:"rgba(255, 255, 255, 0.15)", border:"none", borderRadius:"10px", padding:"6px 10px", cursor:"pointer", color:"white", fontSize:"16px" }}>✕</button>
                <div style={{ display:"flex", alignItems:"center", gap:"14px" }}>
                  <div style={{ width:"58px", height:"58px", borderRadius:"50%", background:"linear-gradient(135deg, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.1))", border:"2px solid rgba(255, 255, 255, 0.4)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"24px", fontWeight:"900", color:"white", flexShrink:0 }}>
                    {e.name?.charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontWeight:"900", fontSize:"20px", color:"white" }}>{e.name}</div>
                    <div style={{ fontSize:"12px", color:"rgba(255, 255, 255, 0.75)", marginTop:"3px" }}>{e.position || "—"}</div>
                    <div style={{ display:"flex", gap:"8px", marginTop:"6px" }}>
                      {e.code && <span style={{ background:"rgba(255, 255, 255, 0.2)", borderRadius:"20px", padding:"2px 10px", fontSize:"11px", color:"white", fontWeight:"700" }}>#{e.code}</span>}
                      {dept && <span style={{ background:"rgba(255, 255, 255, 0.2)", borderRadius:"20px", padding:"2px 10px", fontSize:"11px", color:"white", fontWeight:"700" }}>🏢 {dept.name}</span>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div style={{ padding:"18px 20px", display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"10px", borderBottom:"1px solid #f1f5f9" }}>
                <div style={{ background: Number(e.balance||0) >= Number(req?.days||0) ? "#f0fdf4" : "#fff1f2", borderRadius:"14px", padding:"12px", textAlign:"center", border: Number(e.balance||0) >= Number(req?.days||0) ? "1px solid #bbf7d0" : "2px solid #fecdd3" }}>
                  <div style={{ fontSize:"26px", fontWeight:"900", color: Number(e.balance||0) >= Number(req?.days||0) ? "#16a34a" : "#dc2626" }}>{e.balance ?? 0}</div>
                  <div style={{ fontSize:"10px", color:"#64748b", marginTop:"2px", fontWeight:"600" }}>رصيد الإجازة</div>
                  {Number(e.balance||0) < Number(req?.days||0) && <div style={{ fontSize:"9px", color:"#dc2626", fontWeight:"800", marginTop:"2px" }}>⚠️ غير كافٍ</div>}
                </div>
                <div style={{ background:"#fffbeb", borderRadius:"14px", padding:"12px", textAlign:"center", border:"1px solid #fde68a" }}>
                  <div style={{ fontSize:"26px", fontWeight:"900", color:"#d97706" }}>{workedDays}</div>
                  <div style={{ fontSize:"10px", color:"#64748b", marginTop:"2px", fontWeight:"600" }}>أيام العمل</div>
                </div>
                <div style={{ background:"#f5f3ff", borderRadius:"14px", padding:"12px", textAlign:"center", border:"1px solid #ddd6fe" }}>
                  <div style={{ fontSize:"26px", fontWeight:"900", color:"#7c3aed" }}>{totalApproved}</div>
                  <div style={{ fontSize:"10px", color:"#64748b", marginTop:"2px", fontWeight:"600" }}>إجمالي الإجازات</div>
                </div>
              </div>

              {/* بيانات إضافية */}
              <div style={{ padding:"16px 20px", display:"flex", flexDirection:"column", gap:"8px", borderBottom:"1px solid #f1f5f9" }}>
                {e.hire_date && (
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:"13px" }}>
                    <span style={{ color:"#94a3b8", fontWeight:"600" }}>📅 تاريخ التعيين</span>
                    <span style={{ fontWeight:"700", color:"#1e293b" }}>{e.hire_date}</span>
                  </div>
                )}
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:"13px" }}>
                  <span style={{ color:"#94a3b8", fontWeight:"600" }}>💰 الرصيد الشهري</span>
                  <span style={{ fontWeight:"700", color:"#059669" }}>{e.monthly_balance || 0} يوم</span>
                </div>
                {pendingCount > 0 && (
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:"13px" }}>
                    <span style={{ color:"#94a3b8", fontWeight:"600" }}>⏳ طلبات معلقة</span>
                    <span style={{ fontWeight:"700", color:"#d97706" }}>{pendingCount} طلب</span>
                  </div>
                )}
                {e.email && (
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:"13px" }}>
                    <span style={{ color:"#94a3b8", fontWeight:"600" }}>✉️ البريد</span>
                    <span style={{ fontWeight:"700", color:"#4f46e5", fontSize:"12px" }}>{e.email}</span>
                  </div>
                )}
              </div>

              {/* تفاصيل الطلب الحالي */}
              {req && (
                <div style={{ padding:"16px 20px", background:"#f8faff", borderBottom:"1px solid #e0e7ff" }}>
                  <div style={{ fontSize:"11px", fontWeight:"800", color:"#4f46e5", marginBottom:"10px", textTransform:"uppercase", letterSpacing:"0.5px" }}>📋 الطلب الحالي</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px" }}>
                    <div style={{ background:"white", borderRadius:"10px", padding:"10px", border:"1px solid #e0e7ff" }}>
                      <div style={{ fontSize:"10px", color:"#94a3b8", marginBottom:"2px" }}>تاريخ البداية</div>
                      <div style={{ fontWeight:"800", fontSize:"13px", color:"#1e293b" }}>{req.start_date}</div>
                    </div>
                    <div style={{ background:"white", borderRadius:"10px", padding:"10px", border:"1px solid #e0e7ff" }}>
                      <div style={{ fontSize:"10px", color:"#94a3b8", marginBottom:"2px" }}>المدة المطلوبة</div>
                      <div style={{ fontWeight:"900", fontSize:"18px", color:"#4f46e5" }}>{req.days} يوم</div>
                    </div>
                    {reqEnd && (
                      <div style={{ background:"white", borderRadius:"10px", padding:"10px", border:"1px solid #e0e7ff" }}>
                        <div style={{ fontSize:"10px", color:"#94a3b8", marginBottom:"2px" }}> تاريخ نهاية الإجازة</div>
                        <div style={{ fontWeight:"800", fontSize:"13px", color:"#059669" }}>{reqEnd}</div>
                      </div>
                    )}
                    {vacType && (
                      <div style={{ background:"white", borderRadius:"10px", padding:"10px", border:"1px solid #e0e7ff" }}>
                        <div style={{ fontSize:"10px", color:"#94a3b8", marginBottom:"2px" }}>نوع الإجازة</div>
                        <div style={{ fontWeight:"800", fontSize:"12px", color:vacType.color }}>{vacType.name}</div>
                      </div>
                    )}
                  </div>
                  {req.notes && (
                    <div style={{ marginTop:"8px", background:"#fffbeb", borderRadius:"10px", padding:"10px", border:"1px solid #fde68a", fontSize:"12px", color:"#92400e", fontStyle:"italic" }}>
                      💬 "{req.notes}"
                    </div>
                  )}
                </div>
              )}

              {/* زر إغلاق */}
              <div style={{ padding:"16px 20px" }}>
                <button onClick={() => { setShowEmpInfoModal(false); setEmpInfoTarget(null); }}
                  style={{ width:"100%", padding:"12px", background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:"14px", fontWeight:"700", cursor:"pointer", fontSize:"14px", color:"#475569" }}>
                  إغلاق
                </button>
              </div>
            </div>
          </div>
          );
        })()}

        {/* Edit Vacation Modal */}
        {editingVac && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 z-[100]" onClick={() => setEditingVac(null)}>
            <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-lg shadow-2xl" dir="rtl" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between mb-8">
                <h3 className="text-2xl font-black">تعديل طلب الإجازة</h3>
                <button onClick={() => setEditingVac(null)}><X size={28} /></button>
              </div>
              <div className="space-y-5">
                <div className="bg-slate-50 p-4 rounded-xl"><p className="font-black text-lg">{editingVac.employee_name}</p></div>
                <input type="date" className="w-full p-4 border rounded-2xl" value={editingVac.start_date} onChange={(e) => setEditingVac({...editingVac, start_date: e.target.value})} />
                <input type="number" step="0.5" className="w-full p-4 border rounded-2xl" value={editingVac.days} onChange={(e) => setEditingVac({...editingVac, days: Number(e.target.value)})} />
                {vacationTypes.length > 0 && (
                  <select className="w-full p-4 border rounded-2xl" value={editingVac.vacation_type_id || ''} onChange={(e) => setEditingVac({...editingVac, vacation_type_id: e.target.value})}>
                    <option value="">اختر النوع</option>
                    {vacationTypes.map(vt => <option key={vt.id} value={vt.id}>{vt.name}</option>)}
                  </select>
                )}
                <textarea className="w-full p-4 border rounded-2xl resize-none" rows={3} value={editingVac.notes || ''} onChange={(e) => setEditingVac({...editingVac, notes: e.target.value})} />
                <button onClick={handleUpdateVacation} className="w-full bg-indigo-600 text-white p-5 rounded-2xl font-black">حفظ</button>
              </div>
            </div>
          </div>
        )}

        {/* Return Modal */}
        {showReturnModal && returnData && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 z-[100]" onClick={() => setShowReturnModal(false)}>
            <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-lg shadow-2xl" dir="rtl" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between mb-8">
                <h3 className="text-2xl font-black">✅ تسجيل العودة من الإجازة</h3>
                <button onClick={() => setShowReturnModal(false)}><X size={28} /></button>
              </div>
              <div className="space-y-5">
                <div className="bg-slate-50 p-6 rounded-xl">
                  <p className="font-black text-lg mb-2">{returnData.employee_name}</p>
                  <div className="text-sm space-y-1">
                    <p><span className="text-slate-500">بداية الإجازة:</span> <span className="font-bold">{formatDate(returnData.start_date)}</span></p>
                    <p><span className="text-slate-500">المدة:</span> <span className="font-bold">{returnData.days} يوم</span></p>
                    <p><span className="text-slate-500">العودة المتوقعة:</span> <span className="font-bold text-indigo-600">{formatDate(getCalculatedDates(returnData.start_date, returnData.days).back)}</span></p>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-black mb-2 block text-indigo-700">تاريخ العودة الفعلي (سيُحفظ في بيانات الموظف لحساب أيام العمل)</label>
                  <input type="date" className="w-full p-4 border-2 border-indigo-300 rounded-2xl" value={returnData.actual_return_date} onChange={(e) => setReturnData({...returnData, actual_return_date: e.target.value})} />
                </div>
                <button onClick={handleReturnFromVacation} className="w-full bg-emerald-600 text-white p-5 rounded-2xl font-black">تأكيد العودة وتحديث البيانات</button>
              </div>
            </div>
          </div>
        )}

        {/* Add Department Modal */}
        {showAddDept && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 z-[100]" onClick={() => setShowAddDept(false)}>
            <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-lg shadow-2xl" dir="rtl" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between mb-8">
                <h3 className="text-2xl font-black">إضافة قسم جديد</h3>
                <button onClick={() => setShowAddDept(false)}><X size={28} /></button>
              </div>
              <div className="space-y-5">
                <input className="w-full p-4 border rounded-2xl" placeholder="اسم القسم" value={newDept.name} onChange={(e) => setNewDept({...newDept, name: e.target.value})} />
                <textarea className="w-full p-4 border rounded-2xl resize-none" rows={3} placeholder="وصف القسم (اختياري)" value={newDept.description} onChange={(e) => setNewDept({...newDept, description: e.target.value})} />
                <button onClick={handleAddDepartment} className="w-full bg-indigo-600 text-white p-5 rounded-2xl font-black">إضافة</button>
              </div>
            </div>
          </div>
        )}

        {/* Add Holiday Modal */}
        {showAddHoliday && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 z-[100]" onClick={() => setShowAddHoliday(false)}>
            <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-lg shadow-2xl" dir="rtl" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between mb-8">
                <h3 className="text-2xl font-black">إضافة عطلة رسمية</h3>
                <button onClick={() => setShowAddHoliday(false)}><X size={28} /></button>
              </div>
              <div className="space-y-5">
                <input className="w-full p-4 border rounded-2xl" placeholder="اسم العطلة" value={newHoliday.name} onChange={(e) => setNewHoliday({...newHoliday, name: e.target.value})} />
                <input type="date" className="w-full p-4 border rounded-2xl" value={newHoliday.date} onChange={(e) => setNewHoliday({...newHoliday, date: e.target.value})} />
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={newHoliday.is_recurring} onChange={(e) => setNewHoliday({...newHoliday, is_recurring: e.target.checked})} className="w-5 h-5" />
                  <span className="font-bold">عطلة متكررة سنوياً</span>
                </label>
                <button onClick={handleAddHoliday} className="w-full bg-indigo-600 text-white p-5 rounded-2xl font-black">إضافة</button>
              </div>
            </div>
          </div>
        )}

        {/* Audit Log Modal */}
        {showAuditLog && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 z-[100]" onClick={() => setShowAuditLog(false)}>
            <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-4xl shadow-2xl max-h-[80vh] overflow-auto" dir="rtl" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between mb-8">
                <h3 className="text-2xl font-black">📋 سجل التعديلات</h3>
                <button onClick={() => setShowAuditLog(false)}><X size={28} /></button>
              </div>
              <div className="space-y-3">
                {auditLog.map((log, idx) => (
                  <div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="font-bold text-slate-800">{log.user_name}</span>
                        <span className="text-sm text-slate-500 mr-2">{log.action === "monthly_balance_update" ? "💰 تحديث رصيد شهري" : log.action === "password_change" ? "🔑 تغيير كلمة المرور" : log.action}</span>
                      </div>
                      <span className="text-xs text-slate-400">{formatDateTime(log.created_at)}</span>
                    </div>
                    {log.new_data?.description ? (
                      <p className="text-sm text-emerald-700 font-bold bg-emerald-50 rounded-lg px-3 py-2">✅ {log.new_data.description}</p>
                    ) : (
                      <p className="text-sm text-slate-600"><span className="font-bold">{log.table_name}</span>{log.record_id && <span> - {log.record_id}</span>}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Balance Log Modal */}
        {showBalanceLog && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 z-[100]" onClick={() => setShowBalanceLog(false)}>
            <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-4xl shadow-2xl max-h-[80vh] overflow-auto" dir="rtl" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="text-2xl font-black">💰 سجل حركات الرصيد الشهري</h3>
                  <p className="text-slate-500 text-sm mt-1">كل مرة أضاف فيها النظام رصيداً تلقائياً لموظف</p>
                </div>
                <button onClick={() => setShowBalanceLog(false)} className="text-slate-400 hover:text-slate-700"><X size={28} /></button>
              </div>
              {balanceLogLoading ? (
                <div className="text-center py-16 text-slate-400 text-lg">جاري التحميل...</div>
              ) : balanceLogs.length === 0 ? (
                <div className="text-center py-16">
                  <div className="text-5xl mb-4">📭</div>
                  <p className="text-slate-400 font-bold">لا توجد سجلات حتى الآن</p>
                  <p className="text-slate-300 text-sm mt-2">سيتم التسجيل تلقائياً كل أول شهر عند إضافة الرصيد الدوري</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {balanceLogs.map((log, idx) => {
                    const empName = log.employees?.name || "—";
                    const empCode = log.employees?.code || "";
                    const dateStr = log.update_date ? new Date(log.update_date).toLocaleDateString("ar-EG", { year: "numeric", month: "long" }) : "—";
                    const desc = log.description || `تم إضافة ${log.amount} يوم للموظف ${empName} - رصيد دوري`;
                    return (
                      <div key={idx} style={{ background: "linear-gradient(135deg, #f0fdf4, #dcfce7)", borderRadius: "16px", padding: "16px 20px", border: "1px solid #bbf7d0" }}>
                        <div className="flex justify-between items-start">
                          <div className="flex items-start gap-3">
                            <div style={{ fontSize: "28px" }}>✅</div>
                            <div>
                              <p className="font-bold text-slate-800 text-sm">{desc}</p>
                              <div className="flex gap-4 mt-1">
                                <span className="text-xs text-emerald-600 font-bold">+{log.amount} يوم</span>
                                <span className="text-xs text-slate-500">{empCode && `#${empCode}`}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-left">
                            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">{dateStr}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
        {/* ==================== AI CHATBOT ==================== */}

        {/* Reset PIN Modal */}
        {showResetPinModal && resetPinEmp && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 z-[100]" onClick={() => { setShowResetPinModal(false); setResetPinEmp(null); setResetPinValue(""); }}>
            <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-sm shadow-2xl" dir="rtl" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <div style={{ background:"#fdf4ff", borderRadius:"12px", padding:"10px", display:"flex" }}>
                    <KeyRound size={22} color="#9333ea" />
                  </div>
                  <h3 className="text-xl font-black">إعادة تعيين الرقم السري</h3>
                </div>
                <button onClick={() => { setShowResetPinModal(false); setResetPinEmp(null); setResetPinValue(""); }}><X size={24} /></button>
              </div>
              <div className="mb-6">
                <p className="text-sm text-slate-500 mb-1">الموظف</p>
                <p className="font-bold text-slate-800">{resetPinEmp.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">#{resetPinEmp.code}</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">الرقم السري الجديد (4 أرقام)</label>
                  <input
                    type="password"
                    maxLength={4}
                    pattern="\d{4}"
                    inputMode="numeric"
                    className="w-full p-4 border-2 border-slate-200 rounded-2xl outline-none focus:border-purple-500 text-center text-2xl font-mono tracking-widest"
                    placeholder="••••"
                    value={resetPinValue}
                    onChange={(e) => setResetPinValue(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  />
                </div>
                <button
                  onClick={handleResetPin}
                  disabled={resetPinLoading || resetPinValue.length !== 4}
                  style={{ width:"100%", padding:"14px", background: resetPinValue.length === 4 ? "linear-gradient(135deg, #7c3aed, #9333ea)" : "#e2e8f0", color: resetPinValue.length === 4 ? "white" : "#94a3b8", border:"none", borderRadius:"16px", fontSize:"15px", fontWeight:"800", cursor: resetPinValue.length === 4 ? "pointer" : "not-allowed", display:"flex", alignItems:"center", justifyContent:"center", gap:"8px" }}>
                  {resetPinLoading ? <Loader2 size={18} className="animate-spin" /> : <KeyRound size={18} />}
                  {resetPinLoading ? "جاري الحفظ..." : "حفظ الرقم السري الجديد"}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    );
  }

  // ==================== EMPLOYEE VIEW ====================
  if (currentView === "employee") {
    const empStatus = getEmployeeStatus(currentUser);
    return (
      <>
      <div style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #4facfe 75%, #00f2fe 100%)",
        backgroundSize: "400% 400%",
        animation: "gradient 15s ease infinite",
        padding: "24px"
      }} dir="rtl">
        <style>{`
          @keyframes gradient {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          @keyframes slideDown {
            from { opacity: 0; transform: translateY(-20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `}</style>
        
        <header className="max-w-4xl mx-auto mb-10" style={{
          animation: "slideDown 0.8s ease",
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(20px)",
          borderRadius: "28px",
          padding: "20px 24px",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.15)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
        }}>
          <div>
            <h2 style={{ margin: "0", fontSize: "clamp(20px, 5vw, 32px)", fontWeight: "900", background: "linear-gradient(135deg, #667eea, #764ba2)", backgroundClip: "text", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", color: "#667eea" }}>
              أهلاً {currentUser.name} 👋
            </h2>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={() => { setChangePinForm({ oldPin:"", newPin:"", confirmPin:"" }); setShowChangePinModal(true); }} style={{
              background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
              color: "white", border: "none", padding: "12px 20px", borderRadius: "14px",
              fontWeight: "700", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px",
              boxShadow: "0 10px 25px rgba(124, 58, 237, 0.3)"
            }}>
              🔑 تغيير PIN
            </button>
            <button onClick={() => { localStorage.removeItem("vms_currentUser"); localStorage.removeItem("vms_currentView"); setCurrentView("login"); setCurrentUser(null); setLoginData({ email: "", password: "" }); setEmpCodeInput(""); setEmpPinInput(""); }} style={{
              background: "linear-gradient(135deg, #ef4444, #dc2626)",
              color: "white", border: "none", padding: "12px 20px", borderRadius: "14px",
              fontWeight: "700", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px",
              transition: "all 0.3s ease", boxShadow: "0 10px 25px rgba(239, 68, 68, 0.3)"
            }} onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-2px)"} onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}>
              <LogOut size={18} /> خروج
            </button>
          </div>
        </header>

        {/* جدول معلومات الموظف الاحترافي */}
        <div className="max-w-4xl mx-auto mb-8" style={{
          animation: "slideDown 1s ease",
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(20px)",
          borderRadius: "24px",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          boxShadow: "0 20px 60px rgba(102, 126, 234, 0.2)",
          overflow: "hidden"
        }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "0"
          }}>
            {/* الرصيد المتاح */}
            <div style={{
              padding: "24px",
              textAlign: "center",
              borderLeft: "1px solid #e2e8f0",
              borderBottom: "1px solid #e2e8f0"
            }}>
              <div style={{ fontSize: "32px", marginBottom: "12px" }}>💰</div>
              <p style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "8px", fontWeight: "600" }}>الرصيد المتاح</p>
              <p style={{ fontSize: "28px", fontWeight: "900", background: "linear-gradient(135deg, #10b981, #059669)", backgroundClip: "text", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", color: "#10b981" }}>{currentUser.balance}</p>
              <p style={{ fontSize: "10px", color: "#64748b", marginTop: "4px" }}>يوم</p>
            </div>

            {/* الرصيد الشهري */}
            {currentUser.monthly_balance > 0 && (
              <div style={{
                padding: "24px",
                textAlign: "center",
                borderLeft: "1px solid #e2e8f0",
                borderBottom: "1px solid #e2e8f0"
              }}>
                <div style={{ fontSize: "32px", marginBottom: "12px" }}>📅</div>
                <p style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "8px", fontWeight: "600" }}>الرصيد الشهري</p>
                <p style={{ fontSize: "28px", fontWeight: "900", color: "#10b981" }}>+{currentUser.monthly_balance}</p>
                <p style={{ fontSize: "10px", color: "#64748b", marginTop: "4px" }}>يوم</p>
              </div>
            )}

            {/* الحالة الحالية */}
            <div style={{
              padding: "24px",
              textAlign: "center",
              borderLeft: "1px solid #e2e8f0",
              borderBottom: "1px solid #e2e8f0"
            }}>
              <div style={{ fontSize: "32px", marginBottom: "12px" }}>{empStatus === "عمل" ? "✅" : "🏖️"}</div>
              <p style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "8px", fontWeight: "600" }}>الحالة الحالية</p>
              <p style={{ fontSize: "16px", fontWeight: "900", color: empStatus === "عمل" ? "#065f46" : "#92400e" }}>
                {empStatus === "عمل" ? "في العمل" : "في إجازة"}
              </p>
            </div>

            {/* أيام العمل منذ العودة */}
            {currentUser.return_date && (
              <div style={{
                padding: "24px",
                textAlign: "center",
                borderLeft: "1px solid #e2e8f0",
                borderBottom: "1px solid #e2e8f0"
              }}>
                <div style={{ fontSize: "32px", marginBottom: "12px" }}>📆</div>
                <p style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "8px", fontWeight: "600" }}>أيام العمل</p>
                <p style={{ fontSize: "28px", fontWeight: "900", color: "#a855f7" }}>{calculateWorkedDays(currentUser.return_date, empStatus === "إجازة")}</p>
                <p style={{ fontSize: "10px", color: "#64748b", marginTop: "4px" }}>منذ العودة</p>
              </div>
            )}

            {/* تاريخ التعيين */}
            {currentUser.hire_date && (
              <div style={{
                padding: "24px",
                textAlign: "center",
                borderLeft: "1px solid #e2e8f0",
                borderBottom: "1px solid #e2e8f0"
              }}>
                <div style={{ fontSize: "32px", marginBottom: "12px" }}>👤</div>
                <p style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "8px", fontWeight: "600" }}>تاريخ التعيين</p>
                <p style={{ fontSize: "14px", fontWeight: "900", color: "#667eea" }}>{formatDate(currentUser.hire_date)}</p>
              </div>
            )}
          </div>
        </div>

        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8">
          <section style={{
            animation: "fadeIn 1s ease",
            background: "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(20px)",
            padding: "32px",
            borderRadius: "28px",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            boxShadow: "0 20px 60px rgba(0, 0, 0, 0.15)",
            transition: "all 0.3s ease"
          }} onMouseEnter={(e) => e.currentTarget.style.boxShadow = "0 30px 80px rgba(102, 126, 234, 0.25)"} onMouseLeave={(e) => e.currentTarget.style.boxShadow = "0 20px 60px rgba(0, 0, 0, 0.15)"}>
            <h3 className="text-xl font-black mb-6 flex items-center gap-3"><Plus className="text-indigo-600" /> طلب إجازة جديد</h3>
            <div className="space-y-5">
              <div>
                <label style={{ fontSize: "13px", fontWeight: "700", color: "#667eea", marginBottom: "8px", display: "block" }}>نوع الإجازة</label>
                <select style={{ width: "100%", padding: "14px 16px", background: "rgba(102, 126, 234, 0.05)", border: "2px solid #e2e8f0", borderRadius: "16px", outline: "none", fontSize: "14px", fontWeight: "600", color: "#1e293b", transition: "all 0.3s", cursor: "pointer" }} onFocus={(e) => { e.currentTarget.style.borderColor = "#667eea"; e.currentTarget.style.background = "rgba(102, 126, 234, 0.08)"; }} onBlur={(e) => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.background = "rgba(102, 126, 234, 0.05)"; }} value={newRequest.vacation_type_id} onChange={(e) => setNewRequest({...newRequest, vacation_type_id: e.target.value})}>
                  <option value="">اختر النوع</option>
                  {vacationTypes.map(vt => <option key={vt.id} value={vt.id}>{vt.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: "13px", fontWeight: "700", color: "#667eea", marginBottom: "8px", display: "block" }}>تاريخ النزول</label>
                <input type="date" style={{ width: "100%", padding: "14px 16px", background: "rgba(102, 126, 234, 0.05)", border: "2px solid #e2e8f0", borderRadius: "16px", outline: "none", fontSize: "14px", fontWeight: "600", color: "#1e293b", transition: "all 0.3s" }} onFocus={(e) => { e.currentTarget.style.borderColor = "#667eea"; e.currentTarget.style.background = "rgba(102, 126, 234, 0.08)"; }} onBlur={(e) => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.background = "rgba(102, 126, 234, 0.05)"; }} value={newRequest.start_date} onChange={(e) => setNewRequest({...newRequest, start_date: e.target.value})} />
              </div>
              <div>
                <label style={{ fontSize: "13px", fontWeight: "700", color: "#667eea", marginBottom: "8px", display: "block" }}>موعد النزول</label>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"10px" }}>
                  {[
                    { value:"after_work", icon:"🌆", label:"بعد العمل",           desc:"يوم التاريخ عمل\nثاني يوم سفر\nثالث يوم إجازة" },
                    { value:"morning",    icon:"🌅", label:"صباحاً",              desc:"يوم التاريخ سفر\nثاني يوم إجازة" },
                    { value:"actual",     icon:"✅", label:"بداية الإجازة الفعلي", desc:"يوم التاريخ أول يوم إجازة" },
                  ].map(opt => (
                    <button key={opt.value} type="button" title={opt.desc}
                      onClick={() => setNewRequest({...newRequest, departure_time: opt.value})}
                      style={{
                        padding:"12px 6px", borderRadius:"16px", border:`2px solid ${newRequest.departure_time === opt.value ? "#6366f1" : "#e2e8f0"}`,
                        background: newRequest.departure_time === opt.value ? "#ede9fe" : "#f8fafc",
                        color: newRequest.departure_time === opt.value ? "#6366f1" : "#64748b",
                        fontWeight:"700", fontSize:"11px", cursor:"pointer", textAlign:"center" as const, transition:"all 0.2s",
                      }}>
                      <div style={{ fontSize:"22px", marginBottom:"4px" }}>{opt.icon}</div>
                      {opt.label}
                    </button>
                  ))}
                </div>
                {newRequest.start_date && (
                  <div style={{ marginTop:"12px", padding:"14px 16px", borderRadius:"14px", background:"linear-gradient(135deg, #ede9fe, #ddd6fe)", border:"1px solid #c4b5fd" }}>
                    <p style={{ fontSize:"11px", color:"#7c3aed", fontWeight:"700", marginBottom:"8px" }}>📅 ملخص الإجازة</p>
                    <div style={{ display:"flex", flexDirection:"column" as const, gap:"5px", fontSize:"13px" }}>
                      <div style={{ display:"flex", justifyContent:"space-between" }}>
                        <span style={{ color:"#6d28d9" }}>تاريخ النزول:</span>
                        <span style={{ fontWeight:"800", color:"#4c1d95" }}>{formatDate(newRequest.start_date)}</span>
                      </div>
                      <div style={{ display:"flex", justifyContent:"space-between" }}>
                        <span style={{ color:"#6d28d9" }}>موعد النزول:</span>
                        <span style={{ fontWeight:"800", color:"#4c1d95" }}>{getDepartureLabel(newRequest.departure_time)}</span>
                      </div>
                      <div style={{ height:"1px", background:"#c4b5fd", margin:"4px 0" }} />
                      <div style={{ display:"flex", justifyContent:"space-between" }}>
                        <span style={{ color:"#6d28d9" }}>أول يوم إجازة فعلي:</span>
                        <span style={{ fontWeight:"900", color:"#4c1d95", fontSize:"14px" }}>{formatDate(getActualStartDate(newRequest.start_date, newRequest.departure_time))}</span>
                      </div>
                      {newRequest.days > 0 && (
                        <div style={{ display:"flex", justifyContent:"space-between" }}>
                          <span style={{ color:"#6d28d9" }}>تاريخ العودة:</span>
                          <span style={{ fontWeight:"900", color:"#059669", fontSize:"14px" }}>
                            {formatDate(getCalculatedDates(getActualStartDate(newRequest.start_date, newRequest.departure_time), newRequest.days).back)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label style={{ fontSize: "13px", fontWeight: "700", color: "#667eea", marginBottom: "8px", display: "block" }}>عدد الأيام</label>
                <input type="number" step="0.5" min="0.5" style={{ width: "100%", padding: "14px 16px", background: "rgba(102, 126, 234, 0.05)", border: "2px solid #e2e8f0", borderRadius: "16px", outline: "none", fontSize: "14px", fontWeight: "600", color: "#1e293b", transition: "all 0.3s" }} onFocus={(e) => { e.currentTarget.style.borderColor = "#667eea"; e.currentTarget.style.background = "rgba(102, 126, 234, 0.08)"; }} onBlur={(e) => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.background = "rgba(102, 126, 234, 0.05)"; }} value={newRequest.days} onChange={(e) => setNewRequest({...newRequest, days: Number(e.target.value)})} />
              </div>
              <div>
                <label style={{ fontSize: "13px", fontWeight: "700", color: "#667eea", marginBottom: "8px", display: "block" }}>ملاحظات</label>
                <textarea style={{ width: "100%", padding: "14px 16px", background: "rgba(102, 126, 234, 0.05)", border: "2px solid #e2e8f0", borderRadius: "16px", outline: "none", fontSize: "14px", fontWeight: "600", color: "#1e293b", transition: "all 0.3s", height: "96px", resize: "none", fontFamily: "inherit" }} placeholder="سبب الإجازة..." onFocus={(e) => { e.currentTarget.style.borderColor = "#667eea"; e.currentTarget.style.background = "rgba(102, 126, 234, 0.08)"; }} onBlur={(e) => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.background = "rgba(102, 126, 234, 0.05)"; }} value={newRequest.notes} onChange={(e) => setNewRequest({...newRequest, notes: e.target.value})} />
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={submitVacationRequest} disabled={isSubmitting} style={{
                  flex: 1,
                  background: "linear-gradient(135deg, #667eea, #764ba2)",
                  color: "white",
                  border: "none",
                  padding: "16px 20px",
                  borderRadius: "16px",
                  fontWeight: "900",
                  fontSize: "16px",
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                  opacity: isSubmitting ? 0.5 : 1,
                  transition: "all 0.3s ease",
                  boxShadow: "0 15px 35px rgba(102, 126, 234, 0.4)"
                }} onMouseEnter={(e) => !isSubmitting && (e.currentTarget.style.transform = "translateY(-2px)")} onMouseLeave={(e) => !isSubmitting && (e.currentTarget.style.transform = "translateY(0)")}>
                  {isSubmitting ? <Loader2 className="animate-spin mx-auto" /> : "إرسال الطلب"}
                </button>
                <button onClick={() => {
                    const myApproved = requests.filter(r => 
                      r.employee_id === currentUser.id && 
                      r.status === "approved" &&
                      !r.is_extension
                    );
                    if (myApproved.length === 0) {
                      alert("لا توجد إجازات مقبولة لطلب امتداد ❌");
                      return;
                    }
                    setShowExtensionModal(true);
                  }} style={{
                  background: "linear-gradient(135deg, #7c3aed, #a855f7)",
                  color: "white",
                  border: "none",
                  padding: "16px 20px",
                  borderRadius: "16px",
                  fontWeight: "900",
                  fontSize: "14px",
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                  boxShadow: "0 10px 25px rgba(124, 58, 237, 0.35)",
                  whiteSpace: "nowrap"
                }} onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; }} onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}>
                  🔗 امتداد
                </button>
              </div>
            </div>
          </section>

          <section style={{ animation: "fadeIn 1.2s ease" }}>
            <h3 style={{ fontSize: "20px", fontWeight: "900", marginBottom: "24px", display: "flex", alignItems: "center", gap: "12px", color: "#1e293b" }}>
              <Clock className="text-amber-500" /> طلباتي
            </h3>
            {requests.filter(r => r.employee_id === currentUser.id).map((req, idx) => {
              const vacType = vacationTypes.find(vt => vt.id === req.vacation_type_id);
              return (
                <div key={req.id} style={{
                  animation: `fadeIn 1.${3 + idx}s ease`,
                  background: "rgba(255, 255, 255, 0.95)",
                  backdropFilter: "blur(20px)",
                  padding: "20px",
                  borderRadius: "20px",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  boxShadow: "0 15px 40px rgba(0, 0, 0, 0.08)",
                  transition: "all 0.3s ease",
                  marginBottom: "16px"
                }} onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 25px 60px rgba(102, 126, 234, 0.2)"; e.currentTarget.style.transform = "translateY(-4px)"; }} onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 15px 40px rgba(0, 0, 0, 0.08)"; e.currentTarget.style.transform = "translateY(0)"; }}>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="font-bold text-slate-800">{formatDate(req.start_date)}</p>
                      <p className="text-xs text-slate-400">{req.days} يوم</p>
                      {req.departure_time && req.departure_time !== "actual" && (
                        <p className="text-xs text-purple-600 font-bold mt-1">
                          🛫 نزول {req.departure_time === "after_work" ? "بعد العمل" : "صباحاً"}
                          {req.departure_date ? ` (${formatDate(req.departure_date)})` : ""}
                        </p>
                      )}
                      {vacType && <span className="inline-block mt-2 px-2 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: vacType.color+'20', color: vacType.color }}>{vacType.name}</span>}
                      {req.is_extension && (
                        <span className="inline-block mt-2 mr-1 px-2 py-1 rounded-full text-xs font-bold" style={{ background: "#ede9fe", color: "#7c3aed" }}>
                          🔗 امتداد
                        </span>
                      )}
                    </div>
                    <span className={`px-4 py-1.5 rounded-full text-xs font-black ${req.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : req.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                      {req.status === 'approved' ? '✓ مقبول' : req.status === 'rejected' ? '✗ مرفوض' : req.status === 'dept_approved' ? '◑ موافقة مبدئية' : '⏳ معلق'}
                    </span>
                  </div>
                  {req.admin_notes && (
                    <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
                      <p className="text-xs text-blue-600 font-bold mb-1 flex items-center gap-1"><MessageSquare size={14} /> ملاحظات الإدارة:</p>
                      <p className="text-sm text-blue-900">{req.admin_notes}</p>
                    </div>
                  )}
                  {req.status === "pending" && (() => {
                    const created = new Date(req.created_at || Date.now());
                    const daysOld = Math.floor((Date.now() - created.getTime()) / 86400000);
                    return daysOld <= 3 ? (
                      <button onClick={() => { setEmpEditReq({...req}); setShowEditRequestModal(true); }}
                        style={{ marginTop:"10px", width:"100%", padding:"9px", background:"#f5f3ff", border:"1px solid #ddd6fe", borderRadius:"10px", color:"#7c3aed", cursor:"pointer", fontWeight:"700", fontSize:"12px" }}>
                        ✏️ تعديل الطلب (متبقي {3 - daysOld} يوم)
                      </button>
                    ) : null;
                  })()}
                </div>
              );
            })}
            {requests.filter(r => r.employee_id === currentUser.id).length === 0 && (
              <div className="bg-white p-16 rounded-[2rem] text-center border border-dashed">
                <p className="text-slate-400 font-bold">لم تقدم أي طلبات بعد</p>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Modal طلب امتداد إجازة */}
      {showExtensionModal && (() => {
        const myApproved = requests.filter(r => 
          r.employee_id === currentUser.id && 
          r.status === "approved" &&
          !r.is_extension
        );
        const selectedReq = requests.find(r => r.id === extensionForm.original_request_id);
        const vacType = selectedReq ? vacationTypes.find(vt => vt.id === selectedReq.vacation_type_id) : null;

        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.65)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", zIndex: 9999 }} onClick={() => setShowExtensionModal(false)}>
            <div style={{ background: "white", borderRadius: "24px", width: "100%", maxWidth: "460px", padding: "24px", boxShadow: "0 32px 80px rgba(0, 0, 0, 0.3)" }} dir="rtl" onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
                <h3 style={{ margin: 0, fontWeight: "900", fontSize: "17px" }}>🔗 طلب امتداد إجازة</h3>
                <button onClick={() => setShowExtensionModal(false)} style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "6px 12px", cursor: "pointer", background: "white", fontSize: "16px", fontWeight: "700" }}>✕</button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {/* اختيار الإجازة الأصلية */}
                <div>
                  <label style={{ fontSize: "12px", color: "#64748b", fontWeight: "700", display: "block", marginBottom: "5px" }}>الإجازة الأصلية *</label>
                  <select 
                    style={{ width: "100%", padding: "11px 14px", border: "1px solid #e2e8f0", borderRadius: "12px", outline: "none", boxSizing: "border-box", fontSize: "13px", background: "white", direction: "rtl" }}
                    value={extensionForm.original_request_id}
                    onChange={e => setExtensionForm({...extensionForm, original_request_id: e.target.value})}
                  >
                    <option value="">اختر الإجازة...</option>
                    {myApproved.map(req => {
                      const vt = vacationTypes.find(v => v.id === req.vacation_type_id);
                      const { end } = getCalculatedDates(req.start_date, req.days);
                      return (
                        <option key={req.id} value={req.id}>
                          {formatDate(req.start_date)} إلى {formatDate(end)} ({req.days} يوم) - {vt?.name || ""}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* تفاصيل الإجازة المختارة */}
                {selectedReq && (
                  <div style={{ background: "#f8fafc", borderRadius: "12px", padding: "12px 14px", border: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span style={{ fontSize: "11px", color: "#94a3b8" }}>النوع</span>
                      <span style={{ fontSize: "12px", fontWeight: "700", color: vacType?.color || "#374151" }}>{vacType?.name || "-"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "11px", color: "#94a3b8" }}>الأيام الأصلية</span>
                      <span style={{ fontSize: "12px", fontWeight: "700" }}>{selectedReq.days} يوم</span>
                    </div>
                  </div>
                )}

                {/* عدد الأيام الإضافية */}
                <div>
                  <label style={{ fontSize: "12px", color: "#64748b", fontWeight: "700", display: "block", marginBottom: "5px" }}>عدد الأيام الإضافية *</label>
                  <input 
                    type="number" 
                    step="0.5" 
                    min="0.5" 
                    style={{ width: "100%", padding: "11px 14px", border: "1px solid #e2e8f0", borderRadius: "12px", outline: "none", boxSizing: "border-box", fontSize: "13px", background: "white", direction: "rtl" }}
                    value={extensionForm.additional_days}
                    onChange={e => setExtensionForm({...extensionForm, additional_days: Number(e.target.value)})}
                  />
                </div>

                {/* ملاحظات */}
                <div>
                  <label style={{ fontSize: "12px", color: "#64748b", fontWeight: "700", display: "block", marginBottom: "5px" }}>ملاحظات الامتداد</label>
                  <textarea 
                    style={{ width: "100%", padding: "11px 14px", border: "1px solid #e2e8f0", borderRadius: "12px", outline: "none", boxSizing: "border-box", fontSize: "13px", background: "white", resize: "none", direction: "rtl" }}
                    rows={2}
                    value={extensionForm.notes}
                    onChange={e => setExtensionForm({...extensionForm, notes: e.target.value})}
                    placeholder="سبب الامتداد..."
                  />
                </div>

                {/* عرض الإجمالي */}
                {selectedReq && (
                  <div style={{ background: "#eef2ff", borderRadius: "10px", padding: "10px 14px", fontSize: "13px", color: "#4f46e5", fontWeight: "700" }}>
                    الإجمالي بعد الامتداد: {Number(selectedReq.days) + Number(extensionForm.additional_days)} يوم
                  </div>
                )}

                <button 
                  onClick={submitExtensionRequest} 
                  disabled={isSubmitting}
                  style={{ padding: "13px", background: "linear-gradient(135deg, #7c3aed, #a855f7)", color: "white", border: "none", borderRadius: "12px", fontWeight: "900", cursor: "pointer", fontSize: "14px", opacity: isSubmitting ? 0.7 : 1 }}
                >
                  {isSubmitting ? "جاري الإرسال..." : "📤 إرسال طلب الامتداد"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal تعديل طلب الموظف */}
      {showEditRequestModal && empEditReq && (
        <EmpEditModal
          req={empEditReq}
          vacationTypes={vacationTypes}
          onClose={() => { setShowEditRequestModal(false); setEmpEditReq(null); }}
          onChange={(updated: any) => setEmpEditReq(updated)}
          onSave={handleEmpEditRequest}
        />
      )}

      {/* Modal تغيير PIN */}
      {showChangePinModal && (
        <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0, 0, 0, 0.65)", backdropFilter:"blur(6px)", display:"flex", alignItems:"center", justifyContent:"center", padding:"16px", zIndex:9999 }} dir="rtl">
          <div style={{ background:"white", borderRadius:"24px", width:"100%", maxWidth:"400px", padding:"32px", boxShadow:"0 32px 80px rgba(0, 0, 0, 0.3)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"24px" }}>
              <h3 style={{ margin:0, fontSize:"20px", fontWeight:"900", color:"#1e293b" }}>🔑 تغيير PIN</h3>
              <button onClick={() => setShowChangePinModal(false)} style={{ border:"1px solid #e2e8f0", borderRadius:"8px", padding:"6px 12px", cursor:"pointer", background:"white", fontSize:"16px", fontWeight:"700" }}>✕</button>
            </div>
            {[
              { label:"PIN الحالي", key:"oldPin" },
              { label:"PIN الجديد", key:"newPin" },
              { label:"تأكيد PIN الجديد", key:"confirmPin" }
            ].map(field => (
              <div key={field.key} style={{ marginBottom:"16px" }}>
                <label style={{ fontSize:"12px", color:"#64748b", fontWeight:"700", display:"block", marginBottom:"6px" }}>{field.label}</label>
                <input
                  type="password" inputMode="numeric" maxLength={4}
                  style={{ width:"100%", border:"1px solid #e2e8f0", borderRadius:"10px", padding:"12px 14px", fontSize:"18px", letterSpacing:"8px", textAlign:"center", boxSizing:"border-box", fontFamily:"monospace" }}
                  placeholder="• • • •"
                  value={(changePinForm as any)[field.key]}
                  onChange={(e) => setChangePinForm(prev => ({ ...prev, [field.key]: e.target.value.replace(/\D/g,"").slice(0,4) }))}
                />
              </div>
            ))}
            <button onClick={handleChangePin} disabled={changePinLoading} style={{ width:"100%", padding:"14px", background:"linear-gradient(135deg, #7c3aed, #6d28d9)", color:"white", border:"none", borderRadius:"12px", fontWeight:"900", cursor:"pointer", fontSize:"15px", marginTop:"8px" }}>
              {changePinLoading ? "جاري الحفظ..." : "حفظ PIN الجديد"}
            </button>
          </div>
        </div>
      )}
      </>
    );
  }

  return null;

};

// ============================================================================
// 🏛️ مكوّن الشؤون الإدارية — إدارة طلبات الشراء والعمليات الإدارية
// ============================================================================
// ============================================================================
// 🏛️ مكوّن الشؤون الإدارية — نظام إدارة شامل متعدد الصفحات
// ============================================================================
// يدعم 3 صفحات منفصلة مع كافة ميزات الإدارة والاستيراد والتصدير والطباعة


const AdminAffairsTab = ({ supabase, logAction, currentUser, userRole }: {
  supabase: any; logAction: Function; currentUser: any; userRole?: string;
}) => {
  // ===== MAIN STATE =====
  const [activeSubTab, setActiveSubTab] = useState<"purchases" | "summary" | "vegetables">("purchases");
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [importProgress, setImportProgress] = useState<{ total: number; done: number; errors: {row:number;msg:string}[]; success: boolean; inserted?: number; updated?: number } | null>(null);
  const [showImportGuide, setShowImportGuide] = useState(false);
  
  // ===== FILTERS & SEARCH =====
  const [searchText, setSearchText] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  
  // ===== SORT =====
  const [sortField, setSortField] = useState("request_date");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  
  // ===== SORT HANDLERS =====
  const handleSort = (field: string, dir: "asc"|"desc") => {
    setSortField(field);
    setSortDir(dir);
    setSortDropdown("");
  };
  const handleSortClear = () => {
    setSortField("request_date");
    setSortDir("desc");
    setSortDropdown("");
  };
  const handleSortToggle = (field: string) => {
    setSortDropdown(prev => prev === field ? "" : field);
  };
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // ===== FORM STATE =====
  const [form, setForm] = useState<any>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [sortDropdown, setSortDropdown] = useState("");

  // إغلاق dropdown الفرز عند الضغط خارجه أو عند التمرير
  useEffect(() => {
    if (!sortDropdown) return;
    const close = () => setSortDropdown("");
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [sortDropdown]);

  // ===== CONSTANTS =====
  const departments = ["الإدارة", "المطبخ", "الصيانة", "النظافة", "الأمن", "الموارد البشرية", "المالية", "أخرى"];
  const statuses = ["لم يتم", "قيد التنفيذ", "تم التنفيذ", "ملغى"];
  const units = ["عدد", "كيس", "علبة", "صندوق", "كيلو", "متر", "ساعة", "أخرى"];
  const years = Array.from({ length: 21 }, (_, i) => String(2015 + i)); // 2015 → 2035

  // ===== TABLE SCHEMAS =====
  const schemas: Record<string, any> = {
    purchases: {
      tableName: "admin_affairs_purchases",
      uniqueKey: ["system_request_no", "item_name"],  // مفتاح التكرار
      fields: [
        { key: "admin_request_no", label: "رقم طلب الإدارة", type: "text" },
        { key: "system_request_no", label: "رقم الطلب سيستم", type: "text" },
        { key: "request_date", label: "تاريخ الطلب", type: "date" },
        { key: "item_name", label: "البند", type: "text", required: true },
        { key: "unit", label: "الوحدة", type: "select", options: units },
        { key: "quantity_requested", label: "الكمية المطلوبة", type: "number" },
        { key: "quantity_executed", label: "الكمية المنفذة", type: "number" },
        { key: "quantity_remaining", label: "الكمية المتبقية", type: "number", readonly: true },
        { key: "year", label: "العام", type: "select", options: years },
        { key: "executor", label: "المنفذ", type: "select", options: statuses },
        { key: "requesting_department", label: "القسم الطالب", type: "select", options: departments },
        { key: "receipt_date", label: "تاريخ الاستلام", type: "date" },
        { key: "received_by", label: "المستلم", type: "text" },
        { key: "notes", label: "لزوم", type: "textarea" },
        { key: "remarks", label: "ملاحظات", type: "textarea" },
      ],
      excelColumns: {
        "رقم طلب الادارة": "admin_request_no",
        "رقم الطلب سيستم": "system_request_no",
        "تاريخ الطلب": "request_date",
        "البند": "item_name",
        "الوحده": "unit",
        "الكميه المطلوبه": "quantity_requested",
        "الكميه المنفذه": "quantity_executed",
        "الكميه المتبقيه": "quantity_remaining",
        "العام": "year",
        "المنفذ": "executor",
        "القسم الطالب": "requesting_department",
        "تاريخ الاستلام": "receipt_date",
        "المستلم": "received_by",
        "لزوم": "notes",
        "ملاحظات": "remarks",
      }
    },
    summary: {
      tableName: "admin_affairs_summary",
      uniqueKey: ["request_number"],
      fields: [
        { key: "request_number", label: "رقم الطلب", type: "text", required: true },
        { key: "request_date", label: "تاريخ الطلب", type: "date" },
        { key: "execution_date", label: "تاريخ التنفيذ", type: "date" },
        { key: "description", label: "وصف طلب الشراء", type: "textarea", required: true },
        { key: "year", label: "العام", type: "select", options: years },
        { key: "status", label: "حالة الطلب", type: "select", options: ["قيد الانتظار", "قيد التنفيذ", "مكتمل", "ملغى"] },
        { key: "remaining_items", label: "عدد البنود المتبقية", type: "text" },
        { key: "remarks", label: "ملاحظات", type: "textarea" },
      ],
      excelColumns: {
        "رقم الطلب": "request_number",
        "تاريخ الطلب": "request_date",
        "تاريخ التنفيذ": "execution_date",
        "تاريخ التنفيذ ": "execution_date",
        "وصف طلب الشراء": "description",
        "العام": "year",
        "العام ": "year",
        "حالة الطلب": "status",
        "عدد البنود المتبقيه": "remaining_items",
        "ملاحظات": "remarks",
      }
    },
    vegetables: {
      tableName: "admin_affairs_vegetables",
      uniqueKey: ["system_request_no", "item_name"],
      fields: [
        { key: "admin_request_no", label: "رقم طلب الإدارة", type: "text" },
        { key: "system_request_no", label: "رقم الطلب سيستم", type: "text" },
        { key: "request_date", label: "تاريخ الطلب", type: "date" },
        { key: "item_name", label: "البند", type: "text", required: true },
        { key: "unit", label: "الوحدة", type: "select", options: units },
        { key: "quantity_requested", label: "الكمية المطلوبة", type: "number" },
        { key: "quantity_executed", label: "الكمية المنفذة", type: "number" },
        { key: "quantity_remaining", label: "الكمية المتبقية", type: "number", readonly: true },
        { key: "year", label: "العام", type: "select", options: years },
        { key: "executor", label: "المنفذ", type: "select", options: statuses },
        { key: "requesting_department", label: "القسم الطالب", type: "select", options: departments },
        { key: "receipt_date", label: "تاريخ الاستلام", type: "date" },
        { key: "received_by", label: "المستلم", type: "text" },
        { key: "notes", label: "لزوم", type: "textarea" },
        { key: "remarks", label: "ملاحظات", type: "textarea" },
      ],
      excelColumns: {
        "رقم طلب الادارة": "admin_request_no",
        "رقم الطلب سيستم": "system_request_no",
        "تاريخ الطلب": "request_date",
        "البند": "item_name",
        "الوحده": "unit",
        "الكميه المطلوبه": "quantity_requested",
        "الكميه المنفذه": "quantity_executed",
        "الكميه المتبقيه": "quantity_remaining",
        "العام": "year",
        "المنفذ": "executor",
        "القسم الطالب": "requesting_department",
        "تاريخ الاستلام": "receipt_date",
        "المستلم": "received_by",
        "لزوم": "notes",
        "ملاحظات": "remarks",
      }
    }
  };

  const currentSchema = schemas[activeSubTab];

  // ===== HELPER FUNCTIONS =====
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("ar-EG", {
      year: "numeric", month: "2-digit", day: "2-digit",
    });
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString("ar-EG", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  };

  // ===== FETCH DATA =====
  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from(currentSchema.tableName)
        .select("*")
        .order(sortField, { ascending: sortDir === "asc" });
      
      if (error) throw error;
      if (data) setRecords(data);
    } catch (err: any) {
      console.error("خطأ في جلب البيانات:", err?.message);
    }
    setLoading(false);
  }, [supabase, currentSchema.tableName, sortField, sortDir]);

  useEffect(() => { 
    setSelectedIds([]);
    setSearchText("");
    fetchRecords(); 
  }, [activeSubTab, fetchRecords]);

  // ===== FILTERED & SORTED DATA =====
  const filtered = useMemo(() => {
    let result = [...records];

    // بحث
    if (searchText) {
      const search = searchText.toLowerCase();
      result = result.filter(r => 
        Object.values(r).some(v => 
          v && v.toString().toLowerCase().includes(search)
        )
      );
    }

    // فلترة
    if (departmentFilter !== "all") {
      result = result.filter(r => r.requesting_department === departmentFilter);
    }
    if (statusFilter !== "all") {
      result = result.filter(r => r.executor === statusFilter || r.status === statusFilter);
    }
    if (yearFilter !== "all") {
      result = result.filter(r => r.year?.toString() === yearFilter);
    }
    if (dateFrom) {
      result = result.filter(r => (r.request_date || r.execution_date) >= dateFrom);
    }
    if (dateTo) {
      result = result.filter(r => (r.request_date || r.execution_date) <= dateTo);
    }

    // ترتيب
    result.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      
      if (aVal === null || aVal === undefined) aVal = "";
      if (bVal === null || bVal === undefined) bVal = "";
      
      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();
      
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [records, searchText, departmentFilter, statusFilter, yearFilter, dateFrom, dateTo, sortField, sortDir]);

  // ===== CRUD OPERATIONS =====
  const openAdd = () => {
    setEditingRecord(null);
    const newForm: any = {};
    currentSchema.fields.forEach((f: any) => {
      if (f.key === "year") newForm[f.key] = new Date().getFullYear().toString();
      else if (f.key === "executor") newForm[f.key] = "لم يتم";
      else newForm[f.key] = "";
    });
    setForm(newForm);
    setShowForm(true);
  };

  const openEdit = (record: any) => {
    setEditingRecord(record);
    const newForm: any = {};
    currentSchema.fields.forEach((f: any) => {
      newForm[f.key] = record[f.key] || "";
    });
    setForm(newForm);
    setShowForm(true);
  };

  const save = async () => {
    const requiredField = currentSchema.fields.find((f: any) => f.required);
    if (requiredField && !form[requiredField.key]?.toString().trim()) {
      alert(`❌ حقل "${requiredField.label}" مطلوب`);
      return;
    }

    setSaving(true);
    try {
      const dataToSave = { ...form };
      
      // حساب الكمية المتبقية إذا كانت موجودة
      if (dataToSave.quantity_requested && dataToSave.quantity_executed) {
        dataToSave.quantity_remaining = dataToSave.quantity_requested - dataToSave.quantity_executed;
      }

      dataToSave.updated_at = new Date().toISOString();

      if (editingRecord) {
        const { error } = await supabase
          .from(currentSchema.tableName)
          .update(dataToSave)
          .eq("id", editingRecord.id);
        
        if (error) throw error;
        await logAction("update", currentSchema.tableName, editingRecord.id);
      } else {
        const { error } = await supabase
          .from(currentSchema.tableName)
          .insert([{
            ...dataToSave,
            created_by: currentUser?.id,
            created_at: new Date().toISOString(),
          }]);
        
        if (error) throw error;
        await logAction("create", currentSchema.tableName, null);
      }

      setShowForm(false);
      setEditingRecord(null);
      fetchRecords();
    } catch (err: any) {
      alert("❌ خطأ: " + (err?.message || "فشل الحفظ"));
    }
    setSaving(false);
  };

  const deleteRecord = async (id: string) => {
    if (!window.confirm("هل تريد حذف هذا السجل؟")) return;
    
    // حفظ موضع التمرير قبل الحذف
    const scrollTop = tableScrollRef.current?.scrollTop ?? 0;
    const scrollLeft = tableScrollRef.current?.scrollLeft ?? 0;
    
    try {
      const { error } = await supabase
        .from(currentSchema.tableName)
        .delete()
        .eq("id", id);
      
      if (error) throw error;
      await logAction("delete", currentSchema.tableName, id);
      await fetchRecords();
      // استعادة موضع التمرير بعد تحديث البيانات
      requestAnimationFrame(() => {
        if (tableScrollRef.current) {
          tableScrollRef.current.scrollTop = scrollTop;
          tableScrollRef.current.scrollLeft = scrollLeft;
        }
      });
    } catch (err: any) {
      alert("❌ خطأ: " + (err?.message || "فشل الحذف"));
    }
  };

  const deleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`⚠️ هل تريد حذف ${selectedIds.length} سجل نهائياً؟\nلا يمكن التراجع عن هذا الإجراء.`)) return;

    try {
      // حذف سجل سجل لتجنب أي قيود على حجم الطلب
      let failCount = 0;
      for (const id of selectedIds) {
        const { error } = await supabase
          .from(currentSchema.tableName)
          .delete()
          .eq("id", id);
        if (error) failCount++;
      }
      await logAction("bulk_delete", currentSchema.tableName, null);
      setSelectedIds([]);
      fetchRecords();
      if (failCount > 0) alert(`⚠️ فشل حذف ${failCount} سجل`);
    } catch (err: any) {
      alert("❌ خطأ في الحذف: " + (err?.message || "فشل الحذف"));
    }
  };

  // ===== EXPORT TO EXCEL =====
  const exportToExcel = () => {
    if (filtered.length === 0) {
      alert("❌ لا توجد بيانات للتصدير");
      return;
    }

    const exportData = filtered.map(r => {
      const row: any = {};
      Object.entries(currentSchema.excelColumns).forEach(([excelCol, dbField]: any) => {
        let value = r[dbField];
        if (dbField.includes("date") && value) {
          // نُصدّر بصيغة ISO لضمان إعادة الاستيراد بشكل صحيح
          value = String(value).split("T")[0]; // YYYY-MM-DD
        }
        row[excelCol] = value ?? "";
      });
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeSubTab === "purchases" ? "طلبات الشراء" : activeSubTab === "summary" ? "إجمالي الطلبات" : "خضار أسبوعي");
    XLSX.writeFile(wb, `${activeSubTab === "purchases" ? "طلبات_الشراء" : activeSubTab === "summary" ? "إجمالي_الطلبات" : "خضار_أسبوعي"}_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  // ===== IMPORT FROM EXCEL =====
  // تحويل الأرقام العربية/الهندية إلى إنجليزية
  const arabicToEnglish = (s: string) =>
    String(s)
      .replace(/[٠١٢٣٤٥٦٧٨٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)))
      .replace(/[۰۱۲۳۴۵۶۷۸۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)));

  const parseImportDate = (value: any): string | null => {
    if (value === null || value === undefined || value === "") return null;

    // Excel serial number
    if (typeof value === "number") {
      if (value <= 0) return null;
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + value * 86400000);
      return isNaN(date.getTime()) ? null : date.toISOString().split("T")[0];
    }

    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : value.toISOString().split("T")[0];
    }

    const str = arabicToEnglish(String(value).trim());
    if (!str) return null;

    // YYYY-MM-DD أو YYYY/MM/DD
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(str)) {
      const parts = str.split(/[-/]/);
      const iso = `${parts[0]}-${parts[1].padStart(2,"0")}-${parts[2].padStart(2,"0")}`;
      return isNaN(new Date(iso).getTime()) ? null : iso;
    }

    // DD-MM-YYYY أو DD/MM/YYYY
    if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(str)) {
      const parts = str.split(/[-/]/);
      const iso = `${parts[2]}-${parts[1].padStart(2,"0")}-${parts[0].padStart(2,"0")}`;
      return isNaN(new Date(iso).getTime()) ? null : iso;
    }

    const fallback = new Date(str);
    return isNaN(fallback.getTime()) ? null : fallback.toISOString().split("T")[0];
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    setImportProgress({ total: 0, done: 0, errors: [], success: false });

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: true, cellFormula: false, cellNF: false });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];

      // ── البحث عن صف الرأس الحقيقي (قد يكون في صف 2، 3، أو 4) ──
      // نبحث عن أول صف يحتوي على مفاتيح تطابق أعمدة الـ schema
      const schemaKeys = Object.keys(currentSchema.excelColumns).map(k => k.trim());
      let headerRowIndex = 0; // افتراضي: صف 1
      const rawAll = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[][];

      for (let i = 0; i < Math.min(rawAll.length, 10); i++) {
        const rowVals = rawAll[i].map((v: any) => String(v ?? "").trim());
        const matches = schemaKeys.filter(k => rowVals.includes(k)).length;
        if (matches >= 2) { headerRowIndex = i; break; }
      }

      // قراءة البيانات بدءاً من صف الرأس الصحيح
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        defval: "",
        range: headerRowIndex,
      }) as any[];

      // دالة مساعدة: ينظف اسم العمود (يزيل مسافات زيادة)
      const normKey = (k: string) => String(k).trim().replace(/\s+/g, " ");

      // بناء خريطة محوّلة: excelCol مُنظَّف → dbField
      const colMap: Record<string, string> = {};
      Object.entries(currentSchema.excelColumns).forEach(([excelCol, dbField]: any) => {
        colMap[normKey(excelCol)] = dbField;
      });

      const dateFields = currentSchema.fields
        .filter((f: any) => f.type === "date")
        .map((f: any) => f.key);

      const rowErrors: {row:number; msg:string}[] = [];
      const toInsert: any[] = [];

      jsonData.forEach((row: any, idx: number) => {
        const record: any = {};

        // ننظف مفاتيح الصف أيضاً قبل المقارنة
        const cleanRow: Record<string, any> = {};
        Object.entries(row).forEach(([k, v]) => { cleanRow[normKey(k)] = v; });

        Object.entries(colMap).forEach(([excelColNorm, dbField]) => {
          let value = cleanRow[excelColNorm];
          if (value === undefined || value === null) value = "";

          // تجاهل المعادلات — نحسبها تلقائياً بعدين
          if (typeof value === "string" && value.startsWith("=")) value = "";

          if (dateFields.includes(dbField)) {
            const parsed = parseImportDate(value);
            if (value !== "" && parsed === null) {
              rowErrors.push({ row: idx + headerRowIndex + 2, msg: `الصف ${idx + headerRowIndex + 2}: التاريخ "${value}" في عمود "${excelColNorm}" غير صحيح` });
            }
            record[dbField] = parsed ?? null;
          } else if (dbField === "quantity_remaining") {
            // يُحسب تلقائياً — لا نأخذه من الملف
          } else {
            // الحقول الرقمية: تأكد إنها أرقام
            if (["quantity_requested","quantity_executed","year"].includes(dbField)) {
              const n = parseFloat(arabicToEnglish(String(value)));
              record[dbField] = isNaN(n) ? null : n;
            } else {
              record[dbField] = value === "" ? null : value;
            }
          }
        });

        // حساب الكمية المتبقية تلقائياً
        const req = Number(record.quantity_requested);
        const exe = Number(record.quantity_executed ?? 0);
        if (!isNaN(req)) record.quantity_remaining = req - exe;

        record.created_by = currentUser?.id;
        record.created_at = new Date().toISOString();
        record.updated_at = new Date().toISOString();

        const requiredField = currentSchema.fields.find((f: any) => f.required);
        if (requiredField && !String(record[requiredField.key] || "").trim()) {
          rowErrors.push({ row: idx + headerRowIndex + 2, msg: `الصف ${idx + headerRowIndex + 2}: الحقل "${requiredField.label}" فارغ — تم تخطيه` });
          return;
        }

        toInsert.push(record);
      });

      setImportProgress({ total: toInsert.length, done: 0, errors: rowErrors, success: false });

      if (toInsert.length === 0) {
        setImportProgress({ total: 0, done: 0, errors: [{ row: 0, msg: "❌ لم يتم العثور على بيانات صحيحة في الملف" }, ...rowErrors], success: false });
        setUploadingFile(false);
        return;
      }

      // رفع على دفعات مع upsert لمنع التكرار
      const BATCH = 10;
      let inserted = 0;
      let updated = 0;
      const insertErrors: {row:number;msg:string}[] = [...rowErrors];
      const uniqueKeys: string[] = currentSchema.uniqueKey || [];

      for (let i = 0; i < toInsert.length; i += BATCH) {
        const batch = toInsert.slice(i, i + BATCH);

        if (uniqueKeys.length > 0) {
          // upsert: نحاول نحدّث السجلات المكررة بدل إضافتها
          let batchInserted = 0;
          let batchUpdated = 0;

          for (const rec of batch) {
            // ابحث عن سجل مكرر في الـ records المحملة
            const existing = records.find((r: any) =>
              uniqueKeys.every(k => r[k] != null && rec[k] != null && String(r[k]).trim() === String(rec[k]).trim())
            );

            if (existing) {
              // تحديث السجل الموجود
              const { error } = await supabase
                .from(currentSchema.tableName)
                .update({ ...rec, updated_at: new Date().toISOString() })
                .eq("id", existing.id);
              if (error) insertErrors.push({ row: i + 2, msg: `تحديث السجل: ${error.message}` });
              else batchUpdated++;
            } else {
              // إضافة سجل جديد
              const { error } = await supabase
                .from(currentSchema.tableName)
                .insert([rec]);
              if (error) insertErrors.push({ row: i + 2, msg: `إضافة السجل: ${error.message}` });
              else batchInserted++;
            }
          }
          inserted += batchInserted;
          updated += batchUpdated;
        } else {
          const { error } = await supabase.from(currentSchema.tableName).insert(batch);
          if (error) {
            insertErrors.push({ row: i + 2, msg: `دفعة ${i + 1}–${i + batch.length}: ${error.message}` });
          } else {
            inserted += batch.length;
          }
        }

        setImportProgress({ total: toInsert.length, done: inserted + updated, errors: insertErrors, success: false });
      }

      await logAction("bulk_import", currentSchema.tableName, null);
      setImportProgress({ total: toInsert.length, done: inserted + updated, errors: insertErrors, success: true, inserted, updated });
      fetchRecords();
    } catch (err: any) {
      setImportProgress(prev => ({
        total: prev?.total || 0,
        done: prev?.done || 0,
        errors: [{ row: 0, msg: "خطأ عام: " + (err?.message || "فشل الاستيراد") }],
        success: false
      }));
    }
    setUploadingFile(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ===== بناء HTML للطباعة/PDF — يستخدم المحدد لو فيه تحديد، وإلا كل المفلتر =====
  const buildAdminAffairsHTML = () => {
    const rowsData = selectedIds.length > 0
      ? filtered.filter((r: any) => selectedIds.includes(r.id))
      : filtered;

    let html = `<html dir="rtl"><head><title>طباعة</title><style>
      body { font-family: Arial, sans-serif; direction: rtl; padding:20px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: right; font-size:12px; }
      th { background-color: #4f46e5; color: white; }
    </style></head><body>`;

    html += `<h2>${activeSubTab === "purchases" ? "طلبات الشراء" : activeSubTab === "summary" ? "إجمالي الطلبات" : "خضار أسبوعي"}</h2>`;
    html += `<p style="color:#64748b;font-size:12px">عدد السجلات: ${rowsData.length}</p>`;
    html += `<table><thead><tr>`;

    currentSchema.fields.forEach((f: any) => {
      html += `<th>${f.label}</th>`;
    });

    html += `</tr></thead><tbody>`;

    rowsData.forEach((record: any) => {
      html += `<tr>`;
      currentSchema.fields.forEach((f: any) => {
        let value = record[f.key] || "-";
        if (f.type === "date" && value !== "-") {
          value = formatDate(value);
        }
        html += `<td>${value}</td>`;
      });
      html += `</tr>`;
    });

    html += `</tbody></table></body></html>`;
    return html;
  };

  // ===== PRINT =====
  const handlePrint = () => {
    printHTMLContent(buildAdminAffairsHTML());
  };

  // ===== PDF EXPORT (المحدد أو المفلتر) =====
  const handleExportPDF = () => {
    const fileName = `${activeSubTab === "purchases" ? "طلبات-الشراء" : activeSubTab === "summary" ? "إجمالي-الطلبات" : "خضار-أسبوعي"}-${new Date().toISOString().split("T")[0]}`;
    exportHTMLToPDF(buildAdminAffairsHTML(), fileName);
  };

  // ===== SHARE =====
  const handleShare = () => {
    const shareText = `${activeSubTab === "purchases" ? "طلبات الشراء" : activeSubTab === "summary" ? "إجمالي الطلبات" : "خضار أسبوعي"}\n\nإجمالي السجلات: ${filtered.length}`;
    
    if (navigator.share) {
      navigator.share({
        title: "الشؤون الإدارية",
        text: shareText,
      });
    } else {
      alert("نسخ البيانات:\n" + shareText);
    }
  };

  // ===== DOWNLOAD TEMPLATE =====
  const downloadTemplate = () => {
    const templateData: Record<string, any>[] = [{}];
    currentSchema.fields.forEach((f: any) => {
      templateData[0][Object.keys(currentSchema.excelColumns).find(key => currentSchema.excelColumns[key] === f.key) || f.key] = "";
    });

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "نموذج");
    XLSX.writeFile(wb, `نموذج_${activeSubTab === "purchases" ? "طلبات_الشراء" : activeSubTab === "summary" ? "إجمالي_الطلبات" : "خضار_أسبوعي"}.xlsx`);
  };

  // ===== RENDER =====
  return (
    <div dir="rtl" className="space-y-6">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2 style={{ fontSize: "24px", fontWeight: "900", margin: 0 }}>🏛️ الشؤون الإدارية</h2>
          <p style={{ color: "#64748b", fontSize: "13px", marginTop: "4px" }}>إدارة شاملة لطلبات الشراء والعمليات الإدارية</p>
        </div>
      </div>

      {/* Sub Tabs */}
      <div style={{ display: "flex", gap: "8px", borderBottom: "2px solid #e2e8f0", overflowX: "auto" }}>
        {[
          { id: "purchases", label: "📋 طلبات الشراء" },
          { id: "summary", label: "📊 إجمالي الطلبات" },
          { id: "vegetables", label: "🥬 خضار أسبوعي" },
        ].map((tab: any) => (
          <button
            key={tab.id}
            onClick={() => { setActiveSubTab(tab.id); setSelectedIds([]); }}
            style={{
              padding: "12px 20px",
              border: "none",
              background: activeSubTab === tab.id ? "#4f46e5" : "transparent",
              color: activeSubTab === tab.id ? "white" : "#64748b",
              fontWeight: activeSubTab === tab.id ? "900" : "700",
              fontSize: "14px",
              cursor: "pointer",
              borderRadius: "8px 8px 0 0",
              fontFamily: "inherit",
              transition: "all 0.2s"
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Action Buttons */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button onClick={openAdd} style={{
          display: "flex", alignItems: "center", gap: "6px",
          background: "linear-gradient(135deg,#4f46e5,#7c3aed)", color: "white",
          border: "none", borderRadius: "10px", padding: "10px 16px",
          fontWeight: "800", fontSize: "13px", cursor: "pointer", fontFamily: "inherit"
        }}>
          <Plus size={16} /> إضافة جديد
        </button>
        <button onClick={downloadTemplate} style={{
          display: "flex", alignItems: "center", gap: "6px",
          background: "#f59e0b", color: "white",
          border: "none", borderRadius: "10px", padding: "10px 16px",
          fontWeight: "800", fontSize: "13px", cursor: "pointer", fontFamily: "inherit"
        }}>
          <FileDown size={16} /> تحميل نموذج
        </button>
        <button onClick={() => fileInputRef.current?.click()} disabled={uploadingFile} style={{
          display: "flex", alignItems: "center", gap: "6px",
          background: uploadingFile ? "#94a3b8" : "#0284c7", color: "white",
          border: "none", borderRadius: "10px", padding: "10px 16px",
          fontWeight: "800", fontSize: "13px", cursor: uploadingFile ? "not-allowed" : "pointer",
          fontFamily: "inherit"
        }}>
          <Upload size={16} /> {uploadingFile ? "جاري..." : "استيراد"}
        </button>
        <button onClick={exportToExcel} style={{
          display: "flex", alignItems: "center", gap: "6px",
          background: "#10b981", color: "white",
          border: "none", borderRadius: "10px", padding: "10px 16px",
          fontWeight: "800", fontSize: "13px", cursor: "pointer", fontFamily: "inherit"
        }}>
          <Download size={16} /> تصدير
        </button>
        <button onClick={handlePrint} style={{
          display: "flex", alignItems: "center", gap: "6px",
          background: "#8b5cf6", color: "white",
          border: "none", borderRadius: "10px", padding: "10px 16px",
          fontWeight: "800", fontSize: "13px", cursor: "pointer", fontFamily: "inherit"
        }}>
          <Printer size={16} /> طباعة
        </button>
        <button onClick={handleExportPDF} style={{
          display: "flex", alignItems: "center", gap: "6px",
          background: "#dc2626", color: "white",
          border: "none", borderRadius: "10px", padding: "10px 16px",
          fontWeight: "800", fontSize: "13px", cursor: "pointer", fontFamily: "inherit"
        }}>
          <FileDown size={16} /> {selectedIds.length > 0 ? `PDF (${selectedIds.length})` : "تصدير PDF"}
        </button>
        <button onClick={handleShare} style={{
          display: "flex", alignItems: "center", gap: "6px",
          background: "#ec4899", color: "white",
          border: "none", borderRadius: "10px", padding: "10px 16px",
          fontWeight: "800", fontSize: "13px", cursor: "pointer", fontFamily: "inherit"
        }}>
          <Share2 size={16} /> مشاركة
        </button>
        {/* زر تعليمات الاستيراد */}
        <button onClick={() => setShowImportGuide(true)} style={{
          display: "flex", alignItems: "center", gap: "6px",
          background: "#f1f5f9", color: "#475569",
          border: "1px solid #e2e8f0", borderRadius: "10px", padding: "10px 16px",
          fontWeight: "800", fontSize: "13px", cursor: "pointer", fontFamily: "inherit"
        }}>
          ❓ تعليمات الاستيراد
        </button>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileUpload} style={{ display: "none" }} />
      </div>

      {/* ===== شريط التحديد الجماعي ===== */}
      {selectedIds.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
          background: "linear-gradient(135deg,#1e293b,#334155)", borderRadius: "12px",
          padding: "12px 18px", color: "white"
        }}>
          <span style={{ fontWeight: "900", fontSize: "14px" }}>
            ✅ تم تحديد <span style={{ color: "#fbbf24", fontSize: "16px" }}>{selectedIds.length}</span> سجل
          </span>
          <button onClick={deleteSelected} style={{
            display: "flex", alignItems: "center", gap: "6px",
            background: "#dc2626", color: "white", border: "none", borderRadius: "8px",
            padding: "8px 14px", fontWeight: "800", fontSize: "13px", cursor: "pointer", fontFamily: "inherit"
          }}>
            <Trash2 size={14} /> حذف المحدد ({selectedIds.length})
          </button>
          <button onClick={() => setSelectedIds(filtered.map((r: any) => r.id))} style={{
            background: "#475569", color: "white", border: "none", borderRadius: "8px",
            padding: "8px 14px", fontWeight: "800", fontSize: "13px", cursor: "pointer", fontFamily: "inherit"
          }}>
            تحديد الكل ({filtered.length})
          </button>
          <button onClick={() => setSelectedIds([])} style={{
            background: "transparent", color: "#94a3b8", border: "1px solid #475569", borderRadius: "8px",
            padding: "8px 14px", fontWeight: "800", fontSize: "13px", cursor: "pointer", fontFamily: "inherit"
          }}>
            إلغاء التحديد
          </button>
        </div>
      )}

      {/* ===== نافذة تعليمات الاستيراد ===== */}
      {showImportGuide && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: "16px"
        }}>
          <div style={{
            background: "white", borderRadius: "16px", padding: "28px", maxWidth: "560px", width: "100%",
            maxHeight: "80vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "900", color: "#1e293b" }}>📋 تعليمات الاستيراد من Excel</h3>
              <button onClick={() => setShowImportGuide(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "20px", color: "#94a3b8" }}>✕</button>
            </div>

            {/* التواريخ */}
            <div style={{ background: "#eff6ff", borderRadius: "10px", padding: "14px", marginBottom: "14px", borderRight: "4px solid #3b82f6" }}>
              <p style={{ margin: "0 0 8px", fontWeight: "900", color: "#1d4ed8", fontSize: "14px" }}>📅 صيغ التواريخ المقبولة</p>
              <ul style={{ margin: 0, paddingRight: "20px", fontSize: "13px", color: "#1e40af", lineHeight: "1.8" }}>
                <li><strong>YYYY-MM-DD</strong> مثال: <code>2026-02-20</code> ✅ (الأفضل)</li>
                <li><strong>YYYY/MM/DD</strong> مثال: <code>2026/02/20</code> ✅</li>
                <li><strong>DD-MM-YYYY</strong> مثال: <code>20-02-2026</code> ✅</li>
                <li><strong>DD/MM/YYYY</strong> مثال: <code>20/02/2026</code> ✅</li>
                <li>أرقام عربية مثال: <code>٢٠٢٦/٠٢/٢٠</code> ✅ (مدعومة)</li>
                <li>رقم تسلسلي Excel ✅ (تلقائي)</li>
              </ul>
            </div>

            {/* الحقول المطلوبة */}
            <div style={{ background: "#fef2f2", borderRadius: "10px", padding: "14px", marginBottom: "14px", borderRight: "4px solid #ef4444" }}>
              <p style={{ margin: "0 0 8px", fontWeight: "900", color: "#dc2626", fontSize: "14px" }}>⚠️ الحقول المطلوبة</p>
              <ul style={{ margin: 0, paddingRight: "20px", fontSize: "13px", color: "#991b1b", lineHeight: "1.8" }}>
                {activeSubTab !== "summary"
                  ? <li><strong>البند</strong> — يجب ألا يكون فارغاً في كل صف</li>
                  : <li><strong>رقم الطلب</strong> و<strong>وصف طلب الشراء</strong> — مطلوبان</li>
                }
                <li>أي صف يخلو من الحقل المطلوب سيُتخطى تلقائياً</li>
              </ul>
            </div>

            {/* نصائح عامة */}
            <div style={{ background: "#f0fdf4", borderRadius: "10px", padding: "14px", marginBottom: "14px", borderRight: "4px solid #22c55e" }}>
              <p style={{ margin: "0 0 8px", fontWeight: "900", color: "#15803d", fontSize: "14px" }}>💡 نصائح مهمة</p>
              <ul style={{ margin: 0, paddingRight: "20px", fontSize: "13px", color: "#166534", lineHeight: "1.8" }}>
                <li>حمّل النموذج أولاً واملأه لضمان تطابق أسماء الأعمدة</li>
                <li>لا تغيّر أسماء الأعمدة في النموذج</li>
                <li>الكمية المتبقية تُحسب تلقائياً (مطلوبة - منفذة)</li>
                <li>حقل "عدد البنود المتبقية" يقبل أرقاماً ونصوصاً</li>
                <li>حقل "العام" يقبل أي سنة من 2015 إلى 2035</li>
              </ul>
            </div>

            <button onClick={() => { setShowImportGuide(false); downloadTemplate(); }} style={{
              width: "100%", padding: "12px", background: "linear-gradient(135deg,#4f46e5,#7c3aed)",
              color: "white", border: "none", borderRadius: "10px", fontWeight: "900",
              fontSize: "14px", cursor: "pointer", fontFamily: "inherit"
            }}>
              ⬇️ تحميل النموذج الجاهز
            </button>
          </div>
        </div>
      )}

      {/* ===== شريط تقدم الاستيراد ===== */}
      {importProgress && (
        <div style={{
          background: "white", borderRadius: "14px", padding: "20px",
          border: `2px solid ${importProgress.success ? "#22c55e" : importProgress.errors.length > 0 ? "#f59e0b" : "#3b82f6"}`,
          boxShadow: "0 4px 20px rgba(0,0,0,0.08)"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <p style={{ margin: 0, fontWeight: "900", fontSize: "14px", color: "#1e293b" }}>
              {importProgress.success ? "✅ اكتمل الاستيراد" : uploadingFile ? "⏳ جاري الاستيراد..." : "📊 نتيجة الاستيراد"}
            </p>
            <button onClick={() => setImportProgress(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "18px" }}>✕</button>
          </div>

          {/* شريط التقدم */}
          {importProgress.total > 0 && (
            <div style={{ marginBottom: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "12px", color: "#64748b", fontWeight: "700" }}>
                <span>تم رفع {importProgress.done} من {importProgress.total} سجل</span>
                <span>{Math.round((importProgress.done / importProgress.total) * 100)}%</span>
              </div>
              <div style={{ background: "#e2e8f0", borderRadius: "99px", height: "10px", overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${(importProgress.done / importProgress.total) * 100}%`,
                  background: importProgress.success ? "#22c55e" : "linear-gradient(90deg,#4f46e5,#7c3aed)",
                  borderRadius: "99px",
                  transition: "width 0.3s ease"
                }} />
              </div>
            </div>
          )}

          {/* الملخص */}
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: importProgress.errors.length > 0 ? "12px" : "0" }}>
            {(importProgress.inserted ?? importProgress.done) > 0 && (
              <span style={{ background: "#dcfce7", color: "#15803d", padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: "800" }}>
                ✅ {importProgress.inserted ?? importProgress.done} سجل جديد
              </span>
            )}
            {(importProgress.updated ?? 0) > 0 && (
              <span style={{ background: "#dbeafe", color: "#1d4ed8", padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: "800" }}>
                🔄 {importProgress.updated} سجل مُحدَّث
              </span>
            )}
            {importProgress.errors.length > 0 && (
              <span style={{ background: "#fef3c7", color: "#92400e", padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: "800" }}>
                ⚠️ {importProgress.errors.length} تنبيه
              </span>
            )}
          </div>

          {/* رسائل الأخطاء */}
          {importProgress.errors.length > 0 && (
            <div style={{ background: "#fef9ec", borderRadius: "8px", padding: "12px", maxHeight: "160px", overflowY: "auto" }}>
              <p style={{ margin: "0 0 8px", fontWeight: "900", fontSize: "12px", color: "#92400e" }}>⚠️ تفاصيل التنبيهات:</p>
              {importProgress.errors.map((e, i) => (
                <div key={i} style={{ fontSize: "12px", color: "#78350f", padding: "4px 0", borderBottom: "1px solid #fde68a" }}>
                  {e.msg}
                  {e.msg.includes("التاريخ") && (
                    <span style={{ color: "#0284c7", marginRight: "8px", cursor: "pointer", fontWeight: "700" }}
                      onClick={() => setShowImportGuide(true)}>
                      — اطلع على تعليمات التواريخ ←
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search & Filters */}
      <div style={{
        background: "white", borderRadius: "12px", padding: "14px 16px",
        border: "1px solid #e2e8f0", display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center"
      }}>
        <div style={{ flex: 1, minWidth: "200px", position: "relative" }}>
          <Search style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} size={16} />
          <input
            type="text"
            placeholder="بحث..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={{
              width: "100%", padding: "10px 32px 10px 12px", border: "1px solid #e2e8f0",
              borderRadius: "8px", outline: "none", fontSize: "13px", fontFamily: "inherit", boxSizing: "border-box" as const
            }}
          />
        </div>

        {activeSubTab !== "summary" && (
          <>
            <select
              value={departmentFilter}
              onChange={e => setDepartmentFilter(e.target.value)}
              style={{
                padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: "8px",
                fontSize: "13px", outline: "none", fontFamily: "inherit"
              }}
            >
              <option value="all">جميع الأقسام</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{
                padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: "8px",
                fontSize: "13px", outline: "none", fontFamily: "inherit"
              }}
            >
              <option value="all">جميع الحالات</option>
              {statuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </>
        )}

        <select
          value={yearFilter}
          onChange={e => setYearFilter(e.target.value)}
          style={{
            padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: "8px",
            fontSize: "13px", outline: "none", fontFamily: "inherit"
          }}
        >
          <option value="all">جميع السنوات</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        {(searchText || departmentFilter !== "all" || statusFilter !== "all" || yearFilter !== "all") && (
          <button
            onClick={() => {
              setSearchText("");
              setDepartmentFilter("all");
              setStatusFilter("all");
              setYearFilter("all");
            }}
            style={{
              padding: "10px 14px", background: "#fee2e2", color: "#dc2626",
              border: "none", borderRadius: "8px", fontWeight: "700", fontSize: "12px",
              cursor: "pointer", fontFamily: "inherit"
            }}
          >
            ✕ مسح
          </button>
        )}
      </div>

      {/* Selected Actions */}
      {selectedIds.length > 0 && (
        <div style={{
          background: "#eef2ff", borderRadius: "10px", padding: "12px 16px",
          border: "1px solid #c7d2fe", display: "flex", alignItems: "center", gap: "12px"
        }}>
          <span style={{ fontWeight: "700", color: "#4f46e5" }}>✓ تم تحديد {selectedIds.length} سجل</span>
          <button
            onClick={deleteSelected}
            style={{
              marginLeft: "auto", padding: "8px 14px", background: "#dc2626", color: "white",
              border: "none", borderRadius: "8px", fontWeight: "700", fontSize: "12px",
              cursor: "pointer", fontFamily: "inherit"
            }}
          >
            🗑️ حذف المحدد
          </button>
        </div>
      )}

      {/* Statistics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px" }}>
        <div style={{ background: "white", borderRadius: "10px", padding: "14px", border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: "11px", color: "#64748b", fontWeight: "700", marginBottom: "4px" }}>إجمالي</div>
          <div style={{ fontSize: "20px", fontWeight: "900", color: "#4f46e5" }}>{filtered.length}</div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
          <Loader2 className="animate-spin" size={28} style={{ margin: "0 auto 10px", display: "block" }} />
          جاري التحميل...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          background: "white", borderRadius: "12px", padding: "40px 20px",
          textAlign: "center", border: "2px dashed #e2e8f0"
        }}>
          <p style={{ color: "#94a3b8", fontWeight: "700", fontSize: "14px" }}>لا توجد بيانات</p>
        </div>
      ) : (
        <div
          ref={tableScrollRef}
          style={{
            background: "white", borderRadius: "12px", border: "1px solid #e2e8f0",
            maxHeight: "600px", overflowY: "auto", overflowX: "auto",
            display: "flex", flexDirection: "column",
          }}
          className="admin-table-scroll"
          onClick={() => sortDropdown && setSortDropdown("")}
        >
          <style>{`
            .admin-table-scroll {
              scroll-behavior: smooth;
            }
            .admin-table-scroll::-webkit-scrollbar {
              width: 10px;
              height: 12px;
            }
            .admin-table-scroll::-webkit-scrollbar-track {
              background: #f1f5f9;
            }
            .admin-table-scroll::-webkit-scrollbar-thumb {
              background: #cbd5e1;
              border-radius: 5px;
            }
            .admin-table-scroll::-webkit-scrollbar-thumb:hover {
              background: #94a3b8;
            }
            .admin-table-scroll table {
              width: 100%;
              border-collapse: collapse;
              table-layout: auto;
            }
            .admin-table-scroll thead {
              position: sticky;
              top: 0;
              z-index: 10;
              background: #f8fafc;
            }
            .admin-table-scroll th {
              white-space: normal;
              word-wrap: break-word;
              padding: 12px 8px !important;
              font-size: 11px;
              font-weight: 800;
              line-height: 1.3;
            }
            .admin-table-scroll td {
              padding: 8px 8px !important;
              font-size: 12px;
            }
          `}</style>
          <table style={{ width:"100%", borderCollapse:"collapse", border:"2px solid #94a3b8", fontSize:"13px", backgroundColor:"#ffffff" }}>
              <colgroup>
                <col style={{ width: "40px" }} />
                {currentSchema.fields.filter((f: any) => !["requesting_department", "notes", "remarks"].includes(f.key)).map((f: any) => {
                  const wideKeys = ["item_name", "notes", "remarks", "description"];
                  const narrowKeys = ["system_request_no", "admin_request_no", "request_number", "year", "quantity_requested", "quantity_executed", "quantity_remaining", "unit"];
                  const width = wideKeys.includes(f.key) ? "180px" : narrowKeys.includes(f.key) ? "90px" : "110px";
                  return <col key={f.key} style={{ width }} />;
                })}
                <col style={{ width: "80px" }} />
              </colgroup>
              <thead style={{ border:"1px solid #94a3b8", padding:"12px 8px", backgroundColor:"#4f46e5", color:"white", fontWeight:"900", textAlign:"center" }}>
                <tr>
                  <th style={{ border:"1px solid #94a3b8", padding:"12px 8px", backgroundColor:"#4f46e5", color:"white", fontWeight:"900", textAlign:"center" }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.length === filtered.length && filtered.length > 0}
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedIds(filtered.map(r => r.id));
                        } else {
                          setSelectedIds([]);
                        }
                      }}
                      style={{ cursor: "pointer" }}
                    />
                  </th>
                  {currentSchema.fields.filter((f: any) => !["requesting_department", "notes", "remarks"].includes(f.key)).map((f: any) => (
                    <SortTh
                      key={f.key}
                      label={f.label}
                      field={f.key}
                      sortField={sortField}
                      sortDir={sortDir}
                      sortDropdown={sortDropdown}
                      onSort={handleSort}
                      onClear={handleSortClear}
                      onToggle={handleSortToggle}
                      align="right"
                    />
                  ))}
                  <th style={{ border:"1px solid #94a3b8", padding:"12px 8px", backgroundColor:"#4f46e5", color:"white", fontWeight:"900", textAlign:"center" }}>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((record: any) => (
                  <tr key={record.id} style={{ height: "44px" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#f8fafc")}
                    onMouseLeave={e => (e.currentTarget.style.background = "white")}>
                    <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(record.id)}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedIds([...selectedIds, record.id]);
                          } else {
                            setSelectedIds(selectedIds.filter(id => id !== record.id));
                          }
                        }}
                        style={{ cursor: "pointer" }}
                      />
                    </td>
                    {currentSchema.fields.filter((f: any) => !["requesting_department", "notes", "remarks"].includes(f.key)).map((f: any) => {
                      const rawVal = f.type === "date" && record[f.key] ? formatDate(record[f.key]) : (record[f.key] ?? "-");
                      const displayVal = rawVal === "" ? "-" : rawVal;
                      const isWideField = ["item_name", "notes", "remarks", "description"].includes(f.key);
                      return (
                        <td key={f.key} title={String(displayVal).length > 20 ? String(displayVal) : undefined} style={{
                          border: "1px solid #94a3b8",
                          padding: "8px 8px",
                          textAlign: "right",
                          fontSize: "12px",
                          color: "#1e293b",
                          verticalAlign: "middle",
                          whiteSpace: isWideField ? "normal" : "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          wordWrap: isWideField ? "break-word" : "normal",
                          maxWidth: "100%",
                        }}>
                          {displayVal}
                        </td>
                      );
                    })}
                    <td style={{ border:"1px solid #94a3b8", padding:"10px 8px", color:"#1e293b", textAlign:"center" }}>
                      <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
                        <button onClick={() => openEdit(record)} style={{
                          padding: "5px 8px", background: "#eff6ff", color: "#0284c7",
                          border: "none", borderRadius: "6px", fontWeight: "700", cursor: "pointer",
                          fontSize: "11px", fontFamily: "inherit"
                        }}>
                          ✏️
                        </button>
                        <button onClick={() => deleteRecord(record.id)} style={{
                          padding: "5px 8px", background: "#fff1f2", color: "#dc2626",
                          border: "none", borderRadius: "6px", fontWeight: "700", cursor: "pointer",
                          fontSize: "11px", fontFamily: "inherit"
                        }}>
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", zIndex: 9999
        }} onClick={() => setShowForm(false)}>
          <div style={{
            background: "white", borderRadius: "20px", width: "100%", maxWidth: "700px",
            padding: "24px", boxShadow: "0 32px 80px rgba(0,0,0,0.25)", maxHeight: "90vh", overflowY: "auto"
          }} dir="rtl" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
              <h3 style={{ margin: 0, fontWeight: "900", fontSize: "18px" }}>
                {editingRecord ? "✏️ تعديل" : "➕ إضافة جديد"}
              </h3>
              <button onClick={() => setShowForm(false)} style={{
                border: "1px solid #e2e8f0", borderRadius: "8px", padding: "6px 12px",
                cursor: "pointer", background: "white", fontSize: "16px", fontWeight: "700", fontFamily: "inherit"
              }}>
                ✕
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {currentSchema.fields.map((field: any) => (
                <div key={field.key} style={{ gridColumn: field.type === "textarea" ? "1 / -1" : "auto" }}>
                  <label style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", display: "block", marginBottom: "5px" }}>
                    {field.label} {field.required && "*"}
                  </label>
                  {field.type === "select" ? (
                    <select
                      value={form[field.key] || ""}
                      onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                      disabled={field.readonly}
                      style={{
                        width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0",
                        borderRadius: "8px", outline: "none", fontSize: "12px", fontFamily: "inherit"
                      }}
                    >
                      <option value="">اختر...</option>
                      {field.options?.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  ) : field.type === "textarea" ? (
                    <textarea
                      value={form[field.key] || ""}
                      onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                      disabled={field.readonly}
                      rows={2}
                      style={{
                        width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0",
                        borderRadius: "8px", outline: "none", fontSize: "12px", fontFamily: "inherit",
                        resize: "none", boxSizing: "border-box" as const
                      }}
                    />
                  ) : (
                    <input
                      type={field.type}
                      value={form[field.key] || ""}
                      onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                      disabled={field.readonly}
                      style={{
                        width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0",
                        borderRadius: "8px", outline: "none", fontSize: "12px", fontFamily: "inherit", boxSizing: "border-box" as const
                      }}
                    />
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "18px" }}>
              <button onClick={() => setShowForm(false)} style={{
                padding: "12px", background: "#f1f5f9", color: "#64748b", border: "none",
                borderRadius: "8px", fontWeight: "900", cursor: "pointer", fontSize: "13px", fontFamily: "inherit"
              }}>
                إلغاء
              </button>
              <button onClick={save} disabled={saving} style={{
                padding: "12px", background: "linear-gradient(135deg,#4f46e5,#7c3aed)", color: "white",
                border: "none", borderRadius: "8px", fontWeight: "900", cursor: saving ? "not-allowed" : "pointer",
                fontSize: "13px", fontFamily: "inherit", opacity: saving ? 0.6 : 1
              }}>
                {saving ? "جاري..." : "💾 حفظ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


export default VacationManagementSystem;

// ================================================================
// 🏢 مكوّن مديرو الأقسام — للـ Owner فقط
// ================================================================
const ManagersTab = ({ departments, supabase, logAction, currentUser }: {
  departments: any[]; supabase: any; logAction: Function; currentUser: any;
}) => {
  const [managers, setManagers]   = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editingMgr, setEditingMgr] = useState<any>(null);
  const [saving, setSaving]       = useState(false);
  // selectedDeptIds: array of selected department ids (strings)
  const [form, setForm]           = useState({ name:"", email:"", password:"" });
  const [selectedDeptIds, setSelectedDeptIds] = useState<string[]>([]);

  // Helper: parse department_ids field (stored as JSON array string or null)
  const parseDeptIds = (m: any): string[] => {
    if (m.department_ids) {
      try {
        const parsed = typeof m.department_ids === "string"
          ? JSON.parse(m.department_ids)
          : m.department_ids;
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch {}
    }
    // fallback: use single department_id
    if (m.department_id) return [String(m.department_id)];
    return [];
  };

  const fetchManagers = async () => {
    setLoading(true);
    const { data } = await supabase.from("department_managers").select("*, departments(name)").order("name");
    if (data) setManagers(data);
    setLoading(false);
  };
  useEffect(() => { fetchManagers(); }, []);

  const openAdd = () => {
    setEditingMgr(null);
    setForm({ name:"", email:"", password:"" });
    setSelectedDeptIds([]);
    setShowForm(true);
  };

  const openEdit = (m: any) => {
    setEditingMgr(m);
    setForm({ name:m.name, email:m.email, password:m.password });
    setSelectedDeptIds(parseDeptIds(m));
    setShowForm(true);
  };

  const toggleDept = (id: string) => {
    setSelectedDeptIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const save = async () => {
    if (!form.name || !form.email || !form.password) return alert("الاسم والبريد وكلمة المرور مطلوبة");
    if (selectedDeptIds.length === 0) return alert("اختر قسماً واحداً على الأقل");
    setSaving(true);

    // primary department_id = first selected, department_ids = full array as JSON
    const primaryDeptId = selectedDeptIds[0];
    const deptIdsJson = JSON.stringify(selectedDeptIds);

    const payload = {
      ...form,
      department_id: primaryDeptId,
      department_ids: deptIdsJson,
    };

    if (editingMgr) {
      const { error } = await supabase.from("department_managers").update(payload).eq("id", editingMgr.id);
      if (error) { alert("خطأ في التحديث: " + error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("department_managers").insert([payload]);
      if (error) { alert("خطأ: " + error.message); setSaving(false); return; }
    }
    await logAction(editingMgr ? "update" : "create", "department_managers", editingMgr?.id ?? null);
    setSaving(false); setShowForm(false); setEditingMgr(null);
    setForm({ name:"", email:"", password:"" });
    setSelectedDeptIds([]);
    fetchManagers();
  };

  const del = async (m: any) => {
    if (!window.confirm(`حذف مدير القسم "${m.name}"؟`)) return;
    await supabase.from("department_managers").delete().eq("id", m.id);
    await logAction("delete", "department_managers", m.id);
    fetchManagers();
  };

  // Get department names for a manager
  const getMgrDeptNames = (m: any): string => {
    const ids = parseDeptIds(m);
    if (ids.length === 0) return "—";
    return ids.map(id => departments.find(d => String(d.id) === String(id))?.name || id).join(" • ");
  };

  return (
    <div dir="rtl" className="space-y-6">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <h2 style={{ fontSize:"24px", fontWeight:"900", margin:0 }}>🏢 مديرو الأقسام</h2>
          <p style={{ color:"#64748b", fontSize:"13px", marginTop:"4px" }}>يدخلون بالإيميل + كلمة السر ويرون أقسامهم فقط. موافقتهم أولى ثم تنتظر موافقتك النهائية.</p>
        </div>
        <button onClick={openAdd} style={{ background:"linear-gradient(135deg, #4f46e5, #7c3aed)", color:"white", border:"none", borderRadius:"14px", padding:"12px 22px", fontWeight:"800", fontSize:"14px", cursor:"pointer" }}>+ إضافة مدير قسم</button>
      </div>

      {/* بطاقة الشرح */}
      <div style={{ background:"linear-gradient(135deg, #ede9fe, #ddd6fe)", borderRadius:"16px", padding:"16px 20px", display:"flex", gap:"16px", alignItems:"center" }}>
        <div style={{ fontSize:"36px" }}>🔄</div>
        <div style={{ fontSize:"13px", color:"#4c1d95", lineHeight:"1.8" }}>
          <strong>سير العمل (Double Approval):</strong><br/>
          موظف يقدم طلب → <strong>مدير القسم يوافق مبدئياً</strong> → <strong>أنت توافق نهائياً</strong> → يُخصم الرصيد ويُرسل الإشعار
        </div>
      </div>

      {loading ? <div style={{ textAlign:"center", padding:"60px", color:"#94a3b8" }}>جاري التحميل...</div> : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(300px, 1fr))", gap:"16px" }}>
          {managers.map(m => {
            const deptNames = getMgrDeptNames(m);
            const deptIds = parseDeptIds(m);
            return (
              <div key={m.id} style={{ background:"white", borderRadius:"20px", padding:"24px", border:"1px solid #e2e8f0" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"16px" }}>
                  <div style={{ display:"flex", gap:"12px", alignItems:"center" }}>
                    <div style={{ width:"46px", height:"46px", borderRadius:"14px", background:"linear-gradient(135deg, #ede9fe, #ddd6fe)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"22px" }}>🏢</div>
                    <div>
                      <div style={{ fontWeight:"800", fontSize:"15px" }}>{m.name}</div>
                      <div style={{ fontSize:"11px", color:"#6366f1", fontWeight:"700", maxWidth:"160px", lineHeight:"1.5" }}>{deptNames}</div>
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:"6px" }}>
                    <button onClick={() => openEdit(m)} style={{ padding:"7px", background:"#eff6ff", border:"none", borderRadius:"8px", cursor:"pointer" }}>✏️</button>
                    <button onClick={() => del(m)}       style={{ padding:"7px", background:"#fff1f2", border:"none", borderRadius:"8px", cursor:"pointer" }}>🗑️</button>
                  </div>
                </div>
                <div style={{ background:"#f8fafc", borderRadius:"12px", padding:"12px 14px", fontSize:"13px" }}>
                  <div style={{ marginBottom:"6px" }}>📧 {m.email}</div>
                  <div style={{ color:"#94a3b8" }}>🔑 {"•".repeat(m.password?.length || 6)}</div>
                </div>
                {/* عرض الأقسام كـ tags */}
                {deptIds.length > 1 && (
                  <div style={{ marginTop:"10px", display:"flex", flexWrap:"wrap", gap:"6px" }}>
                    {deptIds.map(id => {
                      const dName = departments.find(d => String(d.id) === String(id))?.name;
                      return dName ? (
                        <span key={id} style={{ background:"#ede9fe", color:"#6d28d9", borderRadius:"8px", padding:"3px 10px", fontSize:"11px", fontWeight:"700" }}>
                          🏷️ {dName}
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
                <div style={{ marginTop:"10px", background:"#f0fdf4", borderRadius:"10px", padding:"8px 12px", fontSize:"12px", color:"#16a34a", fontWeight:"700" }}>
                  ✅ صلاحية: موافقة مبدئية على طلبات {deptIds.length > 1 ? `${deptIds.length} أقسام` : "قسمه"}
                </div>
              </div>
            );
          })}
          {managers.length === 0 && (
            <div style={{ gridColumn:"1/-1", padding:"60px", textAlign:"center", background:"white", borderRadius:"20px", border:"2px dashed #e2e8f0" }}>
              <div style={{ fontSize:"48px", marginBottom:"12px" }}>🏢</div>
              <p style={{ color:"#94a3b8", fontWeight:"700" }}>لم تضف مديري أقسام بعد</p>
            </div>
          )}
        </div>
      )}

      {/* فورم الإضافة / التعديل */}
      {showForm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15, 23, 42, 0.6)", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:"20px" }} onClick={() => setShowForm(false)}>
          <div style={{ background:"white", borderRadius:"28px", padding:"40px", width:"100%", maxWidth:"500px", direction:"rtl", maxHeight:"90vh", overflowY:"auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"28px" }}>
              <h3 style={{ margin:0, fontSize:"20px", fontWeight:"900" }}>{editingMgr ? "تعديل مدير قسم" : "إضافة مدير قسم جديد"}</h3>
              <button onClick={() => setShowForm(false)} style={{ background:"#f1f5f9", border:"none", borderRadius:"10px", padding:"8px 14px", cursor:"pointer", fontSize:"16px" }}>✕</button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
              {[
                { label:"الاسم الكامل *", key:"name", type:"text", ph:"مثال: أحمد محمد" },
                { label:"البريد الإلكتروني *", key:"email", type:"email", ph:"manager@company.com" },
                { label:"كلمة المرور *", key:"password", type:"text", ph:"اختر كلمة مرور قوية" },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize:"12px", fontWeight:"700", color:"#64748b", display:"block", marginBottom:"6px" }}>{f.label}</label>
                  <input type={f.type} placeholder={f.ph} value={(form as any)[f.key]} onChange={e => setForm({...form, [f.key]: e.target.value})}
                    style={{ width:"100%", padding:"12px 16px", border:"1.5px solid #e2e8f0", borderRadius:"14px", fontSize:"14px", outline:"none", boxSizing:"border-box" as const, fontFamily:"inherit" }} />
                </div>
              ))}

              {/* اختيار الأقسام - متعدد */}
              <div>
                <label style={{ fontSize:"12px", fontWeight:"700", color:"#64748b", display:"block", marginBottom:"8px" }}>
                  الأقسام المسؤول عنها * <span style={{ color:"#a78bfa", fontWeight:"600" }}>(يمكن اختيار أكثر من قسم)</span>
                </label>
                <div style={{ border:"1.5px solid #e2e8f0", borderRadius:"14px", padding:"10px", maxHeight:"200px", overflowY:"auto", display:"flex", flexDirection:"column", gap:"6px" }}>
                  {departments.length === 0 && (
                    <div style={{ color:"#94a3b8", fontSize:"13px", padding:"8px" }}>لا توجد أقسام</div>
                  )}
                  {departments.map(d => {
                    const isChecked = selectedDeptIds.includes(String(d.id));
                    return (
                      <label key={d.id} style={{
                        display:"flex", alignItems:"center", gap:"10px", padding:"10px 12px",
                        borderRadius:"10px", cursor:"pointer", userSelect:"none",
                        background: isChecked ? "linear-gradient(135deg,#ede9fe,#ddd6fe)" : "#f8fafc",
                        border: isChecked ? "1.5px solid #a78bfa" : "1.5px solid transparent",
                        transition:"all 0.15s"
                      }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleDept(String(d.id))}
                          style={{ width:"16px", height:"16px", accentColor:"#7c3aed", cursor:"pointer", flexShrink:0 }}
                        />
                        <span style={{ fontSize:"13px", fontWeight: isChecked ? "700" : "500", color: isChecked ? "#5b21b6" : "#374151" }}>
                          {isChecked ? "🏢" : "○"} {d.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {selectedDeptIds.length > 0 && (
                  <div style={{ marginTop:"8px", display:"flex", flexWrap:"wrap", gap:"6px" }}>
                    {selectedDeptIds.map(id => {
                      const dName = departments.find(d => String(d.id) === String(id))?.name;
                      return dName ? (
                        <span key={id} style={{ background:"#7c3aed", color:"white", borderRadius:"8px", padding:"3px 10px", fontSize:"11px", fontWeight:"700", display:"flex", alignItems:"center", gap:"4px" }}>
                          {dName}
                          <span onClick={() => toggleDept(id)} style={{ cursor:"pointer", opacity:0.8, marginRight:"2px" }}>✕</span>
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
              </div>

              <div style={{ background:"#fef3c7", borderRadius:"12px", padding:"12px", fontSize:"12px", color:"#92400e", fontWeight:"700" }}>
                ⚠️ احتفظ بكلمة المرور بشكل آمن
              </div>
              <button onClick={save} disabled={saving} style={{ width:"100%", background:"linear-gradient(135deg, #4f46e5, #7c3aed)", color:"white", border:"none", borderRadius:"14px", padding:"14px", fontWeight:"900", fontSize:"15px", cursor:"pointer", opacity: saving ? 0.6 : 1, fontFamily:"inherit" }}>
                {saving ? "جاري الحفظ..." : editingMgr ? "💾 تحديث" : "✅ إضافة"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ⚙️ مكوّن الادمن — للـ Owner فقط
const AdminsTab = ({ supabase, logAction, currentUser }: {
  supabase: any; logAction: Function; currentUser: any;
}) => {
  const [admins, setAdmins]     = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<any>(null);
  const [saving, setSaving]     = useState(false);
  const [form, setForm]         = useState({ name:"", email:"", password:"" });

  const fetch = async () => {
    setLoading(true);
    const { data } = await supabase.from("users").select("id, name, email, role").eq("role", "admin").order("name");
    if (data) setAdmins(data);
    setLoading(false);
  };
  useEffect(() => { fetch(); }, []);

  const openAdd = () => { setEditingAdmin(null); setForm({ name:"", email:"", password:"" }); setShowForm(true); };
  const openEdit = (a: any) => { setEditingAdmin(a); setForm({ name:a.name, email:a.email, password:"" }); setShowForm(true); };

  const save = async () => {
    if (!form.name || !form.email) return alert("الاسم والبريد الإلكتروني مطلوبان");
    if (!editingAdmin && !form.password) return alert("كلمة المرور مطلوبة عند إضافة ادمن جديد");
    setSaving(true);
    if (editingAdmin) {
      const update: { name: string; email: string; password?: string } = { name: form.name, email: form.email };
      if (form.password) {
        update.password = await hashPassword(form.password);
      }
      const { error: updateError } = await supabase.from("users").update(update).eq("id", editingAdmin.id);
      if (updateError) { alert("خطأ في التحديث: " + updateError.message); setSaving(false); return; }
      if (form.password) {
        await logAction("password_change", "users", editingAdmin.id, null, { admin_name: editingAdmin.name, changed_by: currentUser?.name || "غير معروف", description: `تم تغيير كلمة مرور الادمن "${editingAdmin.name}"` });
      }
    } else {
      const hashedPassword = await hashPassword(form.password);
      const { error } = await supabase.from("users").insert([{ name: form.name, email: form.email, password: hashedPassword, role: "admin" }]);
      if (error) { alert("خطأ: " + error.message); setSaving(false); return; }
    }
    await logAction(editingAdmin ? "update" : "create", "users", editingAdmin?.id ?? null, { role: "admin" });
    setSaving(false); setShowForm(false); setEditingAdmin(null);
    setForm({ name:"", email:"", password:"" });
    fetch();
  };

  const del = async (a: any) => {
    if (!window.confirm(`حذف الادمن "${a.name}"؟`)) return;
    await supabase.from("users").delete().eq("id", a.id);
    await logAction("delete", "users", a.id, { role: "admin" });
    fetch();
  };

  return (
    <div dir="rtl" className="space-y-6">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <h2 style={{ fontSize:"24px", fontWeight:"900", margin:0 }}>⚙️ الادمن</h2>
          <p style={{ color:"#64748b", fontSize:"13px", marginTop:"4px" }}>لهم نفس صلاحيات المالك كاملة. يمكنهم إدارة الموظفين والأقسام والمديرين.</p>
        </div>
        <button onClick={openAdd} style={{ background:"linear-gradient(135deg, #4f46e5, #7c3aed)", color:"white", border:"none", borderRadius:"14px", padding:"12px 22px", fontWeight:"800", fontSize:"14px", cursor:"pointer" }}>+ إضافة ادمن</button>
      </div>

      {/* بطاقة الشرح */}
      <div style={{ background:"linear-gradient(135deg, #f0fdf4, #dcfce7)", borderRadius:"16px", padding:"16px 20px", display:"flex", gap:"16px", alignItems:"center" }}>
        <div style={{ fontSize:"36px" }}>⚙️</div>
        <div style={{ fontSize:"13px", color:"#166534", lineHeight:"1.8" }}>
          <strong>الادمن:</strong><br/>
          لهم صلاحيات المالك الكاملة في إدارة النظام. يمكنهم إضافة/تعديل/حذف الموظفين والأقسام والمديرين والإجازات.
        </div>
      </div>

      {loading ? <div style={{ textAlign:"center", padding:"60px", color:"#94a3b8" }}>جاري التحميل...</div> : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(300px, 1fr))", gap:"16px" }}>
          {admins.map(a => (
            <div key={a.id} style={{ background:"white", borderRadius:"20px", padding:"24px", border:"1px solid #e2e8f0" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"16px" }}>
                <div style={{ display:"flex", gap:"12px", alignItems:"center" }}>
                  <div style={{ width:"46px", height:"46px", borderRadius:"14px", background:"linear-gradient(135deg, #f0fdf4, #dcfce7)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"22px" }}>⚙️</div>
                  <div>
                    <div style={{ fontWeight:"800", fontSize:"15px" }}>{a.name}</div>
                    <div style={{ fontSize:"12px", color:"#16a34a", fontWeight:"700" }}>ادمن النظام</div>
                  </div>
                </div>
                <div style={{ display:"flex", gap:"6px" }}>
                  <button onClick={() => openEdit(a)} style={{ padding:"7px", background:"#eff6ff", border:"none", borderRadius:"8px", cursor:"pointer" }}>✏️</button>
                  <button onClick={() => del(a)}       style={{ padding:"7px", background:"#fff1f2", border:"none", borderRadius:"8px", cursor:"pointer" }}>🗑️</button>
                </div>
              </div>
              <div style={{ background:"#f8fafc", borderRadius:"12px", padding:"12px 14px", fontSize:"13px" }}>
                <div>📧 {a.email}</div>
              </div>
              <div style={{ marginTop:"10px", background:"#f0fdf4", borderRadius:"10px", padding:"8px 12px", fontSize:"12px", color:"#16a34a", fontWeight:"700" }}>
                ✅ صلاحية: صلاحيات المالك الكاملة
              </div>
            </div>
          ))}
          {admins.length === 0 && (
            <div style={{ gridColumn:"1/-1", padding:"60px", textAlign:"center", background:"white", borderRadius:"20px", border:"2px dashed #e2e8f0" }}>
              <div style={{ fontSize:"48px", marginBottom:"12px" }}>⚙️</div>
              <p style={{ color:"#94a3b8", fontWeight:"700" }}>لم تضف ادمن بعد</p>
            </div>
          )}
        </div>
      )}

      {/* فورم الإضافة / التعديل */}
      {showForm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15, 23, 42, 0.6)", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:"20px" }} onClick={() => setShowForm(false)}>
          <div style={{ background:"white", borderRadius:"28px", padding:"40px", width:"100%", maxWidth:"460px", direction:"rtl" }} onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"28px" }}>
              <h3 style={{ margin:0, fontSize:"20px", fontWeight:"900" }}>{editingAdmin ? "تعديل ادمن" : "إضافة ادمن جديد"}</h3>
              <button onClick={() => setShowForm(false)} style={{ background:"#f1f5f9", border:"none", borderRadius:"10px", padding:"8px 14px", cursor:"pointer", fontSize:"16px" }}>✕</button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
              {[
                { label:"الاسم الكامل *", key:"name", type:"text", ph:"مثال: أحمد محمد" },
                { label:"البريد الإلكتروني *", key:"email", type:"email", ph:"admin@company.com" },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize:"12px", fontWeight:"700", color:"#64748b", display:"block", marginBottom:"6px" }}>{f.label}</label>
                  <input type={f.type} placeholder={f.ph} value={(form as any)[f.key]} onChange={e => setForm({...form, [f.key]: e.target.value})}
                    style={{ width:"100%", padding:"12px 16px", border:"1.5px solid #e2e8f0", borderRadius:"14px", fontSize:"14px", outline:"none", boxSizing:"border-box" as const, fontFamily:"inherit" }} />
                </div>
              ))}
              <div>
                <label style={{ fontSize:"12px", fontWeight:"700", color:"#64748b", display:"block", marginBottom:"6px" }}>
                  {editingAdmin ? "كلمة المرور (اتركها فارغة للإبقاء على الحالية)" : "كلمة المرور *"}
                </label>
                <input type="password" placeholder={editingAdmin ? "اتركها فارغة إذا لا تريد تغييرها" : "اختر كلمة مرور قوية"} value={form.password} onChange={e => setForm({...form, password: e.target.value})}
                  style={{ width:"100%", padding:"12px 16px", border:"1.5px solid #e2e8f0", borderRadius:"14px", fontSize:"14px", outline:"none", boxSizing:"border-box" as const, fontFamily:"inherit" }} />
              </div>
              <div style={{ background:"#fef3c7", borderRadius:"12px", padding:"12px", fontSize:"12px", color:"#92400e", fontWeight:"700" }}>
                ⚠️ احتفظ بكلمة المرور بشكل آمن - يمكنهم إدارة كل شيء في النظام
              </div>
              <button onClick={save} disabled={saving} style={{ width:"100%", background:"linear-gradient(135deg, #4f46e5, #7c3aed)", color:"white", border:"none", borderRadius:"14px", padding:"14px", fontWeight:"900", fontSize:"15px", cursor:"pointer", opacity: saving ? 0.6 : 1, fontFamily:"inherit" }}>
                {saving ? "جاري الحفظ..." : editingAdmin ? "💾 تحديث" : "✅ إضافة"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
