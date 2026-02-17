import React, { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import {
  LayoutDashboard, Users, LogOut, Plus, Trash2, Calendar,
  CheckCircle, Clock, Search, Edit3, ShieldCheck, Download,
  FileSpreadsheet, ArrowUpRight, CalendarDays, X, UserPlus, FileUp
} from "lucide-react";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || "https://rxeminlotawcfqalxoqy.supabase.co";
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY || "sb_publishable_nExTWl7CRubKfDuiqbX1Sw_EwyMdUoX";
const supabase = createClient(supabaseUrl, supabaseKey);

const VacationManagementSystem = () => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [currentView, setCurrentView] = useState("login");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [empSearch, setEmpSearch] = useState("");
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [empCodeInput, setEmpCodeInput] = useState("");
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [showAddVacation, setShowAddVacation] = useState(false);
  const [newEmp, setNewEmp] = useState({ name: "", code: "", position: "", balance: 21 });
  const [newRequest, setNewRequest] = useState({ start_date: "", days: 1, notes: "" });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: emps } = await supabase.from("employees").select("*").order("name");
      const { data: reqs } = await supabase.from("vacation_requests").select("*").order("created_at", { ascending: false });
      if (emps) setEmployees(emps);
      if (reqs) setRequests(reqs);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

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
      } catch (err) { alert("خطأ في الملف! تأكد من العناوين: الاسم، الكود، المنصب، الرصيد"); }
    };
    reader.readAsBinaryString(file);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginData.email === "mohamedgamal199681945@gmail.com" && loginData.password === "Mg1996819456") {
      setCurrentUser({ role: "admin", name: "محمد جمال" });
      setCurrentView("admin");
    } else {
      const emp = employees.find(e => e.code === empCodeInput.trim());
      if (emp) { setCurrentUser(emp); setCurrentView("employee"); }
      else { alert("الكود غير صحيح"); }
    }
  };

  const handleAddRequest = async () => {
    if (currentUser.balance < newRequest.days) return alert("الرصيد غير كافٍ");
    await supabase.from("vacation_requests").insert([{
      employee_id: currentUser.id,
      employee_name: currentUser.name,
      ...newRequest,
      status: "pending"
    }]);
    setShowAddVacation(false);
    fetchData();
  };
