#!/usr/bin/env bash
set -e

echo "🔄 دریافت آخرین تغییرات از گیت‌هاب..."
git pull

echo "🐳 ساخت مجدد ایمیج و راه‌اندازی کانتینر داکر..."
mkdir -p ./data
docker compose up -d --build

echo "✅ برنامه کارکردیار با موفقیت آپدیت و اجرا شد (پورت 3000)."
