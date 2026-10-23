#!/usr/bin/env bash
set -e

PERSISTENT_DATA_DIR="../karkardyar-data"
BACKUP_DIR="../karkardyar-backups"
LEGACY_DATA_DIR="./data"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")

mkdir -p "$PERSISTENT_DATA_DIR" "$BACKUP_DIR" "$LEGACY_DATA_DIR"

echo "🛡️ بررسی و محافظت از دیتابیس فعلی سرور قبل از آپدیت..."

# ۱. اگر دیتابیس از نسخه قبلی در ./data وجود دارد و هنوز به پوشه امن بیرونی منتقل نشده، منتقل کن
if [ -f "$LEGACY_DATA_DIR/karkard.sqlite" ] && [ ! -f "$PERSISTENT_DATA_DIR/karkard.sqlite" ]; then
  echo "📦 انتقال دیتابیس فعلی به پوشه امن خارج از گیت ($PERSISTENT_DATA_DIR)..."
  cp -f "$LEGACY_DATA_DIR"/karkard.sqlite* "$PERSISTENT_DATA_DIR"/ 2>/dev/null || true
fi

# ۲. تهیه نسخه پشتیبان خودکار قبل از هرگونه آپدیت کد
if [ -f "$PERSISTENT_DATA_DIR/karkard.sqlite" ]; then
  cp -f "$PERSISTENT_DATA_DIR/karkard.sqlite" "$BACKUP_DIR/karkard-pre-update-$TIMESTAMP.sqlite"
  cp -f "$PERSISTENT_DATA_DIR/karkard.sqlite" "/tmp/karkard-safe-snapshot.sqlite"
  echo "✅ نسخه پشتیبان خودکار در $BACKUP_DIR/karkard-pre-update-$TIMESTAMP.sqlite ذخیره شد."
elif [ -f "$LEGACY_DATA_DIR/karkard.sqlite" ]; then
  cp -f "$LEGACY_DATA_DIR/karkard.sqlite" "$BACKUP_DIR/karkard-pre-update-$TIMESTAMP.sqlite"
  cp -f "$LEGACY_DATA_DIR/karkard.sqlite" "$PERSISTENT_DATA_DIR/karkard.sqlite"
  cp -f "$LEGACY_DATA_DIR/karkard.sqlite" "/tmp/karkard-safe-snapshot.sqlite"
  echo "✅ نسخه پشتیبان خودکار در $BACKUP_DIR/karkard-pre-update-$TIMESTAMP.sqlite ذخیره شد."
fi

echo "🔄 دریافت آخرین تغییرات کد از گیت‌هاب (بدون دست زدن به دیتابیس)..."
# جلوگیری از خطای تداخل فایل دیتابیس در گیت
git checkout -- "$LEGACY_DATA_DIR" 2>/dev/null || true
git pull

# ۳. اطمینان از اینکه فایل دیتابیس سرور پس از git pull دست‌نخورده باقی مانده است
if [ -f "/tmp/karkard-safe-snapshot.sqlite" ]; then
  if [ ! -f "$PERSISTENT_DATA_DIR/karkard.sqlite" ]; then
    cp -f "/tmp/karkard-safe-snapshot.sqlite" "$PERSISTENT_DATA_DIR/karkard.sqlite"
  fi
  mkdir -p "$LEGACY_DATA_DIR"
  cp -f "$PERSISTENT_DATA_DIR/karkard.sqlite" "$LEGACY_DATA_DIR/karkard.sqlite"
  rm -f "/tmp/karkard-safe-snapshot.sqlite"
fi

echo "🐳 ساخت مجدد ایمیج کدها و راه‌اندازی کانتینر داکر..."
docker compose up -d --build

echo "✅ کدهای برنامه با موفقیت آپدیت شد و دیتابیس شما در $PERSISTENT_DATA_DIR کاملاً دست‌نخورده و محفوظ است."

