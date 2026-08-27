# نصب Oplus Studio روی ویندوز

## روش پیشنهادی برای کاربر عادی

فایل `Oplus-Studio-Setup-Windows-1.0.0.exe` را بگیرید، After Effects را ببندید و روی فایل دوبار کلیک کنید. سپس `Next > Install > Finish` را بزنید.

نصب‌کننده خودش افزونه را در مسیر درست کاربر قرار می‌دهد:

`%APPDATA%\Adobe\CEP\extensions\studio.oplus.ae`

همچنین مقدار لازم `PlayerDebugMode` را برای CEP 12 می‌سازد. کاربر لازم نیست AppData، Registry Editor یا PowerShell را باز کند.

بعد از نصب:

1. After Effects 2025 را اجرا کنید.
2. وارد `Window > Extensions > Oplus Studio` شوید.
3. در اولین اجرا، محل Library را انتخاب کنید.

## اگر Windows SmartScreen ظاهر شد

نسخه‌ای که برای عموم منتشر می‌شود باید با گواهی Authenticode ناشر امضا شود. تا قبل از امضا ممکن است Windows عبارت `Unknown publisher` یا پنجره SmartScreen نشان دهد. فقط فایل ساخته‌شده توسط خودتان و دارای hash مورد انتظار را اجرا کنید.

## اگر افزونه نمایش داده نشد

1. نسخه After Effects باید 2025 یا 25.x باشد.
2. After Effects را از Task Manager هم بررسی کنید و مطمئن شوید `AfterFX.exe` بسته است.
3. نصب‌کننده را دوباره اجرا کنید.
4. ویندوز را Restart کنید.
5. دوباره منوی `Window > Extensions` را بررسی کنید.

## پاک‌کردن افزونه

وارد `Settings > Apps > Installed apps` شوید، `Oplus Studio (Development Installer)` را پیدا کنید و `Uninstall` را بزنید.

Library خارجی و Assetهای شما پاک نمی‌شوند. مقدار PlayerDebugMode هم عمداً خودکار حذف نمی‌شود، چون ممکن است افزونه‌های توسعه‌ای دیگر به آن نیاز داشته باشند. برای حذف دستی آن:

```powershell
reg delete HKCU\Software\Adobe\CSXS.12 /v PlayerDebugMode /f
```

## نکته مخصوص انتشار عمومی

این EXE نصب داخلی را بسیار ساده می‌کند، اما فعال‌بودن PlayerDebugMode برای مشتری نهایی ایده‌آل نیست. برای نسخه فروش، ZXP امضاشده و نصب با aescripts ZXP/UXP Installer پیشنهاد می‌شود؛ یا باید زنجیره نصب EXE طوری تکمیل شود که payload امضاشده و خود EXE نیز Authenticode-signed باشد.
