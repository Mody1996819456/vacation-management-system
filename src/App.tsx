import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import emailjs from "@emailjs/browser";
import {
  LayoutDashboard, Users, LogOut, Plus, Trash2, Calendar, CheckCircle,
  Clock, Search, Edit3, ShieldCheck, Download, Loader2,
  ArrowUpRight, CalendarDays, X, UserPlus, Upload, Bell, MessageSquare,
  FileDown, Zap, BarChart3, Building2, TrendingUp,
  AlertCircle, RefreshCw, PieChart, BarChart2,
  History, Mail, Briefcase, Smartphone, Wifi, WifiOff,
  TrendingDown, Activity, Award, Target, Flame, Eye,
} from "lucide-react";

// ==================== SUPABASE CONFIG ====================
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || "https://rxeminlotawcfqalxoqy.supabase.co";
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY || "sb_publishable_nExTWl7CRubKfDuiqbX1Sw_EwyMdUoX";
const supabase = createClient(supabaseUrl, supabaseKey);

// ==================== EMAILJS CONFIG ====================
const EMAILJS_SERVICE_ID  = "service_1fmr5dt";
const EMAILJS_PUBLIC_KEY  = "huxXo8btK5U4v1zQd";
const EMAILJS_TEMPLATES = {
  approved:          "template_s3qqrew",
  rejected:          "template_aigwzle",
  return_reminder:   "template_return_reminder",
  new_request_admin: "template_new_request",
};

const ADMIN_EMAIL = "mohamedgamal199681945@gmail.com";

// ==================== EMAIL SENDER ====================
// ==================== EMAIL SENDER ====================
// منع تكرار إيميلات تلقائية (return_reminder) بس - مش إيميلات الموافقة/الرفض
const autoEmailCache = new Set<string>();

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

// أيام العمل = من يوم العودة نفسه حتى اليوم
const calculateWorkedDays = (returnDate: string) => {
  if (!returnDate) return 0;
  const start = new Date(returnDate);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (start > today) return 0;
  const diffTime = today.getTime() - start.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
};

