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

// أيام العمل = من تاريخ العودة حتى اليوم فقط
const calculateWorkedDays = (returnDate: string) => {
  if (!returnDate) return 0;
  const start = new Date(returnDate);
  const today = new Date();
  if (start > today) return 0;
  const diffTime = today.getTime() - start.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
};

// ==================== MAIN COMPONENT ====================
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
  });

  const [newDept, setNewDept] = useState({ name: "", description: "" });
  const [newHoliday, setNewHoliday] = useState({ name: "", date: "", is_recurring: false });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
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
        const pendingReqs = reqs?.filter(r => r.status === "pending") || [];
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

  // ========== MONTHLY BALANCE UPDATE ==========
  useEffect(() => {
    const updateMonthlyBalances = async () => {
      const today = new Date();
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0];
      for (const emp of employees) {
        if (emp.monthly_balance > 0 && (!emp.last_balance_update || emp.last_balance_update < firstDayOfMonth)) {
          const newBalance = emp.balance + emp.monthly_balance;
          await supabase.from("employees").update({ balance: newBalance, last_balance_update: firstDayOfMonth }).eq("id", emp.id);
          await supabase.from("balance_updates").insert([{ employee_id: emp.id, amount: emp.monthly_balance, update_date: firstDayOfMonth }]);
          await logAction("monthly_balance_update", "employees", emp.id, { balance: emp.balance }, { balance: newBalance });
        }
      }
    };
    if (employees.length > 0 && currentView === "admin") updateMonthlyBalances();
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
      .filter(r => r.backDate >= today).sort((a, b) => a.backDate.localeCompare(b.backDate)).slice(0, 8);
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
    if (loginData.email === ADMIN_EMAIL && loginData.password === "Mg1996819456") {
      setCurrentUser({ role: "admin", name: "محمد جمال" });
      setCurrentView("admin");
      await logAction("login", "users", null, null, { role: "admin" });
    } else {
      const { data: emp } = await supabase.from("employees").select("*").eq("code", empCodeInput.trim()).single();
      if (emp) {
        setCurrentUser(emp);
        setCurrentView("employee");
        await logAction("login", "employees", emp.id);
      } else {
        alert("الكود الوظيفي غير صحيح ❌");
      }
    }
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      const employeesToAdd = jsonData.map((row: any) => {
        const deptName = row["القسم"] || "";
        const dept = departments.find(d => d.name === deptName);
        return {
          name: row["الاسم الكامل"] || row.name || "",
          code: String(row["الكود الوظيفي"] || row.code || ""),
          position: row["المنصب"] || row.position || "",
          email: row["البريد الإلكتروني"] || row.email || "",
          balance: Number(row["الرصيد الحالي"] || row.balance || 21),
          monthly_balance: Number(row["الرصيد الشهري"] || row.monthly_balance || 0),
          hire_date: row["تاريخ التعيين"] || row.hire_date || null,
          return_date: row["تاريخ العودة"] || row.return_date || null,
          department_id: dept?.id || null,
        };
      });
      const validEmployees = employeesToAdd.filter(emp => emp.name && emp.code);
      if (validEmployees.length === 0) { alert("لم يتم العثور على بيانات صحيحة!"); setUploadingFile(false); return; }
      const { error } = await supabase.from("employees").insert(validEmployees);
      if (!error) {
        alert(`تم إضافة ${validEmployees.length} موظف ✅`);
        setShowImportModal(false);
        fetchData();
        await logAction("bulk_import", "employees", null, null, { count: validEmployees.length });
      } else { alert("خطأ في الاستيراد: " + error.message); }
    } catch (err) { alert("خطأ في قراءة الملف"); }
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
    if (!newEmp.name || !newEmp.code) return alert("املأ البيانات الأساسية");
    const { error } = await supabase.from("employees").insert([newEmp]);
    if (!error) {
      setShowAddEmp(false);
      setNewEmp({ name: "", code: "", position: "", balance: 21, monthly_balance: 0, department_id: "", hire_date: "", return_date: "", email: "" });
      fetchData();
      await logAction("create", "employees", null, null, newEmp);
      alert("تم الإضافة ✅");
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    if (window.confirm("حذف الموظف نهائياً؟")) {
      const emp = employees.find(e => e.id === id);
      await supabase.from("vacation_requests").delete().eq("employee_id", id);
      await supabase.from("employees").delete().eq("id", id);
      await logAction("delete", "employees", id, emp);
      fetchData();
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

    if (action === "approved") {
      if (emp.balance < days) { alert("رصيد غير كافٍ!"); setShowApprovalModal(false); return; }
      await supabase.from("employees").update({ balance: emp.balance - days, status: "إجازة", return_date: null }).eq("id", emp.id);
      // إيميل في الخلفية
      if (emp.email) {
        const { back } = getCalculatedDates(currentRequest.start_date, days);
        sendEmail(EMAILJS_TEMPLATES.approved, emp.email, {
          employee_name: emp.name,
          start_date: formatDate(currentRequest.start_date),
          days: days,
          back_date: formatDate(back),
          admin_notes: adminNotes || "لا توجد ملاحظات",
          request_id: id,
        });
      }
    }

    if (action === "rejected") {
      // إيميل في الخلفية
      if (emp?.email) {
        sendEmail(EMAILJS_TEMPLATES.rejected, emp.email, {
          employee_name: emp.name,
          start_date: formatDate(currentRequest.start_date),
          admin_notes: adminNotes || "لا توجد ملاحظات",
          request_id: id,
        });
      }
    }

    await supabase.from("vacation_requests").update({ status: action, admin_notes: adminNotes || null }).eq("id", id);
    
    // ===== إشعار فوري للأدمن =====
    if (action === "approved") {
      sendLocalNotification(
        "✅ تمت الموافقة على إجازة",
        `${emp?.name} - ${currentRequest.days} يوم من ${formatDate(currentRequest.start_date)}`
      );
    } else {
      sendLocalNotification(
        "❌ تم رفض طلب إجازة",
        `${emp?.name} - ${formatDate(currentRequest.start_date)}`
      );
    }

    setShowApprovalModal(false);
    setCurrentRequest(null);
    setAdminNotes("");
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
    if (!error) {
      setEditingVac(null);
      fetchData();
      alert("تم التحديث ✅");
      await logAction("update", "vacation_requests", editingVac.id, oldData, editingVac);
    }
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
    setIsSubmitting(true);
    const { error } = await supabase.from("vacation_requests").insert([{
      employee_id: currentUser.id, employee_name: currentUser.name,
      start_date: newRequest.start_date, days: newRequest.days,
      notes: newRequest.notes, vacation_type_id: newRequest.vacation_type_id, status: "pending",
    }]);
    if (!error) {
      // أظهر التأكيد فوراً بدون انتظار الإيميل
      setNewRequest({ start_date: "", days: 1, notes: "", vacation_type_id: "" });
      setIsSubmitting(false);
      fetchData();
      alert("✅ تم إرسال طلب الإجازة بنجاح!");
      
      // إرسال الإيميل والإشعار في الخلفية (مش بيوقف الواجهة)
      sendEmail(EMAILJS_TEMPLATES.new_request_admin, ADMIN_EMAIL, {
        employee_name: currentUser.name,
        start_date: formatDate(newRequest.start_date),
        days: newRequest.days,
        notes: newRequest.notes || "لا توجد ملاحظات",
      });
      sendLocalNotification(
        "🔔 طلب إجازة جديد",
        `${currentUser.name} طلب ${newRequest.days} يوم من ${formatDate(newRequest.start_date)}`
      );
      logAction("create", "vacation_requests", null, null, newRequest);
      return;
    }
    setIsSubmitting(false);
  };

  // ========== DEPARTMENT OPERATIONS ==========
  const handleAddDepartment = async () => {
    if (!newDept.name) return alert("أدخل اسم القسم");
    const { error } = await supabase.from("departments").insert([newDept]);
    if (!error) {
      setShowAddDept(false);
      setNewDept({ name: "", description: "" });
      fetchData();
      await logAction("create", "departments", null, null, newDept);
      alert("تم إضافة القسم ✅");
    }
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
        <div key={day} className={`p-2 border rounded-lg min-h-[70px] text-sm ${isToday ? 'bg-indigo-50 border-indigo-300 font-bold' : 'border-slate-100'} ${isHoliday ? 'bg-red-50' : ''}`}>
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

  // ========== FILTERED DATA ==========
  const filteredEmployees = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return employees.filter(emp => {
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
  }, [employees, empSearch, departmentFilter, empStatusFilter, requests]);

  const filteredRequests = useMemo(() => {
    return requests.filter(req => {
      const matchSearch = req.employee_name?.includes(vacSearch);
      const matchType = vacationTypeFilter === "all" || req.vacation_type_id === vacationTypeFilter;
      const matchStatus = statusFilter === "all" || req.status === statusFilter;
      return matchSearch && matchType && matchStatus;
    });
  }, [requests, vacSearch, vacationTypeFilter, statusFilter]);

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

    // كل الموظفين بشكل مضغوط مع حالتهم الحقيقية
    const compactEmployees = employees.slice(0, 50).map(e => ({
      id: e.id,
      name: e.name,
      code: e.code,
      balance: e.balance,
      dept: departments.find(d => d.id === e.department_id)?.name || "-",
      status: onVacationIds.has(e.id) ? "إجازة" : "عمل",
    }));

    // الطلبات المعلقة + المقبولة الحالية
    const activeRequests = requests
      .filter(r => r.status === "pending" || (r.status === "approved" && r.start_date <= today))
      .slice(0, 20)
      .map(r => ({
        id: r.id,
        emp: r.employee_name,
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
قواعد: أجب بالعربي باختصار. للتنفيذ أضف في النهاية:
ACTION: {"type":"نوع","data":{...}}
الأوامر: add_employee={name,code,position,email,balance,department_id} | delete_employee={id} | update_balance={id,balance} | approve_request={id} | reject_request={id}`;

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
          model: "llama-3.1-8b-instant",
          messages: [
            { role: "system", content: systemPrompt },
            ...conversationHistory,
          ],
          max_tokens: 512,
          temperature: 0.3,
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
              <div style={{ background:"#4f46e5", borderRadius:"10px", padding:"8px", flexShrink:0 }}>
                <CalendarDays size={18} className="text-white" />
              </div>
              <div>
                <div style={{ color:"white", fontWeight:"900", fontSize:"13px", lineHeight:"1.2" }}>نظام الإجازات</div>
                <div style={{ color:"#475569", fontSize:"10px" }}>لوحة الإدارة</div>
              </div>
            </div>
          </div>

          {/* القائمة */}
          <nav style={{ flex:1, padding:"12px 10px", display:"flex", flexDirection:"column", gap:"4px", overflowY:"auto" }}>
            {[
              { id: "dashboard", label: "الرئيسية", icon: LayoutDashboard },
              { id: "employees", label: "الموظفين", icon: Users },
              { id: "requests", label: "الطلبات", icon: Clock },
              { id: "calendar", label: "التقويم", icon: Calendar },
              { id: "reports", label: "التقارير", icon: BarChart3 },
              { id: "departments", label: "الأقسام", icon: Building2 },
              { id: "holidays", label: "العطلات", icon: CalendarDays },
              { id: "history", label: "السجل", icon: History },
            ].map((item) => (
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
            <button onClick={() => setCurrentView("login")} style={{
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
          marginRight: sidebarOpen ? "220px" : "0", 
          width: sidebarOpen ? "calc(100% - 220px)" : "100%",
          transition:"all 0.3s ease", 
          padding:"16px 24px", 
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
                      {lastBackup && <span style={{ color:"#64748b", fontSize:"12px", alignSelf:"center" }}>آخر نسخة: {lastBackup}</span>}
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
                    <div style={{ background:"white", borderRadius:"20px", border:"1px solid #e2e8f0", padding:"24px", boxShadow:"0 4px 20px rgba(0,0,0,0.08)" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"16px" }}>
                        <h3 style={{ margin:0, fontWeight:"900", fontSize:"18px", display:"flex", alignItems:"center", gap:"8px" }}>
                          <Activity size={20} style={{color:"#7c3aed"}}/> التقرير التحليلي الذكي
                        </h3>
                        <button onClick={() => setShowInsights(false)} style={{ background:"#f1f5f9", border:"none", borderRadius:"8px", padding:"6px 12px", cursor:"pointer", fontWeight:"700", color:"#64748b" }}>✕ إغلاق</button>
                      </div>
                      {insightsLoading ? (
                        <div style={{ textAlign:"center", padding:"40px", color:"#7c3aed" }}>
                          <Loader2 size={36} style={{ animation:"spin 1s linear infinite", margin:"0 auto 12px" }}/>
                          <p style={{ fontWeight:"700" }}>جاري تحليل البيانات بالذكاء الاصطناعي...</p>
                        </div>
                      ) : (
                        <div style={{ whiteSpace:"pre-wrap", lineHeight:"1.8", fontSize:"14px", color:"#374151", background:"#f8fafc", padding:"20px", borderRadius:"12px" }}>
                          {aiInsights}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-4 gap-6">
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
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"16px" }}>
                    {/* نسبة الحضور */}
                    {(() => {
                      const attendRate = stats.totalEmployees > 0 ? Math.round((stats.atWorkNow / stats.totalEmployees) * 100) : 0;
                      return (
                        <div style={{ background:"white", borderRadius:"16px", padding:"20px", border:"1px solid #e2e8f0", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"12px" }}>
                            <Target size={16} style={{color:"#4f46e5"}}/>
                            <span style={{ fontSize:"12px", color:"#64748b", fontWeight:"700" }}>نسبة الحضور</span>
                          </div>
                          <div style={{ fontSize:"28px", fontWeight:"900", color:"#4f46e5" }}>{attendRate}%</div>
                          <div style={{ marginTop:"8px", height:"6px", background:"#e2e8f0", borderRadius:"3px" }}>
                            <div style={{ height:"100%", width:`${attendRate}%`, background:"linear-gradient(90deg,#4f46e5,#7c3aed)", borderRadius:"3px" }}/>
                          </div>
                        </div>
                      );
                    })()}
                    {/* إجمالي أيام الإجازات */}
                    <div style={{ background:"white", borderRadius:"16px", padding:"20px", border:"1px solid #e2e8f0", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"12px" }}>
                        <Award size={16} style={{color:"#f59e0b"}}/>
                        <span style={{ fontSize:"12px", color:"#64748b", fontWeight:"700" }}>إجمالي أيام الإجازات</span>
                      </div>
                      <div style={{ fontSize:"28px", fontWeight:"900", color:"#f59e0b" }}>{stats.totalVacationDays}</div>
                      <div style={{ fontSize:"11px", color:"#94a3b8", marginTop:"4px" }}>يوم مجموع مُوافق عليه</div>
                    </div>
                    {/* موظفين رصيدهم منخفض */}
                    {(() => {
                      const lowCount = employees.filter(e => e.balance < 5).length;
                      return (
                        <div style={{ background: lowCount > 0 ? "#fff7ed" : "white", borderRadius:"16px", padding:"20px", border:`1px solid ${lowCount > 0 ? "#fed7aa" : "#e2e8f0"}`, boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"12px" }}>
                            <Flame size={16} style={{color: lowCount > 0 ? "#ea580c" : "#64748b"}}/>
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
                        <div style={{ background:"white", borderRadius:"16px", padding:"20px", border:"1px solid #e2e8f0", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"12px" }}>
                            <Eye size={16} style={{color:"#10b981"}}/>
                            <span style={{ fontSize:"12px", color:"#64748b", fontWeight:"700" }}>معدل الموافقة</span>
                          </div>
                          <div style={{ fontSize:"28px", fontWeight:"900", color:"#10b981" }}>{rate}%</div>
                          <div style={{ fontSize:"11px", color:"#94a3b8", marginTop:"4px" }}>{approved} من {total} طلب</div>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="grid grid-cols-2 gap-8">
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
                  <div className="grid grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-[2rem] shadow-sm border col-span-2">
                      <h4 className="font-black mb-4 flex items-center gap-2"><BarChart2 size={20} className="text-indigo-600" /> الإجازات الشهرية</h4>
                      <div className="h-48 flex items-end justify-between gap-2">
                        {vacationByMonth.map((item, idx) => {
                          const maxCount = Math.max(...vacationByMonth.map(v => v.count));
                          const height = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                          return (
                            <div key={idx} className="flex-1 flex flex-col items-center">
                              <div className="w-full bg-indigo-500 rounded-t-lg transition-all hover:bg-indigo-600" style={{ height: `${height}%` }} title={`${item.month}: ${item.count}`}></div>
                              <span className="text-xs mt-2 text-slate-600">{item.month.slice(0,3)}</span>
                            </div>
                          );
                        })}
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
                </div>
              )}

              {/* ===== EMPLOYEES ===== */}
              {activeTab === "employees" && (
                <div className="space-y-5">
                  {/* شريط الأدوات */}
                  <div style={{ background:"white", borderRadius:"20px", padding:"16px 20px", border:"1px solid #e2e8f0", display:"flex", alignItems:"center", gap:"12px", flexWrap:"wrap", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
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
                    {/* فلاتر */}
                    {departments.length > 0 && (
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
                  <div style={{ background:"white", borderRadius:"20px", border:"1px solid #e2e8f0", boxShadow:"0 1px 4px rgba(0,0,0,0.05)", overflow:"hidden" }}>
                    <div style={{ overflowX:"auto", overflowY:"auto", maxHeight:"calc(100vh - 280px)" }}>
                      <table style={{ width:"100%", borderCollapse:"collapse", minWidth:"900px", fontSize:"13px" }}>
                        <thead>
                          <tr style={{ background:"#f8fafc", borderBottom:"2px solid #e2e8f0", position:"sticky", top:0, zIndex:5 }}>
                            <th style={{ padding:"14px 16px", textAlign:"right", fontWeight:"800", color:"#374151", whiteSpace:"nowrap", minWidth:"180px" }}>الاسم</th>
                            <th style={{ padding:"14px 12px", textAlign:"center", fontWeight:"800", color:"#374151", whiteSpace:"nowrap" }}>الكود</th>
                            <th style={{ padding:"14px 12px", textAlign:"right", fontWeight:"800", color:"#374151", whiteSpace:"nowrap", minWidth:"140px" }}>المنصب</th>
                            <th style={{ padding:"14px 12px", textAlign:"center", fontWeight:"800", color:"#374151", whiteSpace:"nowrap" }}>القسم</th>
                            <th style={{ padding:"14px 12px", textAlign:"center", fontWeight:"800", color:"#374151", whiteSpace:"nowrap" }}>الرصيد</th>
                            <th style={{ padding:"14px 12px", textAlign:"center", fontWeight:"800", color:"#374151", whiteSpace:"nowrap" }}>شهري</th>
                            <th style={{ padding:"14px 12px", textAlign:"center", fontWeight:"800", color:"#374151", whiteSpace:"nowrap" }}>أيام العمل</th>
                            <th style={{ padding:"14px 12px", textAlign:"center", fontWeight:"800", color:"#374151", whiteSpace:"nowrap" }}>الحالة</th>
                            <th style={{ padding:"14px 12px", textAlign:"center", fontWeight:"800", color:"#374151", whiteSpace:"nowrap" }}>إجراءات</th>
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
                                  <div style={{ fontWeight:"700", color:"#1e293b", fontSize:"13px" }}>{emp.name}</div>
                                  {emp.email && <a href={`mailto:${emp.email}`} style={{ color:"#6366f1", fontSize:"11px", textDecoration:"none" }}>{emp.email}</a>}
                                </td>
                                {/* الكود */}
                                <td style={{ padding:"12px", textAlign:"center" }}>
                                  <span style={{ fontFamily:"monospace", background:"#f1f5f9", padding:"3px 8px", borderRadius:"6px", fontSize:"12px", color:"#475569", fontWeight:"600" }}>{emp.code}</span>
                                </td>
                                {/* المنصب */}
                                <td style={{ padding:"12px", color:"#64748b", fontSize:"12px" }}>{emp.position || "-"}</td>
                                {/* القسم */}
                                <td style={{ padding:"12px", textAlign:"center" }}>
                                  {dept ? <span style={{ background:"#ede9fe", color:"#7c3aed", padding:"3px 10px", borderRadius:"20px", fontSize:"11px", fontWeight:"700" }}>{dept.name}</span> : <span style={{ color:"#cbd5e1" }}>-</span>}
                                </td>
                                {/* الرصيد */}
                                <td style={{ padding:"12px", textAlign:"center" }}>
                                  <span style={{ fontWeight:"900", fontSize:"16px", color: emp.balance < 5 ? "#dc2626" : emp.balance < 10 ? "#d97706" : "#4f46e5" }}>{emp.balance}</span>
                                  <div style={{ fontSize:"10px", color:"#94a3b8" }}>يوم</div>
                                </td>
                                {/* شهري */}
                                <td style={{ padding:"12px", textAlign:"center" }}>
                                  {emp.monthly_balance > 0
                                    ? <span style={{ background:"#dcfce7", color:"#16a34a", padding:"3px 8px", borderRadius:"20px", fontSize:"11px", fontWeight:"700" }}>+{emp.monthly_balance}</span>
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
                                    <button onClick={() => setEditingEmp(emp)} style={{ padding:"6px", background:"#eff6ff", border:"none", borderRadius:"8px", cursor:"pointer", color:"#3b82f6", display:"flex", alignItems:"center" }} title="تعديل"><Edit3 size={14} /></button>
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
                    <h2 className="text-2xl font-black">طلبات الإجازات المعلقة</h2>
                    <select className="px-4 py-3 bg-white border rounded-xl" value={vacationTypeFilter} onChange={(e) => setVacationTypeFilter(e.target.value)}>
                      <option value="all">كل الأنواع</option>
                      {vacationTypes.map(vt => <option key={vt.id} value={vt.id}>{vt.name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    {filteredRequests.filter(r => r.status === "pending").map(req => {
                      const vacType = vacationTypes.find(vt => vt.id === req.vacation_type_id);
                      return (
                        <div key={req.id} className="bg-white p-8 rounded-[2.5rem] border shadow-sm">
                          <div className="flex justify-between items-start mb-6">
                            <div>
                              <h4 className="font-black text-xl text-slate-800">{req.employee_name}</h4>
                              <p className="text-slate-400 text-sm mt-1">طلب جديد</p>
                            </div>
                            <div className="flex gap-2 items-center">
                              {vacType && <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: vacType.color+'20', color: vacType.color }}>{vacType.name}</span>}
                              <button onClick={() => setEditingVac(req)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-xl"><Edit3 size={18} /></button>
                              <button onClick={() => handleDeleteVacation(req.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-xl"><Trash2 size={18} /></button>
                            </div>
                          </div>
                          <div className="bg-slate-50 p-6 rounded-2xl space-y-3 mb-6">
                            <div className="flex justify-between text-sm font-bold"><span className="text-slate-400">تاريخ البداية</span><span className="text-slate-800">{formatDate(req.start_date)}</span></div>
                            <div className="flex justify-between text-sm font-bold"><span className="text-slate-400">المدة</span><span className="text-slate-800">{req.days} يوم</span></div>
                            <div className="flex justify-between text-sm font-bold pt-3 border-t"><span className="text-indigo-600">تاريخ العودة</span><span className="text-indigo-600 font-black">{formatDate(getCalculatedDates(req.start_date, req.days).back)}</span></div>
                          </div>
                          {req.notes && <p className="text-sm text-slate-500 italic mb-6">"{req.notes}"</p>}
                          <div className="flex gap-3">
                            <button onClick={() => openApprovalModal(req, "approved")} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl font-black">قبول</button>
                            <button onClick={() => openApprovalModal(req, "rejected")} className="flex-1 bg-red-50 text-red-600 hover:bg-red-100 py-4 rounded-2xl font-black">رفض</button>
                          </div>
                        </div>
                      );
                    })}
                    {filteredRequests.filter(r => r.status === "pending").length === 0 && (
                      <div className="col-span-2 py-32 text-center bg-white rounded-[3rem] border border-dashed">
                        <p className="text-slate-400 font-bold text-lg">لا توجد طلبات معلقة ✅</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ===== CALENDAR ===== */}
              {activeTab === "calendar" && (
                <div style={{ width:"100%", boxSizing:"border-box" }} className="space-y-6">
                  <h2 className="text-2xl font-black">التقويم الشهري</h2>
                  {renderCalendar()}
                </div>
              )}

              {/* ===== REPORTS ===== */}
              {activeTab === "reports" && (
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
              {activeTab === "departments" && (
                <div style={{ width:"100%", boxSizing:"border-box" }} className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-black">إدارة الأقسام</h2>
                    <button onClick={() => setShowAddDept(true)} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl flex items-center gap-2 font-bold"><Plus size={20} /> إضافة قسم</button>
                  </div>
                  <div className="grid grid-cols-3 gap-6">
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
              {activeTab === "holidays" && (
                <div style={{ width:"100%", boxSizing:"border-box" }} className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-black">العطلات الرسمية</h2>
                    <button onClick={() => setShowAddHoliday(true)} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl flex items-center gap-2 font-bold"><Plus size={20} /> إضافة عطلة</button>
                  </div>
                  <div className="bg-white rounded-[2rem] shadow-sm border overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-slate-50 border-b">
                        <tr>
                          <th className="p-4 text-right">اسم العطلة</th>
                          <th className="p-4 text-center">التاريخ</th>
                          <th className="p-4 text-center">متكررة سنوياً</th>
                          <th className="p-4 text-center">إجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {publicHolidays.map(holiday => (
                          <tr key={holiday.id} className="border-b hover:bg-slate-50">
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

              {/* ===== HISTORY ===== */}
              {activeTab === "history" && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-black">سجل الإجازات</h2>
                    <div className="flex gap-3">
                      <input className="px-4 py-3 bg-white border rounded-xl" placeholder="بحث بالاسم..." onChange={(e) => setVacSearch(e.target.value)} />
                      <select className="px-4 py-3 bg-white border rounded-xl" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="all">كل الحالات</option>
                        <option value="approved">مقبول</option>
                        <option value="rejected">مرفوض</option>
                      </select>
                      <button onClick={() => setShowAuditLog(true)} className="bg-purple-600 text-white px-6 py-3 rounded-xl flex items-center gap-2 font-bold"><History size={20} /> سجل التعديلات</button>
                    </div>
                  </div>
                  <div className="bg-white rounded-[2rem] shadow-sm border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b text-xs">
                        <tr>
                          <th className="p-4 text-right">الموظف</th>
                          <th className="p-4">نوع الإجازة</th>
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
                            <tr key={req.id} className="border-b hover:bg-slate-50">
                              <td className="p-4 font-bold">{req.employee_name}</td>
                              <td className="p-4">{vacType && <span className="px-2 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: vacType.color+'20', color: vacType.color }}>{vacType.name}</span>}</td>
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
            <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-2xl shadow-2xl" dir="rtl" onClick={(e) => e.stopPropagation()}>
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
                <div className="bg-slate-50 p-6 rounded-2xl">
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
                <button onClick={handleAddEmployee} className="w-full bg-indigo-600 text-white p-5 rounded-2xl font-black">💾 حفظ</button>
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

        {/* Approval Modal */}
        {showApprovalModal && currentRequest && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 z-[100]" onClick={() => setShowApprovalModal(false)}>
            <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-lg shadow-2xl" dir="rtl" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between mb-8">
                <h3 className="text-2xl font-black">{currentRequest.action === "approved" ? "✅ موافقة" : "❌ رفض"}</h3>
                <button onClick={() => setShowApprovalModal(false)}><X size={28} /></button>
              </div>
              <div className="bg-slate-50 p-6 rounded-2xl mb-6">
                <p className="font-black text-lg">{currentRequest.employee_name}</p>
                <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                  <div><p className="text-slate-500">البداية</p><p className="font-bold">{formatDate(currentRequest.start_date)}</p></div>
                  <div><p className="text-slate-500">المدة</p><p className="font-bold">{currentRequest.days} يوم</p></div>
                </div>
                {(() => { const emp = employees.find(e => e.id === currentRequest.employee_id); return emp?.email ? <p className="text-xs text-indigo-600 mt-3 flex items-center gap-1"><Mail size={12} /> سيُرسل إشعار لـ {emp.email}</p> : <p className="text-xs text-amber-600 mt-3">⚠️ الموظف ليس لديه بريد إلكتروني</p>; })()}
              </div>
              <textarea className="w-full p-4 border rounded-2xl outline-none resize-none" rows={4} placeholder="ملاحظات (اختياري)" value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} />
              <button onClick={handleActionWithNotes} className={`w-full p-5 rounded-2xl font-black mt-4 ${currentRequest.action === "approved" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}`}>
                تأكيد {currentRequest.action === "approved" ? "وإرسال الإشعار" : "وإرسال الإشعار"}
              </button>
            </div>
          </div>
        )}

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
                      <div><span className="font-bold text-slate-800">{log.user_name}</span><span className="text-sm text-slate-500 mr-2">{log.action}</span></div>
                      <span className="text-xs text-slate-400">{formatDateTime(log.created_at)}</span>
                    </div>
                    <p className="text-sm text-slate-600"><span className="font-bold">{log.table_name}</span>{log.record_id && <span> - {log.record_id}</span>}</p>
                  </div>
                ))}
              </div>
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
            background: "white", borderRadius: "24px",
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
                style={{ flex: 1, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "12px 16px", fontSize: "13px", outline: "none", fontFamily: "inherit", textAlign: "right" }}
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
    return (
      <div className="min-h-screen bg-slate-50 p-6" dir="rtl">
        <header className="max-w-4xl mx-auto flex justify-between items-center mb-10">
          <div>
            <h2 className="text-3xl font-black text-slate-800">أهلاً {currentUser.name} 👋</h2>
            <p className="text-slate-500">
              رصيدك: <span className="font-black text-indigo-600">{currentUser.balance} يوم</span>
              {currentUser.monthly_balance > 0 && <span className="mr-2 text-emerald-600 text-sm">(+{currentUser.monthly_balance} شهرياً)</span>}
            </p>
            {currentUser.hire_date && <p className="text-slate-400 text-sm">تاريخ التعيين: {formatDate(currentUser.hire_date)}</p>}
            {currentUser.return_date && (
              <p className="text-slate-400 text-sm">
                أيام العمل منذ العودة: <span className="font-bold text-purple-600">{calculateWorkedDays(currentUser.return_date)} يوم</span>
              </p>
            )}
            <span className={`inline-block mt-1 px-3 py-1 rounded-full text-xs font-black ${empStatus === "عمل" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
              {empStatus === "عمل" ? "🟢 في العمل" : "🟡 في إجازة"}
            </span>
          </div>
          <button onClick={() => setCurrentView("login")} className="text-red-500 font-bold flex items-center gap-2 hover:bg-red-50 px-4 py-2 rounded-xl">
            <LogOut size={20} /> خروج
          </button>
        </header>

        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8">
          <section className="bg-white p-8 rounded-[2.5rem] shadow-sm border">
            <h3 className="text-xl font-black mb-6 flex items-center gap-3"><Plus className="text-indigo-600" /> طلب إجازة جديد</h3>
            <div className="space-y-5">
              <div>
                <label className="text-sm font-bold text-slate-400 mb-2 block">نوع الإجازة</label>
                <select className="w-full p-4 bg-slate-50 border-none rounded-2xl outline-none" value={newRequest.vacation_type_id} onChange={(e) => setNewRequest({...newRequest, vacation_type_id: e.target.value})}>
                  <option value="">اختر النوع</option>
                  {vacationTypes.map(vt => <option key={vt.id} value={vt.id}>{vt.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-bold text-slate-400 mb-2 block">تاريخ البدء</label>
                <input type="date" className="w-full p-4 bg-slate-50 border-none rounded-2xl outline-none" value={newRequest.start_date} onChange={(e) => setNewRequest({...newRequest, start_date: e.target.value})} />
              </div>
              <div>
                <label className="text-sm font-bold text-slate-400 mb-2 block">عدد الأيام</label>
                <input type="number" step="0.5" min="0.5" className="w-full p-4 bg-slate-50 border-none rounded-2xl outline-none" value={newRequest.days} onChange={(e) => setNewRequest({...newRequest, days: Number(e.target.value)})} />
              </div>
              <div>
                <label className="text-sm font-bold text-slate-400 mb-2 block">ملاحظات</label>
                <textarea className="w-full p-4 bg-slate-50 border-none rounded-2xl outline-none h-24" placeholder="سبب الإجازة..." value={newRequest.notes} onChange={(e) => setNewRequest({...newRequest, notes: e.target.value})} />
              </div>
              <button onClick={submitVacationRequest} disabled={isSubmitting} className="w-full bg-indigo-600 text-white p-5 rounded-2xl font-black text-lg disabled:opacity-50">
                {isSubmitting ? <Loader2 className="animate-spin mx-auto" /> : "إرسال الطلب"}
              </button>
            </div>
          </section>

          <section className="space-y-6">
            <h3 className="text-xl font-black flex items-center gap-3"><Clock className="text-amber-500" /> طلباتي</h3>
            {requests.filter(r => r.employee_id === currentUser.id).map(req => {
              const vacType = vacationTypes.find(vt => vt.id === req.vacation_type_id);
              return (
                <div key={req.id} className="bg-white p-6 rounded-[2rem] shadow-sm border">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="font-bold text-slate-800">{formatDate(req.start_date)}</p>
                      <p className="text-xs text-slate-400">{req.days} يوم</p>
                      {vacType && <span className="inline-block mt-2 px-2 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: vacType.color+'20', color: vacType.color }}>{vacType.name}</span>}
                    </div>
                    <span className={`px-4 py-1.5 rounded-full text-xs font-black ${req.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : req.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                      {req.status === 'approved' ? '✓ مقبول' : req.status === 'rejected' ? '✗ مرفوض' : '⏳ معلق'}
                    </span>
                  </div>
                  {req.admin_notes && (
                    <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
                      <p className="text-xs text-blue-600 font-bold mb-1 flex items-center gap-1"><MessageSquare size={14} /> ملاحظات الإدارة:</p>
                      <p className="text-sm text-blue-900">{req.admin_notes}</p>
                    </div>
                  )}
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
    );
  }

  return null;
};

export default VacationManagementSystem;
