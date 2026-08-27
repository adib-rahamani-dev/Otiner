# نصب خیلی ساده Oplus Studio

این راهنما برای کسی است که نمی‌خواهد با کد، Terminal، PowerShell یا پوشه‌های سیستمی درگیر شود.

## ویندوز — فقط یک فایل EXE

فایلی که باید به کاربر بدهید شبیه این است:

`Oplus-Studio-Setup-Windows-1.0.0.exe`

کاربر فقط این کارها را انجام می‌دهد:

1. After Effects را کامل ببندد.
2. روی فایل EXE دوبار کلیک کند.
3. اگر ویندوز سؤال امنیتی نشان داد، فقط وقتی ادامه دهد که نام ناشر و منبع فایل را می‌شناسد.
4. دکمه‌های `Next`، سپس `Install` و بعد `Finish` را بزند.
5. After Effects 2025 را باز کند.
6. از بالای برنامه وارد `Window > Extensions > Oplus Studio` شود.

تمام. نیازی به کپی‌کردن فایل، پیدا‌کردن AppData یا دست‌زدن به Registry نیست.

## مک — فقط یک فایل PKG

فایلی که باید به کاربر بدهید شبیه این است:

`Oplus-Studio-Installer-macOS-1.0.0.pkg`

کاربر فقط این کارها را انجام می‌دهد:

1. After Effects را کامل ببندد.
2. روی فایل PKG دوبار کلیک کند.
3. روی `Continue` و سپس `Install` کلیک کند.
4. اگر مک رمز خواست، رمز همان حساب مک را وارد کند.
5. وقتی پیام موفقیت آمد، Installer را ببندد.
6. After Effects 2025 را باز کند.
7. از بالای برنامه وارد `Window > Extensions > Oplus Studio` شود.

تمام. نیازی به بازکردن Terminal یا نمایش پوشه‌های مخفی نیست.

## اولین اجرای افزونه

اولین بار که پنل باز می‌شود:

1. روی `Choose Library Location` کلیک کنید.
2. یک پوشه معمولی و قابل نوشتن انتخاب کنید؛ مثلاً `Documents/Oplus Library`.
3. از این به بعد فایل‌های Library در همان پوشه می‌مانند.

نصب نسخه جدید افزونه، Library انتخاب‌شده و Assetهای ذخیره‌شده را پاک نمی‌کند.

## اگر پنل دیده نشد

1. مطمئن شوید After Effects نسخه 2025 یعنی 25.x است.
2. After Effects را کامل ببندید؛ فقط بستن پروژه کافی نیست.
3. دوباره فایل نصب را اجرا کنید.
4. کامپیوتر را یک‌بار Restart کنید.
5. دوباره `Window > Extensions > Oplus Studio` را بررسی کنید.

## پیشنهاد انتشار نهایی

فایل‌های EXE و PKG فعلی برای تست داخلی ساخته می‌شوند و حالت توسعه CEP را فعال می‌کنند. برای فروش یا انتشار عمومی، بهترین مسیر این است:

1. افزونه با گواهی به فایل `.zxp` امضا شود.
2. کاربر برنامه رایگان `aescripts + aeplugins ZXP/UXP Installer` را نصب کند.
3. فایل `.zxp` را داخل آن بکشد و روی Install کلیک کند.

این روش استانداردتر است و لازم نیست حالت توسعه روی سیستم مشتری فعال شود. صفحه رسمی Installer: https://aescripts.com/learn/post/zxp-installer

## ساخت فایل EXE توسط توسعه‌دهنده

پیش‌نیاز: Node.js و Inno Setup 6 روی ویندوز نصب باشند.

در پوشه پروژه اجرا کنید:

```powershell
npm run installer:windows
```

خروجی در پوشه `release` ساخته می‌شود. اگر Inno Setup خودکار پیدا نشد:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-windows-installer.ps1 -IsccPath "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
```

## ساخت فایل PKG توسط توسعه‌دهنده

فایل PKG فقط روی خود macOS ساخته می‌شود. پروژه را روی مک باز کنید و اجرا کنید:

```bash
chmod +x scripts/*.sh
npm run installer:mac
```

خروجی در پوشه `release` ساخته می‌شود. برای انتشار عمومی، PKG باید با `Developer ID Installer` امضا و توسط Apple notarize شود. اگر شناسه امضا تنظیم شده باشد، اسکریپت مرحله امضای package را انجام می‌دهد:

اگر نمی‌خواهید روی Mac با Terminal کار کنید، کل پوشه پروژه را به Mac منتقل کنید و روی فایل `BUILD-MAC-PKG.command` دوبار کلیک کنید. این فایل از build آماده داخل `dist` استفاده می‌کند، PKG را می‌سازد و پوشه خروجی را خودش باز می‌کند. اگر macOS اجازه اجرای فایل را نداد، یک‌بار روی آن راست‌کلیک و `Open` را انتخاب کنید.

```bash
export OPLUS_MAC_INSTALLER_ID="Developer ID Installer: COMPANY NAME (TEAMID)"
npm run installer:mac
```

Notarization و stapling بعد از ساخت باید با اطلاعات Apple Developer همان ناشر انجام شود.

## ساخت ZXP امضاشده

به ابزار Adobe `ZXPSignCmd`، یک گواهی `.p12` و رمز آن نیاز دارید. رمز یا فایل گواهی را داخل Git قرار ندهید.

PowerShell ویندوز:

```powershell
$env:ZXPSIGNCMD_PATH = "C:\Tools\ZXPSignCmd.exe"
$env:OPLUS_ZXP_CERTIFICATE = "C:\Secure\oplus-signing.p12"
$env:OPLUS_ZXP_PASSWORD = "YOUR_SECRET_PASSWORD"
npm run package:zxp
```

Terminal مک:

```bash
export ZXPSIGNCMD_PATH="/Applications/ZXPSignCmd"
export OPLUS_ZXP_CERTIFICATE="$HOME/Secure/oplus-signing.p12"
export OPLUS_ZXP_PASSWORD="YOUR_SECRET_PASSWORD"
npm run package:zxp
```

خروجی `Oplus-Studio-1.0.0.zxp` در پوشه `release` ساخته و همان لحظه verify می‌شود.

نکته امنیتی: رابط رسمی ZXPSignCmd رمز گواهی را به‌صورت آرگومان دریافت می‌کند؛ ساخت ZXP را فقط روی سیستم ساخت امن یا CI امن انجام دهید.
