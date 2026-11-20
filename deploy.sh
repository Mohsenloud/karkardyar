#!/usr/bin/env bash
set -euo pipefail

# همیشه از پوشه خود اسکریپت اجرا شود (حتی اگر از مسیر دیگری فراخوانی شد)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

SERVICE_NAME="karkardyar"
PERSISTENT_DATA_DIR="../karkardyar-data"
BACKUP_DIR="../karkardyar-backups"
LEGACY_DATA_DIR="./data"
MAX_BACKUPS=15
TIMESTAMP="$(date +"%Y-%m-%d_%H-%M-%S")"
TMP_GUARD_DIR=""

cleanup() {
  if [ -n "$TMP_GUARD_DIR" ] && [ -d "$TMP_GUARD_DIR" ]; then
    rm -rf "$TMP_GUARD_DIR"
  fi
}
trap cleanup EXIT

# تشخیص دستور Docker Compose (نسخه جدید یا قدیمی)
if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "❌ خطا: Docker Compose روی سرور نصب نیست."
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "❌ خطا: Git روی سرور نصب نیست."
  exit 1
fi

# خواندن پورت برنامه از .env (در صورت وجود) یا پیش‌فرض 3080
APP_PORT="3080"
if [ -f ".env" ]; then
  ENV_PORT="$(grep -E '^[[:space:]]*APP_PORT=' .env | tail -n 1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | tr -d '[:space:]' || true)"
  if [ -n "$ENV_PORT" ]; then
    APP_PORT="$ENV_PORT"
  fi
fi

mkdir -p "$PERSISTENT_DATA_DIR" "$BACKUP_DIR" "$LEGACY_DATA_DIR"
TMP_GUARD_DIR="$(mktemp -d)"
chmod 700 "$TMP_GUARD_DIR"

echo "=================================================="
echo "🚀 شروع بروزرسانی امن کارکردیار ($TIMESTAMP)"
echo "=================================================="

echo "[1/6] 🛡️ بررسی و انتقال دیتابیس‌های قبلی..."
# اگر دیتابیس از نسخه قدیمی در ./data وجود دارد و در پوشه بیرونی نیست، منتقل کن
if [ -f "$LEGACY_DATA_DIR/karkard.sqlite" ] && [ ! -f "$PERSISTENT_DATA_DIR/karkard.sqlite" ]; then
  echo "   📦 انتقال دیتابیس فعلی به پوشه امن ($PERSISTENT_DATA_DIR)..."
  cp -f "$LEGACY_DATA_DIR"/karkard.sqlite* "$PERSISTENT_DATA_DIR"/ 2>/dev/null || true
fi

echo "[2/6] 🔄 ادغام فایل‌های WAL و تهیه نسخه پشتیبان خودکار..."
if "${COMPOSE_CMD[@]}" ps --status running --services 2>/dev/null | grep -q "^${SERVICE_NAME}$"; then
  "${COMPOSE_CMD[@]}" exec -T "$SERVICE_NAME" node -e \
    "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync('/app/data/karkard.sqlite'); db.exec('PRAGMA wal_checkpoint(TRUNCATE);'); db.close();" \
    2>/dev/null || true
fi

BACKUP_FILE=""
if [ -f "$PERSISTENT_DATA_DIR/karkard.sqlite" ] && [ -s "$PERSISTENT_DATA_DIR/karkard.sqlite" ]; then
  BACKUP_FILE="$BACKUP_DIR/karkard-pre-update-$TIMESTAMP.sqlite"
  cp -f "$PERSISTENT_DATA_DIR/karkard.sqlite" "$BACKUP_FILE"
  cp -f "$PERSISTENT_DATA_DIR"/karkard.sqlite* "$TMP_GUARD_DIR"/ 2>/dev/null || true
  echo "   ✅ بکاپ خودکار ذخیره شد: $BACKUP_FILE"

  # نگهداری حداکثر MAX_BACKUPS نسخه پشتیبان اخیر برای جلوگیری از پر شدن دیسک
  OLD_BACKUPS="$(ls -1t "$BACKUP_DIR"/karkard-pre-update-*.sqlite 2>/dev/null | tail -n +$((MAX_BACKUPS + 1)) || true)"
  if [ -n "$OLD_BACKUPS" ]; then
    echo "$OLD_BACKUPS" | xargs -r rm -f
  fi
else
  echo "   ℹ️ فایل دیتابیس قبلی یافت نشد (احتمالاً اولین نصب روی سرور است)."
fi

echo "[3/6] 📥 دریافت آخرین تغییرات کد از گیت..."
# جلوگیری از خطای تداخل روی پوشه legacy data
git checkout -- "$LEGACY_DATA_DIR" 2>/dev/null || true

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if ! git pull --ff-only origin "$CURRENT_BRANCH"; then
  echo "⚠️ هشدار: git pull --ff-only با تداخل مواجه شد. تلاش با git pull معمولی..."
  git pull origin "$CURRENT_BRANCH"
fi
chmod +x "$SCRIPT_DIR/deploy.sh" 2>/dev/null || true

# اطمینان از سالم ماندن دیتابیس در پوشه بیرونی پس از آپدیت گیت
if [ -f "$TMP_GUARD_DIR/karkard.sqlite" ] && [ ! -s "$PERSISTENT_DATA_DIR/karkard.sqlite" ]; then
  echo "   🔁 بازیابی فایل دیتابیس از نسخه محافظتی..."
  cp -f "$TMP_GUARD_DIR"/karkard.sqlite* "$PERSISTENT_DATA_DIR"/ 2>/dev/null || true
fi

echo "[4/6] 🐳 ساخت ایمیج جدید و راه‌اندازی کانتینر..."
"${COMPOSE_CMD[@]}" up -d --build --remove-orphans

echo "[5/6] 🩺 بررسی سلامت سرویس روی پورت $APP_PORT..."
HEALTH_OK=false
for i in $(seq 1 20); do
  if command -v curl >/dev/null 2>&1; then
    if curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then
      HEALTH_OK=true
      break
    fi
  else
    if "${COMPOSE_CMD[@]}" exec -T "$SERVICE_NAME" node -e \
      "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))" \
      >/dev/null 2>&1; then
      HEALTH_OK=true
      break
    fi
  fi
  sleep 1.5
done

if [ "$HEALTH_OK" != "true" ]; then
  echo "❌ خطا: سرویس پس از ۳۰ ثانیه به /api/health پاسخ نداد."
  echo "📋 آخرین لاگ‌های کانتینر:"
  "${COMPOSE_CMD[@]}" logs --tail=40 "$SERVICE_NAME" || true
  if [ -n "$BACKUP_FILE" ]; then
    echo "🛡️ دیتابیس شما محفوظ است. فایل پشتیبان: $BACKUP_FILE"
  fi
  exit 1
fi

echo "[6/6] 🧹 پاکسازی ایمیج‌های بلااستفاده داکر..."
docker image prune -f >/dev/null 2>&1 || true

echo "=================================================="
echo "✅ بروزرسانی با موفقیت کامل شد!"
echo "🌐 آدرس محلی سرور: http://127.0.0.1:${APP_PORT}"
echo "💾 مسیر دائمی دیتابیس: $(cd "$PERSISTENT_DATA_DIR" && pwd)/karkard.sqlite"
if [ -n "$BACKUP_FILE" ]; then
  echo "🗂️ آخرین بکاپ قبل از آپدیت: $BACKUP_FILE"
fi
echo "=================================================="
