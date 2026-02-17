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
  ArrowUpRight,
  CalendarDays,
  X,
  UserPlus,
  Printer,
  FileUp
} from "lucide-react";

// --- إعدادات Supabase ---
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || "https://rxeminlotawcfqalxoqy.supabase.co";
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY || "sb_publishable_nExTWl7CRubKfDuiqbX1Sw_EwyMdUoX";
const supabase = createClient(supabaseUrl, supabaseKey);

// --- دوال مساعدة ---
const formatDate = (dateStr: string) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("ar-EG", {
    year: "numeric", month: "2-digit", day: "2-digit",
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
  const [employees, setEmployees] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [currentView, setCurrentView] = useState("login");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [empSearch, setEmpSearch] = useState("");
  const [vacSearch, setVacSearch] = useState("");
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [empCodeInput, setEmpCodeInput] = useState("");
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [editingEmp, setEditingEmp] = useState<any>(null);
  const [editingVac, setEditingVac] = useState<any>(null);

  const [newEmp, setNewEmp] = useState({ name: "", code: "", position: "", balance: 21 });
  const [newRequest, setNewRequest] = useState({ start_date: "", days: 1, notes: "" });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: emps } = await supabase.from("employees").select("*").order("balance", { ascending: false });
      const { data: reqs } = await supabase.from("vacation_requests").select("*").order("created_at", { ascending: false });
      if (emps) setEmployees(emps);
      if (reqs) setRequests(reqs);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // --- ميزة رفع ملف الإكسيل ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        const formattedData = data.map(item => ({
          name: item["الاسم"] || item.name,
          code: String(item["الكود"] || item.code),
          position: item["المنصب"] || item.position,
          balance: Number(item["الرصيد"] || item.balance) || 21
        }));

        const { error } = await supabase.from("employees").insert(formattedData);
        if (error) throw error;
        alert("تم رفع الموظفين بنجاح ✅");
        fetchData();
      } catch (err) { alert("خطأ في تنسيق الملف! تأكد من أسماء الأعمدة."); }
    };
    reader.readAsBinaryString(file);
  };

  // --- ميزة الطباعة ---
  const handlePrint = (req: any) => {
    const { back } = getCalculatedDates(req.start_date, req.days);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <div dir="rtl" style="font-family: Arial; padding: 40px; border: 2px solid #000;">
          <h1 style="text-align: center;">نموذج طلب إجازة معتمد</h1>
          <hr/>
          <p><strong>اسم الموظف:</strong> ${req.employee_name}</p>
          <p><strong>تاريخ البداية:</strong> ${formatDate(req.start_date)}</p>
          <p><strong>المدة:</strong> ${req.days} يوم</p>
          <p><strong>تاريخ العودة للعمل:</strong> ${formatDate(back)}</p>
          <p><strong>ملاحظات:</strong> ${req.notes || 'لا يوجد'}</p>
          <br/><br/>
          <div style="display: flex; justify-content: space-between;">
            <p>توقيع الموظف: ............</p>
            <p>توقيع المدير: ............</p>
          </div>
        </div>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginData.email === "mohamedgamal199681945@gmail.com" && loginData.password === "Mg1996819456") {
      setCurrentUser({ role: "admin", name: "محمد جمال" });
      setCurrentView("admin");
    } else {
      const { data: emp } = await supabase.from("employees").select("*").eq("code", empCodeInput.trim()).single();
      if (emp) { setCurrentUser(emp); setCurrentView("employee"); }
      else { alert("الكود غير صحيح ❌"); }
    }
  };

  const handleAction = async (id: number, action: "approved" | "rejected") => {
    const req = requests.find(r => r.id === id);
    if (action === "approved") {
      const emp = employees.find(e => e.id === req.employee_id);
      if (emp.balance < req.days) return alert("الرصيد غير كافٍ!");
      await supabase.from("employees").update({ balance: emp.balance - req.days }).eq("id", emp.id);
    }
    await supabase.from("vacation_requests").update({ status: action }).eq("id", id);
    fetchData();
  };

  if (currentView === "login") return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-right" dir="rtl">
      <div className="w-full max-w-4xl grid md:grid-cols-2 rounded-[2.5rem] overflow-hidden shadow-2xl border border-slate-800">
        <div className="p-12 bg-slate-900 border-l border-slate-800">
          <Users className="text-indigo-500 mb-6" size={48} />
          <h2 className="text-3xl font-bold text-white mb-8">دخول الموظفين</h2>
          <input className="w-full bg-slate-800 p-4 rounded-2xl text-white mb-4 outline-none border border-slate-700" placeholder="أدخل الكود الوظيفي" value={empCodeInput} onChange={(e) => setEmpCodeInput(e.target.value)} />
          <button onClick={handleLogin} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-2xl font-bold">دخول سريع</button>
        </div>
        <div className="p-12 bg-slate-950">
          <ShieldCheck className="text-emerald-500 mb-6" size={48} />
          <h2 className="text-3xl font-bold text-white mb-8">لوحة الإدارة</h2>
          <input className="w-full bg-slate-900 p-4 rounded-2xl text-white mb-4 border border-slate-800" placeholder="البريد الإلكتروني" onChange={(e) => setLoginData({ ...loginData, email: e.target.value })} />
          <input type="password" className="w-full bg-slate-900 p-4 rounded-2xl text-white mb-6 border border-slate-800" placeholder="كلمة المرور" onChange={(e) => setLoginData({ ...loginData, password: e.target.value })} />
          <button onClick={handleLogin} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white p-4 rounded-2xl font-bold">تسجيل دخول المدير</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex text-right" dir="rtl">
      <aside className="w-72 bg-slate-900 text-slate-300 fixed h-full p-6 flex flex-col z-20">
        <div className="mb-10 text-center">
          <div className="bg-indigo-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"><CalendarDays className="text-white" size={32} /></div>
          <h1 className="text-white font-black text-xl">نظام الإجازات</h1>
        </div>
        <nav className="flex-1 space-y-2">
          {[{ id: "dashboard", label: "الرئيسية", icon: LayoutDashboard }, { id: "employees", label: "الموظفين", icon: Users }, { id: "requests", label: "الطلبات", icon: Clock }, { id: "history", label: "السجل", icon: FileSpreadsheet }].map((item) => (
            <button key={item.id} onClick={() => setActiveTab(item.id)} className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all ${activeTab === item.id ? "bg-indigo-600 text-white" : "hover:bg-slate-800"}`}><item.icon size={22} /> <span className="font-bold">{item.label}</span></button>
          ))}
        </nav>
        <button onClick={() => setCurrentView("login")} className="p-4 text-red-400 hover:bg-red-500/10 rounded-2xl flex items-center gap-4 mt-auto border border-red-500/20"><LogOut size={22} /><span className="font-bold">خروج</span></button>
      </aside>

      <main className="mr-72 p-10 w-full">
        {activeTab === "employees" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <input className="w-1/2 p-3.5 bg-white border border-slate-200 rounded-2xl" placeholder="بحث..." value={empSearch} onChange={(e) => setEmpSearch(e.target.value)} />
              <div className="flex gap-3">
                <label className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-3.5 rounded-2xl flex items-center gap-2 font-black cursor-pointer shadow-lg">
                  <FileUp size={20} /> رفع إكسيل
                  <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleFileUpload} />
                </label>
                <button onClick={() => setShowAddEmp(true)} className="bg-indigo-600 text-white px-6 py-3.5 rounded-2xl flex items-center gap-2 font-black"><UserPlus size={20} /> إضافة موظف</button>
              </div>
            </div>
            <div className="bg-white rounded-[2rem] shadow-sm border overflow-hidden">
              <table className="w-full text-right">
                <thead className="bg-slate-50 text-slate-500">
                  <tr><th className="p-6">الاسم</th><th className="p-6">الكود</th><th className="p-6">المنصب</th><th className="p-6 text-center">الرصيد</th><th className="p-6 text-center">التحكم</th></tr>
                </thead>
                <tbody>
                  {employees.filter(e => e.name.includes(empSearch) || e.code.includes(empSearch)).map(emp => (
                    <tr key={emp.id} className="border-t hover:bg-slate-50">
                      <td className="p-6 font-black">{emp.name}</td>
                      <td className="p-6">{emp.code}</td>
                      <td className="p-6">{emp.position}</td>
                      <td className="p-6 text-center font-bold text-indigo-600">{emp.balance}</td>
                      <td className="p-6 text-center">
                        <button onClick={async () => { if(window.confirm("حذف؟")) { await supabase.from("employees").delete().eq("id", emp.id); fetchData(); } }} className="text-red-500 p-2"><Trash2 size={18} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "history" && (
          <div className="bg-white rounded-[2rem] shadow-sm border overflow-hidden">
             <table className="w-full text-right">
                <thead className="bg-slate-50">
                  <tr><th className="p-6">الموظف</th><th className="p-6 text-center">البداية</th><th className="p-6 text-center">العودة</th><th className="p-6 text-center">المدة</th><th className="p-6 text-center">طباعة</th></tr>
                </thead>
                <tbody>
                  {requests.filter(r => r.status === "approved").map(req => (
                    <tr key={req.id} className="border-t">
                      <td className="p-6 font-bold">{req.employee_name}</td>
                      <td className="p-6 text-center">{formatDate(req.start_date)}</td>
                      <td className="p-6 text-center text-indigo-600 font-bold">{formatDate(getCalculatedDates(req.start_date, req.days).back)}</td>
                      <td className="p-6 text-center">{req.days} يوم</td>
                      <td className="p-6 text-center">
                        <button onClick={() => handlePrint(req)} className="text-blue-600 p-2 hover:bg-blue-50 rounded-lg"><Printer size={20} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
             </table>
          </div>
        )}

        {activeTab === "dashboard" && (
          <div className="grid grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-[2rem] shadow-sm border flex items-center gap-6">
              <div className="p-5 bg-blue-50 text-blue-600 rounded-2xl"><Users size={32} /></div>
              <div><p className="text-slate-500 font-bold">الموظفين</p><h3 className="text-4xl font-black">{employees.length}</h3></div>
            </div>
            <div className="bg-white p-8 rounded-[2rem] shadow-sm border flex items-center gap-6">
              <div className="p-5 bg-amber-50 text-amber-600 rounded-2xl"><Clock size={32} /></div>
              <div><p className="text-slate-500 font-bold">طلبات معلقة</p><h3 className="text-4xl font-black">{requests.filter(r => r.status === "pending").length}</h3></div>
            </div>
            <div className="bg-white p-8 rounded-[2rem] shadow-sm border flex items-center gap-6">
              <div className="p-5 bg-emerald-50 text-emerald-600 rounded-2xl"><CheckCircle size={32} /></div>
              <div><p className="text-slate-500 font-bold">إجازات اليوم</p><h3 className="text-4xl font-black">{requests.filter(r => r.status === "approved").length}</h3></div>
            </div>
          </div>
        )}

        {activeTab === "requests" && (
           <div className="grid grid-cols-2 gap-6">
           {requests.filter(r => r.status === "pending").map(req => (
             <div key={req.id} className="bg-white p-8 rounded-[2.5rem] border shadow-sm">
               <h4 className="font-black text-xl mb-4">{req.employee_name}</h4>
               <div className="bg-slate-50 p-4 rounded-xl mb-6">
                 <p>تاريخ البداية: {formatDate(req.start_date)}</p>
                 <p>المدة: {req.days} يوم</p>
               </div>
               <div className="flex gap-3">
                 <button onClick={() => handleAction(req.id, "approved")} className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold">قبول</button>
                 <button onClick={() => handleAction(req.id, "rejected")} className="flex-1 bg-red-50 text-red-600 py-3 rounded-xl font-bold">رفض</button>
               </div>
             </div>
           ))}
         </div>
        )}
      </main>

      {showAddEmp && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-10 rounded-[2.5rem] w-full max-w-md text-right" dir="rtl">
            <h3 className="text-2xl font-black mb-6">إضافة موظف جديد</h3>
            <input className="w-full p-4 border rounded-xl mb-4" placeholder="الاسم" onChange={e => setNewEmp({...newEmp, name: e.target.value})} />
            <input className="w-full p-4 border rounded-xl mb-4" placeholder="الكود" onChange={e => setNewEmp({...newEmp, code: e.target.value})} />
            <input className="w-full p-4 border rounded-xl mb-4" placeholder="المنصب" onChange={e => setNewEmp({...newEmp, position: e.target.value})} />
            <div className="flex gap-3">
              <button onClick={async () => { await supabase.from("employees").insert([newEmp]); setShowAddEmp(false); fetchData(); }} className="flex-1 bg-indigo-600 text-white py-4 rounded-xl font-bold">حفظ</button>
              <button onClick={() => setShowAddEmp(false)} className="flex-1 bg-slate-100 py-4 rounded-xl font-bold">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VacationManagementSystem;
