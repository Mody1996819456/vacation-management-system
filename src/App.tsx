import React, { useState, useEffect, useCallback, useMemo } from "react";
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
} from "lucide-react";

// --- إعدادات الاتصال بـ Supabase ---
const supabaseUrl = "https://rxeminlotawcfqalxoqy.supabase.co";
const supabaseKey = "sb_publishable_nExTWl7CRubKfDuiqbX1Sw_EwyMdUoX";
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

  // New Data Forms
  const [newEmp, setNewEmp] = useState({
    name: "",
    code: "",
    position: "",
    balance: 21,
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
    } catch (err) {
      console.error("Fetch Error:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  // --- عمليات الموظفين (Admin) ---
  const handleAddEmployee = async () => {
    if (!newEmp.name || !newEmp.code)
      return alert("يرجى ملء البيانات الأساسية");
    const { error } = await supabase.from("employees").insert([newEmp]);
    if (!error) {
      setShowAddEmp(false);
      setNewEmp({ name: "", code: "", position: "", balance: 21 });
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

  // --- عمليات الإجازات (Admin) ---
  const handleAction = async (id: number, action: "approved" | "rejected") => {
    const req = requests.find((r) => r.id === id);
    if (action === "approved") {
      const emp = employees.find((e) => e.id === req.employee_id);
      if (emp.balance < req.days) return alert("رصيد الموظف غير كافٍ!");
      await supabase
        .from("employees")
        .update({ balance: emp.balance - req.days })
        .eq("id", emp.id);
    }
    await supabase
      .from("vacation_requests")
      .update({ status: action })
      .eq("id", id);
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
                        <span className="bg-amber-100 text-amber-700 px-4 py-1.5 rounded-full text-xs font-black">
                          قيد المراجعة
                        </span>
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
                        onClick={() => handleAction(req.id, "approved")}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl font-black transition-all shadow-lg shadow-emerald-100"
                      >
                        قبول الإجازة
                      </button>
                      <button
                        onClick={() => handleAction(req.id, "rejected")}
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

          {/* TAB: HISTORY (قائمة الإجازات المعتمدة) */}
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

        {/* Add Employee Modal */}
        {showAddEmp && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 z-[100]">
            <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-lg shadow-2xl animate-in zoom-in duration-200">
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
                  <label className="text-sm font-black mr-2">
                    الاسم الثلاثي
                  </label>
                  <input
                    className="w-full p-4 border border-slate-200 rounded-2xl outline-none focus:border-indigo-500"
                    placeholder="مثلاً: أحمد محمد علي"
                    onChange={(e) =>
                      setNewEmp({ ...newEmp, name: e.target.value })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-black mr-2">
                      الكود الوظيفي
                    </label>
                    <input
                      className="w-full p-4 border border-slate-200 rounded-2xl outline-none focus:border-indigo-500"
                      placeholder="EMP-001"
                      onChange={(e) =>
                        setNewEmp({ ...newEmp, code: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-black mr-2">
                      رصيد الأيام
                    </label>
                    <input
                      type="number"
                      className="w-full p-4 border border-slate-200 rounded-2xl outline-none focus:border-indigo-500"
                      defaultValue={21}
                      onChange={(e) =>
                        setNewEmp({
                          ...newEmp,
                          balance: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-black mr-2">
                    المسمى الوظيفي
                  </label>
                  <input
                    className="w-full p-4 border border-slate-200 rounded-2xl outline-none focus:border-indigo-500"
                    placeholder="مثلاً: مطور برمجيات"
                    onChange={(e) =>
                      setNewEmp({ ...newEmp, position: e.target.value })
                    }
                  />
                </div>
                <button
                  onClick={handleAddEmployee}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-black text-lg mt-6 shadow-xl shadow-indigo-100 transition-all"
                >
                  تأكيد الإضافة
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Vacation Modal */}
        {editingVac && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 z-[100]">
            <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-lg shadow-2xl">
              <h3 className="text-2xl font-black mb-8 text-slate-800">
                تعديل بيانات الإجازة
              </h3>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-black">تاريخ البداية</label>
                  <input
                    type="date"
                    className="w-full p-4 border rounded-2xl"
                    value={editingVac.start_date}
                    onChange={(e) =>
                      setEditingVac({
                        ...editingVac,
                        start_date: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-black">عدد الأيام</label>
                  <input
                    type="number"
                    className="w-full p-4 border rounded-2xl"
                    value={editingVac.days}
                    onChange={(e) =>
                      setEditingVac({
                        ...editingVac,
                        days: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="pt-6 flex gap-3">
                  <button
                    onClick={handleUpdateVacation}
                    className="flex-1 bg-emerald-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-emerald-50"
                  >
                    حفظ التغييرات
                  </button>
                  <button
                    onClick={() => setEditingVac(null)}
                    className="flex-1 bg-slate-100 text-slate-500 py-4 rounded-2xl font-black"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Employee Modal */}
        {editingEmp && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 z-[100]">
            <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-lg shadow-2xl">
              <h3 className="text-2xl font-black mb-8 text-slate-800">
                تحديث بيانات الموظف
              </h3>
              <div className="space-y-5">
                <input
                  className="w-full p-4 border rounded-2xl"
                  value={editingEmp.name}
                  onChange={(e) =>
                    setEditingEmp({ ...editingEmp, name: e.target.value })
                  }
                />
                <input
                  className="w-full p-4 border rounded-2xl"
                  value={editingEmp.position}
                  onChange={(e) =>
                    setEditingEmp({ ...editingEmp, position: e.target.value })
                  }
                />
                <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl">
                  <span className="font-bold text-slate-400 text-sm">
                    تعديل الرصيد:
                  </span>
                  <input
                    type="number"
                    className="w-24 p-2 border rounded-xl font-black text-center"
                    value={editingEmp.balance}
                    onChange={(e) =>
                      setEditingEmp({
                        ...editingEmp,
                        balance: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <button
                  onClick={handleUpdateEmployee}
                  className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-blue-50 mt-4"
                >
                  تحديث الآن
                </button>
                <button
                  onClick={() => setEditingEmp(null)}
                  className="w-full text-slate-400 font-bold py-2"
                >
                  تراجع
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );

  // --- واجهة الموظف (Employee Dashboard) ---
  if (currentView === "employee")
    return (
      <div
        className="min-h-screen bg-slate-50 p-8 flex flex-col items-center text-right font-sans"
        dir="rtl"
      >
        <div className="w-full max-w-3xl space-y-8 animate-in slide-in-from-top-10 duration-700">
          {/* ملف الموظف */}
          <div className="bg-white p-10 rounded-[3rem] shadow-xl border border-slate-100 flex justify-between items-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-32 h-32 bg-indigo-500/5 rounded-full -translate-x-10 -translate-y-10"></div>
            <div className="z-10">
              <p className="text-indigo-600 font-black text-sm mb-2 uppercase tracking-widest">
                مرحباً بك مجدداً
              </p>
              <h1 className="text-4xl font-black text-slate-800">
                {currentUser.name}
              </h1>
              <p className="text-slate-400 mt-2 font-bold">
                {currentUser.position} | {currentUser.code}
              </p>
              <button
                onClick={() => setCurrentView("login")}
                className="mt-6 flex items-center gap-2 text-red-500 font-black text-sm hover:translate-x-1 transition-all"
              >
                <LogOut size={16} /> تسجيل الخروج
              </button>
            </div>
            <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] text-center shadow-2xl border-4 border-white">
              <p className="text-slate-400 text-xs font-bold mb-1 uppercase">
                رصيدك المتاح
              </p>
              <p className="text-5xl font-black">
                {employees.find((e) => e.id === currentUser.id)?.balance || 0}
              </p>
              <p className="text-[10px] mt-2 text-slate-500 font-bold">
                يوم إجازة
              </p>
            </div>
          </div>

          {/* تقديم طلب */}
          <div className="bg-white p-10 rounded-[3rem] shadow-lg border border-slate-100">
            <h2 className="text-2xl font-black mb-8 flex items-center gap-4 text-slate-800">
              <Calendar className="text-indigo-600" size={28} /> تقديم طلب إجازة
              جديد
            </h2>
            <div className="grid grid-cols-2 gap-6 mb-8">
              <div className="space-y-3">
                <label className="text-sm font-black text-slate-500 mr-2">
                  تاريخ بداية الإجازة
                </label>
                <input
                  type="date"
                  className="w-full bg-slate-50 border-none p-5 rounded-2xl outline-none focus:ring-4 ring-indigo-500/10 font-bold"
                  onChange={(e) =>
                    setNewRequest({ ...newRequest, start_date: e.target.value })
                  }
                />
              </div>
              <div className="space-y-3">
                <label className="text-sm font-black text-slate-500 mr-2">
                  عدد أيام الإجازة
                </label>
                <input
                  type="number"
                  min="1"
                  className="w-full bg-slate-50 border-none p-5 rounded-2xl outline-none focus:ring-4 ring-indigo-500/10 font-black text-xl text-center"
                  value={newRequest.days}
                  onChange={(e) =>
                    setNewRequest({
                      ...newRequest,
                      days: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="col-span-2 space-y-3 text-indigo-600 bg-indigo-50/50 p-6 rounded-[2rem] border border-indigo-100 border-dashed text-center">
                <span className="text-sm font-bold">
                  في حال الموافقة، سيكون موعد عودتك للعمل هو:
                </span>
                <p className="text-2xl font-black mt-1">
                  {newRequest.start_date
                    ? formatDate(
                        getCalculatedDates(
                          newRequest.start_date,
                          newRequest.days
                        ).back
                      )
                    : "يحدد لاحقاً"}
                </p>
              </div>
              <div className="col-span-2 space-y-3">
                <label className="text-sm font-black text-slate-500 mr-2">
                  ملاحظات إضافية (اختياري)
                </label>
                <textarea
                  className="w-full bg-slate-50 border-none p-5 rounded-2xl outline-none focus:ring-4 ring-indigo-500/10 font-medium h-24"
                  placeholder="هل تود إبلاغ الإدارة بشيء؟"
                  onChange={(e) =>
                    setNewRequest({ ...newRequest, notes: e.target.value })
                  }
                ></textarea>
              </div>
            </div>
            <button
              onClick={submitVacationRequest}
              disabled={isSubmitting}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-6 rounded-2xl font-black text-xl shadow-xl shadow-indigo-100 transition-all flex items-center justify-center gap-4 group"
            >
              {isSubmitting ? (
                <Loader2 className="animate-spin" />
              ) : (
                <>
                  <Save
                    size={24}
                    className="group-hover:scale-110 transition-all"
                  />{" "}
                  إرسال الطلب للمراجعة
                </>
              )}
            </button>
          </div>

          {/* الطلبات السابقة */}
          <div className="space-y-5">
            <h3 className="text-xl font-black text-slate-800 mr-4 flex items-center gap-2">
              <Clock size={20} /> سجل طلباتك الأخيرة
            </h3>
            {requests
              .filter((r) => r.employee_id === currentUser.id)
              .map((req) => (
                <div
                  key={req.id}
                  className="bg-white p-6 rounded-[2rem] border border-slate-100 flex justify-between items-center shadow-sm"
                >
                  <div className="flex items-center gap-6">
                    <div className="bg-slate-50 p-4 rounded-2xl text-center min-w-[80px]">
                      <p className="text-[10px] text-slate-400 font-bold uppercase">
                        المدة
                      </p>
                      <p className="text-xl font-black text-slate-700">
                        {req.days} يوم
                      </p>
                    </div>
                    <div>
                      <p className="font-black text-slate-800">
                        تبدأ من: {formatDate(req.start_date)}
                      </p>
                      <p className="text-xs text-slate-400 font-bold">
                        العودة:{" "}
                        {formatDate(
                          getCalculatedDates(req.start_date, req.days).back
                        )}
                      </p>
                    </div>
                  </div>
                  <div
                    className={`px-6 py-2 rounded-full text-xs font-black shadow-sm ${
                      req.status === "approved"
                        ? "bg-emerald-100 text-emerald-700"
                        : req.status === "rejected"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {req.status === "approved"
                      ? "تمت الموافقة ✓"
                      : req.status === "rejected"
                      ? "مرفوض ✕"
                      : "قيد الانتظار..."}
                  </div>
                </div>
              ))}
            {requests.filter((r) => r.employee_id === currentUser.id).length ===
              0 && (
              <div className="p-12 text-center text-slate-400 font-bold bg-white/50 border border-dashed rounded-[2.5rem]">
                لا يوجد لديك طلبات سابقة حتى الآن.
              </div>
            )}
          </div>
        </div>
      </div>
    );

  return null;
};

export default VacationManagementSystem;
