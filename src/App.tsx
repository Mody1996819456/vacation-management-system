import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import emailjs from "@emailjs/browser";
import {
  LayoutDashboard, Users, LogOut, Plus, Trash2, Calendar, CheckCircle,
  Clock, Search, Edit3, ShieldCheck, Download, Loader2,
  ArrowUpRight, CalendarDays, X, UserPlus, Upload, Bell, MessageSquare,
  FileDown, BarChart3, Building2, TrendingUp,
  AlertCircle, RefreshCw, PieChart, BarChart2,
  History, Mail, Briefcase, Smartphone, Wifi, WifiOff,
  Award, Target, Flame, Eye, KeyRound,
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

const getActualStartDate = (startDate: string, departureTime: string): string => {
  if (!startDate) return "";
  const d = new Date(startDate);
  if (departureTime === "after_work") d.setDate(d.getDate() + 2);
  else if (departureTime === "morning") d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
};

const getDepartureLabel = (dep: string) => {
  if (dep === "after_work") return "بعد العمل (+يومان)";
  if (dep === "morning")    return "صباحاً (+يوم)";
  return "بداية الإجازة الفعلي";
};

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

// ========== ✅ دالة جديدة: حساب أيام العمل قبل الطلب ==========
const calculateWorkedDaysBeforeRequest = (returnDate: string, departureDate: string): number => {
  if (!returnDate || !departureDate) return 0;
  const start = new Date(returnDate);
  const end = new Date(departureDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  if (end <= start) return 0;
  const diffTime = end.getTime() - start.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
};

// ==================== MAIN COMPONENT ====================
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
  return (
    <th style={{ padding:"12px 10px", textAlign: align as any, fontWeight:"800", color:"#374151", whiteSpace:"nowrap", position:"relative", userSelect:"none" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent: align==="right" ? "flex-start" : "center", gap:"4px" }}>
        <span style={{ fontSize:"13px" }}>{label}</span>
        <button
          onClick={e => { e.stopPropagation(); onToggle(field); }}
          style={{
            background: active ? "#4f46e5" : "#e2e8f0",
            border:"none", borderRadius:"4px", padding:"2px 5px",
            cursor:"pointer", fontSize:"11px", lineHeight:"1.4",
            color: active ? "white" : "#64748b", flexShrink:0,
          }}>
          {active ? (sortDir === "desc" ? "↓" : "↑") : "⇅"}
        </button>
      </div>
      {open && (
        <div
          style={{ position:"absolute", top:"100%", left:"50%", transform:"translateX(-50%)", background:"white", border:"1px solid #e2e8f0", borderRadius:"10px", boxShadow:"0 8px 24px rgba(0,0,0,0.15)", zIndex:100, minWidth:"155px", overflow:"hidden" }}
          onClick={e => e.stopPropagation()}>
          <button onClick={() => onSort(field, "desc")}
            style={{ display:"flex", alignItems:"center", gap:"8px", width:"100%", padding:"10px 14px", background: active && sortDir==="desc" ? "#eef2ff" : "white", border:"none", borderBottom:"1px solid #f1f5f9", cursor:"pointer", fontSize:"13px", fontWeight:"700", color:"#1e293b", fontFamily:"inherit" }}>
            ↓ من الأعلى للأقل
          </button>
          <button onClick={() => onSort(field, "asc")}
            style={{ display:"flex", alignItems:"center", gap:"8px", width:"100%", padding:"10px 14px", background: active && sortDir==="asc" ? "#eef2ff" : "white", border:"none", borderBottom: active ? "1px solid #f1f5f9" : "none", cursor:"pointer", fontSize:"13px", fontWeight:"700", color:"#1e293b", fontFamily:"inherit" }}>
            ↑ من الأقل للأعلى
          </button>
          {active && (
            <button onClick={onClear}
              style={{ display:"flex", alignItems:"center", gap:"8px", width:"100%", padding:"9px 14px", background:"#fff1f2", border:"none", cursor:"pointer", fontSize:"12px", fontWeight:"700", color:"#dc2626", fontFamily:"inherit" }}>
              ✕ إلغاء الفرز
            </button>
          )}
        </div>
      )}
    </th>
  );
};

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
    <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.65)", backdropFilter:"blur(6px)", display:"flex", alignItems:"center", justifyContent:"center", padding:"16px", zIndex:9999 }}
      onClick={onClose}>
      <div style={{ background:"white", borderRadius:"24px", width:"100%", maxWidth:"430px", padding:"24px", boxShadow:"0 32px 80px rgba(0,0,0,0.3)" }}
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
            <button onClick={onSave} style={{ padding:"13px", background:"linear-gradient(135deg,#4f46e5,#7c3aed)", color:"white", border:"none", borderRadius:"12px", fontWeight:"900", cursor:"pointer", fontSize:"14px" }}>
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
  const [empSortField, setEmpSortField] = useState("");
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusChangeEmp, setStatusChangeEmp] = useState<any>(null);
  const [statusChangeForm, setStatusChangeForm] = useState({ status: "إجازة", start_date: "", days: 1, notes: "", vacation_type_id: "" });
  const [empSortDir, setEmpSortDir] = useState<"asc"|"desc">("desc");
  const [empSortDropdown, setEmpSortDropdown] = useState("");
  const [reqSearch, setReqSearch] = useState("");
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

  const [newEmp, setNewEmp] = useState({
    name: "", code: "", position: "", balance: 21, monthly_balance: 0,
    department_id: "", hire_date: "", return_date: "", email: "",
  });

  const [newRequest, setNewRequest] = useState({
    start_date: "", days: 1, notes: "", vacation_type_id: "",
    departure_time: "actual",
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
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pushEnabled, setPushEnabled] = useState(() => {
    try { return typeof Notification !== "undefined" && Notification.permission === "granted"; } catch { return false; }
  });
  const [showPWAGuide, setShowPWAGuide] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [notifSearch, setNotifSearch] = useState("");
  const [notifDateFilter, setNotifDateFilter] = useState("");
  const [notifSortDir, setNotifSortDir] = useState<"asc"|"desc">("desc");
  const [activeVacDateFrom, setActiveVacDateFrom] = useState("");
  const [activeVacDateTo, setActiveVacDateTo] = useState("");
  const [activeVacSortField, setActiveVacSortField] = useState("back");
  const [activeVacSortDir, setActiveVacSortDir] = useState<"asc"|"desc">("asc");

  useEffect(() => {
    if (!empSortDropdown) return;
    const handler = () => setEmpSortDropdown("");
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [empSortDropdown]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, []);

  const enablePushNotifications = async () => {
    if (!("Notification" in window)) {
      alert("متصفحك لا يدعم الإشعارات. جرب Chrome أو Edge.");
      return;
    }
    if (Notification.permission === "denied") {
      alert("الإشعارات محجوبة في إعدادات المتصفح.\n\nعشان تفعّلها:\n1. اضغط على 🔒 في شريط العنوان\n2. اختر إعدادات الموقع\n3. فعّل الإشعارات");
      return;
    }
    if (Notification.permission === "granted") {
      setPushEnabled(true);
      new Notification("🔔 الإشعارات مفعّلة", {
        body: "الإشعارات شغالة بالفعل!",
        icon: "/icon-192.png",
        dir: "rtl",
      });
      return;
    }
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
    requestAnimationFrame(() => { window.scrollTo({ top: scrollRef.current, behavior: "auto" }); });
  }, [currentUser, currentView]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
          }, true);
        }
      }
    });
  }, [requests, employees, currentView]);

  useEffect(() => {
    const autoUpdateStatuses = async () => {
      const today = new Date().toISOString().split("T")[0];
      const idsToUpdate: string[] = [];
      for (const emp of employees) {
        if (emp.status === "إجازة") continue;
        const activeReq = requests.find(r => {
          if (r.employee_id !== emp.id || r.status !== "approved") return false;
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

  const getEmployeeStatus = (emp: any) => {
    return emp.status === "إجازة" ? "إجازة" : "عمل";
  };

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

  useEffect(() => {
    const updateMonthlyBalances = async () => {
      const today = new Date();
      const monthNames = ['يناير','فبراير','مارس','إبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
      const currentMonthName = monthNames[today.getMonth()];
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0];

      const toUpdate = employees.filter(emp =>
        emp.monthly_balance > 0 &&
        (!emp.last_balance_update || emp.last_balance_update < firstDayOfMonth)
      );

      if (toUpdate.length === 0) return;

      console.log(`🔄 جاري تحديث رصيد ${toUpdate.length} موظف...`);

      await Promise.all(toUpdate.map(async (emp) => {
        let newBalance = emp.balance + emp.monthly_balance;
        let description = `تم إضافة ${emp.monthly_balance} يوم للموظف ${emp.name} - رصيد دوري لشهر ${currentMonthName}`;
        
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

  const stats = useMemo(() => {
    const totalEmployees = employees.length;
    const pendingRequests = requests.filter(r => r.status === "pending").length;
    const approvedThisMonth = requests.filter(r => {
      const reqDate = new Date(r.created_at);
      const now = new Date();
      return r.status === "approved" && reqDate.getMonth() === now.getMonth() && reqDate.getFullYear() === now.getFullYear();
    }).length;
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

  const handleLogin = async () => {
    if (loginData.email === ADMIN_EMAIL && loginData.password === process.env.REACT_APP_OWNER_PASSWORD) {
      const ownerUser = { role: "owner", name: "محمد جمال" };
      setCurrentUser(ownerUser);
      setCurrentView("admin");
      localStorage.setItem("vms_currentUser", JSON.stringify(ownerUser));
      localStorage.setItem("vms_currentView", "admin");
      await logAction("login", "users", null, null, { role: "owner" });
      return;
    }

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

    if (loginData.email && loginData.password) {
      const hashedPw2 = await hashPassword(loginData.password);
      let { data: mgr } = await supabase
        .from("department_managers")
        .select("*, departments(name)")
        .eq("email", loginData.email.trim())
        .eq("password", hashedPw2)
        .single();
      if (!mgr) {
        const { data: mgrPlain } = await supabase
          .from("department_managers")
          .select("*, departments(name)")
          .eq("email", loginData.email.trim())
          .eq("password", loginData.password)
          .single();
        if (mgrPlain) {
          mgr = mgrPlain;
          await supabase.from("department_managers").update({ password: hashedPw2 }).eq("id", mgrPlain.id);
        }
      }
      if (mgr) {
        const mgrUser = {
          role: "dept_manager",
          id: mgr.id,
          name: mgr.name,
          email: mgr.email,
          dept_id: mgr.department_id,
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
    ws["!cols"] = [
      { wch: 14 }, { wch: 22 }, { wch: 16 }, { wch: 28 },
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "نموذج الموظفين");
    XLSX.writeFile(wb, "نموذج_استيراد_الموظفين.xlsx");
  };

  const parseFlexibleDate = (value: any): string | null => {
    if (!value && value !== 0) return null;
    if (typeof value === "number") {
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + value * 86400000);
      if (!isNaN(date.getTime())) return date.toISOString().split("T")[0];
      return null;
    }
    const str = String(value).trim();
    if (!str) return null;
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(str)) {
      const d = new Date(str.replace(/\//g, "-"));
      if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
    }
    if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(str)) {
      const parts = str.split(/[-/]/);
      const d = new Date(`${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`);
      if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
    }
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
      const d = new Date(str);
      if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
    }
    const fallback = new Date(str);
    if (!isNaN(fallback.getTime())) return fallback.toISOString().split("T")[0];
    return null;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { cellDates: false });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: true });

      const fileRows = jsonData.map((row: any) => {
        const deptName = row["القسم"] || "";
        const dept = departments.find(d => d.name === deptName);
        const parsed: any = {};
        const name = row["الاسم الكامل"] || row["name"] || row["الاسم"];
        const code = String(row["الكود الوظيفي"] || row["code"] || row["الكود"] || "").trim();
        if (name) parsed.name = String(name).trim();
        if (code) parsed.code = code;
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

      const validRows = fileRows.filter((r: any) => r.code);
      const rowsWithoutCode = fileRows.length - validRows.length;

      if (validRows.length === 0) {
        alert("❌ لم يتم العثور على بيانات صحيحة!\nتأكد من وجود عمود 'الكود الوظيفي' في الملف.");
        setUploadingFile(false);
        return;
      }

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
          const updatePayload: any = { id: existing.id };
          if (row.name !== undefined)             updatePayload.name = row.name;
          if (row.position !== undefined)         updatePayload.position = row.position;
          if (row.email !== undefined)            updatePayload.email = row.email;
          if (row.balance !== undefined)          updatePayload.balance = row.balance;
          if (row.monthly_balance !== undefined)  updatePayload.monthly_balance = row.monthly_balance;
          if (row.hire_date !== undefined)        updatePayload.hire_date = row.hire_date;
          if (row.return_date !== undefined)      updatePayload.return_date = row.return_date;
          if (row.department_id !== undefined)    updatePayload.department_id = row.department_id;
          toUpdate.push(updatePayload);
          updatedCount++;
        } else {
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

      if (toAdd.length > 0) {
        const { error: addErr } = await supabase.from("employees").insert(toAdd);
        if (addErr) errorMsg += "\n⚠️ خطأ في الإضافة: " + addErr.message;
      }

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
        "تاريخ التعيين": emp.hire_date || "",
        "تاريخ العودة": emp.return_date || "",
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
        admin_notes: adminNotes || "تم رفض الطلب", request
