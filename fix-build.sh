#!/bin/bash

# =================================================
# Vacation Management System - Build Fix Script
# =================================================

echo "🚀 جاري تنظيف وإعادة بناء المشروع..."
echo ""

# الألوان
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ✅ الخطوة 1: حذف الملفات القديمة
echo -e "${YELLOW}1️⃣ حذف المكتبات والملفات القديمة...${NC}"
rm -rf node_modules
rm -f package-lock.json
rm -f npm-debug.log
echo -e "${GREEN}✅ تم${NC}\n"

# ✅ الخطوة 2: تنظيف npm cache
echo -e "${YELLOW}2️⃣ تنظيف npm cache...${NC}"
npm cache clean --force
echo -e "${GREEN}✅ تم${NC}\n"

# ✅ الخطوة 3: تثبيت المكتبات
echo -e "${YELLOW}3️⃣ تثبيت المكتبات الجديدة...${NC}"
npm install
echo -e "${GREEN}✅ تم${NC}\n"

# ✅ الخطوة 4: البناء
echo -e "${YELLOW}4️⃣ بناء المشروع...${NC}"
npm run build

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}🎉 تم البناء بنجاح!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "الخطوات التالية:"
    echo "1. git add ."
    echo "2. git commit -m 'Fix: Update dependencies and fix syntax errors'"
    echo "3. git push origin main"
else
    echo ""
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}❌ فشل البناء${NC}"
    echo -e "${RED}========================================${NC}"
    echo ""
    echo "جرّب الآتي:"
    echo "1. تحقق من Node version: node --version"
    echo "2. تحقق من ملفات النصوص: استخدم UTF-8 encoding"
    echo "3. جرّب: npm run build"
fi