// ==================== DARK MODE GLOBAL STYLES ====================
const darkModeStyle = `
  * { box-sizing: border-box; }
  input, select, textarea {
    color-scheme: dark;
  }
  input::placeholder { color: #484f58 !important; }
  textarea::placeholder { color: #484f58 !important; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: #0d1117; }
  ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #484f58; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;

// ==================== MAIN COMPONENT ====================
// ==================== MANAGERS TAB COMPONENT ====================
const ManagersTab: React.FC<{ departments: any[], supabase: any, logAction: any, currentUser: any }> = ({ departments, supabase, logAction, currentUser }) => {
  const [managers, setManagers] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [newMgr, setNewMgr] = React.useState({ name: "", email: "", password: "", department_id: "" });
  const [saving, setSaving] = React.useState(false);

  const fetchManagers = React.useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("department_managers").select("*, departments(name)");
    setManagers(data || []);
    setLoading(false);
  }, [supabase]);

  React.useEffect(() => { fetchManagers(); }, [fetchManagers]);

  const handleAdd = async () => {
    if (!newMgr.name.trim()) return alert("اكتب اسم المدير");
    if (!newMgr.email.trim()) return alert("اكتب البريد الإلكتروني");
    if (!newMgr.password.trim()) return alert("اكتب كلمة المرور");
    if (!newMgr.department_id) return alert("اختر القسم");
    setSaving(true);
    const { error } = await supabase.from("department_managers").insert([{
      name: newMgr.name.trim(),
      email: newMgr.email.trim(),
      password: newMgr.password.trim(),
      department_id: newMgr.department_id,
    }]);
    if (error) { alert("خطأ: " + error.message); setSaving(false); return; }
    await logAction("add_manager", "department_managers", null, null, { name: newMgr.name });
    setNewMgr({ name: "", email: "", password: "", department_id: "" });
    setShowAddForm(false);
    setSaving(false);
    await fetchManagers();
    alert("✅ تم إضافة مدير القسم بنجاح");
  };

  const handleDelete = async (mgr: any) => {
    if (!window.confirm("هل تريد حذف " + mgr.name + "؟")) return;
    const { error } = await supabase.from("department_managers").delete().eq("id", mgr.id);
    if (error) { alert("خطأ: " + error.message); return; }
    await logAction("delete_manager", "department_managers", mgr.id, mgr, null);
    await fetchManagers();
    alert("✅ تم حذف مدير القسم");
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "11px 14px", background: "#0d1117",
    border: "1px solid #30363d", borderRadius: "10px", color: "#e6edf3",
    outline: "none", boxSizing: "border-box", fontSize: "13px",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: "22px", fontWeight: "900", color: "#e6edf3", margin: 0 }}>مديرو الأقسام</h2>
          <p style={{ fontSize: "13px", color: "#8b949e", margin: "4px 0 0" }}>{managers.length} مدير مسجل</p>
        </div>
        <button onClick={() => setShowAddForm(!showAddForm)}
          style={{ padding: "10px 18px", background: "linear-gradient(135deg,#4f46e5,#7c3aed)", color: "white", border: "none", borderRadius: "12px", fontWeight: "700", cursor: "pointer", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}>
          <UserPlus size={16} /> إضافة مدير
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div style={{ background: "#161b22", borderRadius: "16px", padding: "20px", border: "1px solid #30363d" }}>
          <h3 style={{ margin: "0 0 16px", fontWeight: "900", color: "#e6edf3", fontSize: "15px" }}>➕ إضافة مدير قسم جديد</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontSize: "11px", color: "#8b949e", fontWeight: "700", display: "block", marginBottom: "5px" }}>الاسم *</label>
              <input style={inputStyle} placeholder="اسم المدير" value={newMgr.name} onChange={e => setNewMgr({ ...newMgr, name: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: "11px", color: "#8b949e", fontWeight: "700", display: "block", marginBottom: "5px" }}>البريد الإلكتروني *</label>
              <input type="email" style={inputStyle} placeholder="email@example.com" value={newMgr.email} onChange={e => setNewMgr({ ...newMgr, email: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: "11px", color: "#8b949e", fontWeight: "700", display: "block", marginBottom: "5px" }}>كلمة المرور *</label>
              <input type="password" style={inputStyle} placeholder="كلمة المرور" value={newMgr.password} onChange={e => setNewMgr({ ...newMgr, password: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: "11px", color: "#8b949e", fontWeight: "700", display: "block", marginBottom: "5px" }}>القسم *</label>
              <select style={inputStyle} value={newMgr.department_id} onChange={e => setNewMgr({ ...newMgr, department_id: e.target.value })}>
                <option value="">اختر القسم</option>
                {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
            <button onClick={handleAdd} disabled={saving}
              style={{ padding: "11px 24px", background: "linear-gradient(135deg,#059669,#10b981)", color: "white", border: "none", borderRadius: "10px", fontWeight: "700", cursor: saving ? "not-allowed" : "pointer", fontSize: "13px" }}>
              {saving ? "جاري الحفظ..." : "✅ حفظ"}
            </button>
            <button onClick={() => setShowAddForm(false)}
              style={{ padding: "11px 20px", background: "#21262d", color: "#8b949e", border: "1px solid #30363d", borderRadius: "10px", fontWeight: "700", cursor: "pointer", fontSize: "13px" }}>
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* Managers List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#8b949e" }}>جاري التحميل...</div>
      ) : managers.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px", background: "#161b22", borderRadius: "16px", border: "1px solid #30363d" }}>
          <ShieldCheck size={48} style={{ color: "#484f58", marginBottom: "12px" }} />
          <p style={{ color: "#6e7681", fontWeight: "700", margin: 0 }}>لم يتم إضافة أي مديرين بعد</p>
          <p style={{ color: "#484f58", fontSize: "12px", marginTop: "6px" }}>اضغط "إضافة مدير" لإضافة أول مدير قسم</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px" }}>
          {managers.map((mgr: any) => (
            <div key={mgr.id} style={{ background: "#161b22", borderRadius: "16px", padding: "18px", border: "1px solid #30363d" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: "linear-gradient(135deg,#059669,#10b981)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "900", fontSize: "18px", color: "white", flexShrink: 0 }}>
                    {mgr.name?.charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontWeight: "800", fontSize: "14px", color: "#e6edf3" }}>{mgr.name}</div>
                    <div style={{ fontSize: "11px", color: "#10b981", fontWeight: "700", marginTop: "2px" }}>🏢 {mgr.departments?.name || "—"}</div>
                  </div>
                </div>
                <button onClick={() => handleDelete(mgr)}
                  style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "8px", padding: "6px 8px", cursor: "pointer", color: "#ef4444" }}>
                  <Trash2 size={14} />
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                <div style={{ fontSize: "12px", color: "#8b949e", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Mail size={11} /> {mgr.email}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
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

  // Modals & Forms
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [empCodeInput, setEmpCodeInput] = useState("");
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
  const [vacDeptFilter2, setVacDeptFilter2] = useState("all");
  const [empSearchDirect, setEmpSearchDirect] = useState("");
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<string | null>(null);
  const [showEmpDropdown, setShowEmpDropdown] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
  // ===== States للميزات الجديدة =====
  const [showEditDaysModal, setShowEditDaysModal] = useState(false);
  const [editDaysForm, setEditDaysForm] = useState({ days: 0, reason: "", requestId: "", oldDays: 0, empName: "" });
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printDateFrom, setPrintDateFrom] = useState("");
  const [printDateTo, setPrintDateTo] = useState("");
  const [selectedPrintRequests, setSelectedPrintRequests] = useState<string[]>([]);
  const [showEmpEditModal, setShowEmpEditModal] = useState(false);
  const [empEditRequest, setEmpEditRequest] = useState<any>(null);
  const [showAIChat, setShowAIChat] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  // ===== NEW FEATURES STATES =====
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showInsights, setShowInsights] = useState(false);
  const [aiInsights, setAiInsights] = useState<string>("");
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(() => {
    try { return typeof Notification !== "undefined" && Notification.permission === "granted"; } catch { return false; }
  });
  const [showPWAGuide, setShowPWAGuide] = useState(false);
  const [lastBackup, setLastBackup] = useState<string>("");
  const GOOGLE_SCRIPT_URL = process.env.REACT_APP_GOOGLE_SCRIPT_URL || "";
  const [aiMessages, setAiMessages] = useState<{role:string, content:string}[]>([
    { role: "assistant", content: "مرحباً! أنا مساعدك الذكي لإدارة الإجازات 🤖\n\nأستطيع مساعدتك في:\n• إضافة أو حذف موظف\n• عرض الإحصائيات والتقارير\n• الاستفسار عن أي موظف\n• مراجعة الطلبات المعلقة\n• وأي شيء آخر تحتاجه!\n\nاكتب أمرك بالعربي وأنا أنفذه." }
  ]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const GROQ_API_KEY = process.env.REACT_APP_GROQ_API_KEY || "";
  const [currentTime, setCurrentTime] = useState(new Date());

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
  const generateAIInsights = async () => {
    setInsightsLoading(true);
    setShowInsights(true);
    const GROQ_KEY = process.env.REACT_APP_GROQ_API_KEY || "";
    if (!GROQ_KEY) { setAiInsights("⚠️ لم يتم إعداد REACT_APP_GROQ_API_KEY"); setInsightsLoading(false); return; }

    const today = new Date().toISOString().split("T")[0];
    const onVacNow = requests.filter(r => {
      if (r.status !== "approved") return false;
      const end = new Date(r.start_date); end.setDate(end.getDate() + Number(r.days));
      return r.start_date <= today && end.toISOString().split("T")[0] > today;
    });

    const lowBal = employees.filter(e => e.balance < 5).map(e => e.name);
    const deptStats = departments.map(d => ({
      dept: d.name,
      emps: employees.filter(e => e.department_id === d.id).length,
      vacations: requests.filter(r => r.status === "approved" && employees.find(e => e.id === r.employee_id)?.department_id === d.id).length,
    }));

    const summaryData = {
      totalEmployees: employees.length,
      onVacationNow: onVacNow.length,
      onVacationNames: onVacNow.map(r => r.employee_name),
      pendingRequests: requests.filter(r => r.status === "pending").length,
      lowBalanceEmployees: lowBal,
      approvedThisMonth: requests.filter(r => { const d = new Date(r.created_at); const n = new Date(); return r.status === "approved" && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); }).length,
      totalVacDays: requests.filter(r => r.status === "approved").reduce((s, r) => s + Number(r.days), 0),
      deptStats,
    };

    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_KEY}` },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          max_tokens: 800,
          messages: [
            { role: "system", content: "أنت محلل بيانات HR خبير. اكتب تقرير تحليلي احترافي باللغة العربية مختصر ومفيد." },
            { role: "user", content: `حلل هذه البيانات واكتب تقرير شهري مختصر مع توصيات:
${JSON.stringify(summaryData)}

اكتب:
1. ملخص الوضع الحالي
2. نقاط تحتاج انتباه
3. توصيات عملية
4. توقعات للفترة القادمة` }
          ]
        })
      });
      const data = await res.json();
      setAiInsights(data.choices?.[0]?.message?.content || "تعذر توليد التقرير");
    } catch { setAiInsights("❌ خطأ في الاتصال"); }
    setInsightsLoading(false);
  };

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
  const fetchData = useCallback(async () => {
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
  }, [currentUser, currentView]);

  useEffect(() => { fetchData(); }, [fetchData]);

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

  // ========== حالة الموظف تلقائياً ==========
  const getEmployeeStatus = (emp: any) => {
    const today = new Date().toISOString().split("T")[0];
    const isOnVacation = requests.some(r =>
      r.employee_id === emp.id && r.status === "approved" &&
      (() => { const { back } = getCalculatedDates(r.start_date, r.days); return r.start_date <= today && back > today; })()
    );
    return isOnVacation ? "إجازة" : "عمل";
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
        const newBalance = parseFloat((emp.balance + emp.monthly_balance).toFixed(2));
        const description = `تم إضافة ${emp.monthly_balance} يوم للموظف ${emp.name} - رصيد دوري لشهر ${currentMonthName}`;

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
    const today = new Date().toISOString().split("T")[0];
    const onVacationNow = requests.filter(r => {
      if (r.status !== "approved") return false;
      const { back } = getCalculatedDates(r.start_date, r.days);
      return r.start_date <= today && back > today;
    }).length;
    const atWorkNow = totalEmployees - onVacationNow;
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

  const vacationByMonth = useMemo(() => {
    const months = ['يناير','فبراير','مارس','إبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
    return months.map((month, idx) => ({
      month,
      count: requests.filter(r => { const d = new Date(r.start_date); return d.getMonth() === idx && r.status === "approved"; }).length,
    }));
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
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1️⃣ Owner
    if (loginData.email === ADMIN_EMAIL && loginData.password === "Mg1996819456") {
      const ownerUser = { role: "owner", name: "محمد جمال" };
      setCurrentUser(ownerUser);
      setCurrentView("admin");
      localStorage.setItem("vms_currentUser", JSON.stringify(ownerUser));
      localStorage.setItem("vms_currentView", "admin");
      await logAction("login", "users", null, null, { role: "owner" });
      return;
    }

    // 2️⃣ مدير قسم
    if (loginData.email && loginData.password) {
      const { data: mgr } = await supabase
        .from("department_managers")
        .select("*, departments(name)")
        .eq("email", loginData.email.trim())
        .eq("password", loginData.password)
        .single();
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

    // 3️⃣ موظف بالكود
    if (empCodeInput.trim()) {
      const { data: emp } = await supabase.from("employees").select("*").eq("code", empCodeInput.trim()).single();
      if (emp) {
        const empUser = { ...emp, role: "employee" };
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

  // ========== EXCEL OPERATIONS ==========
  const downloadExcelTemplate = () => {
    const template = [{
      "الاسم الكامل": "محمد أحمد",
      "الكود الوظيفي": "1001",
      "المنصب": "محاسب",
      "البريد الإلكتروني": "mohamed@example.com",
      "الرصيد الحالي": 21,
      "الرصيد الشهري": 2,
      "تاريخ التعيين": "2020-01-01",
      "تاريخ العودة": "2025-01-15",
      "القسم": "المحاسبة",
    }];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "نموذج");
    XLSX.writeFile(wb, "نموذج_الموظفين.xlsx");
  };

  // ========== دالة تحويل التواريخ من أي صيغة ==========
  const parseFlexibleDate = (value: any): string | null => {
    if (!value && value !== 0) return null;

    // 1) Excel serial number (رقم تسلسلي من Excel)
    if (typeof value === "number") {
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + value * 86400000);
      if (!isNaN(date.getTime())) return date.toISOString().split("T")[0];
      return null;
    }

    const str = String(value).trim();
    if (!str) return null;

    // 2) YYYY-MM-DD أو YYYY/MM/DD
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(str)) {
      const d = new Date(str.replace(/\//g, "-"));
      if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
    }

    // 3) DD-MM-YYYY أو DD/MM/YYYY
    if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(str)) {
      const parts = str.split(/[-/]/);
      const d = new Date(`${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`);
      if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
    }

    // 4) MM/DD/YYYY
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
      const d = new Date(str);
      if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
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

      // فلترة الصفوف اللي فيها كود واسم على الأقل
      const validRows = fileRows.filter((r: any) => r.name && r.code);
      if (validRows.length === 0) {
        alert("لم يتم العثور على بيانات صحيحة! تأكد من وجود عمود 'الاسم الكامل' و 'الكود الوظيفي'");
        setUploadingFile(false);
        return;
      }

      // جلب الموظفين الحاليين لعمل merge ذكي
      const codes = validRows.map((r: any) => r.code);
      const { data: existingEmps } = await supabase
        .from("employees")
        .select("*")
        .in("code", codes);

      const existingMap = new Map((existingEmps || []).map((e: any) => [e.code, e]));

      let addedCount = 0;
      let updatedCount = 0;

      const toUpsert = validRows.map((row: any) => {
        const existing = existingMap.get(row.code);
        if (existing) {
          // تحديث: دمج البيانات الجديدة مع القديمة (الجديد يكسب)
          updatedCount++;
          return {
            ...existing,
            ...row,
            id: existing.id,
          };
        } else {
          // إضافة جديد
          addedCount++;
          return {
            name: row.name,
            code: row.code,
            position: row.position || null,
            email: row.email || null,
            balance: row.balance ?? 21,
            monthly_balance: row.monthly_balance ?? 0,
            hire_date: row.hire_date || null,
            return_date: row.return_date || null,
            department_id: row.department_id || null,
          };
        }
      });

      const { error } = await supabase.from("employees").upsert(toUpsert, {
        onConflict: "code",
        ignoreDuplicates: false,
      });

      if (!error) {
        alert(`✅ تمت المعالجة بنجاح!
• تم إضافة ${addedCount} موظف جديد
• تم تحديث بيانات ${updatedCount} موظف موجود
• إجمالي: ${validRows.length} موظف`);
        setShowImportModal(false);
        fetchData();
        await logAction("bulk_import", "employees", null, null, { added: addedCount, updated: updatedCount });
      } else {
        alert("خطأ في الاستيراد: " + error.message);
      }
    } catch (err) {
      alert("خطأ في قراءة الملف — تأكد من أن الملف بصيغة Excel صحيحة");
      console.error(err);
    }
    setUploadingFile(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const exportToExcel = (data: any[], fileName: string) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "البيانات");
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  };

  const exportDetailedReport = () => {
    const reportData = employees.map(emp => {
      const empRequests = requests.filter(r => r.employee_id === emp.id && r.status === "approved");
      const totalVacDays = empRequests.reduce((sum, r) => sum + Number(r.days), 0);
      const workedDays = calculateWorkedDays(emp.return_date);
      const dept = departments.find(d => d.id === emp.department_id);
      const status = getEmployeeStatus(emp);
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

    // ===== مدير القسم: موافقة مبدئية فقط → تنتقل للـ Owner =====
    const isDeptMgrNow = currentUser?.role === "dept_manager";
    if (isDeptMgrNow && action === "approved") {
      const { error: deptErr } = await supabase.from("vacation_requests").update({
        status: "dept_approved",
        dept_manager_notes: adminNotes || null,
        dept_approved_by: currentUser?.name,
        dept_approved_at: new Date().toISOString(),
      }).eq("id", id);
      if (deptErr) {
        alert("❌ حصل خطأ: " + deptErr.message);
        return;
      }
      setShowApprovalModal(false); setCurrentRequest(null); setAdminNotes("");
      await fetchData();
      alert("✅ تمت الموافقة المبدئية — الطلب منتظر موافقة المالك");
      await logAction("dept_approved", "vacation_requests", id, oldData, { status: "dept_approved" });
      return;
    }

    // مدير القسم يرفض نهائياً
    if (isDeptMgrNow && action === "rejected") {
      if (emp?.email) sendEmail(EMAILJS_TEMPLATES.rejected, emp.email, {
        employee_name: emp.name,
        start_date: formatDate(currentRequest.start_date),
        admin_notes: adminNotes || "تم رفض الطلب من مدير القسم",
        request_id: id,
      });
      const { error: rejectErr } = await supabase.from("vacation_requests").update({
        status: "rejected",
        admin_notes: adminNotes || null,
        dept_approved_by: currentUser?.name,
      }).eq("id", id);
      if (rejectErr) {
        alert("❌ حصل خطأ: " + rejectErr.message);
        return;
      }
      setShowApprovalModal(false); setCurrentRequest(null); setAdminNotes("");
      await fetchData();
      await logAction("rejected", "vacation_requests", id, oldData);
      return;
    }

    // ===== Owner: موافقة نهائية =====
    if (action === "approved") {
      if (emp.balance < days) { alert("رصيد غير كافٍ!"); setShowApprovalModal(false); return; }
      await supabase.from("employees").update({ balance: emp.balance - days, status: "إجازة", return_date: null }).eq("id", emp.id);
      if (emp.email) {
        const { back } = getCalculatedDates(currentRequest.start_date, days);
        sendEmail(EMAILJS_TEMPLATES.approved, emp.email, {
          employee_name: emp.name,
          start_date: formatDate(currentRequest.start_date),
          days,
          back_date: formatDate(back),
          admin_notes: adminNotes || "لا توجد ملاحظات",
          request_id: id,
        });
      }
    }

    if (action === "rejected" && emp?.email) {
      sendEmail(EMAILJS_TEMPLATES.rejected, emp.email, {
        employee_name: emp.name,
        start_date: formatDate(currentRequest.start_date),
        admin_notes: adminNotes || "لا توجد ملاحظات",
        request_id: id,
      });
    }

    const { error: ownerErr } = await supabase.from("vacation_requests").update({
      status: action,
      admin_notes: adminNotes || null,
      owner_approved_by: currentUser?.name,
      owner_approved_at: new Date().toISOString(),
    }).eq("id", id);
    if (ownerErr) {
      alert("❌ حصل خطأ في الموافقة النهائية: " + ownerErr.message);
      return;
    }

    sendLocalNotification(
      action === "approved" ? "✅ تمت الموافقة النهائية" : "❌ تم رفض طلب إجازة",
      `${emp?.name} - ${currentRequest.days} يوم`
    );

    setShowApprovalModal(false); setCurrentRequest(null); setAdminNotes("");
    fetchData();
    await logAction(action, "vacation_requests", id, oldData, { status: action, admin_notes: adminNotes });
  };

  const handleDeleteVacation = async (id: string) => {
    if (!window.confirm("حذف طلب الإجازة؟")) return;
    const req = requests.find(r => r.id === id);
    if (req?.status === "approved") {
      const emp = employees.find(e => e.id === req.employee_id);
      if (emp) await supabase.from("employees").update({ balance: emp.balance + Number(req.days) }).eq("id", emp.id);
    }
    await supabase.from("vacation_requests").delete().eq("id", id);
    await logAction("delete", "vacation_requests", id, req);
    fetchData();
    alert("تم الحذف ✅");
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
    // تسجيل تاريخ العودة الفعلي + حالة الموظف = عمل
    await supabase.from("employees").update({
      return_date: returnData.actual_return_date,
      status: "عمل",
    }).eq("id", emp.id);
    await supabase.from("vacation_requests").update({ actual_return_date: returnData.actual_return_date }).eq("id", returnData.id);
    setShowReturnModal(false);
    setReturnData(null);
    fetchData();
    alert("تم تسجيل العودة وتحديث تاريخ العودة ✅");
    await logAction("return_from_vacation", "vacation_requests", returnData.id);
  };

  // ========== EMPLOYEE PORTAL ==========
  const submitVacationRequest = async () => {
    if (!newRequest.start_date) return alert("حدد تاريخ البداية");
    if (!newRequest.vacation_type_id) return alert("اختر نوع الإجازة");

    // ===== منع الطلب الثاني (لو فيه طلب معلق) =====
    const hasPending = requests.some(r =>
      r.employee_id === currentUser.id && (r.status === "pending" || r.status === "dept_approved")
    );
    if (hasPending) {
      return alert("لديك طلب اجازة قيد المراجعة. يمكنك تعديله فقط خلال 3 ايام من تقديمه ولا يمكن تقديم طلب جديد.");
    }

    // ===== التحقق من الرصيد مع مراعاة الرصيد الشهري =====
    const days = Number(newRequest.days);
    const balance = Number(currentUser.balance);
    const monthly = Number(currentUser.monthly_balance || 0);
    if (balance < days) {
      if (balance + monthly >= days) {
        const ok = window.confirm(
          "رصيدك الحالي (" + balance + " يوم) غير كافٍ." +
          "\nبعد اضافة رصيدك الشهري (" + monthly + " يوم) سيصبح " + (balance + monthly) + " يوم وهو كافٍ." +
          "\n\nهل تريد المتابعة؟"
        );
        if (!ok) return;
      } else {
        return alert(
          "رصيدك " + balance + " يوم غير كافٍ لـ " + days + " يوم.\n" +
          "حتى بعد اضافة رصيدك الشهري (" + monthly + " يوم) = " + (balance + monthly) + " يوم لن يكفي."
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

  // ========== تعديل الموظف لطلبه (خلال 3 أيام) ==========
  const handleEmpEditRequest = async () => {
    if (!empEditRequest) return;
    if (!empEditRequest.start_date) return alert("حدد تاريخ البداية");
    if (!empEditRequest.days || empEditRequest.days < 0.5) return alert("عدد الايام يجب ان يكون 0.5 على الاقل");
    const { error } = await supabase.from("vacation_requests").update({
      start_date: empEditRequest.start_date,
      days: empEditRequest.days,
      notes: empEditRequest.notes,
      vacation_type_id: empEditRequest.vacation_type_id,
      departure_time: empEditRequest.departure_time,
    }).eq("id", empEditRequest.id);
    if (error) return alert("خطا: " + error.message);
    setShowEmpEditModal(false);
    setEmpEditRequest(null);
    await fetchData();
    alert("تم تعديل الطلب بنجاح");
  };

  // ========== تعديل عدد أيام الإجازة بواسطة المدير ==========
  const handleEditDays = async () => {
    if (!editDaysForm.reason.trim()) return alert("اكتب سبب التعديل");
    if (editDaysForm.days < 0.5) return alert("عدد الايام يجب ان يكون 0.5 على الاقل");
    const req = requests.find(r => r.id === editDaysForm.requestId);
    if (!req) return;
    const emp = employees.find(e => e.id === req.employee_id);
    if (!emp) return;
    const daysDiff = editDaysForm.days - editDaysForm.oldDays;
    const { error } = await supabase.from("vacation_requests").update({
      days: editDaysForm.days,
      admin_notes: "تم تعديل المدة من " + editDaysForm.oldDays + " الى " + editDaysForm.days + " يوم - السبب: " + editDaysForm.reason + " (بواسطة: " + currentUser?.name + ")",
    }).eq("id", editDaysForm.requestId);
    if (error) return alert(error.message);
    if (req.status === "approved" && daysDiff !== 0) {
      await supabase.from("employees").update({ balance: Math.max(0, emp.balance - daysDiff) }).eq("id", emp.id);
    }
    await logAction("edit_days", "vacation_requests", editDaysForm.requestId, req, { newDays: editDaysForm.days, reason: editDaysForm.reason });
    setShowEditDaysModal(false);
    setEditDaysForm({ days: 0, reason: "", requestId: "", oldDays: 0, empName: "" });
    await fetchData();
    alert("تم تعديل عدد الايام بنجاح");
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
      <div style={{ width:"100%", boxSizing:"border-box", background:"#161b22", padding:"24px", borderRadius:"1.5rem", border:"1px solid #30363d" }}>
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
  const isOwner   = currentUser?.role === "owner";
  const isDeptMgr = currentUser?.role === "dept_manager";
  const myDeptId  = currentUser?.dept_id ?? null;

  // Owner يرى الكل — مدير القسم يرى قسمه فقط
  const scopedEmployees = isDeptMgr
    ? employees.filter(e => e.department_id === myDeptId)
    : employees;
  const scopedRequests = isDeptMgr
    ? requests.filter(r => scopedEmployees.some(e => e.id === r.employee_id))
    : requests;

  // ========== FILTERED DATA ==========
  const filteredEmployees = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return scopedEmployees.filter(emp => {
      const matchSearch = emp.name.includes(empSearch) || emp.code.includes(empSearch);
      const matchDept = departmentFilter === "all" || emp.department_id === departmentFilter;
      const isOnVacation = requests.some(r =>
        r.employee_id === emp.id && r.status === "approved" &&
        (() => { const { back } = getCalculatedDates(r.start_date, r.days); return r.start_date <= today && back > today; })()
      );
      const empStatus = isOnVacation ? "إجازة" : "عمل";
      const matchStatus = empStatusFilter === "all" || empStatus === empStatusFilter;
      return matchSearch && matchDept && matchStatus;
    });
  }, [scopedEmployees, empSearch, departmentFilter, empStatusFilter, requests]);

  const filteredRequests = useMemo(() => {
    return scopedRequests.filter(req => {
      const matchSearch = req.employee_name?.includes(vacSearch);
      const matchType = vacationTypeFilter === "all" || req.vacation_type_id === vacationTypeFilter;
      const matchStatus = statusFilter === "all" || req.status === statusFilter;
      return matchSearch && matchType && matchStatus;
    });
  }, [scopedRequests, vacSearch, vacationTypeFilter, statusFilter]);

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

  // ==================== AI CHAT HANDLER ====================
  const handleAIMessage = async () => {
    if (!aiInput.trim() || aiLoading) return;
    const userMsg = aiInput.trim();
    setAiInput("");
    setAiMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setAiLoading(true);

    // ✅ تحقق من وجود الـ API Key أولاً
    if (!GROQ_API_KEY) {
      setAiMessages(prev => [...prev, {
        role: "assistant",
        content: "⚠️ لم يتم إعداد REACT_APP_GROQ_API_KEY.\n\nالحل:\n1. روح Vercel → Project Settings → Environment Variables\n2. أضف: REACT_APP_GROQ_API_KEY = مفتاحك من console.groq.com\n3. اعمل Redeploy للمشروع"
      }]);
      setAiLoading(false);
      return;
    }

    // ✅ بيانات شاملة ومضغوطة - كل الموظفين مع حالتهم دايماً
    const today = new Date().toISOString().split("T")[0];

    // حساب من في إجازة دلوقتي
    const onVacationEmployees = employees.filter(e => {
      return requests.some(r => {
        if (r.employee_id !== e.id || r.status !== "approved") return false;
        const endDate = new Date(r.start_date);
        endDate.setDate(endDate.getDate() + Number(r.days));
        const endStr = endDate.toISOString().split("T")[0];
        return r.start_date <= today && endStr > today;
      });
    });

    const onVacationIds = new Set(onVacationEmployees.map(e => e.id));

    // كل الموظفين بدون حدود مع حالتهم الحقيقية
    const compactEmployees = employees.map(e => ({
      id: e.id,
      name: e.name,
      code: e.code,
      position: e.position,
      balance: e.balance,
      dept: departments.find(d => d.id === e.department_id)?.name || "-",
      department_id: e.department_id,
      status: onVacationIds.has(e.id) ? "إجازة" : "عمل",
    }));

    // كل الطلبات المعلقة والحالية بدون حدود
    const activeRequests = requests
      .filter(r => r.status === "pending" || (r.status === "approved" && r.start_date <= today))
      .map(r => ({
        id: r.id,
        emp: r.employee_name,
        employee_id: r.employee_id,
        status: r.status,
        from: r.start_date,
        days: r.days,
      }));

    const systemData = {
      stats: {
        total: stats.totalEmployees,
        on_vacation: onVacationEmployees.length,
        on_vacation_names: onVacationEmployees.map(e => e.name),
        at_work: stats.totalEmployees - onVacationEmployees.length,
        pending_requests: stats.pendingRequests,
      },
      employees: compactEmployees,
      active_requests: activeRequests,
      departments: departments.map(d => ({ id: d.id, name: d.name })),
      vacation_types: vacationTypes.map(v => ({ id: v.id, name: v.name })),
    };

    const systemPrompt = `أنت مساعد ذكي لإدارة الإجازات. بيانات النظام الحالية:
${JSON.stringify(systemData)}

قواعد مهمة جداً:
1. أجب بالعربي باختصار
2. لما تنفذ أمر، اكتب ACTION في السطر الأخير فقط بالشكل الصحيح
3. للأوامر الجماعية (مثل: ضم كل عمال الري لقسم معين) استخدم bulk_update_department
4. لا تقل "تم" إلا لو كتبت ACTION فعلاً

الأوامر المتاحة:
- إضافة موظف: ACTION: {"type":"add_employee","data":{"name":"","code":"","position":"","email":"","balance":21,"department_id":""}}
- حذف موظف: ACTION: {"type":"delete_employee","data":{"id":""}}
- تعديل رصيد: ACTION: {"type":"update_balance","data":{"id":"","balance":0}}
- قبول طلب: ACTION: {"type":"approve_request","data":{"id":""}}
- رفض طلب: ACTION: {"type":"reject_request","data":{"id":""}}
- نقل موظفين جماعي لقسم: ACTION: {"type":"bulk_update_department","data":{"employee_ids":["id1","id2"],"department_id":""}}
- تعديل منصب موظفين: ACTION: {"type":"bulk_update_position","data":{"employee_ids":["id1","id2"],"position":""}}`;

    try {
      // بناء تاريخ المحادثة بصيغة OpenAI المتوافقة مع Groq
      const conversationHistory = aiMessages
        .filter((m, idx) => !(m.role === "assistant" && idx === 0))
        .map(m => ({ role: m.role, content: m.content }));
      conversationHistory.push({ role: "user", content: userMsg });

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemPrompt },
            ...conversationHistory,
          ],
          max_tokens: 1024,
          temperature: 0.2,
        }),
      });

      const data = await response.json();

      // ✅ التعامل مع أخطاء API
      if (data.error) {
        const errCode = data.error.code || "";
        let arabicError = `❌ خطأ من Groq API:\n${data.error.message}`;

        if (errCode === "invalid_api_key" || response.status === 401) {
          arabicError = "❌ الـ API Key غلط أو منتهي.\n\nالحل:\n1. روح console.groq.com واعمل Key جديد\n2. حدّثه في Vercel → Environment Variables\n3. اعمل Redeploy";
        } else if (response.status === 429) {
          arabicError = "⚠️ تجاوزت الحد المسموح. انتظر ثواني وحاول مجدداً.";
        }

        setAiMessages(prev => [...prev, { role: "assistant", content: arabicError }]);
        setAiLoading(false);
        return;
      }

      const replyText = data.choices?.[0]?.message?.content || "عذراً، لم يرجع رد من الـ AI.";

      // تحقق من وجود ACTION في الرد
      const actionMatch = replyText.match(/ACTION:\s*(\{.*\})/s);
      const cleanReply = replyText.replace(/ACTION:\s*\{.*\}/s, "").trim();

      setAiMessages(prev => [...prev, { role: "assistant", content: cleanReply }]);

      // تنفيذ الأمر لو موجود
      if (actionMatch) {
        try {
          const action = JSON.parse(actionMatch[1]);
          if (action.type === "add_employee" && action.data) {
            const dept = departments.find(d => d.name === action.data.department);
            await supabase.from("employees").insert([{ ...action.data, department_id: dept?.id || null, balance: action.data.balance || 21 }]);
            setAiMessages(prev => [...prev, { role: "assistant", content: "✅ تم تنفيذ الأمر بنجاح! جاري تحديث البيانات..." }]);
            fetchData();
          } else if (action.type === "delete_employee" && action.data?.id) {
            await supabase.from("vacation_requests").delete().eq("employee_id", action.data.id);
            await supabase.from("employees").delete().eq("id", action.data.id);
            setAiMessages(prev => [...prev, { role: "assistant", content: "✅ تم الحذف بنجاح!" }]);
            fetchData();
          } else if (action.type === "update_balance" && action.data) {
            await supabase.from("employees").update({ balance: action.data.balance }).eq("id", action.data.id);
            setAiMessages(prev => [...prev, { role: "assistant", content: "✅ تم تحديث الرصيد!" }]);
            fetchData();
          } else if (action.type === "approve_request" && action.data?.id) {
            const req = requests.find(r => r.id === action.data.id);
            const emp = employees.find(e => e.id === req?.employee_id);
            if (req && emp) {
              await supabase.from("employees").update({ balance: emp.balance - req.days, status: "إجازة", return_date: null }).eq("id", emp.id);
              await supabase.from("vacation_requests").update({ status: "approved" }).eq("id", action.data.id);
              setAiMessages(prev => [...prev, { role: "assistant", content: "✅ تمت الموافقة على الطلب!" }]);
              fetchData();
            }
          } else if (action.type === "reject_request" && action.data?.id) {
            await supabase.from("vacation_requests").update({ status: "rejected" }).eq("id", action.data.id);
            setAiMessages(prev => [...prev, { role: "assistant", content: "✅ تم رفض الطلب!" }]);
            fetchData();
          } else if (action.type === "bulk_update_department" && action.data?.employee_ids && action.data?.department_id) {
            const ids = action.data.employee_ids;
            await Promise.all(ids.map((id: string) =>
              supabase.from("employees").update({ department_id: action.data.department_id }).eq("id", id)
            ));
            const deptName = departments.find(d => d.id === action.data.department_id)?.name || action.data.department_id;
            setAiMessages(prev => [...prev, { role: "assistant", content: `✅ تم نقل ${ids.length} موظف لقسم ${deptName} بنجاح!` }]);
            fetchData();
          } else if (action.type === "bulk_update_position" && action.data?.employee_ids && action.data?.position) {
            const ids = action.data.employee_ids;
            await Promise.all(ids.map((id: string) =>
              supabase.from("employees").update({ position: action.data.position }).eq("id", id)
            ));
            setAiMessages(prev => [...prev, { role: "assistant", content: `✅ تم تعديل منصب ${ids.length} موظف بنجاح!` }]);
            fetchData();
          }
        } catch(e) { console.error("Action parse error:", e); }
      }
    } catch (err: any) {
      let errorMsg = "❌ خطأ في الاتصال بـ Groq API. تأكد من اتصالك بالإنترنت.";
      setAiMessages(prev => [...prev, { role: "assistant", content: errorMsg }]);
    }
    setAiLoading(false);
  };

  // ==================== LOGIN VIEW ====================
  // inject dark mode styles once
  React.useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = darkModeStyle;
    style.id = "vms-dark-mode";
    if (!document.getElementById("vms-dark-mode")) document.head.appendChild(style);
    document.body.style.background = "#0d1117";
    document.body.style.margin = "0";
    return () => {};
  }, []);

  if (currentView === "login") {
    return (
      <div dir="rtl" style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)",
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
        `}</style>

        {/* كرات ضوئية في الخلفية */}
        <div className="orb1" style={{ position:"absolute", top:"-10%", right:"-5%", width:"500px", height:"500px", borderRadius:"50%", background:"radial-gradient(circle, rgba(99,102,241,0.4) 0%, transparent 70%)", filter:"blur(40px)" }} />
        <div className="orb2" style={{ position:"absolute", bottom:"-15%", left:"-10%", width:"600px", height:"600px", borderRadius:"50%", background:"radial-gradient(circle, rgba(16,185,129,0.3) 0%, transparent 70%)", filter:"blur(50px)" }} />
        <div className="orb3" style={{ position:"absolute", top:"40%", left:"30%", width:"300px", height:"300px", borderRadius:"50%", background:"radial-gradient(circle, rgba(139,92,246,0.25) 0%, transparent 70%)", filter:"blur(30px)" }} />

        {/* شبكة نقاط خلفية */}
        <div style={{ position:"absolute", inset:0, backgroundImage:"radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)", backgroundSize:"40px 40px", pointerEvents:"none" }} />

        {/* الكارت الرئيسي */}
        <div style={{ width:"100%", maxWidth:"900px", display:"grid", gridTemplateColumns:"1fr 1fr", borderRadius:"32px", overflow:"hidden", boxShadow:"0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)", position:"relative", zIndex:10 }}>
          
          {/* قسم الموظفين - يمين */}
          <div className="login-card" style={{ padding:"52px 40px", background:"rgba(255,255,255,0.04)", borderLeft:"1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ width:"60px", height:"60px", borderRadius:"18px", background:"linear-gradient(135deg, #6366f1, #8b5cf6)", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:"24px", boxShadow:"0 8px 20px rgba(99,102,241,0.4)" }}>
              <Users className="text-white" size={28} />
            </div>
            <h2 style={{ color:"white", fontSize:"26px", fontWeight:"900", marginBottom:"8px", fontFamily:"Cairo, sans-serif" }}>دخول الموظفين</h2>
            <p style={{ color:"rgba(255,255,255,0.4)", fontSize:"14px", marginBottom:"32px" }}>أدخل كودك الوظيفي للمتابعة</p>
            <div style={{ position:"relative", marginBottom:"16px" }}>
              <input
                className="login-input"
                style={{ width:"100%", background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:"14px", padding:"14px 18px", color:"white", fontSize:"15px", boxSizing:"border-box", fontFamily:"Cairo, sans-serif" }}
                placeholder="الكود الوظيفي"
                value={empCodeInput}
                onChange={(e) => setEmpCodeInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin(e as any)}
              />
            </div>
            <button className="login-btn" onClick={handleLogin} style={{ width:"100%", background:"linear-gradient(135deg, #6366f1, #8b5cf6)", border:"none", borderRadius:"14px", padding:"15px", color:"white", fontSize:"16px", fontWeight:"700", cursor:"pointer", fontFamily:"Cairo, sans-serif" }}>
              دخول
            </button>
          </div>

          {/* قسم الإدارة - يسار */}
          <div className="login-card" style={{ padding:"52px 40px", background:"rgba(0,0,0,0.25)" }}>
            <div style={{ width:"60px", height:"60px", borderRadius:"18px", background:"linear-gradient(135deg, #10b981, #059669)", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:"24px", boxShadow:"0 8px 20px rgba(16,185,129,0.4)" }}>
              <ShieldCheck className="text-white" size={28} />
            </div>
            <h2 style={{ color:"white", fontSize:"26px", fontWeight:"900", marginBottom:"8px", fontFamily:"Cairo, sans-serif" }}>لوحة الإدارة</h2>
            <p style={{ color:"rgba(255,255,255,0.4)", fontSize:"14px", marginBottom:"32px" }}>صلاحيات خاصة للمسؤولين فقط</p>
            <input
              className="login-input"
              style={{ width:"100%", background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:"14px", padding:"14px 18px", color:"white", fontSize:"15px", marginBottom:"12px", display:"block", boxSizing:"border-box", fontFamily:"Cairo, sans-serif" }}
              placeholder="البريد الإلكتروني"
              value={loginData.email}
              onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
            />
            <input
              type="password"
              className="login-input"
              style={{ width:"100%", background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:"14px", padding:"14px 18px", color:"white", fontSize:"15px", marginBottom:"16px", display:"block", boxSizing:"border-box", fontFamily:"Cairo, sans-serif" }}
              placeholder="كلمة المرور"
              value={loginData.password}
              onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleLogin(e as any)}
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
      <div style={{ minHeight:"100vh", background:"#0d1117", display:"flex" }} dir="rtl">

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
          style={{ background: sidebarOpen ? "rgba(99,102,241,0.9)" : "#6366f1", backdropFilter:"blur(10px)" }}
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
          <div style={{ padding:"24px 16px 16px", borderBottom:"1px solid rgba(255,255,255,0.07)", marginTop:"48px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
              <div style={{ background: isOwner ? "#4f46e5" : "#059669", borderRadius:"10px", padding:"8px", flexShrink:0 }}>
                <CalendarDays size={18} className="text-white" />
              </div>
              <div>
                <div style={{ color:"white", fontWeight:"900", fontSize:"13px", lineHeight:"1.2" }}>نظام الإجازات</div>
                <div style={{ fontSize:"10px", fontWeight:"700", color: isOwner ? "#a5b4fc" : "#6ee7b7" }}>
                  {isOwner ? "👑 المالك" : `🏢 ${currentUser?.dept_name || "مدير قسم"}`}
                </div>
              </div>
            </div>
          </div>

          {/* القائمة */}
          <nav style={{ flex:1, padding:"12px 10px", display:"flex", flexDirection:"column", gap:"4px", overflowY:"auto" }}>
            {([
              { id: "dashboard",   label: "الرئيسية",       icon: LayoutDashboard, ownerOnly: false },
              { id: "employees",   label: "الموظفين",        icon: Users,           ownerOnly: false },
              { id: "requests",    label: "الطلبات",         icon: Clock,           ownerOnly: false },
              { id: "calendar",    label: "التقويم",          icon: Calendar,        ownerOnly: false },
              { id: "reports",     label: "التقارير",         icon: BarChart3,       ownerOnly: false },
              { id: "departments", label: "الأقسام",          icon: Building2,       ownerOnly: true  },
              { id: "managers",    label: "مديرو الأقسام",   icon: ShieldCheck,     ownerOnly: true  },
              { id: "holidays",    label: "العطلات",          icon: CalendarDays,    ownerOnly: true  },
              { id: "history",     label: "السجل",            icon: History,         ownerOnly: false },
              { id: "active_vacations", label: "الإجازات الفعلية", icon: CheckCircle, ownerOnly: false },
            ] as {id:string,label:string,icon:any,ownerOnly:boolean}[])
              .filter(item => !item.ownerOnly || isOwner)
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
              </button>
            ))}
          </nav>

          {/* PWA + خروج */}
          <div style={{ padding:"10px", borderTop:"1px solid rgba(255,255,255,0.07)", display:"flex", flexDirection:"column", gap:"6px" }}>
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
            <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center", padding:"20px" }} onClick={() => setShowPWAGuide(false)}>
              <div style={{ background:"#161b22", borderRadius:"24px", padding:"32px", maxWidth:"440px", width:"100%", direction:"rtl" }} onClick={e => e.stopPropagation()}>
                <div style={{ textAlign:"center", marginBottom:"24px" }}>
                  <div style={{ fontSize:"48px", marginBottom:"12px" }}>📱</div>
                  <h2 style={{ margin:0, fontWeight:"900", fontSize:"22px", color:"#e6edf3" }}>تثبيت التطبيق</h2>
                  <p style={{ color:"#8b949e", fontSize:"14px", marginTop:"8px" }}>وصول سريع من شاشتك الرئيسية</p>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:"16px" }}>
                  <div style={{ background:"#0d1117", borderRadius:"16px", padding:"16px" }}>
                    <p style={{ fontWeight:"800", fontSize:"14px", color:"#e6edf3", marginBottom:"8px" }}>🤖 Android (Chrome):</p>
                    <ol style={{ margin:0, padding:"0 20px", fontSize:"13px", color:"#8b949e", lineHeight:"2" }}>
                      <li>اضغط على ⋮ (القائمة) في Chrome</li>
                      <li>اختر "إضافة إلى الشاشة الرئيسية"</li>
                      <li>اضغط "إضافة"</li>
                    </ol>
                  </div>
                  <div style={{ background:"#0d1117", borderRadius:"16px", padding:"16px" }}>
                    <p style={{ fontWeight:"800", fontSize:"14px", color:"#e6edf3", marginBottom:"8px" }}>🍎 iPhone (Safari):</p>
                    <ol style={{ margin:0, padding:"0 20px", fontSize:"13px", color:"#8b949e", lineHeight:"2" }}>
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
          marginRight: sidebarOpen ? "220px" : "0", 
          width: sidebarOpen ? "calc(100% - 220px)" : "100%",
          transition:"all 0.3s ease", 
          padding:"16px 24px", minHeight:"100vh", paddingTop:"60px", boxSizing:"border-box", background:"#0d1117",
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
                    const deptEmps = employees.filter(e => e.department_id === myDeptId);
                    const onVacNow = deptEmps.filter(emp =>
                      requests.some(r => r.employee_id === emp.id && r.status === "approved" &&
                        (() => { const { back } = getCalculatedDates(r.start_date, r.days); return r.start_date <= today && back > today; })()
                      )
                    );
                    const atWork = deptEmps.length - onVacNow.length;
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
                          <div style={{ position:"absolute", top:"-30px", left:"-30px", width:"180px", height:"180px", borderRadius:"50%", background:"rgba(255,255,255,0.04)" }}/>
                          <div style={{ position:"absolute", bottom:"-50px", left:"20%", width:"220px", height:"220px", borderRadius:"50%", background:"rgba(255,255,255,0.03)" }}/>
                          <div style={{ position:"absolute", top:"10px", right:"10px", width:"80px", height:"80px", borderRadius:"50%", background:"rgba(255,255,255,0.05)" }}/>

                          <div style={{ position:"relative", zIndex:1 }}>
                            {/* التحية والاسم */}
                            <div style={{ display:"flex", alignItems:"center", gap:"12px", marginBottom:"6px" }}>
                              <span style={{ fontSize:"32px" }}>{greeting.emoji}</span>
                              <div>
                                <div style={{ fontSize:"11px", color:"rgba(255,255,255,0.5)", marginBottom:"2px" }}>{greeting.text}</div>
                                <h2 style={{ margin:0, fontSize:"20px", fontWeight:"900" }}>{currentUser.name}</h2>
                              </div>
                            </div>
                            <div style={{ display:"inline-flex", alignItems:"center", gap:"6px", background:"rgba(255,255,255,0.12)", borderRadius:"20px", padding:"4px 12px", marginBottom:"20px", border:"1px solid rgba(255,255,255,0.15)" }}>
                              <Building2 size={13} style={{color:"#a5b4fc"}}/>
                              <span style={{ fontSize:"12px", color:"#a5b4fc", fontWeight:"700" }}>{currentUser.dept_name}</span>
                            </div>

                            {/* الإحصائيات الـ 4 */}
                            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))", gap:"10px" }}>
                              {[
                                { label:"إجمالي الموظفين", value: deptEmps.length, color:"#a5b4fc", icon:"👥" },
                                { label:"في عمل الآن",      value: atWork,          color:"#6ee7b7", icon:"✅" },
                                { label:"في إجازة الآن",   value: onVacNow.length, color:"#fca5a5", icon:"🏖️" },
                                { label:"طلبات معلقة",     value: pendingDept.length, color: pendingDept.length > 0 ? "#fde68a" : "#6ee7b7", icon:"⏳" },
                              ].map(s => (
                                <div key={s.label} style={{ background:"rgba(255,255,255,0.09)", borderRadius:"14px", padding:"14px 10px", textAlign:"center", border:"1px solid rgba(255,255,255,0.1)", backdropFilter:"blur(10px)" }}>
                                  <div style={{ fontSize:"20px", marginBottom:"4px" }}>{s.icon}</div>
                                  <div style={{ fontSize:"26px", fontWeight:"900", color:s.color, lineHeight:1 }}>{s.value}</div>
                                  <div style={{ fontSize:"10px", color:"rgba(255,255,255,0.6)", marginTop:"4px" }}>{s.label}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* ===== Pie Chart + شريط نسبة الحضور ===== */}
                        <div style={{ background:"#161b22", borderRadius:"20px", border:"1px solid #30363d", padding:"20px", boxShadow:"0 2px 8px rgba(0,0,0,0.06)" }}>
                          <div style={{ fontWeight:"900", fontSize:"15px", marginBottom:"16px", display:"flex", alignItems:"center", gap:"8px" }}>
                            <PieChart size={18} style={{color:"#4f46e5"}}/> حالة موظفي القسم
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
                              <circle cx="60" cy="60" r="32" fill="#161b22"/>
                              <text x="60" y="57" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#e6edf3">{workPct}%</text>
                              <text x="60" y="70" textAnchor="middle" fontSize="8" fill="#94a3b8">حضور</text>
                            </svg>
                            <div style={{ flex:1, display:"flex", flexDirection:"column", gap:"10px" }}>
                              <div>
                                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"4px" }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                                    <div style={{ width:"10px", height:"10px", borderRadius:"2px", background:"#10b981" }}/>
                                    <span style={{ fontSize:"12px", fontWeight:"700", color:"#c9d1d9" }}>في عمل</span>
                                  </div>
                                  <span style={{ fontSize:"12px", fontWeight:"900", color:"#10b981" }}>{atWork} موظف</span>
                                </div>
                                <div style={{ height:"6px", background:"#161b22", borderRadius:"3px" }}>
                                  <div style={{ height:"100%", width:`${workPct}%`, background:"linear-gradient(90deg,#10b981,#34d399)", borderRadius:"3px" }}/>
                                </div>
                              </div>
                              <div>
                                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"4px" }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                                    <div style={{ width:"10px", height:"10px", borderRadius:"2px", background:"#ef4444" }}/>
                                    <span style={{ fontSize:"12px", fontWeight:"700", color:"#c9d1d9" }}>في إجازة</span>
                                  </div>
                                  <span style={{ fontSize:"12px", fontWeight:"900", color:"#ef4444" }}>{onVacNow.length} موظف</span>
                                </div>
                                <div style={{ height:"6px", background:"#161b22", borderRadius:"3px" }}>
                                  <div style={{ height:"100%", width:`${vacPct}%`, background:"linear-gradient(90deg,#ef4444,#f87171)", borderRadius:"3px" }}/>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* ===== هيكل القسم ===== */}
                        <div style={{ background:"#161b22", borderRadius:"20px", border:"1px solid #30363d", overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,0.06)" }}>
                          <div style={{ padding:"16px 20px", borderBottom:"1px solid #30363d", fontWeight:"900", fontSize:"15px", display:"flex", alignItems:"center", gap:"8px" }}>
                            <Briefcase size={17} style={{color:"#7c3aed"}}/> هيكل القسم
                          </div>
                          <div style={{ padding:"12px", display:"flex", flexDirection:"column", gap:"12px" }}>
                            {grouped.map(group => (
                              <div key={group.rank}>
                                {/* عنوان الفئة */}
                                <div style={{ display:"inline-flex", alignItems:"center", gap:"6px", background:group.bg, borderRadius:"20px", padding:"5px 14px", marginBottom:"8px" }}>
                                  <span style={{ fontSize:"14px" }}>{group.icon}</span>
                                  <span style={{ fontSize:"12px", fontWeight:"900", color:group.color }}>{group.label} ({group.emps.length})</span>
                                </div>
                                {/* الموظفون */}
                                <div style={{ display:"flex", flexDirection:"column", gap:"4px", paddingRight:"12px", borderRight:`3px solid ${group.color}20` }}>
                                  {group.emps.map(emp => {
                                    const isVac = onVacNow.some(e => e.id === emp.id);
                                    return (
                                      <div key={emp.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 12px", borderRadius:"10px", background: isVac ? "#fff1f2" : "#f8fafc", border:`1px solid ${isVac ? "#fecdd3" : "#f1f5f9"}` }}>
                                        <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                                          <div style={{ width:"32px", height:"32px", borderRadius:"50%", background:`linear-gradient(135deg,${group.color}30,${group.color}15)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"13px", fontWeight:"900", color:group.color, flexShrink:0 }}>
                                            {emp.name.charAt(0)}
                                          </div>
                                          <div>
                                            <div style={{ fontWeight:"700", fontSize:"13px", color:"#e6edf3" }}>{emp.name}</div>
                                            <div style={{ fontSize:"10px", color:"#6e7681" }}>{emp.position}</div>
                                          </div>
                                        </div>
                                        <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                                          <span style={{ fontSize:"10px", fontWeight:"700", color:"#8b949e" }}>{emp.balance} يوم</span>
                                          <span style={{ padding:"2px 8px", borderRadius:"20px", fontSize:"10px", fontWeight:"700", background: isVac ? "#fee2e2" : "#dcfce7", color: isVac ? "#dc2626" : "#16a34a" }}>
                                            {isVac ? "إجازة" : "عمل"}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* ===== 3 جداول في Row ===== */}
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:"16px" }}>

                          {/* أعلى رصيد */}
                          <div style={{ background:"#161b22", borderRadius:"20px", border:"1px solid #30363d", overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,0.06)" }}>
                            <div style={{ padding:"14px 16px", background:"linear-gradient(135deg,#eef2ff,#e0e7ff)", borderBottom:"1px solid #30363d", fontWeight:"900", fontSize:"13px", color:"#4f46e5", display:"flex", alignItems:"center", gap:"6px" }}>
                              🏆 أعلى رصيد في القسم
                            </div>
                            {[...deptEmps].sort((a,b) => b.balance - a.balance).slice(0,5).map((emp,i) => (
                              <div key={emp.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderBottom:"1px solid #f8fafc" }}>
                                <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                                  <span style={{ fontWeight:"900", color: i === 0 ? "#f59e0b" : "#cbd5e1", fontSize:"14px" }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i+1}`}</span>
                                  <div>
                                    <div style={{ fontWeight:"700", fontSize:"12px" }}>{emp.name}</div>
                                    <div style={{ fontSize:"10px", color:"#6e7681" }}>{emp.position || "-"}</div>
                                  </div>
                                </div>
                                <span style={{ background:"rgba(99,102,241,0.1)", color:"#4f46e5", borderRadius:"20px", padding:"3px 10px", fontSize:"11px", fontWeight:"700" }}>{emp.balance} يوم</span>
                              </div>
                            ))}
                          </div>

                          {/* أكتر أيام عمل */}
                          <div style={{ background:"#161b22", borderRadius:"20px", border:"1px solid #30363d", overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,0.06)" }}>
                            <div style={{ padding:"14px 16px", background:"linear-gradient(135deg,#f0fdf4,#dcfce7)", borderBottom:"1px solid #30363d", fontWeight:"900", fontSize:"13px", color:"#16a34a", display:"flex", alignItems:"center", gap:"6px" }}>
                              💪 أكثر أيام عمل بعد العودة
                            </div>
                            {(() => {
                              const ranked = [...deptEmps]
                                .map(emp => ({ ...emp, workedDays: calculateWorkedDays(emp.return_date) }))
                                .filter(emp => emp.workedDays > 0)
                                .sort((a,b) => b.workedDays - a.workedDays)
                                .slice(0,5);
                              return ranked.length > 0 ? ranked.map((emp,i) => (
                                <div key={emp.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderBottom:"1px solid #f8fafc" }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                                    <span style={{ fontWeight:"900", color:"#6e7681", fontSize:"11px" }}>#{i+1}</span>
                                    <div>
                                      <div style={{ fontWeight:"700", fontSize:"12px" }}>{emp.name}</div>
                                      <div style={{ fontSize:"10px", color:"#6e7681" }}>{emp.position || "-"}</div>
                                    </div>
                                  </div>
                                  <span style={{ background:"rgba(16,185,129,0.15)", color:"#16a34a", borderRadius:"20px", padding:"3px 10px", fontSize:"11px", fontWeight:"700" }}>{emp.workedDays} يوم</span>
                                </div>
                              )) : <div style={{ padding:"20px", textAlign:"center", color:"#6e7681", fontSize:"12px" }}>لا توجد بيانات</div>;
                            })()}
                          </div>

                          {/* أقرب عودة */}
                          <div style={{ background:"#161b22", borderRadius:"20px", border:"1px solid #30363d", overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,0.06)" }}>
                            <div style={{ padding:"14px 16px", background:"linear-gradient(135deg,#fff7ed,#fef3c7)", borderBottom:"1px solid #30363d", fontWeight:"900", fontSize:"13px", color:"#ea580c", display:"flex", alignItems:"center", gap:"6px" }}>
                              📅 أقرب مواعيد العودة
                            </div>
                            {upcoming.length > 0 ? upcoming.map((r,i) => (
                              <div key={r.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderBottom:"1px solid #f8fafc" }}>
                                <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                                  <span style={{ fontWeight:"900", color:"#6e7681", fontSize:"11px" }}>#{i+1}</span>
                                  <div style={{ fontWeight:"700", fontSize:"12px" }}>{r.employee_name}</div>
                                </div>
                                <span style={{ background:"rgba(245,158,11,0.1)", color:"#ea580c", borderRadius:"20px", padding:"3px 10px", fontSize:"11px", fontWeight:"700" }}>{formatDate(r.backDate)}</span>
                              </div>
                            )) : <div style={{ padding:"20px", textAlign:"center", color:"#6e7681", fontSize:"12px" }}>لا يوجد موظفون في إجازة</div>}
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
                        <div style={{ position:"absolute", top:"-40px", left:"-40px", width:"200px", height:"200px", borderRadius:"50%", background:"rgba(255,255,255,0.04)" }} />
                        <div style={{ position:"absolute", bottom:"-60px", left:"30%", width:"250px", height:"250px", borderRadius:"50%", background:"rgba(255,255,255,0.03)" }} />

                        <div style={{ position:"relative", zIndex:1, display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:"24px" }}>
                          {/* يمين - الترحيب */}
                          <div>
                            <div style={{ display:"flex", alignItems:"center", gap:"12px", marginBottom:"8px" }}>
                              <span style={{ fontSize:"36px" }}>{greeting.emoji}</span>
                              <h2 style={{ color:"white", fontSize:"28px", fontWeight:"900", margin:0 }}>{greeting.text}، {currentUser.name}</h2>
                            </div>
                            <p style={{ color:"rgba(255,255,255,0.6)", fontSize:"15px", marginBottom:"20px" }}>نظرة عامة على حالة الإجازات</p>

                            {/* التاريخ والوقت */}
                            <div style={{ display:"flex", gap:"16px", flexWrap:"wrap" }}>
                              <div style={{ background:"rgba(255,255,255,0.1)", backdropFilter:"blur(10px)", borderRadius:"12px", padding:"10px 18px", border:"1px solid rgba(255,255,255,0.15)" }}>
                                <div style={{ color:"rgba(255,255,255,0.5)", fontSize:"11px", marginBottom:"2px" }}>الوقت</div>
                                <div style={{ color:"white", fontSize:"22px", fontWeight:"900", fontVariantNumeric:"tabular-nums", direction:"ltr" }}>
                                  {currentTime.toLocaleTimeString("ar-EG", { hour:"2-digit", minute:"2-digit", second:"2-digit" })}
                                </div>
                              </div>
                              <div style={{ background:"rgba(255,255,255,0.1)", backdropFilter:"blur(10px)", borderRadius:"12px", padding:"10px 18px", border:"1px solid rgba(255,255,255,0.15)" }}>
                                <div style={{ color:"rgba(255,255,255,0.5)", fontSize:"11px", marginBottom:"2px" }}>ميلادي</div>
                                <div style={{ color:"white", fontSize:"14px", fontWeight:"700" }}>
                                  {currentTime.toLocaleDateString("ar-EG", { weekday:"long", year:"numeric", month:"long", day:"numeric" })}
                                </div>
                              </div>
                              <div style={{ background:"rgba(255,255,255,0.1)", backdropFilter:"blur(10px)", borderRadius:"12px", padding:"10px 18px", border:"1px solid rgba(255,255,255,0.15)" }}>
                                <div style={{ color:"rgba(255,255,255,0.5)", fontSize:"11px", marginBottom:"2px" }}>هجري</div>
                                <div style={{ color:"#a5b4fc", fontSize:"14px", fontWeight:"700" }}>{getHijriDate()}</div>
                              </div>
                            </div>
                          </div>

                          {/* يسار - الحكمة اليومية */}
                          <div style={{ maxWidth:"340px", background:"rgba(255,255,255,0.07)", borderRadius:"16px", padding:"20px 24px", border:"1px solid rgba(255,255,255,0.12)", backdropFilter:"blur(10px)" }}>
                            <div style={{ color:"#fbbf24", fontSize:"12px", fontWeight:"700", marginBottom:"10px", display:"flex", alignItems:"center", gap:"6px" }}>
                              <span>💡</span> حكمة اليوم
                            </div>
                            <p style={{ color:"rgba(255,255,255,0.85)", fontSize:"14px", lineHeight:"1.8", margin:0 }}>
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
                    <div style={{ display:"flex", alignItems:"center", gap:"8px", padding:"8px 16px", borderRadius:"20px", background: isOnline ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)", color: isOnline ? "#10b981" : "#ef4444", fontSize:"13px", fontWeight:"700" }}>
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

                      {/* زر التقرير الذكي */}
                      <button onClick={generateAIInsights} style={{
                        display:"flex", alignItems:"center", gap:"8px",
                        background: "linear-gradient(135deg, #7c3aed, #6366f1)",
                        color:"white", border:"none", borderRadius:"14px",
                        padding:"10px 18px", fontWeight:"700", cursor:"pointer",
                        fontSize:"13px", fontFamily:"inherit",
                      }}>
                        <Activity size={16}/> تقرير AI ذكي
                      </button>

                      {/* زر النسخ الاحتياطي */}
                      {lastBackup && <span style={{ color:"#8b949e", fontSize:"12px", alignSelf:"center" }}>آخر نسخة: {lastBackup}</span>}
                      <button onClick={handleBackup} disabled={backupLoading} style={{
                        display:"flex", alignItems:"center", gap:"8px",
                        background: backupLoading ? "#94a3b8" : "linear-gradient(135deg, #10b981, #059669)",
                        color:"white", border:"none", borderRadius:"14px",
                        padding:"10px 18px", fontWeight:"700", cursor: backupLoading ? "not-allowed" : "pointer",
                        fontSize:"13px", fontFamily:"inherit",
                      }}>
                        {backupLoading ? <><RefreshCw size={16} style={{animation:"spin 1s linear infinite"}}/> جاري...</> : <><Download size={16}/> Google Sheets</>}
                      </button>
                    </div>
                  </div>

                  {/* AI Insights Modal */}
                  {showInsights && (
                    <div style={{ background:"#161b22", borderRadius:"20px", border:"1px solid #30363d", padding:"24px", boxShadow:"0 4px 20px rgba(0,0,0,0.08)" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"16px" }}>
                        <h3 style={{ margin:0, fontWeight:"900", fontSize:"18px", display:"flex", alignItems:"center", gap:"8px" }}>
                          <Activity size={20} style={{color:"#7c3aed"}}/> التقرير التحليلي الذكي
                        </h3>
                        <button onClick={() => setShowInsights(false)} style={{ background:"#161b22", border:"none", borderRadius:"8px", padding:"6px 12px", cursor:"pointer", fontWeight:"700", color:"#8b949e" }}>✕ إغلاق</button>
                      </div>
                      {insightsLoading ? (
                        <div style={{ textAlign:"center", padding:"40px", color:"#7c3aed" }}>
                          <Loader2 size={36} style={{ animation:"spin 1s linear infinite", margin:"0 auto 12px" }}/>
                          <p style={{ fontWeight:"700" }}>جاري تحليل البيانات بالذكاء الاصطناعي...</p>
                        </div>
                      ) : (
                        <div style={{ whiteSpace:"pre-wrap", lineHeight:"1.8", fontSize:"14px", color:"#c9d1d9", background:"#0d1117", padding:"20px", borderRadius:"12px" }}>
                          {aiInsights}
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(150px, 1fr))", gap:"14px" }}>
                    {[
                      { label:"إجمالي الموظفين", value: stats.totalEmployees, icon: <Users size={26}/>, grad:"linear-gradient(135deg,#667eea,#764ba2)", color:"#a5b4fc" },
                      { label:"طلبات معلقة",     value: stats.pendingRequests, icon: <Clock size={26}/>,  grad:"linear-gradient(135deg,#f6d365,#fda085)", color:"#fde68a" },
                      { label:"في إجازة الآن",  value: stats.onVacationNow, icon: <CheckCircle size={26}/>, grad:"linear-gradient(135deg,#43e97b,#38f9d7)", color:"#6ee7b7" },
                      { label:"متوسط الرصيد",   value: stats.avgBalance,     icon: <TrendingUp size={26}/>, grad:"linear-gradient(135deg,#a18cd1,#fbc2eb)", color:"#e9d5ff" },
                    ].map(s => (
                      <div key={s.label} style={{ background:"#161b22", border:"1px solid #30363d", borderRadius:"20px", padding:"20px", boxShadow:"0 8px 24px rgba(0,0,0,0.4)", display:"flex", flexDirection:"column", gap:"12px" }}>
                        <div style={{ width:"48px", height:"48px", borderRadius:"14px", background:s.grad, display:"flex", alignItems:"center", justifyContent:"center", color:"white", boxShadow:`0 4px 12px rgba(0,0,0,0.3)` }}>
                          {s.icon}
                        </div>
                        <div>
                          <div style={{ fontSize:"11px", color:"#6e7681", fontWeight:"700", marginBottom:"4px" }}>{s.label}</div>
                          <div style={{ fontSize:"32px", fontWeight:"900", color:s.color, lineHeight:"1" }}>{s.value}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* ===== Advanced Analytics Strip ===== */}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(140px, 1fr))", gap:"12px" }}>
                    {/* نسبة الحضور */}
                    {(() => {
                      const attendRate = stats.totalEmployees > 0 ? Math.round((stats.atWorkNow / stats.totalEmployees) * 100) : 0;
                      return (
                        <div style={{ background:"#161b22", borderRadius:"16px", padding:"20px", border:"1px solid #30363d", boxShadow:"0 4px 16px rgba(0,0,0,0.3)" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"12px" }}>
                            <Target size={16} style={{color:"#4f46e5"}}/>
                            <span style={{ fontSize:"12px", color:"#6e7681", fontWeight:"700" }}>نسبة الحضور</span>
                          </div>
                          <div style={{ fontSize:"28px", fontWeight:"900", color:"#4f46e5" }}>{attendRate}%</div>
                          <div style={{ marginTop:"8px", height:"6px", background:"#e2e8f0", borderRadius:"3px" }}>
                            <div style={{ height:"100%", width:`${attendRate}%`, background:"linear-gradient(90deg,#4f46e5,#7c3aed)", borderRadius:"3px" }}/>
                          </div>
                        </div>
                      );
                    })()}
                    {/* إجمالي أيام الإجازات */}
                    <div style={{ background:"#161b22", borderRadius:"16px", padding:"20px", border:"1px solid #30363d", boxShadow:"0 4px 16px rgba(0,0,0,0.3)" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"12px" }}>
                        <Award size={16} style={{color:"#f59e0b"}}/>
                        <span style={{ fontSize:"12px", color:"#6e7681", fontWeight:"700" }}>إجمالي أيام الإجازات</span>
                      </div>
                      <div style={{ fontSize:"28px", fontWeight:"900", color:"#f59e0b" }}>{stats.totalVacationDays}</div>
                      <div style={{ fontSize:"11px", color:"#6e7681", marginTop:"4px" }}>يوم مجموع مُوافق عليه</div>
                    </div>
                    {/* موظفين رصيدهم منخفض */}
                    {(() => {
                      const lowCount = employees.filter(e => e.balance < 5).length;
                      return (
                        <div style={{ background: lowCount > 0 ? "#fff7ed" : "white", borderRadius:"16px", padding:"20px", border:`1px solid ${lowCount > 0 ? "#fed7aa" : "#e2e8f0"}`, boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"12px" }}>
                            <Flame size={16} style={{color: lowCount > 0 ? "#ea580c" : "#64748b"}}/>
                            <span style={{ fontSize:"12px", color:"#6e7681", fontWeight:"700" }}>رصيد منخفض</span>
                          </div>
                          <div style={{ fontSize:"28px", fontWeight:"900", color: lowCount > 0 ? "#ea580c" : "#10b981" }}>{lowCount}</div>
                          <div style={{ fontSize:"11px", color:"#6e7681", marginTop:"4px" }}>موظف أقل من 5 أيام</div>
                        </div>
                      );
                    })()}
                    {/* معدل الموافقة */}
                    {(() => {
                      const total = requests.length;
                      const approved = requests.filter(r => r.status === "approved").length;
                      const rate = total > 0 ? Math.round((approved / total) * 100) : 0;
                      return (
                        <div style={{ background:"#161b22", borderRadius:"16px", padding:"20px", border:"1px solid #30363d", boxShadow:"0 4px 16px rgba(0,0,0,0.3)" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"12px" }}>
                            <Eye size={16} style={{color:"#10b981"}}/>
                            <span style={{ fontSize:"12px", color:"#6e7681", fontWeight:"700" }}>معدل الموافقة</span>
                          </div>
                          <div style={{ fontSize:"28px", fontWeight:"900", color:"#10b981" }}>{rate}%</div>
                          <div style={{ fontSize:"11px", color:"#6e7681", marginTop:"4px" }}>{approved} من {total} طلب</div>
                        </div>
                      );
                    })()}
                  </div>

                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))", gap:"16px" }}>
                    <div style={{ background:"#161b22", borderRadius:"1.5rem", border:"1px solid #30363d", boxShadow:"0 4px 20px rgba(0,0,0,0.3)" }}>
                      <div style={{ padding:"20px 24px", borderBottom:"1px solid #30363d", background:"#1c2333" }}><h4 style={{ fontWeight:"900", color:"#e6edf3", display:"flex", alignItems:"center", gap:"8px" }}><ArrowUpRight className="text-indigo-600" size={20} /> الأعلى رصيداً</h4></div>
                      <div style={{ padding:"14px 16px", color:"#8b949e", fontWeight:"700", textAlign:"center" }}>
                        {topBalances.map((emp, idx) => (
                          <div key={emp.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", borderRadius:"12px", cursor:"default" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:"12px" }}><span style={{ fontSize:"16px", fontWeight:"700", color:"#484f58" }}>#{idx+1}</span><span style={{ fontWeight:"700", color:"#e6edf3" }}>{emp.name}</span></div>
                            <span style={{ background:"rgba(99,102,241,0.2)", color:"#818cf8", padding:"3px 12px", borderRadius:"20px", fontWeight:"700", fontSize:"13px" }}>{emp.balance} يوم</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ background:"#161b22", borderRadius:"1.5rem", border:"1px solid #30363d", boxShadow:"0 4px 20px rgba(0,0,0,0.3)" }}>
                      <div style={{ padding:"20px 24px", borderBottom:"1px solid #30363d", background:"#1c2333" }}><h4 style={{ fontWeight:"900", color:"#e6edf3", display:"flex", alignItems:"center", gap:"8px" }}><Calendar className="text-emerald-600" size={20} /> أقرب مواعيد العودة</h4></div>
                      <div className="p-4 space-y-2">
                        {comingBackSoon.map(req => (
                          <div key={req.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", borderRadius:"12px", cursor:"default" }}>
                            <span style={{ fontWeight:"700", color:"#e6edf3" }}>{req.employee_name}</span>
                            <span style={{ color:"#10b981", fontWeight:"700", fontSize:"13px" }}>{formatDate(req.backDate)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(250px, 1fr))", gap:"16px" }}>
                    <div style={{ background:"#161b22", padding:"24px", borderRadius:"1.5rem", border:"1px solid #30363d", gridColumn:"span 2" }}>
                      <h4 style={{ fontWeight:"900", marginBottom:"16px", display:"flex", alignItems:"center", gap:"8px", color:"#e6edf3" }}><BarChart2 size={20} className="text-indigo-600" /> الإجازات الشهرية</h4>
                      <div className="h-48 flex items-end justify-between gap-2">
                        {vacationByMonth.map((item, idx) => {
                          const maxCount = Math.max(...vacationByMonth.map(v => v.count));
                          const height = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                          return (
                            <div key={idx} className="flex-1 flex flex-col items-center">
                              <div style={{ width:"100%", background:"linear-gradient(180deg,#6366f1,#4f46e5)", borderRadius:"4px 4px 0 0", transition:"all 0.2s", height: `${height}%` }} title={`${item.month}: ${item.count}`}></div>
                              <span style={{ fontSize:"11px", marginTop:"6px", color:"#8b949e" }}>{item.month.slice(0,3)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div style={{ background:"#161b22", padding:"24px", borderRadius:"1.5rem", border:"1px solid #30363d" }}>
                      <h4 style={{ fontWeight:"900", marginBottom:"16px", display:"flex", alignItems:"center", gap:"8px", color:"#e6edf3" }}><PieChart size={20} className="text-purple-600" /> أنواع الإجازات</h4>
                      <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
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
                  <div style={{ background:"#161b22", borderRadius:"20px", padding:"16px 20px", border:"1px solid #30363d", display:"flex", alignItems:"center", gap:"12px", flexWrap:"wrap", boxShadow:"0 4px 16px rgba(0,0,0,0.3)" }}>
                    {/* بحث */}
                    <div style={{ position:"relative", flex:"1", minWidth:"200px" }}>
                      <Search style={{ position:"absolute", right:"14px", top:"50%", transform:"translateY(-50%)", color:"#6e7681" }} size={16} />
                      <input
                        style={{ width:"100%", paddingRight:"40px", paddingLeft:"14px", paddingTop:"10px", paddingBottom:"10px", background:"#0d1117", border:"1px solid #30363d", borderRadius:"12px", color:"#e6edf3", fontSize:"13px", outline:"none", boxSizing:"border-box" }}
                        placeholder="ابحث بالاسم أو الكود..."
                        value={empSearch}
                        onChange={(e) => setEmpSearch(e.target.value)}
                      />
                    </div>
                    {/* فلاتر */}
                    {departments.length > 0 && (
                      <select style={{ padding:"10px 14px", background:"#0d1117", border:"1px solid #30363d", borderRadius:"12px", color:"#8b949e", fontSize:"13px", outline:"none" }} value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
                        <option value="all">كل الأقسام</option>
                        {departments.map(dept => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
                      </select>
                    )}
                    <select style={{ padding:"10px 14px", background:"#0d1117", border:"1px solid #30363d", borderRadius:"12px", color:"#8b949e", fontSize:"13px", outline:"none" }} value={empStatusFilter} onChange={(e) => setEmpStatusFilter(e.target.value)}>
                      <option value="all">كل الحالات</option>
                      <option value="عمل">🟢 في العمل</option>
                      <option value="إجازة">🟡 في إجازة</option>
                    </select>
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
                    <span style={{ fontSize:"13px", color:"#8b949e", fontWeight:"600" }}>
                      إجمالي: <span style={{ color:"#4f46e5", fontWeight:"900" }}>{filteredEmployees.length}</span> موظف
                      {filteredEmployees.filter(e => getEmployeeStatus(e) === "إجازة").length > 0 && (
                        <span style={{ marginRight:"12px", color:"#d97706" }}>
                          🟡 في إجازة: <strong>{filteredEmployees.filter(e => getEmployeeStatus(e) === "إجازة").length}</strong>
                        </span>
                      )}
                    </span>
                  </div>

                  {/* الجدول مع scroll أفقي */}
                  <div style={{ background:"#161b22", borderRadius:"20px", border:"1px solid #30363d", boxShadow:"0 1px 4px rgba(0,0,0,0.05)", overflow:"hidden" }}>
                    <div style={{ overflowX:"auto", overflowY:"auto", maxHeight:"calc(100vh - 280px)" }}>
                      <table style={{ width:"100%", borderCollapse:"collapse", minWidth:"900px", fontSize:"13px" }}>
                        <thead>
                          <tr style={{ background:"#0d1117", borderBottom:"2px solid #e2e8f0", position:"sticky", top:0, zIndex:5 }}>
                            <th style={{ padding:"14px 16px", textAlign:"right", fontWeight:"800", color:"#c9d1d9", whiteSpace:"nowrap", minWidth:"180px" }}>الاسم</th>
                            <th style={{ padding:"14px 12px", textAlign:"center", fontWeight:"800", color:"#c9d1d9", whiteSpace:"nowrap" }}>الكود</th>
                            <th style={{ padding:"14px 12px", textAlign:"right", fontWeight:"800", color:"#c9d1d9", whiteSpace:"nowrap", minWidth:"140px" }}>المنصب</th>
                            <th style={{ padding:"14px 12px", textAlign:"center", fontWeight:"800", color:"#c9d1d9", whiteSpace:"nowrap" }}>القسم</th>
                            <th style={{ padding:"14px 12px", textAlign:"center", fontWeight:"800", color:"#c9d1d9", whiteSpace:"nowrap" }}>الرصيد</th>
                            <th style={{ padding:"14px 12px", textAlign:"center", fontWeight:"800", color:"#c9d1d9", whiteSpace:"nowrap" }}>شهري</th>
                            <th style={{ padding:"14px 12px", textAlign:"center", fontWeight:"800", color:"#c9d1d9", whiteSpace:"nowrap" }}>أيام العمل</th>
                            <th style={{ padding:"14px 12px", textAlign:"center", fontWeight:"800", color:"#c9d1d9", whiteSpace:"nowrap" }}>الحالة</th>
                            <th style={{ padding:"14px 12px", textAlign:"center", fontWeight:"800", color:"#c9d1d9", whiteSpace:"nowrap" }}>إجراءات</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredEmployees.map((emp, idx) => {
                            const workedDays = calculateWorkedDays(emp.return_date);
                            const dept = departments.find(d => d.id === emp.department_id);
                            const empStatus = getEmployeeStatus(emp);
                            const isOnLeave = empStatus === "إجازة";
                            return (
                              <tr key={emp.id} style={{ borderBottom:"1px solid #f1f5f9", background: isOnLeave ? "#fffbeb" : (idx % 2 === 0 ? "white" : "#fafafa"), transition:"background 0.15s" }}
                                onMouseEnter={e => (e.currentTarget.style.background = "#f0f4ff")}
                                onMouseLeave={e => (e.currentTarget.style.background = isOnLeave ? "#fffbeb" : (idx % 2 === 0 ? "white" : "#fafafa"))}>
                                {/* الاسم */}
                                <td style={{ padding:"12px 16px" }}>
                                  <div style={{ fontWeight:"700", color:"#e6edf3", fontSize:"13px" }}>{emp.name}</div>
                                  {emp.email && <a href={`mailto:${emp.email}`} style={{ color:"#6366f1", fontSize:"11px", textDecoration:"none" }}>{emp.email}</a>}
                                </td>
                                {/* الكود */}
                                <td style={{ padding:"12px", textAlign:"center" }}>
                                  <span style={{ fontFamily:"monospace", background:"#161b22", padding:"3px 8px", borderRadius:"6px", fontSize:"12px", color:"#8b949e", fontWeight:"600" }}>{emp.code}</span>
                                </td>
                                {/* المنصب */}
                                <td style={{ padding:"12px", color:"#8b949e", fontSize:"12px" }}>{emp.position || "-"}</td>
                                {/* القسم */}
                                <td style={{ padding:"12px", textAlign:"center" }}>
                                  {dept ? <span style={{ background:"#ede9fe", color:"#7c3aed", padding:"3px 10px", borderRadius:"20px", fontSize:"11px", fontWeight:"700" }}>{dept.name}</span> : <span style={{ color:"#cbd5e1" }}>-</span>}
                                </td>
                                {/* الرصيد */}
                                <td style={{ padding:"12px", textAlign:"center" }}>
                                  <span style={{ fontWeight:"900", fontSize:"16px", color: emp.balance < 5 ? "#dc2626" : emp.balance < 10 ? "#d97706" : "#4f46e5" }}>{emp.balance}</span>
                                  <div style={{ fontSize:"10px", color:"#6e7681" }}>يوم</div>
                                </td>
                                {/* شهري */}
                                <td style={{ padding:"12px", textAlign:"center" }}>
                                  {emp.monthly_balance > 0
                                    ? <span style={{ background:"rgba(16,185,129,0.15)", color:"#16a34a", padding:"3px 8px", borderRadius:"20px", fontSize:"11px", fontWeight:"700" }}>+{emp.monthly_balance}</span>
                                    : <span style={{ color:"#cbd5e1", fontSize:"12px" }}>-</span>}
                                </td>
                                {/* أيام العمل */}
                                <td style={{ padding:"12px", textAlign:"center", fontWeight:"700", color:"#7c3aed", fontSize:"13px" }}>{workedDays > 0 ? workedDays : "-"}</td>
                                {/* الحالة */}
                                <td style={{ padding:"12px", textAlign:"center" }}>
                                  <span style={{ padding:"4px 12px", borderRadius:"20px", fontSize:"11px", fontWeight:"800", background: isOnLeave ? "#fef3c7" : "#dcfce7", color: isOnLeave ? "#92400e" : "#166534" }}>
                                    {isOnLeave ? "🟡 إجازة" : "🟢 عمل"}
                                  </span>
                                </td>
                                {/* إجراءات */}
                                <td style={{ padding:"12px", textAlign:"center" }}>
                                  <div style={{ display:"flex", justifyContent:"center", gap:"6px" }}>
                                    <button onClick={() => setEditingEmp(emp)} style={{ padding:"6px", background:"rgba(59,130,246,0.1)", border:"none", borderRadius:"8px", cursor:"pointer", color:"#3b82f6", display:"flex", alignItems:"center" }} title="تعديل"><Edit3 size={14} /></button>
                                    <button onClick={() => handleDeleteEmployee(emp.id)} style={{ padding:"6px", background:"#fff1f2", border:"none", borderRadius:"8px", cursor:"pointer", color:"#ef4444", display:"flex", alignItems:"center" }} title="حذف"><Trash2 size={14} /></button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {filteredEmployees.length === 0 && (
                        <div style={{ padding:"60px", textAlign:"center", color:"#6e7681" }}>
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
                      <h2 style={{ fontSize:"22px", fontWeight:"900", color:"#e6edf3" }}>طلبات الإجازات</h2>
                      {isDeptMgr && <p className="text-sm text-emerald-600 font-bold mt-1">🏢 تعرض طلبات قسم: {currentUser?.dept_name}</p>}
                    </div>
                    <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
                      <select style={{ padding:"10px 14px", background:"#0d1117", border:"1px solid #30363d", borderRadius:"12px", color:"#e6edf3", outline:"none" }} value={vacationTypeFilter} onChange={(e) => setVacationTypeFilter(e.target.value)}>
                        <option value="all">كل الأنواع</option>
                        {vacationTypes.map(vt => <option key={vt.id} value={vt.id}>{vt.name}</option>)}
                      </select>
                      <button onClick={() => { setSelectedPrintRequests([]); setPrintDateFrom(""); setPrintDateTo(""); setShowPrintModal(true); }}
                        style={{ padding:"10px 16px", background:"linear-gradient(135deg,#1d4ed8,#3b82f6)", color:"white", border:"none", borderRadius:"12px", fontWeight:"700", cursor:"pointer", fontSize:"13px", display:"flex", alignItems:"center", gap:"6px", whiteSpace:"nowrap" }}>
                        🖨️ طباعة / مشاركة
                      </button>
                    </div>
                  </div>

                  {/* طلبات بانتظار مدير القسم (للدور: مدير قسم) */}
                  {isDeptMgr && (
                    <>
                      <h3 className="font-black text-lg text-amber-600">⏳ بانتظار موافقتك ({filteredRequests.filter(r => r.status === "pending").length})</h3>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))", gap:"16px" }}>
                        {filteredRequests.filter(r => r.status === "pending").map(req => {
                          const vacType = vacationTypes.find(vt => vt.id === req.vacation_type_id);
                          return (
                            <div key={req.id} style={{ background:"#161b22", padding:"24px", borderRadius:"1.5rem", border:"2px solid rgba(245,158,11,0.3)" }}>
                              <div className="flex justify-between items-start mb-6" style={{ cursor:"pointer" }} onClick={() => setExpandedRequestId(expandedRequestId === req.id ? null : req.id)}>
                                <div>
                                  <h4 className="font-black text-xl text-slate-800">{req.employee_name}</h4>
                                  <p className="text-slate-400 text-sm mt-1">بانتظار موافقتك — <span style={{color:"#818cf8", fontSize:"11px"}}>اضغط لعرض بيانات الموظف</span></p>
                                </div>
                                <div className="flex gap-2 items-center">
                                  {vacType && <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: vacType.color+'20', color: vacType.color }}>{vacType.name}</span>}
                                  <span style={{ color:"#6e7681", fontSize:"18px" }}>{expandedRequestId === req.id ? "▲" : "▼"}</span>
                                </div>
                              </div>
                              {/* بيانات الموظف عند الضغط */}
                              {expandedRequestId === req.id && (() => {
                                const empInfo = employees.find(e => e.id === req.employee_id);
                                if (!empInfo) return null;
                                const workedDaysEmp = calculateWorkedDays(empInfo.return_date);
                                const totalVacDays = requests.filter(r => r.employee_id === empInfo.id && r.status === "approved").reduce((s,r) => s + Number(r.days), 0);
                                const isBalanceSufficient = Number(empInfo.balance) >= Number(req.days);
                                return (
                                  <div style={{ background:"linear-gradient(135deg,#1c2333,#21262d)", borderRadius:"16px", padding:"16px", marginBottom:"16px", border:"1px solid #30363d" }}>
                                    <div style={{ display:"flex", alignItems:"center", gap:"12px", marginBottom:"14px" }}>
                                      <div style={{ width:"46px", height:"46px", borderRadius:"50%", background:"linear-gradient(135deg,#4f46e5,#7c3aed)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:"900", fontSize:"18px", color:"white", flexShrink:0 }}>
                                        {empInfo.name?.charAt(0)}
                                      </div>
                                      <div>
                                        <div style={{ fontWeight:"900", fontSize:"15px", color:"#e6edf3" }}>{empInfo.name}</div>
                                        <div style={{ fontSize:"11px", color:"#6e7681" }}>{empInfo.position || "-"} | كود: {empInfo.code || "-"}</div>
                                        {empInfo.hire_date && <div style={{ fontSize:"10px", color:"#484f58" }}>تاريخ التعيين: {formatDate(empInfo.hire_date)}</div>}
                                      </div>
                                    </div>
                                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"8px" }}>
                                      <div style={{ background: isBalanceSufficient ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.15)", borderRadius:"12px", padding:"10px", textAlign:"center", border: isBalanceSufficient ? "1px solid rgba(16,185,129,0.2)" : "1px solid rgba(239,68,68,0.3)" }}>
                                        <div style={{ fontSize:"20px", fontWeight:"900", color: isBalanceSufficient ? "#10b981" : "#ef4444" }}>{empInfo.balance}</div>
                                        <div style={{ fontSize:"10px", color:"#6e7681", marginTop:"2px" }}>رصيد الإجازة</div>
                                        {!isBalanceSufficient && <div style={{ fontSize:"9px", color:"#ef4444", marginTop:"2px" }}>⚠️ رصيد غير كافٍ!</div>}
                                      </div>
                                      <div style={{ background:"rgba(245,158,11,0.1)", borderRadius:"12px", padding:"10px", textAlign:"center", border:"1px solid rgba(245,158,11,0.2)" }}>
                                        <div style={{ fontSize:"20px", fontWeight:"900", color:"#f59e0b" }}>{workedDaysEmp}</div>
                                        <div style={{ fontSize:"10px", color:"#6e7681", marginTop:"2px" }}>أيام العمل</div>
                                      </div>
                                      <div style={{ background:"rgba(129,140,248,0.1)", borderRadius:"12px", padding:"10px", textAlign:"center", border:"1px solid rgba(129,140,248,0.2)" }}>
                                        <div style={{ fontSize:"20px", fontWeight:"900", color:"#818cf8" }}>{totalVacDays}</div>
                                        <div style={{ fontSize:"10px", color:"#6e7681", marginTop:"2px" }}>إجمالي إجازاته</div>
                                      </div>
                                    </div>
                                    <div style={{ marginTop:"10px", display:"flex", justifyContent:"space-between", fontSize:"11px", color:"#6e7681" }}>
                                      <span>الرصيد الشهري: <b style={{color:"#6ee7b7"}}>{empInfo.monthly_balance || 0} يوم/شهر</b></span>
                                      {empInfo.email ? <span style={{color:"#818cf8"}}>📧 {empInfo.email}</span> : <span style={{color:"#f59e0b"}}>⚠️ لا يوجد بريد</span>}
                                    </div>
                                    {/* هل يستاهل الإجازة؟ */}
                                    <div style={{ marginTop:"12px", padding:"10px 14px", borderRadius:"12px", background: isBalanceSufficient && workedDaysEmp >= 30 ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.1)", border: isBalanceSufficient && workedDaysEmp >= 30 ? "1px solid rgba(16,185,129,0.3)" : "1px solid rgba(239,68,68,0.2)", textAlign:"center" }}>
                                      <div style={{ fontWeight:"900", fontSize:"14px", color: isBalanceSufficient && workedDaysEmp >= 30 ? "#10b981" : "#ef4444" }}>
                                        {isBalanceSufficient && workedDaysEmp >= 30 ? "✅ الموظف يستحق الإجازة" : !isBalanceSufficient ? "❌ الرصيد غير كافٍ" : "⚠️ أيام العمل أقل من 30 يوم"}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}
                              <div style={{ background:"#1c2333", padding:"20px", borderRadius:"16px", marginBottom:"20px" }}>
                                <div className="flex justify-between text-sm font-bold"><span style={{ color:"#6e7681" }}>تاريخ البداية</span><span>{formatDate(req.start_date)}</span></div>
                                <div className="flex justify-between text-sm font-bold"><span style={{ color:"#6e7681" }}>المدة</span><span>{req.days} يوم</span></div>
                                <div className="flex justify-between text-sm font-bold pt-3 border-t"><span className="text-indigo-600">تاريخ العودة</span><span className="text-indigo-600 font-black">{formatDate(getCalculatedDates(req.start_date, req.days).back)}</span></div>
                              </div>
                              {req.notes && <p className="text-sm text-slate-500 italic mb-6">"{req.notes}"</p>}
                              <div className="flex gap-3">
                                <button onClick={() => openApprovalModal(req, "approved")} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-4 rounded-2xl font-black">موافقة مبدئية ✓</button>
                                <button onClick={() => openApprovalModal(req, "rejected")} className="flex-1 bg-red-50 text-red-600 hover:bg-red-100 py-4 rounded-2xl font-black">رفض</button>
                              </div>
                                <button onClick={() => { setEditDaysForm({ days: req.days, oldDays: req.days, reason: "", requestId: req.id, empName: req.employee_name }); setShowEditDaysModal(true); }}
                                  style={{ width:"100%", marginTop:"6px", padding:"10px", background:"rgba(99,102,241,0.15)", border:"1px solid rgba(99,102,241,0.3)", borderRadius:"14px", color:"#818cf8", cursor:"pointer", fontWeight:"700", fontSize:"13px" }}>
                                  ✏️ تعديل عدد الأيام
                                </button>
                            </div>
                          );
                        })}
                        {filteredRequests.filter(r => r.status === "pending").length === 0 && (
                          <div className="col-span-2 py-20 text-center bg-white rounded-[3rem] border border-dashed">
                            <p className="text-slate-400 font-bold">لا توجد طلبات معلقة ✅</p>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Owner: طلبات بانتظار موافقة مدير القسم */}
                  {isOwner && filteredRequests.filter(r => r.status === "pending").length > 0 && (
                    <>
                      <h3 className="font-black text-lg text-amber-600">⏳ جديدة — بانتظار مدير القسم ({filteredRequests.filter(r => r.status === "pending").length})</h3>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))", gap:"16px" }}>
                        {filteredRequests.filter(r => r.status === "pending").map(req => {
                          const vacType = vacationTypes.find(vt => vt.id === req.vacation_type_id);
                          const dept = departments.find(d => d.id === employees.find(e => e.id === req.employee_id)?.department_id);
                          return (
                            <div key={req.id} style={{ background:"#161b22", padding:"20px", borderRadius:"1.5rem", border:"1px solid #30363d" }}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"14px", cursor:"pointer" }} onClick={() => setExpandedRequestId(expandedRequestId === req.id ? null : req.id)}>
                                <div>
                                  <h4 className="font-black text-xl text-slate-800">{req.employee_name}</h4>
                                  <p className="text-xs text-amber-600 font-bold mt-1">🏢 {dept?.name || "—"} — بانتظار مدير القسم — <span style={{color:"#818cf8", fontSize:"11px"}}>اضغط لعرض بيانات الموظف</span></p>
                                </div>
                                <div className="flex gap-2">
                                  {vacType && <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: vacType.color+'20', color: vacType.color }}>{vacType.name}</span>}
                                  <span style={{ color:"#6e7681", fontSize:"18px" }}>{expandedRequestId === req.id ? "▲" : "▼"}</span>
                                  <button onClick={(e) => { e.stopPropagation(); handleDeleteVacation(req.id); }} className="p-2 text-red-400 hover:bg-red-50 rounded-xl"><Trash2 size={16} /></button>
                                </div>
                              </div>
                              {/* بيانات الموظف عند الضغط */}
                              {expandedRequestId === req.id && (() => {
                                const empInfo = employees.find(e => e.id === req.employee_id);
                                if (!empInfo) return null;
                                const workedDaysEmp = calculateWorkedDays(empInfo.return_date);
                                const totalVacDays = requests.filter(r => r.employee_id === empInfo.id && r.status === "approved").reduce((s,r) => s + Number(r.days), 0);
                                const isBalanceSufficient = Number(empInfo.balance) >= Number(req.days);
                                return (
                                  <div style={{ background:"linear-gradient(135deg,#1c2333,#21262d)", borderRadius:"16px", padding:"16px", marginBottom:"16px", border:"1px solid #30363d" }}>
                                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"8px" }}>
                                      <div style={{ background: isBalanceSufficient ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.15)", borderRadius:"12px", padding:"10px", textAlign:"center", border: isBalanceSufficient ? "1px solid rgba(16,185,129,0.2)" : "1px solid rgba(239,68,68,0.3)" }}>
                                        <div style={{ fontSize:"20px", fontWeight:"900", color: isBalanceSufficient ? "#10b981" : "#ef4444" }}>{empInfo.balance}</div>
                                        <div style={{ fontSize:"10px", color:"#6e7681", marginTop:"2px" }}>رصيد الإجازة</div>
                                        {!isBalanceSufficient && <div style={{ fontSize:"9px", color:"#ef4444", marginTop:"2px" }}>⚠️ غير كافٍ</div>}
                                      </div>
                                      <div style={{ background:"rgba(245,158,11,0.1)", borderRadius:"12px", padding:"10px", textAlign:"center", border:"1px solid rgba(245,158,11,0.2)" }}>
                                        <div style={{ fontSize:"20px", fontWeight:"900", color:"#f59e0b" }}>{workedDaysEmp}</div>
                                        <div style={{ fontSize:"10px", color:"#6e7681", marginTop:"2px" }}>أيام العمل</div>
                                      </div>
                                      <div style={{ background:"rgba(129,140,248,0.1)", borderRadius:"12px", padding:"10px", textAlign:"center", border:"1px solid rgba(129,140,248,0.2)" }}>
                                        <div style={{ fontSize:"20px", fontWeight:"900", color:"#818cf8" }}>{totalVacDays}</div>
                                        <div style={{ fontSize:"10px", color:"#6e7681", marginTop:"2px" }}>إجمالي إجازاته</div>
                                      </div>
                                    </div>
                                    <div style={{ marginTop:"12px", padding:"10px 14px", borderRadius:"12px", background: isBalanceSufficient && workedDaysEmp >= 30 ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.1)", border: isBalanceSufficient && workedDaysEmp >= 30 ? "1px solid rgba(16,185,129,0.3)" : "1px solid rgba(239,68,68,0.2)", textAlign:"center" }}>
                                      <div style={{ fontWeight:"900", fontSize:"14px", color: isBalanceSufficient && workedDaysEmp >= 30 ? "#10b981" : "#ef4444" }}>
                                        {isBalanceSufficient && workedDaysEmp >= 30 ? "✅ الموظف يستحق الإجازة" : !isBalanceSufficient ? "❌ الرصيد غير كافٍ" : "⚠️ أيام العمل أقل من 30 يوم"}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}
                              <div style={{ background:"#1c2333", padding:"14px", borderRadius:"14px", fontSize:"13px" }}>
                                <div className="flex justify-between font-bold"><span style={{ color:"#6e7681" }}>البداية</span><span>{formatDate(req.start_date)}</span></div>
                                <div className="flex justify-between font-bold"><span style={{ color:"#6e7681" }}>المدة</span><span>{req.days} يوم</span></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {/* Owner: طلبات وافق عليها مدير القسم — تنتظر الموافقة النهائية */}
                  {isOwner && (
                    <>
                      <h3 className="font-black text-lg text-indigo-600">
                        🔔 وافق عليها مدير القسم — بانتظار موافقتك النهائية ({filteredRequests.filter(r => r.status === "dept_approved").length})
                      </h3>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))", gap:"14px" }}>
                        {filteredRequests.filter(r => r.status === "dept_approved").map(req => {
                          const vacType = vacationTypes.find(vt => vt.id === req.vacation_type_id);
                          const emp = employees.find(e => e.id === req.employee_id);
                          const dept = departments.find(d => d.id === emp?.department_id);
                          return (
                            <div key={req.id} style={{ background:"#161b22", padding:"20px", borderRadius:"1.5rem", border:"1px solid #30363d" }}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"14px", cursor:"pointer" }} onClick={() => setExpandedRequestId(expandedRequestId === req.id ? null : req.id)}>
                                <div>
                                  <h4 className="font-black text-xl text-slate-800">{req.employee_name}</h4>
                                  <p className="text-xs text-indigo-600 font-bold mt-1">✅ وافق عليها: {req.dept_approved_by || dept?.name} — <span style={{color:"#818cf8", fontSize:"11px"}}>اضغط لعرض بيانات الموظف</span></p>
                                </div>
                                <div className="flex gap-2 items-center">
                                  {vacType && <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: vacType.color+'20', color: vacType.color }}>{vacType.name}</span>}
                                  <span style={{ color:"#6e7681", fontSize:"18px" }}>{expandedRequestId === req.id ? "▲" : "▼"}</span>
                                  <button onClick={(e) => { e.stopPropagation(); handleDeleteVacation(req.id); }} className="p-2 text-red-400 hover:bg-red-50 rounded-xl"><Trash2 size={16} /></button>
                                </div>
                              </div>
                              {/* بيانات الموظف عند الضغط */}
                              {expandedRequestId === req.id && (() => {
                                const empInfo = employees.find(e => e.id === req.employee_id);
                                if (!empInfo) return null;
                                const workedDaysEmp = calculateWorkedDays(empInfo.return_date);
                                const totalVacDays = requests.filter(r => r.employee_id === empInfo.id && r.status === "approved").reduce((s,r) => s + Number(r.days), 0);
                                const isBalanceSufficient = Number(empInfo.balance) >= Number(req.days);
                                return (
                                  <div style={{ background:"linear-gradient(135deg,#1c2333,#21262d)", borderRadius:"16px", padding:"16px", marginBottom:"16px", border:"1px solid #30363d" }}>
                                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"8px" }}>
                                      <div style={{ background: isBalanceSufficient ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.15)", borderRadius:"12px", padding:"10px", textAlign:"center", border: isBalanceSufficient ? "1px solid rgba(16,185,129,0.2)" : "1px solid rgba(239,68,68,0.3)" }}>
                                        <div style={{ fontSize:"20px", fontWeight:"900", color: isBalanceSufficient ? "#10b981" : "#ef4444" }}>{empInfo.balance}</div>
                                        <div style={{ fontSize:"10px", color:"#6e7681", marginTop:"2px" }}>رصيد الإجازة</div>
                                        {!isBalanceSufficient && <div style={{ fontSize:"9px", color:"#ef4444", marginTop:"2px" }}>⚠️ غير كافٍ</div>}
                                      </div>
                                      <div style={{ background:"rgba(245,158,11,0.1)", borderRadius:"12px", padding:"10px", textAlign:"center", border:"1px solid rgba(245,158,11,0.2)" }}>
                                        <div style={{ fontSize:"20px", fontWeight:"900", color:"#f59e0b" }}>{workedDaysEmp}</div>
                                        <div style={{ fontSize:"10px", color:"#6e7681", marginTop:"2px" }}>أيام العمل</div>
                                      </div>
                                      <div style={{ background:"rgba(129,140,248,0.1)", borderRadius:"12px", padding:"10px", textAlign:"center", border:"1px solid rgba(129,140,248,0.2)" }}>
                                        <div style={{ fontSize:"20px", fontWeight:"900", color:"#818cf8" }}>{totalVacDays}</div>
                                        <div style={{ fontSize:"10px", color:"#6e7681", marginTop:"2px" }}>إجمالي إجازاته</div>
                                      </div>
                                    </div>
                                    <div style={{ marginTop:"10px", display:"flex", justifyContent:"space-between", fontSize:"11px", color:"#6e7681" }}>
                                      <span>الرصيد الشهري: <b style={{color:"#6ee7b7"}}>{empInfo.monthly_balance || 0} يوم/شهر</b></span>
                                      {empInfo.email ? <span style={{color:"#818cf8"}}>📧 {empInfo.email}</span> : <span style={{color:"#f59e0b"}}>⚠️ لا يوجد بريد</span>}
                                    </div>
                                    <div style={{ marginTop:"12px", padding:"10px 14px", borderRadius:"12px", background: isBalanceSufficient && workedDaysEmp >= 30 ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.1)", border: isBalanceSufficient && workedDaysEmp >= 30 ? "1px solid rgba(16,185,129,0.3)" : "1px solid rgba(239,68,68,0.2)", textAlign:"center" }}>
                                      <div style={{ fontWeight:"900", fontSize:"14px", color: isBalanceSufficient && workedDaysEmp >= 30 ? "#10b981" : "#ef4444" }}>
                                        {isBalanceSufficient && workedDaysEmp >= 30 ? "✅ الموظف يستحق الإجازة" : !isBalanceSufficient ? "❌ الرصيد غير كافٍ" : "⚠️ أيام العمل أقل من 30 يوم"}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}
                              <div className="bg-indigo-50 p-6 rounded-2xl space-y-3 mb-6">
                                <div className="flex justify-between text-sm font-bold"><span style={{ color:"#6e7681" }}>تاريخ البداية</span><span>{formatDate(req.start_date)}</span></div>
                                <div className="flex justify-between text-sm font-bold"><span style={{ color:"#6e7681" }}>المدة</span><span>{req.days} يوم</span></div>
                                <div className="flex justify-between text-sm font-bold pt-3 border-t"><span className="text-indigo-600">تاريخ العودة</span><span className="text-indigo-600 font-black">{formatDate(getCalculatedDates(req.start_date, req.days).back)}</span></div>
                              </div>
                              {req.dept_manager_notes && <p className="text-sm text-indigo-500 italic mb-4">💬 مدير القسم: "{req.dept_manager_notes}"</p>}
                              {req.notes && <p className="text-sm text-slate-500 italic mb-4">"{req.notes}"</p>}
                              {emp?.email && <p className="text-xs text-indigo-400 mb-4 flex items-center gap-1"><Mail size={12} /> إشعار لـ {emp.email}</p>}
                              <div className="flex gap-3">
                                <button onClick={() => openApprovalModal(req, "approved")} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl font-black">✅ موافقة نهائية</button>
                                <button onClick={() => openApprovalModal(req, "rejected")} className="flex-1 bg-red-50 text-red-600 hover:bg-red-100 py-4 rounded-2xl font-black">❌ رفض</button>
                              </div>
                                <button onClick={() => { setEditDaysForm({ days: req.days, oldDays: req.days, reason: "", requestId: req.id, empName: req.employee_name }); setShowEditDaysModal(true); }}
                                  style={{ width:"100%", marginTop:"6px", padding:"10px", background:"rgba(99,102,241,0.15)", border:"1px solid rgba(99,102,241,0.3)", borderRadius:"14px", color:"#818cf8", cursor:"pointer", fontWeight:"700", fontSize:"13px" }}>
                                  ✏️ تعديل عدد الأيام
                                </button>
                            </div>
                          );
                        })}
                        {filteredRequests.filter(r => r.status === "dept_approved").length === 0 && (
                          <div className="col-span-2 py-16 text-center bg-indigo-50 rounded-[3rem] border border-dashed border-indigo-200">
                            <p className="text-indigo-300 font-bold">لا توجد طلبات بانتظار موافقتك النهائية ✅</p>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ===== CALENDAR ===== */}
              {activeTab === "calendar" && (
                <div style={{ width:"100%", boxSizing:"border-box" }} className="space-y-6">
                  <h2 style={{ fontSize:"22px", fontWeight:"900", color:"#e6edf3" }}>التقويم الشهري</h2>
                  {renderCalendar()}
                </div>
              )}

              {/* ===== REPORTS ===== */}
              {activeTab === "reports" && (
                <div style={{ width:"100%", boxSizing:"border-box" }} className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 style={{ fontSize:"22px", fontWeight:"900", color:"#e6edf3" }}>التقارير والإحصائيات</h2>
                    <button onClick={exportDetailedReport} className="bg-emerald-600 text-white px-6 py-3 rounded-2xl flex items-center gap-2 font-bold shadow-lg"><Download size={20} /> تصدير التقرير الشامل</button>
                  </div>
                  {vacationByDepartment.length > 0 && (
                    <div style={{ background:"#161b22", padding:"24px", borderRadius:"1.5rem", border:"1px solid #30363d" }}>
                      <h4 style={{ fontWeight:"900", marginBottom:"16px", display:"flex", alignItems:"center", gap:"8px", color:"#e6edf3" }}><Building2 size={20} className="text-indigo-600" /> إحصائيات الأقسام</h4>
                      <div className="grid grid-cols-3 gap-4">
                        {vacationByDepartment.map(dept => (
                          <div key={dept.name} style={{ padding:"14px", background:"#1c2333", borderRadius:"12px" }}>
                            <h5 className="font-bold text-slate-800 mb-2">{dept.name}</h5>
                            <div className="space-y-1 text-sm">
                              <div className="flex justify-between"><span style={{ color:"#8b949e" }}>عدد الموظفين:</span><span className="font-bold">{dept.employees}</span></div>
                              <div className="flex justify-between"><span style={{ color:"#8b949e" }}>عدد الإجازات:</span><span className="font-bold">{dept.count}</span></div>
                              <div className="flex justify-between"><span style={{ color:"#8b949e" }}>إجمالي الأيام:</span><span className="font-bold text-indigo-600">{dept.days}</span></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ background:"#161b22", padding:"24px", borderRadius:"1.5rem", border:"1px solid #30363d" }}>
                    <h4 style={{ fontWeight:"900", marginBottom:"16px", display:"flex", alignItems:"center", gap:"8px", color:"#e6edf3" }}><AlertCircle size={20} className="text-amber-600" /> تحذير: رصيد منخفض</h4>
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
              {activeTab === "departments" && (
                <div style={{ width:"100%", boxSizing:"border-box" }} className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 style={{ fontSize:"22px", fontWeight:"900", color:"#e6edf3" }}>إدارة الأقسام</h2>
                    <button onClick={() => setShowAddDept(true)} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl flex items-center gap-2 font-bold"><Plus size={20} /> إضافة قسم</button>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(250px, 1fr))", gap:"16px" }}>
                    {departments.map(dept => {
                      const deptEmps = employees.filter(e => e.department_id === dept.id);
                      return (
                        <div key={dept.id} style={{ background:"#161b22", padding:"24px", borderRadius:"1.5rem", border:"1px solid #30363d" }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"14px" }}>
                            <div>
                              <h4 style={{ fontWeight:"900", fontSize:"18px", color:"#e6edf3" }}>{dept.name}</h4>
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
              {activeTab === "holidays" && (
                <div style={{ width:"100%", boxSizing:"border-box" }} className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 style={{ fontSize:"22px", fontWeight:"900", color:"#e6edf3" }}>العطلات الرسمية</h2>
                    <button onClick={() => setShowAddHoliday(true)} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl flex items-center gap-2 font-bold"><Plus size={20} /> إضافة عطلة</button>
                  </div>
                  <div style={{ background:"#161b22", borderRadius:"1.5rem", border:"1px solid #30363d", overflow:"hidden" }}>
                    <table className="w-full">
                      <thead style={{ background:"#1c2333", borderBottom:"1px solid #30363d" }}>
                        <tr>
                          <th style={{ padding:"14px 16px", textAlign:"right", color:"#8b949e", fontWeight:"700" }}>اسم العطلة</th>
                          <th className="p-4 text-center">التاريخ</th>
                          <th className="p-4 text-center">متكررة سنوياً</th>
                          <th className="p-4 text-center">إجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {publicHolidays.map(holiday => (
                          <tr key={holiday.id} style={{ borderBottom:"1px solid #21262d" }}>
                            <td style={{ padding:"14px 16px", fontWeight:"700", color:"#e6edf3" }}>{holiday.name}</td>
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
                const today = new Date().toISOString().split("T")[0];
                // الموظفين في إجازة دلوقتي فعلاً
                const activeVacRequests = requests.filter(r => {
                  if (r.status !== "approved") return false;
                  const { back } = getCalculatedDates(r.start_date, r.days);
                  return r.start_date <= today && back > today;
                });
                // فلترة حسب القسم لمدير القسم
                const scopedActive = isDeptMgr
                  ? activeVacRequests.filter(r => employees.find(e => e.id === r.employee_id)?.department_id === myDeptId)
                  : activeVacRequests;
                // بحث وفلترة
                const filtered = scopedActive.filter(r => {
                  const matchSearch = !vacSearch2 || r.employee_name?.includes(vacSearch2);
                  const emp = employees.find(e => e.id === r.employee_id);
                  const matchDept = vacDeptFilter2 === "all" || emp?.department_id === vacDeptFilter2;
                  return matchSearch && matchDept;
                });
                return (
                  <div className="space-y-5">
                    {/* Header */}
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:"12px" }}>
                      <div>
                        <h2 style={{ margin:0, fontSize:"22px", fontWeight:"900" }}>🏖️ الإجازات الفعلية</h2>
                        <p style={{ margin:"4px 0 0", color:"#8b949e", fontSize:"13px" }}>الموظفون في إجازة الآن — يُشالون تلقائياً عند العودة</p>
                      </div>
                      {!isDeptMgr && (
                        <button onClick={() => setShowDirectVacModal(true)} style={{ display:"flex", alignItems:"center", gap:"8px", background:"#4f46e5", color:"white", border:"none", borderRadius:"12px", padding:"10px 20px", fontWeight:"700", cursor:"pointer", fontSize:"14px", fontFamily:"inherit" }}>
                          <Plus size={16}/> إضافة إجازة مباشرة
                        </button>
                      )}
                      {isDeptMgr && (
                        <button onClick={() => setShowDirectVacModal(true)} style={{ display:"flex", alignItems:"center", gap:"8px", background:"#4f46e5", color:"white", border:"none", borderRadius:"12px", padding:"10px 20px", fontWeight:"700", cursor:"pointer", fontSize:"14px", fontFamily:"inherit" }}>
                          <Plus size={16}/> إضافة إجازة مباشرة
                        </button>
                      )}
                    </div>

                    {/* بحث وفلترة */}
                    <div style={{ background:"#161b22", borderRadius:"16px", padding:"14px 18px", border:"1px solid #30363d", display:"flex", gap:"12px", flexWrap:"wrap", alignItems:"center" }}>
                      <div style={{ position:"relative", flex:1, minWidth:"200px" }}>
                        <Search style={{ position:"absolute", right:"12px", top:"50%", transform:"translateY(-50%)", color:"#6e7681" }} size={15}/>
                        <input
                          style={{ width:"100%", paddingRight:"36px", paddingLeft:"12px", padding:"10px 36px 10px 12px", background:"#0d1117", border:"1px solid #30363d", borderRadius:"10px", fontSize:"13px", outline:"none", boxSizing:"border-box" }}
                          placeholder="ابحث باسم الموظف..."
                          value={vacSearch2}
                          onChange={e => setVacSearch2(e.target.value)}
                        />
                      </div>
                      {!isDeptMgr && (
                        <select
                          style={{ padding:"10px 14px", background:"#0d1117", border:"1px solid #30363d", borderRadius:"10px", fontSize:"13px", outline:"none" }}
                          value={vacDeptFilter2}
                          onChange={e => setVacDeptFilter2(e.target.value)}
                        >
                          <option value="all">كل الأقسام</option>
                          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      )}
                      <div style={{ background:"rgba(99,102,241,0.1)", color:"#4f46e5", borderRadius:"10px", padding:"10px 16px", fontWeight:"700", fontSize:"13px" }}>
                        {filtered.length} موظف في إجازة
                      </div>
                    </div>

                    {/* الجدول */}
                    <div style={{ background:"#1c2333", borderRadius:"16px", border:"1px solid #30363d", overflow:"hidden" }}>
                      {filtered.length === 0 ? (
                        <div style={{ padding:"60px", textAlign:"center", color:"#6e7681" }}>
                          <CheckCircle size={48} style={{ margin:"0 auto 12px", opacity:0.3 }}/>
                          <p style={{ fontWeight:"700", fontSize:"16px" }}>لا يوجد موظفون في إجازة الآن ✅</p>
                        </div>
                      ) : (
                        <div style={{ overflowX:"auto" }}>
                          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"13px" }}>
                            <thead style={{ background:"#0d1117", borderBottom:"2px solid #e2e8f0" }}>
                              <tr>
                                {["الموظف", "القسم", "نوع الإجازة", "تاريخ البداية", "المدة", "تاريخ العودة", "الرصيد المتبقي", "إجراءات"].map(h => (
                                  <th key={h} style={{ padding:"12px 14px", textAlign:"right", fontWeight:"800", color:"#8b949e", whiteSpace:"nowrap" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {filtered.map(req => {
                                const { back } = getCalculatedDates(req.start_date, req.days);
                                const emp = employees.find(e => e.id === req.employee_id);
                                const dept = departments.find(d => d.id === emp?.department_id);
                                const vacType = vacationTypes.find(vt => vt.id === req.vacation_type_id);
                                const daysLeft = Math.ceil((new Date(back).getTime() - new Date(today).getTime()) / 86400000);
                                return (
                                  <tr key={req.id} style={{ borderBottom:"1px solid #f1f5f9" }}>
                                    <td style={{ padding:"12px 14px" }}>
                                      <div style={{ fontWeight:"700" }}>{req.employee_name}</div>
                                      <div style={{ fontSize:"11px", color:"#6e7681" }}>{emp?.code}</div>
                                    </td>
                                    <td style={{ padding:"12px 14px", color:"#8b949e" }}>{dept?.name || "-"}</td>
                                    <td style={{ padding:"12px 14px" }}>
                                      {vacType && <span style={{ padding:"3px 10px", borderRadius:"20px", fontSize:"11px", fontWeight:"700", backgroundColor: vacType.color+"20", color: vacType.color }}>{vacType.name}</span>}
                                    </td>
                                    <td style={{ padding:"12px 14px", textAlign:"center" }}>{formatDate(req.start_date)}</td>
                                    <td style={{ padding:"12px 14px", textAlign:"center", fontWeight:"700" }}>{req.days} يوم</td>
                                    <td style={{ padding:"12px 14px", textAlign:"center" }}>
                                      <div style={{ fontWeight:"700", color:"#4f46e5" }}>{formatDate(back)}</div>
                                      <div style={{ fontSize:"11px", color: daysLeft <= 2 ? "#ef4444" : "#94a3b8" }}>
                                        {daysLeft <= 0 ? "اليوم" : `بعد ${daysLeft} يوم`}
                                      </div>
                                    </td>
                                    <td style={{ padding:"12px 14px", textAlign:"center" }}>
                                      <span style={{ fontWeight:"700", color: (emp?.balance || 0) < 5 ? "#ef4444" : "#10b981" }}>{emp?.balance || 0} يوم</span>
                                    </td>
                                    <td style={{ padding:"12px 14px", textAlign:"center" }}>
                                      <div style={{ display:"flex", gap:"6px", justifyContent:"center" }}>
                                        <button onClick={() => openReturnModal(req)} style={{ background:"rgba(16,185,129,0.15)", color:"#16a34a", border:"none", borderRadius:"8px", padding:"6px 12px", fontSize:"12px", fontWeight:"700", cursor:"pointer" }}>تسجيل عودة</button>
                                        <button onClick={() => handleDeleteVacation(req.id)} style={{ background:"rgba(239,68,68,0.15)", color:"#dc2626", border:"none", borderRadius:"8px", padding:"6px 10px", fontSize:"12px", cursor:"pointer" }}><Trash2 size={13}/></button>
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
                <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", padding:"20px", zIndex:200 }} onClick={() => { setShowDirectVacModal(false); setEmpSearchDirect(""); setShowEmpDropdown(false); }}>
                  <div style={{ background:"#161b22", borderRadius:"24px", width:"100%", maxWidth:"480px", padding:"28px", boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }} dir="rtl" onClick={e => e.stopPropagation()}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"20px" }}>
                      <h3 style={{ margin:0, fontWeight:"900", fontSize:"18px" }}>➕ إضافة إجازة مباشرة</h3>
                      <button onClick={() => { setShowDirectVacModal(false); setEmpSearchDirect(""); setShowEmpDropdown(false); }} style={{ background:"#161b22", border:"none", borderRadius:"8px", padding:"6px 10px", cursor:"pointer" }}><X size={18}/></button>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
                      <div style={{ position:"relative" }}>
                        <label style={{ fontSize:"13px", fontWeight:"700", color:"#8b949e", display:"block", marginBottom:"6px" }}>الموظف *</label>
                        <div style={{ position:"relative" }}>
                          <Search style={{ position:"absolute", right:"12px", top:"50%", transform:"translateY(-50%)", color:"#6e7681" }} size={15}/>
                          <input
                            style={{ width:"100%", padding:"12px 36px 12px 12px", border:"1px solid #30363d", borderRadius:"12px", fontSize:"14px", outline:"none", background:"#0d1117", boxSizing:"border-box" }}
                            placeholder="ابحث بالاسم أو الكود..."
                            value={empSearchDirect}
                            onChange={e => { setEmpSearchDirect(e.target.value); setShowEmpDropdown(true); if(!e.target.value) { setDirectVacForm({...directVacForm, employee_id:""}); } }}
                            onFocus={() => setShowEmpDropdown(true)}
                          />
                        </div>
                        {showEmpDropdown && empSearchDirect && (() => {
                          const filtered = (isDeptMgr ? employees.filter(e => e.department_id === myDeptId) : employees)
                            .filter(e => e.name.includes(empSearchDirect) || e.code.includes(empSearchDirect))
                            .slice(0, 6);
                          return filtered.length > 0 ? (
                            <div style={{ position:"absolute", top:"100%", right:0, left:0, background:"#1c2333", border:"1px solid #30363d", borderRadius:"12px", boxShadow:"0 8px 24px rgba(0,0,0,0.12)", zIndex:300, maxHeight:"200px", overflowY:"auto", marginTop:"4px" }}>
                              {filtered.map(e => (
                                <div key={e.id}
                                  onClick={() => { setDirectVacForm({...directVacForm, employee_id: e.id}); setEmpSearchDirect(e.name + " (" + e.code + ")"); setShowEmpDropdown(false); }}
                                  style={{ padding:"10px 14px", cursor:"pointer", borderBottom:"1px solid #f1f5f9", display:"flex", justifyContent:"space-between", alignItems:"center" }}
                                  onMouseEnter={ev => ev.currentTarget.style.background="#f8fafc"}
                                  onMouseLeave={ev => ev.currentTarget.style.background="white"}
                                >
                                  <div>
                                    <div style={{ fontWeight:"700", fontSize:"13px" }}>{e.name}</div>
                                    <div style={{ fontSize:"11px", color:"#6e7681" }}>كود: {e.code}</div>
                                  </div>
                                  <span style={{ fontSize:"12px", fontWeight:"700", color:"#4f46e5" }}>رصيد: {e.balance} يوم</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ position:"absolute", top:"100%", right:0, left:0, background:"#1c2333", border:"1px solid #30363d", borderRadius:"12px", padding:"12px", textAlign:"center", color:"#6e7681", fontSize:"13px", zIndex:300, marginTop:"4px" }}>
                              لا توجد نتائج
                            </div>
                          );
                        })()}
                        {directVacForm.employee_id && (() => {
                          const emp = employees.find(e => e.id === directVacForm.employee_id);
                          return emp ? (
                            <div style={{ marginTop:"6px", background:"rgba(99,102,241,0.1)", borderRadius:"8px", padding:"8px 12px", fontSize:"12px", color:"#4f46e5", fontWeight:"700" }}>
                              ✅ {emp.name} | رصيد: {emp.balance} يوم
                            </div>
                          ) : null;
                        })()}
                      </div>
                      <div>
                        <label style={{ fontSize:"13px", fontWeight:"700", color:"#8b949e", display:"block", marginBottom:"6px" }}>نوع الإجازة *</label>
                        <select
                          style={{ width:"100%", padding:"12px", border:"1px solid #30363d", borderRadius:"12px", fontSize:"14px", outline:"none", background:"#0d1117", boxSizing:"border-box" }}
                          value={directVacForm.vacation_type_id}
                          onChange={e => setDirectVacForm({...directVacForm, vacation_type_id: e.target.value})}
                        >
                          <option value="">اختر النوع...</option>
                          {vacationTypes.map(vt => <option key={vt.id} value={vt.id}>{vt.name}</option>)}
                        </select>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" }}>
                        <div>
                          <label style={{ fontSize:"13px", fontWeight:"700", color:"#8b949e", display:"block", marginBottom:"6px" }}>تاريخ البداية *</label>
                          <input type="date" style={{ width:"100%", padding:"12px", border:"1px solid #30363d", borderRadius:"12px", fontSize:"14px", outline:"none", background:"#0d1117", boxSizing:"border-box" }} value={directVacForm.start_date} onChange={e => setDirectVacForm({...directVacForm, start_date: e.target.value})}/>
                        </div>
                        <div>
                          <label style={{ fontSize:"13px", fontWeight:"700", color:"#8b949e", display:"block", marginBottom:"6px" }}>عدد الأيام *</label>
                          <input type="number" min="1" style={{ width:"100%", padding:"12px", border:"1px solid #30363d", borderRadius:"12px", fontSize:"14px", outline:"none", background:"#0d1117", boxSizing:"border-box" }} value={directVacForm.days} onChange={e => setDirectVacForm({...directVacForm, days: Number(e.target.value)})}/>
                        </div>
                      </div>
                      {directVacForm.start_date && directVacForm.days > 0 && (
                        <div style={{ background:"rgba(99,102,241,0.1)", borderRadius:"10px", padding:"10px 14px", fontSize:"13px", color:"#4f46e5", fontWeight:"700" }}>
                          📅 تاريخ العودة: {formatDate(getCalculatedDates(directVacForm.start_date, directVacForm.days).back)}
                        </div>
                      )}
                      <div>
                        <label style={{ fontSize:"13px", fontWeight:"700", color:"#8b949e", display:"block", marginBottom:"6px" }}>ملاحظات</label>
                        <textarea style={{ width:"100%", padding:"12px", border:"1px solid #30363d", borderRadius:"12px", fontSize:"14px", outline:"none", background:"#0d1117", resize:"none", boxSizing:"border-box" }} rows={2} placeholder="ملاحظات اختيارية..." value={directVacForm.notes} onChange={e => setDirectVacForm({...directVacForm, notes: e.target.value})}/>
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
                  <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", padding:"20px", zIndex:200 }} onClick={() => setSelectedCalendarDay(null)}>
                    <div style={{ background:"#161b22", borderRadius:"24px", width:"100%", maxWidth:"480px", padding:"24px", boxShadow:"0 20px 60px rgba(0,0,0,0.2)", maxHeight:"80vh", overflow:"hidden", display:"flex", flexDirection:"column" }} onClick={e => e.stopPropagation()}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"16px" }}>
                        <div>
                          <h3 style={{ margin:0, fontWeight:"900", fontSize:"17px" }}>📅 موظفو الإجازة</h3>
                          <p style={{ margin:"2px 0 0", fontSize:"12px", color:"#8b949e" }}>{formatDate(selectedCalendarDay)} — {dayReqs.length} موظف</p>
                        </div>
                        <button onClick={() => setSelectedCalendarDay(null)} style={{ background:"#161b22", border:"none", borderRadius:"8px", padding:"6px 10px", cursor:"pointer" }}><X size={16}/></button>
                      </div>
                      <div style={{ overflowY:"auto", display:"flex", flexDirection:"column", gap:"8px" }}>
                        {dayReqs.map(req => {
                          const emp = employees.find(e => e.id === req.employee_id);
                          const dept = departments.find(d => d.id === emp?.department_id);
                          const vacType = vacationTypes.find(vt => vt.id === req.vacation_type_id);
                          const { back } = getCalculatedDates(req.start_date, req.days);
                          return (
                            <div key={req.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 14px", borderRadius:"12px", background:"#0d1117", border:"1px solid #30363d" }}>
                              <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                                <div style={{ width:"36px", height:"36px", borderRadius:"50%", background:"linear-gradient(135deg,#4f46e5,#7c3aed)", display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontWeight:"900", fontSize:"14px", flexShrink:0 }}>
                                  {req.employee_name?.charAt(0)}
                                </div>
                                <div>
                                  <div style={{ fontWeight:"700", fontSize:"13px" }}>{req.employee_name}</div>
                                  <div style={{ fontSize:"11px", color:"#6e7681" }}>{dept?.name || "-"} | {emp?.position || "-"}</div>
                                </div>
                              </div>
                              <div style={{ textAlign:"left" }}>
                                {vacType && <div style={{ padding:"2px 8px", borderRadius:"20px", fontSize:"10px", fontWeight:"700", backgroundColor:vacType.color+"20", color:vacType.color, marginBottom:"3px" }}>{vacType.name}</div>}
                                <div style={{ fontSize:"10px", color:"#6e7681" }}>عودة: {formatDate(back)}</div>
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

              {/* ===== HISTORY ===== */}
              {activeTab === "history" && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 style={{ fontSize:"22px", fontWeight:"900", color:"#e6edf3" }}>سجل الإجازات</h2>
                    <div className="flex gap-3">
                      <input style={{ padding:"10px 14px", background:"#0d1117", border:"1px solid #30363d", borderRadius:"12px", color:"#e6edf3", outline:"none" }} placeholder="بحث بالاسم..." onChange={(e) => setVacSearch(e.target.value)} />
                      <select style={{ padding:"10px 14px", background:"#0d1117", border:"1px solid #30363d", borderRadius:"12px", color:"#e6edf3", outline:"none" }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="all">كل الحالات</option>
                        <option value="approved">مقبول</option>
                        <option value="rejected">مرفوض</option>
                      </select>
                      <button onClick={() => setShowAuditLog(true)} style={{ background:"linear-gradient(135deg,#7c3aed,#6366f1)", color:"white", padding:"10px 18px", borderRadius:"12px", display:"flex", alignItems:"center", gap:"8px", fontWeight:"700", border:"none", cursor:"pointer", fontSize:"13px" }}><History size={20} /> سجل التعديلات</button>
                      <button onClick={() => { setShowBalanceLog(true); fetchBalanceLogs(); }} style={{ background:"linear-gradient(135deg,#059669,#10b981)", color:"white", padding:"10px 18px", borderRadius:"12px", display:"flex", alignItems:"center", gap:"8px", fontWeight:"700", border:"none", cursor:"pointer", fontSize:"13px" }}>💰 سجل حركات الرصيد</button>
                    </div>
                  </div>
                  <div style={{ background:"#161b22", borderRadius:"1.5rem", border:"1px solid #30363d", overflow:"hidden" }}>
                    <table className="w-full text-sm">
                      <thead style={{ background:"#1c2333", borderBottom:"1px solid #30363d", fontSize:"12px" }}>
                        <tr>
                          <th style={{ padding:"14px 16px", textAlign:"right", color:"#8b949e", fontWeight:"700" }}>الموظف</th>
                          <th style={{ padding:"14px 16px", color:"#8b949e", fontWeight:"700", textAlign:"center" }}>نوع الإجازة</th>
                          <th className="p-4 text-center">تاريخ البداية</th>
                          <th className="p-4 text-center">المدة</th>
                          <th className="p-4 text-center">تاريخ العودة المتوقع</th>
                          <th className="p-4 text-center">تاريخ العودة الفعلي</th>
                          <th className="p-4 text-center">الحالة</th>
                          <th className="p-4 text-center">ملاحظات</th>
                          <th className="p-4 text-center">إجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRequests.filter(r => r.status !== "pending").map(req => {
                          const { back } = getCalculatedDates(req.start_date, req.days);
                          const vacType = vacationTypes.find(vt => vt.id === req.vacation_type_id);
                          const today = new Date().toISOString().split("T")[0];
                          const isOnVacation = req.status === "approved" && req.start_date <= today && back > today;
                          return (
                            <tr key={req.id} style={{ borderBottom:"1px solid #21262d" }}>
                              <td style={{ padding:"14px 16px", fontWeight:"700", color:"#e6edf3" }}>{req.employee_name}</td>
                              <td style={{ padding:"14px 16px", color:"#8b949e", fontWeight:"700", textAlign:"center" }}>{vacType && <span className="px-2 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: vacType.color+'20', color: vacType.color }}>{vacType.name}</span>}</td>
                              <td className="p-4 text-center">{formatDate(req.start_date)}</td>
                              <td className="p-4 text-center font-bold">{req.days}</td>
                              <td className="p-4 text-center text-indigo-600 font-bold">{formatDate(back)}</td>
                              <td className="p-4 text-center">
                                {req.actual_return_date ? (
                                  <span className="text-green-600 font-bold">{formatDate(req.actual_return_date)}</span>
                                ) : isOnVacation ? (
                                  <button onClick={() => openReturnModal(req)} className="text-blue-600 hover:underline font-bold">تسجيل العودة</button>
                                ) : "-"}
                              </td>
                              <td className="p-4 text-center">
                                <span className={`px-3 py-1 rounded-full text-xs font-bold ${req.status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                                  {req.status === "approved" ? "مقبول" : "مرفوض"}
                                </span>
                              </td>
                              <td className="p-4 text-center">{req.admin_notes && <button className="text-blue-600" title={req.admin_notes}><MessageSquare size={16} /></button>}</td>
                              <td className="p-4 text-center">
                                <div className="flex justify-center gap-1">
                                  <button onClick={() => setEditingVac(req)} className="text-blue-500 hover:bg-blue-50 p-2 rounded-xl"><Edit3 size={16} /></button>
                                  <button onClick={() => handleDeleteVacation(req.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-xl"><Trash2 size={16} /></button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </main>

        {/* ==================== MODALS ==================== */}

        {/* Import Excel Modal */}
        {showImportModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 z-[100]" onClick={() => setShowImportModal(false)}>
            <div className="bg-transparent" dir="rtl" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between mb-8">
                <h3 className="text-2xl font-black flex items-center gap-3"><Upload className="text-emerald-600" /> استيراد من Excel</h3>
                <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-red-500"><X size={28} /></button>
              </div>
              <div className="space-y-6">
                <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
                  <h4 className="font-black text-blue-900 mb-1">الخطوة 1: تحميل النموذج</h4>
                  <p className="text-blue-600 text-sm mb-3">العناوين: الاسم الكامل، الكود الوظيفي، المنصب، البريد الإلكتروني، الرصيد الحالي، الرصيد الشهري، تاريخ التعيين، تاريخ العودة، القسم</p>
                  <button onClick={downloadExcelTemplate} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2"><FileDown size={18} /> تحميل النموذج</button>
                </div>
                <div style={{ background:"#1c2333", padding:"20px", borderRadius:"16px" }}>
                  <h4 className="font-black mb-3">الخطوة 2: رفع الملف</h4>
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploadingFile} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 disabled:opacity-50">
                    {uploadingFile ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
                    {uploadingFile ? "جاري الرفع..." : "اختر ملف"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add Employee Modal */}
        {showAddEmp && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 z-[100]" onClick={() => setShowAddEmp(false)}>
            <div style={{ background:"#161b22", padding:"32px", borderRadius:"2rem", width:"100%", maxWidth:"520px", boxShadow:"0 24px 64px rgba(0,0,0,0.5)", border:"1px solid #30363d" }} dir="rtl" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between mb-8">
                <h3 style={{ fontSize:"22px", fontWeight:"900", color:"#e6edf3" }}>إضافة موظف جديد</h3>
                <button onClick={() => setShowAddEmp(false)}><X size={28} /></button>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
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
            <div style={{ background:"#161b22", padding:"32px", borderRadius:"2rem", width:"100%", maxWidth:"520px", boxShadow:"0 24px 64px rgba(0,0,0,0.5)", border:"1px solid #30363d" }} dir="rtl" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between mb-8">
                <h3 style={{ fontSize:"22px", fontWeight:"900", color:"#e6edf3" }}>تعديل بيانات الموظف</h3>
                <button onClick={() => setEditingEmp(null)}><X size={28} /></button>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
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
          const workedDaysEmp = calculateWorkedDays(empInfo?.return_date);
          const totalVacDays = requests.filter(r => r.employee_id === empInfo?.id && r.status === "approved").reduce((s,r) => s + Number(r.days), 0);
          const isBalanceSufficient = Number(empInfo?.balance || 0) >= Number(currentRequest.days);
          return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-[100]" onClick={() => setShowApprovalModal(false)}>
            <div style={{ background:"#161b22", borderRadius:"20px", width:"100%", maxWidth:"500px", padding:"22px", border:"1px solid #30363d", maxHeight:"92vh", overflowY:"auto" }} dir="rtl" onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"18px" }}>
                <h3 style={{ margin:0, fontWeight:"900", fontSize:"18px", color:"#e6edf3" }}>
                  {currentRequest.action === "approved" ? "✅ موافقة على الطلب" : "❌ رفض الطلب"}
                </h3>
                <button onClick={() => setShowApprovalModal(false)} style={{ background:"#21262d", border:"1px solid #30363d", borderRadius:"8px", padding:"6px 10px", cursor:"pointer", color:"#8b949e" }}><X size={16}/></button>
              </div>

              {/* بطاقة الموظف الكاملة */}
              {empInfo && (
                <div style={{ background:"linear-gradient(135deg,#1c2333,#21262d)", borderRadius:"16px", padding:"16px", marginBottom:"14px", border:"1px solid #30363d" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:"12px", marginBottom:"14px" }}>
                    <div style={{ width:"46px", height:"46px", borderRadius:"50%", background:"linear-gradient(135deg,#4f46e5,#7c3aed)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:"900", fontSize:"18px", color:"white", flexShrink:0 }}>
                      {empInfo.name?.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontWeight:"900", fontSize:"15px", color:"#e6edf3" }}>{empInfo.name}</div>
                      <div style={{ fontSize:"11px", color:"#6e7681" }}>{empInfo.position || "-"} | كود: {empInfo.code || "-"}</div>
                      {empInfo.hire_date && <div style={{ fontSize:"10px", color:"#484f58" }}>تاريخ التعيين: {formatDate(empInfo.hire_date)}</div>}
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"8px" }}>
                    <div style={{ background: isBalanceSufficient ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.15)", borderRadius:"12px", padding:"10px", textAlign:"center", border: isBalanceSufficient ? "1px solid rgba(16,185,129,0.2)" : "1px solid rgba(239,68,68,0.3)" }}>
                      <div style={{ fontSize:"20px", fontWeight:"900", color: isBalanceSufficient ? "#10b981" : "#ef4444" }}>{empInfo.balance}</div>
                      <div style={{ fontSize:"10px", color:"#6e7681", marginTop:"2px" }}>رصيد الإجازة</div>
                      {!isBalanceSufficient && <div style={{ fontSize:"9px", color:"#ef4444", marginTop:"2px" }}>⚠️ غير كافٍ</div>}
                    </div>
                    <div style={{ background:"rgba(245,158,11,0.1)", borderRadius:"12px", padding:"10px", textAlign:"center", border:"1px solid rgba(245,158,11,0.2)" }}>
                      <div style={{ fontSize:"20px", fontWeight:"900", color:"#f59e0b" }}>{workedDaysEmp}</div>
                      <div style={{ fontSize:"10px", color:"#6e7681", marginTop:"2px" }}>أيام العمل</div>
                    </div>
                    <div style={{ background:"rgba(129,140,248,0.1)", borderRadius:"12px", padding:"10px", textAlign:"center", border:"1px solid rgba(129,140,248,0.2)" }}>
                      <div style={{ fontSize:"20px", fontWeight:"900", color:"#818cf8" }}>{totalVacDays}</div>
                      <div style={{ fontSize:"10px", color:"#6e7681", marginTop:"2px" }}>إجمالي إجازاته</div>
                    </div>
                  </div>
                  <div style={{ marginTop:"10px", display:"flex", justifyContent:"space-between", fontSize:"11px", color:"#6e7681" }}>
                    <span>الرصيد الشهري: <b style={{color:"#6ee7b7"}}>{empInfo.monthly_balance || 0} يوم/شهر</b></span>
                    {empInfo.email
                      ? <span style={{color:"#818cf8"}}><Mail size={11} style={{display:"inline"}}/> {empInfo.email}</span>
                      : <span style={{color:"#f59e0b"}}>⚠️ لا يوجد بريد</span>
                    }
                  </div>
                </div>
              )}

              {/* تفاصيل الطلب */}
              <div style={{ background:"#1c2333", borderRadius:"14px", padding:"14px", marginBottom:"14px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" }}>
                <div>
                  <div style={{ fontSize:"11px", color:"#6e7681", marginBottom:"3px" }}>تاريخ البداية</div>
                  <div style={{ fontWeight:"800", color:"#e6edf3" }}>{formatDate(currentRequest.start_date)}</div>
                </div>
                <div>
                  <div style={{ fontSize:"11px", color:"#6e7681", marginBottom:"3px" }}>المدة المطلوبة</div>
                  <div style={{ fontWeight:"900", color:"#fde68a", fontSize:"22px" }}>{currentRequest.days} يوم</div>
                </div>
              </div>

              {/* ملاحظات */}
              <textarea
                style={{ width:"100%", padding:"12px", background:"#0d1117", border:"1px solid #30363d", borderRadius:"12px", color:"#e6edf3", outline:"none", resize:"none", boxSizing:"border-box", fontSize:"13px", marginBottom:"12px" }}
                rows={3} placeholder="ملاحظات للموظف (اختياري)..." value={adminNotes} onChange={e => setAdminNotes(e.target.value)}
              />

              {/* زر التأكيد */}
              <button onClick={handleActionWithNotes}
                style={{ width:"100%", padding:"14px", borderRadius:"12px", fontWeight:"900", fontSize:"15px", border:"none", cursor:"pointer", color:"white", background: currentRequest.action === "approved" ? "linear-gradient(135deg,#059669,#10b981)" : "linear-gradient(135deg,#dc2626,#ef4444)" }}>
                {currentRequest.action === "approved" ? "✅ تأكيد الموافقة وإرسال الإشعار" : "❌ تأكيد الرفض وإرسال الإشعار"}
              </button>
            </div>
          </div>
          );
        })()}

        {/* Modal تعديل عدد الأيام - للمدير */}
        {showEditDaysModal && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.65)", backdropFilter:"blur(6px)", display:"flex", alignItems:"center", justifyContent:"center", padding:"16px", zIndex:200 }} onClick={() => setShowEditDaysModal(false)}>
            <div style={{ background:"#161b22", borderRadius:"20px", width:"100%", maxWidth:"400px", padding:"24px", border:"1px solid #30363d" }} dir="rtl" onClick={e => e.stopPropagation()}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"20px" }}>
                <div>
                  <h3 style={{ margin:0, fontWeight:"900", fontSize:"17px", color:"#e6edf3" }}>✏️ تعديل عدد الأيام</h3>
                  <div style={{ fontSize:"12px", color:"#8b949e", marginTop:"3px" }}>{editDaysForm.empName}</div>
                </div>
                <button onClick={() => setShowEditDaysModal(false)} style={{ background:"#21262d", border:"1px solid #30363d", borderRadius:"8px", padding:"6px 10px", cursor:"pointer", color:"#8b949e" }}><X size={16}/></button>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
                <div>
                  <label style={{ fontSize:"12px", color:"#8b949e", fontWeight:"700", display:"block", marginBottom:"6px" }}>عدد الأيام الجديد</label>
                  <input type="number" step="0.5" min="0.5"
                    style={{ width:"100%", padding:"14px", background:"#0d1117", border:"1px solid #30363d", borderRadius:"12px", color:"#e6edf3", outline:"none", boxSizing:"border-box", fontSize:"20px", fontWeight:"900", textAlign:"center" }}
                    value={editDaysForm.days} onChange={e => setEditDaysForm({...editDaysForm, days: Number(e.target.value)})}/>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:"12px", color:"#6e7681", marginTop:"6px" }}>
                    <span>كان: <b style={{color:"#8b949e"}}>{editDaysForm.oldDays} يوم</b></span>
                    <span>سيصبح: <b style={{color: editDaysForm.days > editDaysForm.oldDays ? "#ef4444" : "#10b981"}}>{editDaysForm.days} يوم</b></span>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize:"12px", color:"#8b949e", fontWeight:"700", display:"block", marginBottom:"6px" }}>سبب التعديل *</label>
                  <textarea
                    style={{ width:"100%", padding:"12px", background:"#0d1117", border:"1px solid #30363d", borderRadius:"12px", color:"#e6edf3", outline:"none", resize:"none", boxSizing:"border-box", fontSize:"13px" }}
                    rows={3} placeholder="اكتب سبب تعديل عدد الأيام..."
                    value={editDaysForm.reason} onChange={e => setEditDaysForm({...editDaysForm, reason: e.target.value})}/>
                </div>
                <button onClick={handleEditDays}
                  style={{ width:"100%", padding:"14px", background:"linear-gradient(135deg,#4f46e5,#7c3aed)", color:"white", border:"none", borderRadius:"12px", fontSize:"14px", fontWeight:"900", cursor:"pointer" }}>
                  💾 حفظ التعديل
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal طباعة ومشاركة */}
        {showPrintModal && (() => {
          const filteredReqs = requests.filter(r => {
            if (r.status !== "approved") return false;
            if (printDateFrom && r.start_date < printDateFrom) return false;
            if (printDateTo && r.start_date > printDateTo) return false;
            return true;
          });
          const allSelected = filteredReqs.length > 0 && selectedPrintRequests.length === filteredReqs.length;
          return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", backdropFilter:"blur(6px)", display:"flex", alignItems:"center", justifyContent:"center", padding:"16px", zIndex:200 }} onClick={() => setShowPrintModal(false)}>
            <div style={{ background:"#161b22", borderRadius:"20px", width:"100%", maxWidth:"580px", padding:"24px", border:"1px solid #30363d", maxHeight:"90vh", display:"flex", flexDirection:"column" }} dir="rtl" onClick={e => e.stopPropagation()}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"18px" }}>
                <h3 style={{ margin:0, fontWeight:"900", fontSize:"17px", color:"#e6edf3" }}>🖨️ طباعة ومشاركة الطلبات</h3>
                <button onClick={() => setShowPrintModal(false)} style={{ background:"#21262d", border:"1px solid #30363d", borderRadius:"8px", padding:"6px 10px", cursor:"pointer", color:"#8b949e" }}><X size={16}/></button>
              </div>

              {/* فلتر التاريخ */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px", marginBottom:"14px" }}>
                {[
                  { label:"من تاريخ", val:printDateFrom, set:setPrintDateFrom },
                  { label:"إلى تاريخ", val:printDateTo, set:setPrintDateTo },
                ].map(f => (
                  <div key={f.label}>
                    <label style={{ fontSize:"11px", color:"#8b949e", fontWeight:"700", display:"block", marginBottom:"5px" }}>{f.label}</label>
                    <input type="date" style={{ width:"100%", padding:"10px", background:"#0d1117", border:"1px solid #30363d", borderRadius:"10px", color:"#e6edf3", outline:"none", boxSizing:"border-box" }}
                      value={f.val} onChange={e => { f.set(e.target.value); setSelectedPrintRequests([]); }}/>
                  </div>
                ))}
              </div>

              {/* شريط التحديد */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"10px" }}>
                <span style={{ fontSize:"12px", color:"#8b949e" }}>{filteredReqs.length} طلب • <b style={{color:"#818cf8"}}>{selectedPrintRequests.length} محدد</b></span>
                <button onClick={() => setSelectedPrintRequests(allSelected ? [] : filteredReqs.map(r => r.id))}
                  style={{ background:"#21262d", border:"1px solid #30363d", borderRadius:"8px", padding:"5px 12px", color:"#818cf8", cursor:"pointer", fontSize:"12px", fontWeight:"700" }}>
                  {allSelected ? "إلغاء الكل" : "تحديد الكل"}
                </button>
              </div>

              {/* قائمة الطلبات */}
              <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:"6px", marginBottom:"14px" }}>
                {filteredReqs.length === 0
                  ? <div style={{ padding:"30px", textAlign:"center", color:"#484f58" }}>لا توجد طلبات مقبولة في هذه الفترة</div>
                  : filteredReqs.map(req => {
                    const isSel = selectedPrintRequests.includes(req.id);
                    const vt = vacationTypes.find(v => v.id === req.vacation_type_id);
                    const { back } = getCalculatedDates(req.start_date, req.days);
                    return (
                      <div key={req.id} onClick={() => setSelectedPrintRequests(prev => isSel ? prev.filter(id => id !== req.id) : [...prev, req.id])}
                        style={{ display:"flex", alignItems:"center", gap:"10px", padding:"10px 12px", borderRadius:"12px", border:`2px solid ${isSel ? "#4f46e5" : "#30363d"}`, background: isSel ? "rgba(79,70,229,0.1)" : "#1c2333", cursor:"pointer" }}>
                        <div style={{ width:"18px", height:"18px", borderRadius:"5px", border:`2px solid ${isSel ? "#4f46e5" : "#484f58"}`, background: isSel ? "#4f46e5" : "transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                          {isSel && <span style={{ color:"white", fontSize:"11px", lineHeight:1 }}>✓</span>}
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:"700", fontSize:"13px", color:"#e6edf3" }}>{req.employee_name}</div>
                          <div style={{ fontSize:"11px", color:"#6e7681" }}>
                            {formatDate(req.start_date)} ← {formatDate(back)} | {req.days} يوم
                            {vt && <span style={{ marginRight:"6px", padding:"1px 7px", borderRadius:"10px", backgroundColor:vt.color+"25", color:vt.color }}>{vt.name}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })
                }
              </div>

              {/* أزرار الطباعة والمشاركة */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px" }}>
                <button disabled={!selectedPrintRequests.length}
                  onClick={() => {
                    const sel = requests.filter(r => selectedPrintRequests.includes(r.id));
                    const w = window.open("", "_blank");
                    if (!w) return alert("السماح بالنوافذ المنبثقة");
                    const rows = sel.map((r,i) => {
                      const vt = vacationTypes.find(v => v.id === r.vacation_type_id);
                      const { back } = getCalculatedDates(r.start_date, r.days);
                      return `<tr style="background:${i%2?"#f9fafb":"white"}">
                        <td>${i+1}</td><td>${r.employee_name}</td>
                        <td>${vt?.name||"-"}</td><td>${formatDate(r.start_date)}</td>
                        <td>${r.days}</td><td>${formatDate(back)}</td>
                        <td style="color:#059669;font-weight:bold">✓ مقبول</td>
                      </tr>`;
                    }).join("");
                    w.document.write(`<html dir="rtl"><head><title>تقرير الإجازات</title>
                    <style>*{font-family:Arial,sans-serif} body{padding:30px} h2{color:#1e1b4b;border-bottom:3px solid #4f46e5;padding-bottom:10px} table{width:100%;border-collapse:collapse;margin-top:20px} th{background:#4f46e5;color:white;padding:12px;text-align:right} td{padding:10px;border-bottom:1px solid #e5e7eb;text-align:right} .meta{color:#6b7280;font-size:13px;margin-bottom:20px}</style>
                    </head><body>
                    <h2>📋 تقرير الإجازات المقبولة</h2>
                    <div class="meta">الفترة: ${printDateFrom||"الكل"} — ${printDateTo||"الكل"} | عدد الطلبات: ${sel.length} | تاريخ الطباعة: ${new Date().toLocaleDateString("ar-EG")}</div>
                    <table><thead><tr><th>#</th><th>الموظف</th><th>نوع الإجازة</th><th>تاريخ البداية</th><th>المدة</th><th>تاريخ العودة</th><th>الحالة</th></tr></thead>
                    <tbody>${rows}</tbody></table>
                    <script>window.onload=()=>window.print()</script>
                    </body></html>`);
                    w.document.close();
                  }}
                  style={{ padding:"13px", background:!selectedPrintRequests.length?"#21262d":"linear-gradient(135deg,#1d4ed8,#3b82f6)", color:!selectedPrintRequests.length?"#484f58":"white", border:"none", borderRadius:"12px", fontWeight:"800", cursor:!selectedPrintRequests.length?"not-allowed":"pointer", fontSize:"14px" }}>
                  🖨️ طباعة ({selectedPrintRequests.length})
                </button>
                <button disabled={!selectedPrintRequests.length}
                  onClick={async () => {
                    const sel = requests.filter(r => selectedPrintRequests.includes(r.id));
                    const text = [
                      "📋 تقرير الإجازات المقبولة",
                      "الفترة: " + (printDateFrom||"الكل") + " - " + (printDateTo||"الكل"),
                      "━━━━━━━━━━━━━━━━━━━━━━",
                      ...sel.map((r,i) => {
                        const vt = vacationTypes.find(v => v.id === r.vacation_type_id);
                        const { back } = getCalculatedDates(r.start_date, r.days);
                        return `${i+1}. ${r.employee_name}
   ${vt?.name||"-"} | ${r.days} يوم
   📅 ${formatDate(r.start_date)} ← ${formatDate(back)}`;
                      })
                    ].join("\n");
                    try {
                      if (navigator.share) {
                        await navigator.share({ title:"تقرير الإجازات", text });
                      } else {
                        await navigator.clipboard.writeText(text);
                        alert("تم نسخ التقرير - الصقه في واتساب او اي تطبيق");
                      }
                    } catch { alert("حدث خطا في المشاركة"); }
                  }}
                  style={{ padding:"13px", background:!selectedPrintRequests.length?"#21262d":"linear-gradient(135deg,#059669,#10b981)", color:!selectedPrintRequests.length?"#484f58":"white", border:"none", borderRadius:"12px", fontWeight:"800", cursor:!selectedPrintRequests.length?"not-allowed":"pointer", fontSize:"14px" }}>
                  📤 مشاركة ({selectedPrintRequests.length})
                </button>
              </div>
            </div>
          </div>
          );
        })()}

        {/* Modal تعديل الموظف لطلبه */}
        {showEmpEditModal && empEditRequest && (() => {
          const createdAt = new Date(empEditRequest.created_at || Date.now());
          const daysSince = Math.floor((Date.now() - createdAt.getTime()) / 86400000);
          const canEdit = daysSince <= 3 && empEditRequest.status === "pending";
          return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.65)", backdropFilter:"blur(6px)", display:"flex", alignItems:"center", justifyContent:"center", padding:"16px", zIndex:200 }} onClick={() => setShowEmpEditModal(false)}>
            <div style={{ background:"#161b22", borderRadius:"20px", width:"100%", maxWidth:"420px", padding:"24px", border:"1px solid #30363d" }} dir="rtl" onClick={e => e.stopPropagation()}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"16px" }}>
                <h3 style={{ margin:0, fontWeight:"900", fontSize:"17px", color:"#e6edf3" }}>✏️ تعديل طلبي</h3>
                <button onClick={() => setShowEmpEditModal(false)} style={{ background:"#21262d", border:"1px solid #30363d", borderRadius:"8px", padding:"6px 10px", cursor:"pointer", color:"#8b949e" }}><X size={16}/></button>
              </div>
              {!canEdit ? (
                <div style={{ padding:"20px", textAlign:"center", background:"rgba(239,68,68,0.1)", borderRadius:"12px", border:"1px solid rgba(239,68,68,0.2)", color:"#ef4444", fontWeight:"700" }}>
                  {daysSince > 3 ? "⏰ انتهت مهلة التعديل (3 أيام من تاريخ التقديم)" : "❌ لا يمكن تعديل طلب تمت مراجعته"}
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
                  <div style={{ background:"rgba(245,158,11,0.1)", borderRadius:"10px", padding:"10px 14px", border:"1px solid rgba(245,158,11,0.2)", fontSize:"12px", color:"#f59e0b", fontWeight:"700" }}>
                    ⏰ متبقي {Math.max(0, 3 - daysSince)} يوم للتعديل من تاريخ تقديم الطلب
                  </div>
                  <div>
                    <label style={{ fontSize:"12px", color:"#8b949e", fontWeight:"700", display:"block", marginBottom:"6px" }}>تاريخ البداية</label>
                    <input type="date" style={{ width:"100%", padding:"12px", background:"#0d1117", border:"1px solid #30363d", borderRadius:"12px", color:"#e6edf3", outline:"none", boxSizing:"border-box" }}
                      value={empEditRequest.start_date} onChange={e => setEmpEditRequest({...empEditRequest, start_date: e.target.value})}/>
                  </div>
                  <div>
                    <label style={{ fontSize:"12px", color:"#8b949e", fontWeight:"700", display:"block", marginBottom:"6px" }}>عدد الأيام</label>
                    <input type="number" step="0.5" min="0.5" style={{ width:"100%", padding:"12px", background:"#0d1117", border:"1px solid #30363d", borderRadius:"12px", color:"#e6edf3", outline:"none", boxSizing:"border-box" }}
                      value={empEditRequest.days} onChange={e => setEmpEditRequest({...empEditRequest, days: Number(e.target.value)})}/>
                  </div>
                  <div>
                    <label style={{ fontSize:"12px", color:"#8b949e", fontWeight:"700", display:"block", marginBottom:"6px" }}>نوع الإجازة</label>
                    <select style={{ width:"100%", padding:"12px", background:"#0d1117", border:"1px solid #30363d", borderRadius:"12px", color:"#e6edf3", outline:"none", boxSizing:"border-box" }}
                      value={empEditRequest.vacation_type_id||""} onChange={e => setEmpEditRequest({...empEditRequest, vacation_type_id: e.target.value})}>
                      <option value="">اختر النوع</option>
                      {vacationTypes.map(vt => <option key={vt.id} value={vt.id}>{vt.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize:"12px", color:"#8b949e", fontWeight:"700", display:"block", marginBottom:"6px" }}>ملاحظات</label>
                    <textarea style={{ width:"100%", padding:"12px", background:"#0d1117", border:"1px solid #30363d", borderRadius:"12px", color:"#e6edf3", outline:"none", resize:"none", boxSizing:"border-box" }}
                      rows={2} value={empEditRequest.notes||""} onChange={e => setEmpEditRequest({...empEditRequest, notes: e.target.value})}/>
                  </div>
                  <button onClick={handleEmpEditRequest}
                    style={{ width:"100%", padding:"14px", background:"linear-gradient(135deg,#4f46e5,#7c3aed)", color:"white", border:"none", borderRadius:"12px", fontWeight:"900", cursor:"pointer", fontSize:"14px" }}>
                    💾 حفظ التعديل
                  </button>
                </div>
              )}
            </div>
          </div>
          );
        })()}

        {/* Edit Vacation Modal */}
        {editingVac && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 z-[100]" onClick={() => setEditingVac(null)}>
            <div style={{ background:"#161b22", padding:"32px", borderRadius:"2rem", width:"100%", maxWidth:"520px", boxShadow:"0 24px 64px rgba(0,0,0,0.5)", border:"1px solid #30363d" }} dir="rtl" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between mb-8">
                <h3 style={{ fontSize:"22px", fontWeight:"900", color:"#e6edf3" }}>تعديل طلب الإجازة</h3>
                <button onClick={() => setEditingVac(null)}><X size={28} /></button>
              </div>
              <div className="space-y-5">
                <div style={{ background:"#1c2333", padding:"14px", borderRadius:"12px" }}><p style={{ fontWeight:"900", fontSize:"18px", color:"#e6edf3" }}>{editingVac.employee_name}</p></div>
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
            <div style={{ background:"#161b22", padding:"32px", borderRadius:"2rem", width:"100%", maxWidth:"520px", boxShadow:"0 24px 64px rgba(0,0,0,0.5)", border:"1px solid #30363d" }} dir="rtl" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between mb-8">
                <h3 style={{ fontSize:"22px", fontWeight:"900", color:"#e6edf3" }}>✅ تسجيل العودة من الإجازة</h3>
                <button onClick={() => setShowReturnModal(false)}><X size={28} /></button>
              </div>
              <div className="space-y-5">
                <div style={{ background:"#1c2333", padding:"20px", borderRadius:"12px" }}>
                  <p className="font-black text-lg mb-2">{returnData.employee_name}</p>
                  <div className="text-sm space-y-1">
                    <p><span style={{ color:"#8b949e" }}>بداية الإجازة:</span> <span className="font-bold">{formatDate(returnData.start_date)}</span></p>
                    <p><span style={{ color:"#8b949e" }}>المدة:</span> <span className="font-bold">{returnData.days} يوم</span></p>
                    <p><span style={{ color:"#8b949e" }}>العودة المتوقعة:</span> <span className="font-bold text-indigo-600">{formatDate(getCalculatedDates(returnData.start_date, returnData.days).back)}</span></p>
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
            <div style={{ background:"#161b22", padding:"32px", borderRadius:"2rem", width:"100%", maxWidth:"520px", boxShadow:"0 24px 64px rgba(0,0,0,0.5)", border:"1px solid #30363d" }} dir="rtl" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between mb-8">
                <h3 style={{ fontSize:"22px", fontWeight:"900", color:"#e6edf3" }}>إضافة قسم جديد</h3>
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
            <div style={{ background:"#161b22", padding:"32px", borderRadius:"2rem", width:"100%", maxWidth:"520px", boxShadow:"0 24px 64px rgba(0,0,0,0.5)", border:"1px solid #30363d" }} dir="rtl" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between mb-8">
                <h3 style={{ fontSize:"22px", fontWeight:"900", color:"#e6edf3" }}>إضافة عطلة رسمية</h3>
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
            <div className="bg-transparent" dir="rtl" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between mb-8">
                <h3 style={{ fontSize:"22px", fontWeight:"900", color:"#e6edf3" }}>📋 سجل التعديلات</h3>
                <button onClick={() => setShowAuditLog(false)}><X size={28} /></button>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
                {auditLog.map((log, idx) => (
                  <div key={idx} style={{ padding:"14px", background:"#1c2333", borderRadius:"12px", border:"1px solid #30363d" }}>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span style={{ fontWeight:"700", color:"#e6edf3" }}>{log.user_name}</span>
                        <span className="text-sm text-slate-500 mr-2">{log.action === "monthly_balance_update" ? "💰 تحديث رصيد شهري" : log.action}</span>
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
            <div className="bg-transparent" dir="rtl" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 style={{ fontSize:"22px", fontWeight:"900", color:"#e6edf3" }}>💰 سجل حركات الرصيد الشهري</h3>
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
                <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
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
        {/* زرار الـ AI العائم */}
        <button
          onClick={() => setShowAIChat(!showAIChat)}
          style={{
            position: "fixed", bottom: "32px", left: "32px", zIndex: 50,
            width: "60px", height: "60px", borderRadius: "50%",
            background: showAIChat ? "linear-gradient(135deg, #ef4444, #dc2626)" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
            border: "none", cursor: "pointer", display: "flex", alignItems: "center",
            justifyContent: "center", boxShadow: "0 8px 30px rgba(99,102,241,0.5)",
            transition: "all 0.3s ease", fontSize: "24px",
          }}
          title={showAIChat ? "إغلاق المساعد" : "فتح المساعد الذكي"}
        >
          {showAIChat ? "✕" : "🤖"}
        </button>

        {/* نافذة الـ AI Chat */}
        {showAIChat && (
          <div style={{
            position: "fixed", bottom: "104px", left: "32px", zIndex: 50,
            width: "400px", height: "560px",
            background: "#161b22", borderRadius: "24px",
            boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            display: "flex", flexDirection: "column", overflow: "hidden",
            border: "1px solid rgba(99,102,241,0.2)",
          }} dir="rtl">
            {/* Header */}
            <div style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", padding: "20px 24px", display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px" }}>🤖</div>
              <div>
                <div style={{ color: "white", fontWeight: "900", fontSize: "16px" }}>المساعد الذكي</div>
                <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "12px" }}>متصل • صلاحيات كاملة</div>
              </div>
              <button onClick={() => setAiMessages([{ role: "assistant", content: "مرحباً من جديد! كيف أساعدك؟ 🤖" }])} style={{ marginRight: "auto", background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "8px", color: "white", padding: "6px 12px", cursor: "pointer", fontSize: "11px" }}>مسح</button>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
              {aiMessages.map((msg, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-start" : "flex-end" }}>
                  <div style={{
                    maxWidth: "85%", padding: "12px 16px", borderRadius: "16px",
                    background: msg.role === "user" ? "#f1f5f9" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    color: msg.role === "user" ? "#1e293b" : "white",
                    fontSize: "13px", lineHeight: "1.7", whiteSpace: "pre-wrap",
                    borderBottomRightRadius: msg.role === "user" ? "4px" : "16px",
                    borderBottomLeftRadius: msg.role === "assistant" ? "4px" : "16px",
                  }}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {aiLoading && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <div style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", borderRadius: "16px", padding: "12px 20px", color: "white", fontSize: "20px" }}>
                    ●●●
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div style={{ padding: "16px", borderTop: "1px solid #f1f5f9", display: "flex", gap: "10px" }}>
              <input
                style={{ flex: 1, background: "#f8fafc", border: "1px solid #30363d", borderRadius: "12px", padding: "12px 16px", fontSize: "13px", outline: "none", fontFamily: "inherit", textAlign: "right" }}
                placeholder="اكتب أمرك هنا... مثال: أضف موظف اسمه محمد"
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAIMessage()}
                disabled={aiLoading}
              />
              <button
                onClick={handleAIMessage}
                disabled={aiLoading || !aiInput.trim()}
                style={{
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)", border: "none",
                  borderRadius: "12px", padding: "12px 18px", color: "white",
                  cursor: aiLoading ? "not-allowed" : "pointer", fontSize: "18px",
                  opacity: aiLoading || !aiInput.trim() ? 0.6 : 1,
                }}
              >
                ↑
              </button>
            </div>
          </div>
        )}

      </div>
    );
  }

  // ==================== EMPLOYEE VIEW ====================
  if (currentView === "employee") {
    const empStatus = getEmployeeStatus(currentUser);
    const empRequests = requests.filter(r => r.employee_id === currentUser.id);
    const approvedReqs = empRequests.filter(r => r.status === "approved");
    const totalVacDays = approvedReqs.reduce((s, r) => s + Number(r.days), 0);
    const workedDays = calculateWorkedDays(currentUser.return_date);
    const greeting = getGreeting();
    const isOnVac = empStatus === "إجازة";

    return (
      <div style={{ minHeight:"100vh", background:"#161b22", direction:"rtl", fontFamily:"inherit" }}>

        {/* ===== Header Banner ===== */}
        <div style={{
          background: isOnVac
            ? "linear-gradient(135deg,#92400e,#b45309,#d97706)"
            : "linear-gradient(135deg,#0f172a,#1e1b4b,#312e81,#4338ca)",
          padding:"28px 20px 80px", position:"relative", overflow:"hidden"
        }}>
          <div style={{ position:"absolute", top:"-40px", right:"-40px", width:"200px", height:"200px", borderRadius:"50%", background:"rgba(255,255,255,0.05)" }}/>
          <div style={{ position:"absolute", bottom:"-60px", left:"10%", width:"250px", height:"250px", borderRadius:"50%", background:"rgba(255,255,255,0.03)" }}/>
          <div style={{ position:"relative", zIndex:1 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"20px" }}>
              <div style={{ display:"inline-flex", alignItems:"center", gap:"6px", background:"rgba(255,255,255,0.12)", borderRadius:"20px", padding:"5px 12px", border:"1px solid rgba(255,255,255,0.15)" }}>
                <div style={{ width:"7px", height:"7px", borderRadius:"50%", background: isOnVac ? "#fbbf24" : "#34d399", boxShadow:`0 0 6px ${isOnVac ? "#fbbf24" : "#34d399"}` }}/>
                <span style={{ fontSize:"12px", color:"white", fontWeight:"700" }}>{isOnVac ? "🏖️ في إجازة" : "✅ في العمل"}</span>
              </div>
              <button onClick={() => { localStorage.removeItem("vms_currentUser"); localStorage.removeItem("vms_currentView"); setCurrentView("login"); setCurrentUser(null); setLoginData({ email:"", password:"" }); setEmpCodeInput(""); }}
                style={{ display:"flex", alignItems:"center", gap:"6px", background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:"20px", padding:"6px 14px", color:"#fca5a5", fontSize:"13px", fontWeight:"700", cursor:"pointer" }}>
                <LogOut size={14}/> خروج
              </button>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:"12px", marginBottom:"20px" }}>
              <div style={{ width:"52px", height:"52px", borderRadius:"50%", background:"rgba(255,255,255,0.15)", border:"2px solid rgba(255,255,255,0.25)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"22px", fontWeight:"900", color:"white", flexShrink:0 }}>
                {currentUser.name?.charAt(0)}
              </div>
              <div>
                <div style={{ fontSize:"11px", color:"rgba(255,255,255,0.5)", marginBottom:"2px" }}>{greeting.emoji} {greeting.text}</div>
                <div style={{ fontSize:"17px", fontWeight:"900", color:"white", lineHeight:"1.2" }}>{currentUser.name}</div>
                {currentUser.position && <div style={{ fontSize:"11px", color:"rgba(255,255,255,0.5)", marginTop:"2px" }}>{currentUser.position}</div>}
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:"10px" }}>
              {([
                { label:"رصيد الإجازة",          value:`${currentUser.balance}`,          unit:"يوم",      color:"#a5b4fc", icon:"💼", warn: Number(currentUser.balance) < 5 },
                { label:"رصيد شهري",              value:`+${currentUser.monthly_balance||0}`, unit:"يوم/شهر", color:"#6ee7b7", icon:"📅", warn:false },
                { label:"أيام العمل منذ العودة", value:`${workedDays}`,                   unit:"يوم",      color:"#fde68a", icon:"⚡", warn:false },
                { label:"إجمالي إجازاتي",        value:`${totalVacDays}`,                 unit:"يوم",      color:"#fca5a5", icon:"✈️", warn:false },
              ] as any[]).map((s:any) => (
                <div key={s.label} style={{ background: s.warn ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.1)", borderRadius:"16px", padding:"14px", border:`1px solid ${s.warn ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.12)"}` }}>
                  <div style={{ fontSize:"18px", marginBottom:"4px" }}>{s.icon}</div>
                  <div style={{ display:"flex", alignItems:"baseline", gap:"4px" }}>
                    <span style={{ fontSize:"28px", fontWeight:"900", color: s.warn ? "#fca5a5" : s.color, lineHeight:"1" }}>{s.value}</span>
                    <span style={{ fontSize:"11px", color:"rgba(255,255,255,0.5)" }}>{s.unit}</span>
                  </div>
                  <div style={{ fontSize:"10px", color:"rgba(255,255,255,0.5)", marginTop:"3px" }}>{s.label}</div>
                  {s.warn && <div style={{ fontSize:"9px", color:"#fca5a5", marginTop:"2px", fontWeight:"700" }}>⚠️ رصيد منخفض</div>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ===== المحتوى الرئيسي ===== */}
        <div style={{ margin:"-40px 16px 20px", position:"relative", zIndex:10, display:"flex", flexDirection:"column", gap:"16px" }}>

          {/* فورم طلب الإجازة */}
          <div style={{ background:"#161b22", borderRadius:"24px", boxShadow:"0 8px 32px rgba(0,0,0,0.1)", overflow:"hidden" }}>
            <div style={{ padding:"18px 20px", borderBottom:"1px solid #f1f5f9", display:"flex", alignItems:"center", gap:"10px" }}>
              <div style={{ width:"36px", height:"36px", borderRadius:"12px", background:"linear-gradient(135deg,#4f46e5,#7c3aed)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <Plus size={18} style={{color:"white"}}/>
              </div>
              <span style={{ fontWeight:"900", fontSize:"16px" }}>طلب إجازة جديد</span>
            </div>
            <div style={{ padding:"20px", display:"flex", flexDirection:"column", gap:"16px" }}>
              <div>
                <label style={{ fontSize:"12px", fontWeight:"700", color:"#8b949e", display:"block", marginBottom:"8px" }}>نوع الإجازة *</label>
                <select style={{ width:"100%", padding:"14px", background:"#0d1117", border:"1px solid #30363d", borderRadius:"14px", fontSize:"14px", outline:"none", boxSizing:"border-box", color:"#e6edf3" }}
                  value={newRequest.vacation_type_id} onChange={e => setNewRequest({...newRequest, vacation_type_id: e.target.value})}>
                  <option value="">اختر النوع...</option>
                  {vacationTypes.map(vt => <option key={vt.id} value={vt.id}>{vt.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:"12px", fontWeight:"700", color:"#8b949e", display:"block", marginBottom:"8px" }}>تاريخ النزول *</label>
                <input type="date" style={{ width:"100%", padding:"14px", background:"#0d1117", border:"1px solid #30363d", borderRadius:"14px", fontSize:"14px", outline:"none", boxSizing:"border-box" }}
                  value={newRequest.start_date} onChange={e => setNewRequest({...newRequest, start_date: e.target.value})}/>
              </div>
              <div>
                <label style={{ fontSize:"12px", fontWeight:"700", color:"#8b949e", display:"block", marginBottom:"8px" }}>موعد النزول</label>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"8px" }}>
                  {[
                    { value:"actual",     icon:"✅", label:"بداية الإجازة الفعلي" },
                    { value:"morning",    icon:"🌅", label:"صباحاً" },
                    { value:"after_work", icon:"🌆", label:"بعد العمل" },
                  ].map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setNewRequest({...newRequest, departure_time: opt.value})}
                      style={{ padding:"12px 6px", borderRadius:"14px", border:`2px solid ${newRequest.departure_time === opt.value ? "#6366f1" : "#30363d"}`, background: newRequest.departure_time === opt.value ? "rgba(79,70,229,0.2)" : "#1c2333", color: newRequest.departure_time === opt.value ? "#4f46e5" : "#64748b", fontWeight:"700", fontSize:"11px", cursor:"pointer", textAlign:"center", transition:"all 0.15s" }}>
                      <div style={{ fontSize:"20px", marginBottom:"4px" }}>{opt.icon}</div>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {newRequest.start_date && (
                <div style={{ background:"linear-gradient(135deg,rgba(79,70,229,0.15),rgba(99,102,241,0.1))", borderRadius:"14px", padding:"14px 16px", border:"1px solid rgba(99,102,241,0.3)" }}>
                  <div style={{ fontSize:"11px", color:"#4f46e5", fontWeight:"800", marginBottom:"10px" }}>📅 ملخص الإجازة</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
                    {([
                      { label:"تاريخ النزول",        value: formatDate(newRequest.start_date) },
                      { label:"موعد النزول",          value: getDepartureLabel(newRequest.departure_time) },
                      { label:"أول يوم إجازة فعلي",  value: formatDate(getActualStartDate(newRequest.start_date, newRequest.departure_time)), bold:true },
                      ...(newRequest.days > 0 ? [{ label:"تاريخ العودة", value: formatDate(getCalculatedDates(getActualStartDate(newRequest.start_date, newRequest.departure_time), newRequest.days).back), bold:true, green:true }] : []),
                    ] as any[]).map((item:any) => (
                      <div key={item.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <span style={{ fontSize:"12px", color:"#6d28d9" }}>{item.label}</span>
                        <span style={{ fontSize:"13px", fontWeight: item.bold ? "900" : "700", color: item.green ? "#059669" : "#3730a3" }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label style={{ fontSize:"12px", fontWeight:"700", color:"#8b949e", display:"block", marginBottom:"8px" }}>عدد الأيام</label>
                <input type="number" step="0.5" min="0.5" style={{ width:"100%", padding:"14px", background:"#0d1117", border:"1px solid #30363d", borderRadius:"14px", fontSize:"14px", outline:"none", boxSizing:"border-box" }}
                  value={newRequest.days} onChange={e => setNewRequest({...newRequest, days: Number(e.target.value)})}/>
              </div>
              <div>
                <label style={{ fontSize:"12px", fontWeight:"700", color:"#8b949e", display:"block", marginBottom:"8px" }}>ملاحظات</label>
                <textarea style={{ width:"100%", padding:"14px", background:"#0d1117", border:"1px solid #30363d", borderRadius:"14px", fontSize:"14px", outline:"none", resize:"none", boxSizing:"border-box", minHeight:"80px" }}
                  placeholder="سبب الإجازة..." value={newRequest.notes} onChange={e => setNewRequest({...newRequest, notes: e.target.value})}/>
              </div>
              <button onClick={submitVacationRequest} disabled={isSubmitting}
                style={{ width:"100%", padding:"16px", background: isSubmitting ? "#94a3b8" : "linear-gradient(135deg,#4f46e5,#7c3aed)", color:"white", border:"none", borderRadius:"14px", fontSize:"15px", fontWeight:"900", cursor: isSubmitting ? "not-allowed" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:"8px" }}>
                {isSubmitting ? <><Loader2 size={18} style={{animation:"spin 1s linear infinite"}}/> جاري الإرسال...</> : <>✈️ إرسال الطلب</>}
              </button>
            </div>
          </div>

          {/* طلباتي */}
          <div style={{ background:"#161b22", borderRadius:"24px", boxShadow:"0 4px 16px rgba(0,0,0,0.06)", overflow:"hidden" }}>
            <div style={{ padding:"18px 20px", borderBottom:"1px solid #f1f5f9", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                <div style={{ width:"36px", height:"36px", borderRadius:"12px", background:"linear-gradient(135deg,#f59e0b,#d97706)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <Clock size={18} style={{color:"white"}}/>
                </div>
                <span style={{ fontWeight:"900", fontSize:"16px" }}>طلباتي</span>
              </div>
              <span style={{ background:"#161b22", color:"#8b949e", borderRadius:"20px", padding:"3px 10px", fontSize:"12px", fontWeight:"700" }}>{empRequests.length} طلب</span>
            </div>
            <div style={{ padding:"12px", display:"flex", flexDirection:"column", gap:"10px" }}>
              {empRequests.length === 0 ? (
                <div style={{ padding:"40px", textAlign:"center", color:"#6e7681" }}>
                  <Clock size={36} style={{ margin:"0 auto 10px", opacity:0.3 }}/>
                  <p style={{ fontWeight:"700" }}>لم تقدم أي طلبات بعد</p>
                </div>
              ) : empRequests.map(req => {
                const vacType = vacationTypes.find(vt => vt.id === req.vacation_type_id);
                const { back } = getCalculatedDates(req.start_date, req.days);
                const statusConfig: Record<string,{label:string,bg:string,color:string}> = {
                  approved:      { label:"✓ مقبول",         bg:"#dcfce7", color:"#16a34a" },
                  rejected:      { label:"✗ مرفوض",         bg:"#fee2e2", color:"#dc2626" },
                  dept_approved: { label:"◑ موافقة مبدئية", bg:"#e0e7ff", color:"#4f46e5" },
                  pending:       { label:"⏳ معلق",          bg:"#fef3c7", color:"#d97706" },
                };
                const sc = statusConfig[req.status] || statusConfig.pending;
                return (
                  <div key={req.id} style={{ borderRadius:"16px", border:"1px solid #30363d", overflow:"hidden", background:"#1c2333" }}>
                    <div style={{ height:"4px", background:sc.color }}/>
                    <div style={{ padding:"14px" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"8px" }}>
                        <div>
                          <div style={{ fontWeight:"800", fontSize:"14px", color:"#e6edf3" }}>{formatDate(req.start_date)}</div>
                          <div style={{ fontSize:"11px", color:"#6e7681", marginTop:"2px" }}>{req.days} يوم • عودة {formatDate(back)}</div>
                        </div>
                        <span style={{ padding:"4px 10px", borderRadius:"20px", fontSize:"11px", fontWeight:"800", background:sc.bg, color:sc.color, whiteSpace:"nowrap" }}>{sc.label}</span>
                      </div>
                      {vacType && <span style={{ display:"inline-block", padding:"3px 10px", borderRadius:"20px", fontSize:"11px", fontWeight:"700", backgroundColor:vacType.color+"20", color:vacType.color, marginBottom:"6px" }}>{vacType.name}</span>}
                      {req.departure_time && req.departure_time !== "actual" && (
                        <div style={{ fontSize:"11px", color:"#7c3aed", fontWeight:"700", marginBottom:"4px" }}>🛫 نزول {req.departure_time === "after_work" ? "بعد العمل" : "صباحاً"}{req.departure_date ? ` (${formatDate(req.departure_date)})` : ""}</div>
                      )}
                      {req.admin_notes && (
                        <div style={{ marginTop:"8px", padding:"10px 12px", background:"rgba(59,130,246,0.1)", borderRadius:"10px", border:"1px solid #bfdbfe" }}>
                          <div style={{ fontSize:"10px", color:"#3b82f6", fontWeight:"800", marginBottom:"4px", display:"flex", alignItems:"center", gap:"4px" }}>
                            <MessageSquare size={11}/> ملاحظات الإدارة
                          </div>
                          <div style={{ fontSize:"12px", color:"#1e40af" }}>{req.admin_notes}</div>
                        </div>
                      )}
                      {req.status === "pending" && (() => {
                        const created = new Date(req.created_at || Date.now());
                        const daysOld = Math.floor((Date.now() - created.getTime()) / 86400000);
                        return daysOld <= 3 ? (
                          <button onClick={() => { setEmpEditRequest({...req}); setShowEmpEditModal(true); }}
                            style={{ marginTop:"10px", width:"100%", padding:"9px", background:"rgba(99,102,241,0.15)", border:"1px solid rgba(99,102,241,0.3)", borderRadius:"10px", color:"#818cf8", cursor:"pointer", fontWeight:"700", fontSize:"12px" }}>
                            ✏️ تعديل الطلب (متبقي {3 - daysOld} يوم)
                          </button>
                        ) : null;
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default VacationManagementSystem;
