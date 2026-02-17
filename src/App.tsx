import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import {
  LayoutDashboard,
  Users,
  LogOut,
  Plus,
  Trash2,
  Calendar,
  CheckCircle,
  Clock,
  Search,
  Edit3,
  ShieldCheck,
  Download,
  FileSpreadsheet,
  Loader2,
  ArrowUpRight,
  CalendarDays,
  Save,
  X,
  UserPlus,
  Upload,
  Bell,
  MessageSquare,
  FileDown,
  Zap,
} from "lucide-react";

// --- إعدادات الاتصال بـ Supabase (باستخدام متغيرات البيئة لضمان نجاح الرفع) ---
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || "https://rxeminlotawcfqalxoqy.supabase.co";
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY || "sb_publishable_nExTWl7CRubKfDuiqbX1Sw_EwyMdUoX";
const supabase = createClient(supabaseUrl, supabaseKey);

// --- دوال مساعدة للتواريخ ---
const formatDate = (dateStr: string) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

const getCalculatedDates = (startDate: string, days: number) => {
  if (!startDate || !days) return { end: "", back: "" };
  const start = new Date(startDate);
  const end = new Date(startDate);
  end.setDate(start.getDate() + (Number(days) - 1));
  const back = new Date(end);
  back.setDate(end.getDate() + 1);
  return {
    end: end.toISOString().split("T")[0],
    back: back.toISOString().split("T")[0],
  };
};