const handleAction = async (id: number, action: "approved" | "rejected") => {
    const req = requests.find(r => r.id === id);
    if (action === "approved") {
      const emp = employees.find(e => e.id === req.employee_id);
      if (emp.balance < req.days) return alert("رصيد الموظف لا يكفي");
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
          <input className="w-full bg-slate-800 p-4 rounded-2xl text-white mb-4 outline-none border border-slate-700 focus:border-indigo-500 transition-all" placeholder="أدخل الكود الوظيفي" value={empCodeInput} onChange={(e) => setEmpCodeInput(e.target.value)} />
          <button onClick={handleLogin} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-2xl font-black shadow-lg shadow-indigo-500/20 transition-all active:scale-95">دخول سريع</button>
        </div>
        <div className="p-12 bg-slate-950">
          <ShieldCheck className="text-emerald-500 mb-6" size={48} />
          <h2 className="text-3xl font-bold text-white mb-8">لوحة الإدارة</h2>
          <input className="w-full bg-slate-900 p-4 rounded-2xl text-white mb-4 border border-slate-800 outline-none focus:border-emerald-500 transition-all" placeholder="البريد الإلكتروني" onChange={(e) => setLoginData({ ...loginData, email: e.target.value })} />
          <input type="password" className="w-full bg-slate-900 p-4 rounded-2xl text-white mb-6 border border-slate-800 outline-none focus:border-emerald-500 transition-all" placeholder="كلمة المرور" onChange={(e) => setLoginData({ ...loginData, password: e.target.value })} />
          <button onClick={handleLogin} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white p-4 rounded-2xl font-black shadow-lg shadow-emerald-500/20 transition-all active:scale-95">تسجيل دخول المدير</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex text-right" dir="rtl">
      <aside className="w-72 bg-slate-900 text-slate-300 fixed h-full p-6 flex flex-col z-20 shadow-2xl">
        <div className="mb-10 text-center">
          <div className="bg-indigo-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/20">
            <CalendarDays className="text-white" size={32} />
          </div>
          <h1 className="text-white font-black text-xl tracking-tight">نظام الإجازات</h1>
        </div>
        <nav className="flex-1 space-y-2">
          <button onClick={() => setActiveTab("dashboard")} className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all font-bold ${activeTab === "dashboard" ? "bg-indigo-600 text-white shadow-lg" : "hover:bg-slate-800"}`}><LayoutDashboard size={22} /> الرئيسية</button>
          {currentUser?.role === "admin" && (
            <button onClick={() => setActiveTab("employees")} className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all font-bold ${activeTab === "employees" ? "bg-indigo-600 text-white shadow-lg" : "hover:bg-slate-800"}`}><Users size={22} /> الموظفين</button>
          )}
          <button onClick={() => setActiveTab("requests")} className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all font-bold ${activeTab === "requests" ? "bg-indigo-600 text-white shadow-lg" : "hover:bg-slate-800"}`}><Clock size={22} /> الطلبات</button>
        </nav>
        <button onClick={() => setCurrentView("login")} className="p-4 text-red-400 hover:bg-red-500/10 rounded-2xl flex items-center gap-4 mt-auto border border-red-500/20 font-bold"><LogOut size={22} /> خروج</button>
      </aside>

      <main className="mr-72 p-10 w-full">
        {activeTab === "dashboard" && (
          <div className="space-y-10">
            <h2 className="text-4xl font-black text-slate-900 mb-2">أهلاً، {currentUser?.name} 👋</h2>
            <div className="grid grid-cols-3 gap-8">
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border flex items-center gap-6">
                <div className="p-5 bg-indigo-50 text-indigo-600 rounded-3xl"><Users size={32} /></div>
                <div><p className="text-slate-500 font-bold mb-1">الموظفين</p><h3 className="text-4xl font-black">{employees.length}</h3></div>
              </div>
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border flex items-center gap-6">
                <div className="p-5 bg-amber-50 text-amber-600 rounded-3xl"><Clock size={32} /></div>
                <div><p className="text-slate-500 font-bold mb-1">معلقة</p><h3 className="text-4xl font-black">{requests.filter(r => r.status === "pending").length}</h3></div>
              </div>
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border flex items-center gap-6">
                <div className="p-5 bg-emerald-50 text-emerald-600 rounded-3xl"><CheckCircle size={32} /></div>
                <div><p className="text-slate-500 font-bold mb-1">رصيدك</p><h3 className="text-4xl font-black">{currentUser?.balance || 0}</h3></div>
              </div>
            </div>
            {currentUser?.role !== "admin" && (
              <button onClick={() => setShowAddVacation(true)} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black shadow-lg">طلب إجازة جديد</button>
            )}
          </div>
        )}

        {activeTab === "employees" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-[2rem] shadow-sm border">
              <input className="w-1/2 p-4 bg-slate-50 border-none rounded-2xl outline-none" placeholder="بحث..." value={empSearch} onChange={(e) => setEmpSearch(e.target.value)} />
              <div className="flex gap-3">
                <label className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-4 rounded-2xl flex items-center gap-3 font-black cursor-pointer shadow-lg shadow-amber-500/20">
                  <FileUp size={22} /> رفع من إكسيل
                  <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleFileUpload} />
                </label>
                <button onClick={() => setShowAddEmp(true)} className="bg-indigo-600 text-white px-6 py-4 rounded-2xl flex items-center gap-3 font-black shadow-lg shadow-indigo-500/20 transition-all active:scale-95"><UserPlus size={22} /> إضافة موظف</button>
              </div>
            </div>
            <div className="bg-white rounded-[2.5rem] shadow-sm border overflow-hidden">
              <table className="w-full text-right">
                <thead className="bg-slate-50">
                  <tr><th className="p-8 font-bold">الموظف</th><th className="p-8 text-center">الكود</th><th className="p-8 text-center">المنصب</th><th className="p-8 text-center">الرصيد</th><th className="p-8 text-center">حذف</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {employees.filter(e => e.name.includes(empSearch) || e.code.includes(empSearch)).map(emp => (
                    <tr key={emp.id} className="hover:bg-slate-50/50 transition-all">
                      <td className="p-8 font-black text-slate-900">{emp.name}</td>
                      <td className="p-8 text-center font-bold text-slate-600">{emp.code}</td>
                      <td className="p-8 text-center text-slate-500 font-medium">{emp.position}</td>
                      <td className="p-8 text-center"><span className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-full font-black text-sm">{emp.balance} يوم</span></td>
                      <td className="p-8 text-center">
                        <button onClick={async () => { if(window.confirm("حذف الموظف؟")) { await supabase.from("employees").delete().eq("id", emp.id); fetchData(); } }} className="text-red-400 hover:text-red-600 p-2"><Trash2 size={20}/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "requests" && (
           <div className="grid grid-cols-2 gap-8">
           {requests.filter(r => r.status === "pending").map(req => (
             <div key={req.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-2 h-full bg-amber-400"></div>
                <h4 className="font-black text-2xl text-slate-900 mb-4">{req.employee_name}</h4>
                <div className="bg-slate-50 p-6 rounded-3xl font-bold text-slate-700 mb-6">
                  <p>تاريخ البداية: {req.start_date}</p>
                  <p className="text-indigo-600">المدة: {req.days} يوم</p>
                </div>
                <div className="flex gap-4">
                  <button onClick={() => handleAction(req.id, "approved")} className="flex-1 bg-emerald-600 text-white py-4 rounded-2xl font-black">قبول</button>
                  <button onClick={() => handleAction(req.id, "rejected")} className="flex-1 bg-red-50 text-red-600 py-4 rounded-2xl font-black">رفض</button>
                </div>
             </div>
           ))}
         </div>
        )}
      </main>

      {showAddEmp && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-md flex items-center justify-center z-50 p-6">
          <div className="bg-white p-10 rounded-[3rem] w-full max-w-lg shadow-2xl">
            <h3 className="text-3xl font-black text-slate-900 mb-8">إضافة موظف</h3>
            <div className="space-y-4">
              <input className="w-full p-5 bg-slate-50 border-none rounded-2xl outline-none font-bold" placeholder="الاسم الكامل" onChange={e => setNewEmp({...newEmp, name: e.target.value})} />
              <input className="w-full p-5 bg-slate-50 border-none rounded-2xl outline-none font-bold" placeholder="الكود الوظيفي" onChange={e => setNewEmp({...newEmp, code: e.target.value})} />
              <input className="w-full p-5 bg-slate-50 border-none rounded-2xl outline-none font-bold" placeholder="المسمى الوظيفي" onChange={e => setNewEmp({...newEmp, position: e.target.value})} />
              <button onClick={async () => { await supabase.from("employees").insert([newEmp]); setShowAddEmp(false); fetchData(); }} className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black text-lg mt-4 shadow-xl shadow-indigo-500/20 active:scale-95 transition-all">تأكيد الإضافة</button>
              <button onClick={() => setShowAddEmp(false)} className="w-full text-slate-400 font-bold py-2">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {showAddVacation && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-md flex items-center justify-center z-50 p-6">
          <div className="bg-white p-10 rounded-[3rem] w-full max-w-lg shadow-2xl">
            <h3 className="text-3xl font-black text-slate-900 mb-8">تقديم طلب إجازة</h3>
            <div className="space-y-4">
              <input type="date" className="w-full p-5 bg-slate-50 border-none rounded-2xl outline-none font-bold" onChange={e => setNewRequest({...newRequest, start_date: e.target.value})} />
              <input type="number" className="w-full p-5 bg-slate-50 border-none rounded-2xl outline-none font-bold" placeholder="عدد أيام الإجازة" onChange={e => setNewRequest({...newRequest, days: Number(e.target.value)})} />
              <button onClick={handleAddRequest} className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black text-lg mt-4 shadow-xl shadow-indigo-500/20 active:scale-95 transition-all">إرسال الطلب للمراجعة</button>
              <button onClick={() => setShowAddVacation(false)} className="w-full text-slate-400 font-bold py-2">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VacationManagementSystem;
