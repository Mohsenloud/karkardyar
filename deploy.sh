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

# ۲. ادغام فایل‌های WAL در فایل اصلی دیتابیس (اگر کانتینر در حال اجراست) قبل از بکاپ
if docker compose ps --status running --services 2>/dev/null | grep -q "^karkardyar$"; then
  echo "🔄 ادغام تراکنش‌های WAL در دیتابیس اصلی..."
  docker compose exec -T karkardyar node -e "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync('/app/data/karkard.sqlite'); db.exec('PRAGMA wal_checkpoint(TRUNCATE);'); db.close();" 2>/dev/null || true
fi

# ۳. تهیه نسخه پشتیبان خودکار قبل از هرگونه آپدیت کد
if [ -f "$PERSISTENT_DATA_DIR/karkard.sqlite" ]; then
  cp -f "$PERSISTENT_DATA_DIR/karkard.sqlite" "$BACKUP_DIR/karkard-pre-update-$TIMESTAMP.sqlite"
  cp -f "$PERSISTENT_DATA_DIR"/karkard.sqlite* /tmp/ 2>/dev/null || true
  echo "✅ نسخه پشتیبان خودکار در $BACKUP_DIR/karkard-pre-update-$TIMESTAMP.sqlite ذخیره شد."
elif [ -f "$LEGACY_DATA_DIR/karkard.sqlite" ]; then
  cp -f "$LEGACY_DATA_DIR"/karkard.sqlite* "$PERSISTENT_DATA_DIR"/ 2>/dev/null || true
  cp -f "$PERSISTENT_DATA_DIR/karkard.sqlite" "$BACKUP_DIR/karkard-pre-update-$TIMESTAMP.sqlite"
  cp -f "$PERSISTENT_DATA_DIR"/karkard.sqlite* /tmp/ 2>/dev/null || true
  echo "✅ نسخه پشتیبان خودکار در $BACKUP_DIR/karkard-pre-update-$TIMESTAMP.sqlite ذخیره شد."
fi

echo "🔄 دریافت آخرین تغییرات کد از گیت‌هاب (بدون دست زدن به دیتابیس)..."
# جلوگیری از خطای تداخل فایل دیتابیس در گیت
git checkout -- "$LEGACY_DATA_DIR" 2>/dev/null || true
git pull

# ۴. اطمینان از اینکه فایل دیتابیس سرور در پوشه امن پس از git pull دست‌نخورده باقی مانده است
if [ -f "/tmp/karkard.sqlite" ]; then
  if [ ! -f "$PERSISTENT_DATA_DIR/karkard.sqlite" ]; then
    cp -f /tmp/karkard.sqlite* "$PERSISTENT_DATA_DIR"/ 2>/dev/null || true
  fi
  rm -f /tmp/karkard.sqlite* 2>/dev/null || true
fi

echo "🐳 ساخت مجدد ایمیج کدها و راه‌اندازی کانتینر داکر..."
docker compose up -d --build

echo "✅ کدهای برنامه با موفقیت آپدیت شد و دیتابیس شما در $PERSISTENT_DATA_DIR کاملاً دست‌نخورده و محفوظ است."