const VacationManagementSystem = () => {
  // --- States ---
  const [employees, setEmployees] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [currentView, setCurrentView] = useState("login");
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Inputs & Modals
  const [empSearch, setEmpSearch] = useState("");
  const [vacSearch, setVacSearch] = useState("");
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  // New Data Forms
  const [newEmp, setNewEmp] = useState({
    name: "",
    code: "",
    position: "",
    balance: 21,
    monthly_balance: 0,
  });
  const [newRequest, setNewRequest] = useState({
    start_date: "",
    days: 1,
    notes: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- جلب البيانات ---
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: emps } = await supabase
        .from("employees")
        .select("*")
        .order("balance", { ascending: false });
      const { data: reqs } = await supabase
        .from("vacation_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (emps) setEmployees(emps);
      if (reqs) setRequests(reqs);
      
      // جلب الإشعارات للموظف الحالي
      if (currentUser && currentView === "employee") {
        const userNotifications = reqs?.filter(
          r => r.employee_id === currentUser.id && r.admin_notes && r.status !== "pending"
        ) || [];
        setNotifications(userNotifications);
      }
    } catch (err) {
      console.error("Fetch Error:", err);
    }
    setLoading(false);
  }, [currentUser, currentView]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- التحديث الشهري التلقائي للرصيد ---
  useEffect(() => {
    const updateMonthlyBalances = async () => {
      const today = new Date();
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
        .toISOString()
        .split("T")[0];

      for (const emp of employees) {
        if (emp.monthly_balance > 0) {
          // التحقق من آخر تحديث
          if (!emp.last_balance_update || emp.last_balance_update < firstDayOfMonth) {
            // إضافة الرصيد الشهري
            const newBalance = emp.balance + emp.monthly_balance;
            
            await supabase
              .from("employees")
              .update({
                balance: newBalance,
                last_balance_update: firstDayOfMonth,
              })
              .eq("id", emp.id);

            // تسجيل التحديث
            await supabase.from("balance_updates").insert([
              {
                employee_id: emp.id,
                amount: emp.monthly_balance,
                update_date: firstDayOfMonth,
              },
            ]);
          }
        }
      }
    };

    if (employees.length > 0 && currentView === "admin") {
      updateMonthlyBalances();
    }
  }, [employees, currentView]);

  // --- التحليلات (Analytics) ---
  const topBalances = useMemo(() => [...employees].slice(0, 5), [employees]);

  const comingBackSoon = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return requests
      .filter((r) => r.status === "approved")
      .map((r) => ({
        ...r,
        backDate: getCalculatedDates(r.start_date, r.days).back,
      }))
      .filter((r) => r.backDate >= today)
      .sort((a, b) => a.backDate.localeCompare(b.backDate))
      .slice(0, 5);
  }, [requests]);

  // --- التعامل مع الدخول ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      loginData.email === "mohamedgamal199681945@gmail.com" &&
      loginData.password === "Mg1996819456"
    ) {
      setCurrentUser({ role: "admin", name: "محمد جمال" });
      setCurrentView("admin");
    } else {
      const { data: emp } = await supabase
        .from("employees")
        .select("*")
        .eq("code", empCodeInput.trim())
        .single();
      if (emp) {
        setCurrentUser(emp);
        setCurrentView("employee");
      } else {
        alert("الكود الوظيفي غير صحيح ❌");
      }
    }
  };

  // --- تحميل نموذج Excel ---
  const downloadExcelTemplate = () => {
    const template = [
      {
        "الاسم الكامل": "محمد أحمد علي",
        "الكود الوظيفي": "1001",
        "المنصب": "محاسب",
        "الرصيد الحالي": 21,
        "الرصيد الشهري": 2,
      },
      {
        "الاسم الكامل": "فاطمة حسن",
        "الكود الوظيفي": "1002",
        "المنصب": "مهندسة",
        "الرصيد الحالي": 21,
        "الرصيد الشهري": 2,
      },
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "نموذج الموظفين");
    XLSX.writeFile(wb, "نموذج_استيراد_الموظفين.xlsx");
  };

  // --- استيراد الموظفين من Excel ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const employeesToAdd = jsonData.map((row: any) => ({
        name: row["الاسم الكامل"] || row.name || "",
        code: String(row["الكود الوظيفي"] || row.code || ""),
        position: row["المنصب"] || row.position || "",
        balance: Number(row["الرصيد الحالي"] || row.balance || 21),
        monthly_balance: Number(row["الرصيد الشهري"] || row.monthly_balance || 0),
      }));

      // التحقق من البيانات
      const validEmployees = employeesToAdd.filter(
        (emp) => emp.name && emp.code
      );

      if (validEmployees.length === 0) {
        alert("لم يتم العثور على بيانات صحيحة في الملف!");
        setUploadingFile(false);
        return;
      }

      // إضافة الموظفين
      const { error } = await supabase
        .from("employees")
        .insert(validEmployees);

      if (error) {
        console.error("Import Error:", error);
        alert("حدث خطأ أثناء الاستيراد. تأكد من عدم تكرار الأكواد الوظيفية.");
      } else {
        alert(`تم إضافة ${validEmployees.length} موظف بنجاح! ✅`);
        setShowImportModal(false);
        fetchData();
      }
    } catch (err) {
      console.error("File processing error:", err);
      alert("حدث خطأ في قراءة الملف. تأكد من صحة التنسيق.");
    }
    setUploadingFile(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // --- عمليات الموظفين (Admin) ---
  const handleAddEmployee = async () => {
    if (!newEmp.name || !newEmp.code)
      return alert("يرجى ملء البيانات الأساسية");
    const { error } = await supabase.from("employees").insert([newEmp]);
    if (!error) {
      setShowAddEmp(false);
      setNewEmp({ name: "", code: "", position: "", balance: 21, monthly_balance: 0 });
      fetchData();
    }
  };

  const handleDeleteEmployee = async (id: number) => {
    if (window.confirm("هل أنت متأكد من حذف هذا الموظف نهائياً؟")) {
      await supabase.from("employees").delete().eq("id", id);
      fetchData();
    }
  };

  const handleUpdateEmployee = async () => {
    const { error } = await supabase
      .from("employees")
      .update(editingEmp)
      .eq("id", editingEmp.id);
    if (!error) {
      setEditingEmp(null);
      fetchData();
    }
  };

  // --- عمليات الإجازات (Admin) مع الملاحظات ---
  const openApprovalModal = (req: any, action: "approved" | "rejected") => {
    setCurrentRequest({ ...req, action });
    setAdminNotes("");
    setShowApprovalModal(true);
  };

  const handleActionWithNotes = async () => {
    if (!currentRequest) return;
    
    const { id, action, employee_id, days } = currentRequest;
    
    if (action === "approved") {
      const emp = employees.find((e) => e.id === employee_id);
      if (emp.balance < days) {
        alert("رصيد الموظف غير كافٍ!");
        setShowApprovalModal(false);
        return;
      }
      await supabase
        .from("employees")
        .update({ balance: emp.balance - days })
        .eq("id", emp.id);
    }
    
    await supabase
      .from("vacation_requests")
      .update({ 
        status: action,
        admin_notes: adminNotes || null
      })
      .eq("id", id);
    
    setShowApprovalModal(false);
    setCurrentRequest(null);
    setAdminNotes("");
    fetchData();
  };

  const handleUpdateVacation = async () => {
    const { error } = await supabase
      .from("vacation_requests")
      .update({
        start_date: editingVac.start_date,
        days: editingVac.days,
        notes: editingVac.notes,
      })
      .eq("id", editingVac.id);
    if (!error) {
      setEditingVac(null);
      fetchData();
      alert("تم تحديث بيانات الإجازة ✅");
    }
  };

  // --- بوابة الموظف (Employee Logic) ---
  const submitVacationRequest = async () => {
    if (!newRequest.start_date) return alert("يرجى تحديد تاريخ البداية");
    setIsSubmitting(true);
    const { error } = await supabase.from("vacation_requests").insert([
      {
        employee_id: currentUser.id,
        employee_name: currentUser.name,
        start_date: newRequest.start_date,
        days: newRequest.days,
        notes: newRequest.notes,
        status: "pending",
      },
    ]);
    if (!error) {
      setNewRequest({ start_date: "", days: 1, notes: "" });
      fetchData();
      alert("تم إرسال طلبك بنجاح");
    }
    setIsSubmitting(false);
  };

  // --- تصدير واستيراد ---
  const exportToExcel = (data: any[], fileName: string) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "البيانات");
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  };

  // --- واجهة تسجيل الدخول ---
  if (currentView === "login")
    return (
      <div
        className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-right"
        dir="rtl"
      >
        <div className="w-full max-w-4xl grid md:grid-cols-2 rounded-[2.5rem] overflow-hidden shadow-2xl border border-slate-800">
          <div className="p-12 bg-slate-900 border-l border-slate-800">
            <Users className="text-indigo-500 mb-6" size={48} />
            <h2 className="text-3xl font-bold text-white mb-8">
              دخول الموظفين
            </h2>
            <input
              className="w-full bg-slate-800 p-4 rounded-2xl text-white mb-4 outline-none border border-slate-700 focus:border-indigo-500 transition-all"
              placeholder="أدخل الكود الوظيفي"
              value={empCodeInput}
              onChange={(e) => setEmpCodeInput(e.target.value)}
            />
            <button
              onClick={handleLogin}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-2xl font-bold text-lg shadow-lg shadow-indigo-900/20"
            >
              دخول سريع
            </button>
          </div>
          <div className="p-12 bg-slate-950">
            <ShieldCheck className="text-emerald-500 mb-6" size={48} />
            <h2 className="text-3xl font-bold text-white mb-8">لوحة الإدارة</h2>
            <input
              className="w-full bg-slate-900 p-4 rounded-2xl text-white mb-4 border border-slate-800 outline-none focus:border-emerald-500"
              placeholder="البريد الإلكتروني"
              onChange={(e) =>
                setLoginData({ ...loginData, email: e.target.value })
              }
            />
            <input
              type="password"
              className="w-full bg-slate-900 p-4 rounded-2xl text-white mb-6 border border-slate-800 outline-none focus:border-emerald-500"
              placeholder="كلمة المرور"
              onChange={(e) =>
                setLoginData({ ...loginData, password: e.target.value })
              }
            />
            <button
              onClick={handleLogin}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white p-4 rounded-2xl font-bold text-lg shadow-lg shadow-emerald-900/20"
            >
              تسجيل دخول المدير
            </button>
          </div>
        </div>
      </div>
    );

  // --- واجهة المدير (Admin) ---
  if (currentView === "admin")
    return (
      <div
        className="min-h-screen bg-slate-50 flex text-right font-sans"
        dir="rtl"
      >
        {/* Sidebar */}
        <aside className="w-72 bg-slate-900 text-slate-300 fixed h-full p-6 flex flex-col shadow-2xl z-20">
          <div className="mb-10 text-center">
            <div className="bg-indigo-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/30">
              <CalendarDays className="text-white" size={32} />
            </div>
            <h1 className="text-white font-black text-xl tracking-tight">
              نظام إدارة الإجازات
            </h1>
            <p className="text-slate-500 text-xs mt-1 uppercase tracking-widest">
              المؤسسة الاحترافية
            </p>
          </div>

          <nav className="flex-1 space-y-2">
            {[
              { id: "dashboard", label: "الرئيسية", icon: LayoutDashboard },
              { id: "employees", label: "شؤون الموظفين", icon: Users },
              { id: "requests", label: "طلبات الانتظار", icon: Clock },
              { id: "history", label: "سجل الإجازات", icon: FileSpreadsheet },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all duration-200 ${
                  activeTab === item.id
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/40"
                    : "hover:bg-slate-800 hover:text-white"
                }`}
              >
                <item.icon size={22} />
                <span className="font-bold">{item.label}</span>
              </button>
            ))}
          </nav>

          <button
            onClick={() => setCurrentView("login")}
            className="p-4 text-red-400 hover:bg-red-500/10 rounded-2xl flex items-center gap-4 transition-all mt-auto border border-red-500/20"
          >
            <LogOut size={22} />
            <span className="font-bold">تسجيل الخروج</span>
          </button>
        </aside>

        {/* Main Area */}
        <main className="mr-72 p-10 w-full overflow-x-hidden">
          {/* TAB: DASHBOARD */}
          {activeTab === "dashboard" && (
            <div className="space-y-10 animate-in fade-in duration-500">
              <header className="flex justify-between items-end">
                <div>
                  <h2 className="text-3xl font-black text-slate-800">
                    أهلاً بك، {currentUser.name} 👋
                  </h2>
                  <p className="text-slate-500 mt-1">
                    إليك ملخص حالة العمل اليوم في المؤسسة.
                  </p>
                </div>
              </header>

              <div className="grid grid-cols-3 gap-8">
                <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 flex items-center gap-6">
                  <div className="p-5 bg-blue-50 text-blue-600 rounded-[1.5rem]">
                    <Users size={32} />
                  </div>
                  <div>
                    <p className="text-slate-500 font-bold mb-1">
                      القوة البشرية
                    </p>
                    <h3 className="text-4xl font-black">{employees.length}</h3>
                  </div>
                </div>
                <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 flex items-center gap-6">
                  <div className="p-5 bg-amber-50 text-amber-600 rounded-[1.5rem]">
                    <Clock size={32} />
                  </div>
                  <div>
                    <p className="text-slate-500 font-bold mb-1">
                      بانتظار القرار
                    </p>
                    <h3 className="text-4xl font-black text-amber-600">
                      {requests.filter((r) => r.status === "pending").length}
                    </h3>
                  </div>
                </div>
                <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 flex items-center gap-6">
                  <div className="p-5 bg-emerald-50 text-emerald-600 rounded-[1.5rem]">
                    <CheckCircle size={32} />
                  </div>
                  <div>
                    <p className="text-slate-500 font-bold mb-1">
                      في إجازة حالياً
                    </p>
                    <h3 className="text-4xl font-black text-emerald-600">
                      {comingBackSoon.length}
                    </h3>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-10">
                {/* الأكثر رصيداً */}
                <section className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
                  <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                    <h4 className="font-black text-slate-800 flex items-center gap-3">
                      <ArrowUpRight className="text-indigo-600" /> الأكثر رصيداً
                      للأيام
                    </h4>
                  </div>
                  <div className="p-4">
                    <table className="w-full">
                      <thead>
                        <tr className="text-slate-400 text-sm">
                          <th className="p-4 text-right">الموظف</th>
                          <th className="p-4 text-center">الرصيد المتبقي</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topBalances.map((emp) => (
                          <tr
                            key={emp.id}
                            className="border-t border-slate-50 group hover:bg-slate-50 transition-all"
                          >
                            <td className="p-5 font-bold text-slate-700">
                              {emp.name}
                            </td>
                            <td className="p-5 text-center">
                              <span className="bg-indigo-100 text-indigo-700 px-4 py-1.5 rounded-full font-black text-sm">
                                {emp.balance} يوم
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* أقرب عودة */}
                <section className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
                  <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                    <h4 className="font-black text-slate-800 flex items-center gap-3">
                      <Calendar className="text-emerald-600" /> أقرب مواعيد
                      العودة
                    </h4>
                  </div>
                  <div className="p-4">
                    <table className="w-full">
                      <thead>
                        <tr className="text-slate-400 text-sm">
                          <th className="p-4 text-right">الموظف</th>
                          <th className="p-4 text-center">يوم العودة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comingBackSoon.map((req) => (
                          <tr
                            key={req.id}
                            className="border-t border-slate-50 hover:bg-slate-50 transition-all"
                          >
                            <td className="p-5 font-bold text-slate-700">
                              {req.employee_name}
                            </td>
                            <td className="p-5 text-center font-black text-emerald-600">
                              {formatDate(req.backDate)}
                            </td>
                          </tr>
                        ))}
                        {comingBackSoon.length === 0 && (
                          <tr>
                            <td
                              colSpan={2}
                              className="p-16 text-center text-slate-400 font-bold"
                            >
                              لا يوجد أحد في إجازة حالياً
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            </div>
          )}

          {/* TAB: EMPLOYEES */}
          {activeTab === "employees" && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
              <div className="flex justify-between items-center">
                <div className="relative w-1/2">
                  <Search
                    className="absolute right-4 top-3.5 text-slate-400"
                    size={20}
                  />
                  <input
                    className="w-full pr-12 p-3.5 bg-white border border-slate-200 rounded-2xl shadow-sm outline-none focus:ring-4 ring-indigo-500/5 transition-all"
                    placeholder="ابحث بالاسم، الكود، أو المنصب..."
                    value={empSearch}
                    onChange={(e) => setEmpSearch(e.target.value)}
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3.5 rounded-2xl flex items-center gap-2 font-black shadow-lg shadow-emerald-200"
                  >
                    <Upload size={20} /> استيراد من Excel
                  </button>
                  <button
                    onClick={() => setShowAddEmp(true)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3.5 rounded-2xl flex items-center gap-2 font-black shadow-lg shadow-indigo-200"
                  >
                    <UserPlus size={20} /> إضافة موظف
                  </button>
                  <button
                    onClick={() => exportToExcel(employees, "قائمة_الموظفين")}
                    className="bg-slate-800 hover:bg-slate-900 text-white px-6 py-3.5 rounded-2xl flex items-center gap-2 font-black"
                  >
                    <Download size={20} /> تصدير
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
                <table className="w-full text-right">
                  <thead className="bg-slate-50 text-slate-500 border-b uppercase text-xs tracking-wider">
                    <tr>
                      <th className="p-6">الاسم الكامل</th>
                      <th className="p-6">كود الموظف</th>
                      <th className="p-6">المنصب</th>
                      <th className="p-6 text-center">الرصيد الحالي</th>
                      <th className="p-6 text-center">الرصيد الشهري</th>
                      <th className="p-6 text-center">التحكم</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {employees
                      .filter(
                        (e) =>
                          e.name.includes(empSearch) ||
                          e.code.includes(empSearch)
                      )
                      .map((emp) => (
                        <tr
                          key={emp.id}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="p-6 font-black text-slate-800">
                            {emp.name}
                          </td>
                          <td className="p-6 font-mono text-slate-500 text-sm">
                            {emp.code}
                          </td>
                          <td className="p-6 text-slate-600 font-medium">
                            {emp.position}
                          </td>
                          <td className="p-6 text-center">
                            <span className="font-black text-indigo-600 text-lg">
                              {emp.balance}
                            </span>
                          </td>
                          <td className="p-6 text-center">
                            <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full font-bold text-sm flex items-center justify-center gap-1 w-fit mx-auto">
                              <Zap size={14} />
                              {emp.monthly_balance || 0}
                            </span>
                          </td>
                          <td className="p-6 text-center">
                            <div className="flex justify-center gap-2">
                              <button
                                onClick={() => setEditingEmp(emp)}
                                className="p-2.5 text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                              >
                                <Edit3 size={18} />
                              </button>
                              <button
                                onClick={() => handleDeleteEmployee(emp.id)}
                                className="p-2.5 text-red-500 hover:bg-red-50 rounded-xl transition-all"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: REQUESTS */}
          {activeTab === "requests" && (
            <div className="grid grid-cols-2 gap-6 animate-in fade-in duration-500">
              {requests
                .filter((r) => r.status === "pending")
                .map((req) => (
                  <div
                    key={req.id}
                    className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-all"
                  >
                    <div>
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <h4 className="font-black text-xl text-slate-800">
                            {req.employee_name}
                          </h4>
                          <p className="text-slate-400 text-sm mt-1">
                            طلب إجازة جديد
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingVac(req)}
                            className="p-2 text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                            title="تعديل الطلب"
                          >
                            <Edit3 size={18} />
                          </button>
                          <span className="bg-amber-100 text-amber-700 px-4 py-1.5 rounded-full text-xs font-black">
                            قيد المراجعة
                          </span>
                        </div>
                      </div>
                      <div className="bg-slate-50 p-6 rounded-2xl space-y-3 mb-8">
                        <div className="flex justify-between text-sm font-bold">
                          <span className="text-slate-400">تاريخ البداية</span>
                          <span className="text-slate-800">
                            {formatDate(req.start_date)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm font-bold">
                          <span className="text-slate-400">المدة المطلوبة</span>
                          <span className="text-slate-800">{req.days} يوم</span>
                        </div>
                        <div className="flex justify-between text-sm font-bold pt-3 border-t">
                          <span className="text-indigo-600">
                            موعد العودة التقريبي
                          </span>
                          <span className="text-indigo-600 font-black">
                            {formatDate(
                              getCalculatedDates(req.start_date, req.days).back
                            )}
                          </span>
                        </div>
                      </div>
                      {req.notes && (
                        <p className="text-sm text-slate-500 italic mb-6">
                          " {req.notes} "
                        </p>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => openApprovalModal(req, "approved")}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl font-black transition-all shadow-lg shadow-emerald-100"
                      >
                        قبول الإجازة
                      </button>
                      <button
                        onClick={() => openApprovalModal(req, "rejected")}
                        className="flex-1 bg-red-50 text-red-600 hover:bg-red-100 py-4 rounded-2xl font-black transition-all"
                      >
                        رفض
                      </button>
                    </div>
                  </div>
                ))}
              {requests.filter((r) => r.status === "pending").length === 0 && (
                <div className="col-span-2 py-32 text-center bg-white rounded-[3rem] border border-dashed border-slate-200">
                  <p className="text-slate-400 font-bold text-lg">
                    لا توجد طلبات معلقة حالياً.. العمل مستقر ✅
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB: HISTORY */}
          {activeTab === "history" && (
            <div className="space-y-6 animate-in fade-in duration-500">
              <div className="flex justify-between items-center">
                <div className="relative w-1/3">
                  <Search
                    className="absolute right-4 top-3 text-slate-400"
                    size={18}
                  />
                  <input
                    className="w-full pr-11 p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-4 ring-indigo-500/5"
                    placeholder="بحث في السجل..."
                    onChange={(e) => setVacSearch(e.target.value)}
                  />
                </div>
                <button
                  onClick={() =>
                    exportToExcel(
                      requests.filter((r) => r.status === "approved"),
                      "سجل_الإجازات"
                    )
                  }
                  className="bg-emerald-600 text-white px-6 py-3 rounded-xl flex items-center gap-2 font-black shadow-lg shadow-emerald-100"
                >
                  <Download size={18} /> تصدير السجل الكامل
                </button>
              </div>

              <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
                <table className="w-full text-right">
                  <thead className="bg-slate-50 text-slate-500 border-b text-xs">
                    <tr>
                      <th className="p-6">الموظف</th>
                      <th className="p-6 text-center">بداية الإجازة</th>
                      <th className="p-6 text-center">نهاية الإجازة</th>
                      <th className="p-6 text-center">تاريخ العودة</th>
                      <th className="p-6 text-center">المدة</th>
                      <th className="p-6 text-center">ملاحظات</th>
                      <th className="p-6 text-center">تعديل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests
                      .filter(
                        (r) =>
                          r.status === "approved" &&
                          r.employee_name.includes(vacSearch)
                      )
                      .map((req) => {
                        const { end, back } = getCalculatedDates(
                          req.start_date,
                          req.days
                        );
                        return (
                          <tr
                            key={req.id}
                            className="border-b hover:bg-slate-50 transition-colors"
                          >
                            <td className="p-6 font-black text-slate-800">
                              {req.employee_name}
                            </td>
                            <td className="p-6 text-center text-slate-600 font-bold">
                              {formatDate(req.start_date)}
                            </td>
                            <td className="p-6 text-center text-slate-400">
                              {formatDate(end)}
                            </td>
                            <td className="p-6 text-center text-indigo-600 font-black">
                              {formatDate(back)}
                            </td>
                            <td className="p-6 text-center">
                              <span className="bg-slate-100 px-4 py-1.5 rounded-full font-bold">
                                {req.days} يوم
                              </span>
                            </td>
                            <td className="p-6 text-center">
                              {req.admin_notes ? (
                                <button
                                  className="text-blue-600 hover:text-blue-700"
                                  title={req.admin_notes}
                                >
                                  <MessageSquare size={18} />
                                </button>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                            <td className="p-6 text-center">
                              <button
                                onClick={() => setEditingVac(req)}
                                className="text-slate-300 hover:text-blue-600 transition-all"
                              >
                                <Edit3 size={18} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>

        {/* --- MODALS --- */}

        {/* Import Excel Modal */}
        {showImportModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 z-[100]">
            <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-2xl shadow-2xl animate-in zoom-in duration-200 text-right" dir="rtl">
              <div className="flex justify-between mb-8">
                <h3 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                  <Upload className="text-emerald-600" />
                  استيراد الموظفين من Excel
                </h3>
                <button
                  onClick={() => setShowImportModal(false)}
                  className="text-slate-400 hover:text-red-500"
                >
                  <X size={28} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
                  <h4 className="font-black text-blue-900 mb-3 flex items-center gap-2">
                    <FileDown size={20} />
                    الخطوة 1: تحميل النموذج
                  </h4>
                  <p className="text-blue-700 text-sm mb-4">
                    قم بتحميل ملف Excel النموذجي وملء بيانات الموظفين
                  </p>
                  <button
                    onClick={downloadExcelTemplate}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2"
                  >
                    <FileDown size={18} />
                    تحميل النموذج
                  </button>
                </div>

                <div className="bg-slate-50 p-6 rounded-2xl">
                  <h4 className="font-black text-slate-800 mb-3 flex items-center gap-2">
                    <Upload size={20} />
                    الخطوة 2: رفع الملف
                  </h4>
                  <p className="text-slate-600 text-sm mb-4">
                    اختر ملف Excel المعبأ لاستيراد بيانات الموظفين
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingFile}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 disabled:opacity-50"
                  >
                    {uploadingFile ? (
                      <>
                        <Loader2 className="animate-spin" size={18} />
                        جاري الرفع...
                      </>
                    ) : (
                      <>
                        <Upload size={18} />
                        اختر ملف Excel
                      </>
                    )}
                  </button>
                </div>

                <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                  <p className="text-amber-800 text-xs font-bold">
                    💡 تأكد من أن الملف يحتوي على الأعمدة: الاسم الكامل - الكود الوظيفي - المنصب - الرصيد الحالي - الرصيد الشهري
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Approval Modal with Notes */}
        {showApprovalModal && currentRequest && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 z-[100]">
            <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-lg shadow-2xl text-right" dir="rtl">
              <div className="flex justify-between mb-8">
                <h3 className="text-2xl font-black text-slate-800">
                  {currentRequest.action === "approved" ? "✅ الموافقة على الطلب" : "❌ رفض الطلب"}
                </h3>
                <button
                  onClick={() => setShowApprovalModal(false)}
                  className="text-slate-400 hover:text-red-500"
                >
                  <X size={28} />
                </button>
              </div>

              <div className="bg-slate-50 p-6 rounded-2xl mb-6">
                <p className="text-sm text-slate-500 mb-2">الموظف</p>
                <p className="font-black text-lg">{currentRequest.employee_name}</p>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <p className="text-xs text-slate-500">تاريخ البداية</p>
                    <p className="font-bold">{formatDate(currentRequest.start_date)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">المدة</p>
                    <p className="font-bold">{currentRequest.days} يوم</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-black text-slate-700 mb-2 flex items-center gap-2">
                    <MessageSquare size={16} />
                    ملاحظات للموظف (اختياري)
                  </label>
                  <textarea
                    className="w-full p-4 border border-slate-200 rounded-2xl outline-none focus:border-indigo-500 resize-none"
                    rows={4}
                    placeholder="مثال: تم الموافقة على الإجازة. نتمنى لك إجازة سعيدة..."
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                  />
                </div>

                <button
                  onClick={handleActionWithNotes}
                  className={`w-full p-5 rounded-2xl font-black text-lg ${
                    currentRequest.action === "approved"
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                      : "bg-red-600 hover:bg-red-700 text-white"
                  }`}
                >
                  {currentRequest.action === "approved" ? "تأكيد الموافقة" : "تأكيد الرفض"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Employee Modal */}
        {showAddEmp && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 z-[100]">
            <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-lg shadow-2xl animate-in zoom-in duration-200 text-right" dir="rtl">
              <div className="flex justify-between mb-8">
                <h3 className="text-2xl font-black text-slate-800">
                  إضافة زميل جديد
                </h3>
                <button
                  onClick={() => setShowAddEmp(false)}
                  className="text-slate-400 hover:text-red-500"
                >
                  <X size={28} />
                </button>
              </div>
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-black mr-2">الاسم الثلاثي</label>
                  <input
                    className="w-full p-4 border border-slate-200 rounded-2xl outline-none focus:border-indigo-500"
                    placeholder="مثلاً: محمد علي حسن"
                    onChange={(e) => setNewEmp({...newEmp, name: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-black mr-2">الكود الوظيفي</label>
                    <input
                      className="w-full p-4 border border-slate-200 rounded-2xl outline-none"
                      placeholder="1001"
                      onChange={(e) => setNewEmp({...newEmp, code: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-black mr-2">المنصب</label>
                    <input
                      className="w-full p-4 border border-slate-200 rounded-2xl outline-none"
                      placeholder="محاسب"
                      onChange={(e) => setNewEmp({...newEmp, position: e.target.value})}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-black mr-2">رصيد الإجازات</label>
                    <input
                      type="number"
                      className="w-full p-4 border border-slate-200 rounded-2xl outline-none"
                      defaultValue={21}
                      onChange={(e) => setNewEmp({...newEmp, balance: Number(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-black mr-2 flex items-center gap-1">
                      <Zap size={14} className="text-emerald-600" />
                      الرصيد الشهري
                    </label>
                    <input
                      type="number"
                      className="w-full p-4 border border-slate-200 rounded-2xl outline-none"
                      defaultValue={0}
                      onChange={(e) => setNewEmp({...newEmp, monthly_balance: Number(e.target.value)})}
                    />
                  </div>
                </div>
                <button
                  onClick={handleAddEmployee}
                  className="w-full bg-indigo-600 text-white p-5 rounded-2xl font-black text-lg mt-4 shadow-xl shadow-indigo-100"
                >
                  حفظ البيانات
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Employee Modal */}
        {editingEmp && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 z-[100]">
            <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-lg shadow-2xl text-right" dir="rtl">
              <div className="flex justify-between mb-8">
                <h3 className="text-2xl font-black text-slate-800">تعديل بيانات الموظف</h3>
                <button onClick={() => setEditingEmp(null)}><X /></button>
              </div>
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-black mr-2">الاسم</label>
                  <input
                    className="w-full p-4 border border-slate-200 rounded-2xl"
                    value={editingEmp.name}
                    onChange={(e) => setEditingEmp({...editingEmp, name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-black mr-2">المنصب</label>
                  <input
                    className="w-full p-4 border border-slate-200 rounded-2xl"
                    value={editingEmp.position}
                    onChange={(e) => setEditingEmp({...editingEmp, position: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-black mr-2">الرصيد الحالي</label>
                    <input
                      type="number"
                      className="w-full p-4 border border-slate-200 rounded-2xl"
                      value={editingEmp.balance}
                      onChange={(e) => setEditingEmp({...editingEmp, balance: Number(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-black mr-2 flex items-center gap-1">
                      <Zap size={14} className="text-emerald-600" />
                      الرصيد الشهري
                    </label>
                    <input
                      type="number"
                      className="w-full p-4 border border-slate-200 rounded-2xl"
                      value={editingEmp.monthly_balance || 0}
                      onChange={(e) => setEditingEmp({...editingEmp, monthly_balance: Number(e.target.value)})}
                    />
                  </div>
                </div>
                <button
                  onClick={handleUpdateEmployee}
                  className="w-full bg-indigo-600 text-white p-5 rounded-2xl font-black"
                >
                  تحديث
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Vacation Modal */}
        {editingVac && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 z-[100]">
            <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-lg shadow-2xl text-right" dir="rtl">
              <div className="flex justify-between mb-8">
                <h3 className="text-2xl font-black text-slate-800">تعديل طلب الإجازة</h3>
                <button onClick={() => setEditingVac(null)}><X size={28} /></button>
              </div>
              <div className="space-y-5">
                <div className="bg-slate-50 p-4 rounded-xl">
                  <p className="text-sm text-slate-500">الموظف</p>
                  <p className="font-black text-lg">{editingVac.employee_name}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-black mr-2">تاريخ البداية</label>
                  <input
                    type="date"
                    className="w-full p-4 border border-slate-200 rounded-2xl"
                    value={editingVac.start_date}
                    onChange={(e) => setEditingVac({...editingVac, start_date: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-black mr-2">عدد الأيام</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full p-4 border border-slate-200 rounded-2xl"
                    value={editingVac.days}
                    onChange={(e) => setEditingVac({...editingVac, days: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-black mr-2">ملاحظات</label>
                  <textarea
                    className="w-full p-4 border border-slate-200 rounded-2xl resize-none"
                    rows={3}
                    value={editingVac.notes || ''}
                    onChange={(e) => setEditingVac({...editingVac, notes: e.target.value})}
                  />
                </div>
                <div className="bg-indigo-50 p-4 rounded-xl">
                  <p className="text-sm text-indigo-700 font-bold">
                    تاريخ العودة المتوقع: {formatDate(getCalculatedDates(editingVac.start_date, editingVac.days).back)}
                  </p>
                </div>
                <button
                  onClick={handleUpdateVacation}
                  className="w-full bg-indigo-600 text-white p-5 rounded-2xl font-black"
                >
                  حفظ التعديلات
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );

  // --- واجهة الموظف (Employee View) ---
  if (currentView === "employee")
    return (
      <div className="min-h-screen bg-slate-50 p-6 text-right font-sans" dir="rtl">
        <header className="max-w-4xl mx-auto flex justify-between items-center mb-10">
          <div>
            <h2 className="text-3xl font-black text-slate-800">أهلاً، {currentUser.name}</h2>
            <p className="text-slate-500">
              رصيدك الحالي: <span className="font-black text-indigo-600">{currentUser.balance} يوم</span>
              {currentUser.monthly_balance > 0 && (
                <span className="mr-2 text-emerald-600 text-sm">
                  (+{currentUser.monthly_balance} شهرياً)
                </span>
              )}
            </p>
          </div>
          <button onClick={() => setCurrentView("login")} className="text-red-500 font-bold flex items-center gap-2">
            <LogOut size={20} /> خروج
          </button>
        </header>

        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8">
          {/* طلب إجازة */}
          <section className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
            <h3 className="text-xl font-black mb-6 flex items-center gap-3">
              <Plus className="text-indigo-600" /> طلب إجازة جديد
            </h3>
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-400">تاريخ البدء</label>
                <input
                  type="date"
                  className="w-full p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 ring-indigo-500"
                  value={newRequest.start_date}
                  onChange={(e) => setNewRequest({...newRequest, start_date: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-400">عدد الأيام</label>
                <input
                  type="number"
                  min="1"
                  className="w-full p-4 bg-slate-50 border-none rounded-2xl outline-none"
                  value={newRequest.days}
                  onChange={(e) => setNewRequest({...newRequest, days: Number(e.target.value)})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-400">ملاحظات (اختياري)</label>
                <textarea
                  className="w-full p-4 bg-slate-50 border-none rounded-2xl outline-none h-24"
                  placeholder="سبب الإجازة..."
                  value={newRequest.notes}
                  onChange={(e) => setNewRequest({...newRequest, notes: e.target.value})}
                />
              </div>
              <button
                onClick={submitVacationRequest}
                disabled={isSubmitting}
                className="w-full bg-indigo-600 text-white p-5 rounded-2xl font-black text-lg disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="animate-spin mx-auto" /> : "إرسال الطلب للمراجعة"}
              </button>
            </div>
          </section>

          {/* حالة الطلبات */}
          <section className="space-y-6">
            <h3 className="text-xl font-black flex items-center gap-3">
              <Clock className="text-amber-500" /> طلباتي الأخيرة
            </h3>
            {requests
              .filter(r => r.employee_id === currentUser.id)
              .map(req => (
                <div key={req.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="font-bold text-slate-800">{formatDate(req.start_date)}</p>
                      <p className="text-xs text-slate-400">{req.days} يوم</p>
                    </div>
                    <span className={`px-4 py-1.5 rounded-full text-xs font-black ${
                      req.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                      req.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {req.status === 'approved' ? 'مقبول ✓' : req.status === 'rejected' ? 'مرفوض ✗' : 'قيد الانتظار ⏳'}
                    </span>
                  </div>
                  
                  {req.admin_notes && (
                    <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
                      <p className="text-xs text-blue-600 font-bold mb-1 flex items-center gap-1">
                        <MessageSquare size={14} />
                        ملاحظات الإدارة:
                      </p>
                      <p className="text-sm text-blue-900">{req.admin_notes}</p>
                    </div>
                  )}
                </div>
              ))}
            
            {requests.filter(r => r.employee_id === currentUser.id).length === 0 && (
              <div className="bg-white p-16 rounded-[2rem] text-center border border-dashed border-slate-200">
                <p className="text-slate-400 font-bold">لم تقم بتقديم أي طلبات بعد</p>
              </div>
            )}
          </section>
        </div>
      </div>
    );

  return null;
};

export default VacationManagementSystem;
