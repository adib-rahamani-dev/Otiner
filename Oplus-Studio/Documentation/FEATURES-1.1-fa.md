# امکانات Otiner Studio 1.1

## نکته مهم برای اولین آپدیت

نسخه 1.0 هنوز دکمه Update را ندارد. بنابراین ارتقا از 1.0 به 1.1 باید یک‌بار با Setup ویندوز، PKG مک، یا دستور نصب مستقیم انجام شود. از نسخه 1.1 به بعد، فایل‌های جدید `Otiner-Update-*.zip` را می‌توان مستقیماً داخل پنجره Update افزونه Drag & Drop کرد.

## Share Asset

1. یک Asset را انتخاب کنید.
2. در پنل جزئیات روی `SHARE ASSET` بزنید.
3. پوشه مقصد را انتخاب کنید.
4. Otiner فایلی با پسوند `.otiner-asset.zip` می‌سازد و محل آن را باز می‌کند.

فایل Share شامل `asset.json`، `data.json` و Preview همان Asset است. فایل‌های Library دیگر یا تنظیمات شخصی داخل آن قرار نمی‌گیرند.

## Update با Drag & Drop

1. روی دکمه `UPDATE` بالای پنل بزنید.
2. فایل رسمی `Otiner-Update-<version>.zip` را داخل Drop Zone بیندازید.
3. Otiner فایل را اعتبارسنجی و نسخه را مقایسه می‌کند.
4. یک Backup کامل در CEP User Data می‌سازد.
5. کد افزونه را به‌روز می‌کند و Database، Logs و Cache فعلی را نگه می‌دارد.
6. After Effects را کامل ببندید و دوباره باز کنید.

فایل‌های دارای Path Traversal، Symbolic Link، Bundle ID اشتباه، نسخه نامعتبر، نسخه قدیمی/برابر یا حجم خارج از محدودیت رد می‌شوند. در صورت خطای نوشتن، Otiner از Backup برای Rollback استفاده می‌کند.

## نصب یک‌باره 1.1 روی مک از Terminal

فایل `Otiner-Update-1.1.0.zip` را داخل Downloads قرار دهید، After Effects را ببندید و این بلوک را اجرا کنید:

```bash
UPDATE="$HOME/Downloads/Otiner-Update-1.1.0.zip"
TARGET="$HOME/Library/Application Support/Adobe/CEP/extensions/studio.oplus.ae"
BACKUP="$HOME/Library/Application Support/Otiner Studio/Backups/studio.oplus.ae-$(date +%Y%m%d-%H%M%S)"
TEMP_DIR="$(mktemp -d -t otiner-update)"

ditto -x -k "$UPDATE" "$TEMP_DIR"
mkdir -p "$(dirname "$TARGET")" "$(dirname "$BACKUP")"
if [ -d "$TARGET" ]; then ditto "$TARGET" "$BACKUP"; fi
mkdir -p "$TARGET"
ditto "$TEMP_DIR/studio.oplus.ae" "$TARGET"
defaults write com.adobe.CSXS.12 PlayerDebugMode -string 1
rm -rf "$TEMP_DIR"

if [ -f "$TARGET/CSXS/manifest.xml" ]; then
  echo "Otiner Studio 1.1 installed successfully"
else
  echo "Installation failed"
fi
```

بعد از این نصب یک‌باره، آپدیت‌های بعدی از داخل خود Otiner انجام می‌شوند.

## اصلاح Text

نسخه 1.1 مقدار Source Text را از مسیر صحیح `ADBE Text Properties > ADBE Text Document` می‌خواند. تست خودکار round-trip و Host Smoke نیز بررسی می‌کنند که متن بعد از Save و Import دقیقاً خالی نشده و برابر مقدار اصلی باشد.
