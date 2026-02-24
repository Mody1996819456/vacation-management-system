# ===================================
# Vacation Management System Build Fix
# PowerShell Version
# ===================================

Write-Host ""
Write-Host "🚀 جاري تنظيف وإعادة بناء المشروع..."
Write-Host ""

# الخطوة 1: حذف المجلدات القديمة
Write-Host "1️⃣ حذف المكتبات القديمة..."
Remove-Item -Path "node_modules" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "package-lock.json" -Force -ErrorAction SilentlyContinue
Write-Host "✅ تم"
Write-Host ""

# الخطوة 2: تنظيف npm
Write-Host "2️⃣ تنظيف npm cache..."
npm cache clean --force
Write-Host "✅ تم"
Write-Host ""

# الخطوة 3: تثبيت المكتبات
Write-Host "3️⃣ تثبيت المكتبات الجديدة..."
npm install
Write-Host "✅ تم"
Write-Host ""

# الخطوة 4: البناء
Write-Host "4️⃣ بناء المشروع..."
$env:NODE_OPTIONS = "--no-deprecation"
npm run build

# التحقق من النتيجة
if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================"
    Write-Host "🎉 تم البناء بنجاح!"
    Write-Host "========================================"
    Write-Host ""
    Write-Host "الخطوات التالية:"
    Write-Host "1. git add ."
    Write-Host "2. git commit -m 'Fix: Update dependencies'"
    Write-Host "3. git push origin main"
} else {
    Write-Host ""
    Write-Host "========================================"
    Write-Host "❌ فشل البناء"
    Write-Host "========================================"
    Write-Host ""
    Write-Host "جرّب:"
    Write-Host "1. تحقق من Node version: node --version"
    Write-Host "2. جرب: npm install --legacy-peer-deps"
    Write-Host "3. ثم: npm run build"
}

Read-Host "اضغط Enter للإغلاق"
