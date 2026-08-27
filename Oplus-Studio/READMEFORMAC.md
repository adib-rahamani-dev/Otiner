# راهنمای خیلی ساده و خیلی دقیق نصب Oplus Studio روی macOS

## راه خیلی ساده: فایل PKG

برای کاربر عادی، فایل `Oplus-Studio-Installer-macOS-1.0.0.pkg` را بسازید و فقط همان یک فایل را تحویل بدهید. کاربر After Effects را می‌بندد، روی PKG دوبار کلیک می‌کند و دکمه‌های `Continue` و `Install` را می‌زند. نصب‌کننده محل درست Adobe و تنظیم CEP 12 را خودش انجام می‌دهد؛ Terminal و کپی دستی لازم نیست.

سورس ساخت PKG در `scripts/build-macos-installer.sh` قرار دارد و باید روی یک Mac اجرا شود:

```bash
chmod +x scripts/*.sh
npm run installer:mac
```

برای انتشار عمومی، PKG باید با گواهی `Developer ID Installer` امضا، سپس توسط Apple notarize و staple شود. نسخه بدون امضا فقط برای تست داخلی مناسب است. راهنمای کوتاه‌تر کاربر نهایی در `README-EASY-INSTALL.md` قرار دارد.

این راهنما طوری نوشته شده که حتی اگر تا امروز Terminal را باز نکرده‌اید، بتوانید افزونه را نصب کنید.

فقط قدم‌ها را به همان ترتیب انجام دهید. هیچ مرحله‌ای را رد نکنید.

---

## قرار است چه کاری انجام دهیم؟

ما پنج کار ساده انجام می‌دهیم:

1. مطمئن می‌شویم After Effects و Node.js آماده هستند.
2. Terminal را در پوشه درست باز می‌کنیم.
3. پروژه را بررسی و Build می‌کنیم.
4. افزونه را در پوشه مخصوص Adobe نصب می‌کنیم.
5. After Effects را باز می‌کنیم و برای Oplus Studio یک Library می‌سازیم.

نگران نباشید؛ اسکریپت نصب بیشتر کارها را خودش انجام می‌دهد.

---

## چیزهایی که قبل از شروع لازم دارید

### 1. کامپیوتر مک

این راهنما مخصوص macOS است.

### 2. Adobe After Effects 2025

Oplus Studio برای After Effects 2025 ساخته شده است.

نسخه اصلی برنامه باید `25.x` باشد؛ برای مثال:

```text
25.0
25.1
25.2
```

برای دیدن نسخه برنامه:

1. After Effects را باز کنید.
2. از بالای صفحه روی `After Effects` کلیک کنید.
3. روی `About After Effects` کلیک کنید.
4. عدد نسخه را پیدا کنید.

اگر نسخه با `25` شروع نمی‌شود، این Build ممکن است در منوی افزونه‌ها نمایش داده نشود.

### 3. Node.js

برای بررسی و ساخت افزونه به Node.js نیاز داریم.

اگر Node.js را ندارید:

1. مرورگر را باز کنید.
2. به [وب‌سایت رسمی Node.js](https://nodejs.org/) بروید.
3. نسخه‌ای را دانلود کنید که روی آن `LTS` نوشته شده است.
4. فایل نصب‌شده را باز کنید.
5. مراحل نصب را با تنظیمات معمولی ادامه دهید.
6. بعد از پایان نصب، Terminal را ببندید و دوباره باز کنید.

در ادامه یاد می‌گیریم چطور نصب بودن Node.js را بررسی کنیم.

### 4. پوشه کامل پروژه

باید پوشه‌ای به نام `Oplus-Studio` داشته باشید.

داخل آن باید حداقل این فایل‌ها و پوشه‌ها دیده شوند:

```text
Oplus-Studio/
├── Extension/
├── Engine/
├── Database/
├── Documentation/
├── scripts/
├── package.json
└── README.md
```

اگر فقط پوشه `Extension` را دارید، سورس کامل پروژه را ندارید و دستورهای Build اجرا نمی‌شوند.

---

## مرحله صفر: After Effects را کاملاً ببندید

قبل از نصب، After Effects باید کاملاً بسته باشد.

1. وارد After Effects شوید.
2. از بالای صفحه روی `After Effects` کلیک کنید.
3. روی `Quit After Effects` کلیک کنید.

می‌توانید کلیدهای زیر را هم فشار دهید:

```text
Command + Q
```

فقط بستن پنجره با دکمه قرمز همیشه برنامه را کاملاً نمی‌بندد. باید از `Command + Q` استفاده کنید.

اگر مطمئن نیستید:

1. برنامه `Activity Monitor` را باز کنید.
2. عبارت `After Effects` را جست‌وجو کنید.
3. مطمئن شوید پردازشی با این نام در حال اجرا نیست.

---

## مرحله یک: Terminal را باز کنید

Terminal برنامه‌ای است که دستورها را داخل آن می‌نویسیم.

برای باز کردن آن:

1. کلیدهای `Command + Space` را فشار دهید.
2. بنویسید:

```text
Terminal
```

3. کلید `Return` یا `Enter` را فشار دهید.

یک پنجره با نوشته‌های متنی باز می‌شود. این همان Terminal است.

---

## مرحله دو: وارد پوشه Oplus-Studio شوید

Terminal باید بداند پروژه کجاست.

ساده‌ترین روش این است:

1. در Terminal بنویسید:

```bash
cd 
```

بعد از `cd` حتماً یک فاصله وجود داشته باشد.

2. هنوز Enter نزنید.
3. Finder را باز کنید.
4. پوشه `Oplus-Studio` را با ماوس بگیرید.
5. همان پوشه را داخل پنجره Terminal رها کنید.

Terminal مسیر کامل پوشه را خودش اضافه می‌کند. چیزی شبیه این می‌بینید:

```bash
cd /Users/your-name/Downloads/Oplus-Studio
```

6. حالا کلید `Return` یا `Enter` را فشار دهید.

برای اینکه مطمئن شوید داخل پوشه درست هستید، این دستور را اجرا کنید:

```bash
pwd
```

خروجی باید در انتها نام `Oplus-Studio` داشته باشد.

حالا این دستور را اجرا کنید:

```bash
ls
```

باید نام‌هایی مثل این‌ها را ببینید:

```text
Extension
Engine
Database
Documentation
scripts
package.json
```

اگر `package.json` را نمی‌بینید، داخل پوشه اشتباهی هستید.

---

## مرحله سه: نصب بودن Node.js را بررسی کنید

در همان Terminal این دستور را اجرا کنید:

```bash
node --version
```

اگر Node.js نصب باشد، یک عدد شبیه این نمایش داده می‌شود:

```text
v20.x.x
```

عدد دقیق ممکن است متفاوت باشد و اشکالی ندارد.

حالا npm را بررسی کنید:

```bash
npm --version
```

این دستور هم باید یک عدد نمایش دهد.

### اگر پیام command not found دیدید

اگر چیزی شبیه این دیدید:

```text
node: command not found
```

یعنی Node.js هنوز نصب نیست یا Terminal بعد از نصب دوباره باز نشده است.

کارهایی که باید انجام دهید:

1. Node.js نسخه LTS را از [nodejs.org](https://nodejs.org/) نصب کنید.
2. Terminal را کاملاً ببندید.
3. Terminal را دوباره باز کنید.
4. دوباره وارد پوشه `Oplus-Studio` شوید.
5. دوباره `node --version` را اجرا کنید.

---

## مرحله چهار: پروژه را بررسی کنید

حالا این دستور را اجرا کنید:

```bash
npm run verify
```

این دستور سه کار انجام می‌دهد:

1. فایل‌ها و ساختار افزونه را بررسی می‌کند.
2. تست‌های موتور Library را اجرا می‌کند.
3. نسخه قابل نصب را داخل پوشه `dist` می‌سازد.

ممکن است چند ثانیه طول بکشد.

اگر همه‌چیز درست باشد، در انتهای خروجی پیام‌هایی شبیه این‌ها می‌بینید:

```text
Oplus Studio contract check passed
13 passed, 0 failed
Built CEP extension at .../dist/studio.oplus.ae
```

عدد تست‌ها ممکن است در نسخه‌های بعدی بیشتر شود. مهم این است که `failed` برابر صفر باشد.

### اگر Terminal خطا نشان داد

به اولین خط قرمز یا اولین پیام `failed` نگاه کنید.

موارد ساده:

- اگر گفت `package.json` پیدا نشد، داخل پوشه اشتباهی هستید.
- اگر گفت `node` یا `npm` پیدا نشد، Node.js نصب نیست.
- اگر فایلی Missing بود، پروژه کامل کپی نشده است.
- اگر پروژه را از یک فایل ZIP گرفته‌اید، اول ZIP را کاملاً Extract کنید.

تا وقتی `npm run verify` موفق نشده، سراغ مرحله نصب نروید.

---

## مرحله پنج: اجازه اجرای اسکریپت‌های نصب را بدهید

macOS ممکن است در اولین اجرا اجازه اجرای فایل‌های `.sh` را ندهد.

این دستور را اجرا کنید:

```bash
chmod +x scripts/*.sh
```

اگر دستور بدون پیام تمام شد، یعنی درست اجرا شده است.

این دستور فقط به اسکریپت‌های داخل پوشه `scripts` اجازه اجرا می‌دهد.

نیازی به `sudo` نیست.

---

## مرحله شش: افزونه را نصب کنید

حالا دستور اصلی نصب را اجرا کنید:

```bash
./scripts/install-dev.sh --debug
```

این دستور کارهای زیر را خودش انجام می‌دهد:

1. پروژه را دوباره بررسی و Build می‌کند.
2. پوشه نسخه نصب‌شدنی را پیدا می‌کند.
3. پوشه CEP کاربر فعلی را می‌سازد.
4. Oplus Studio را در محل درست کپی می‌کند.
5. `PlayerDebugMode` مربوط به CEP 12 را فعال می‌کند.

در پایان باید پیام‌هایی شبیه این‌ها ببینید:

```text
Installed Oplus Studio to /Users/your-name/Library/Application Support/Adobe/CEP/extensions/studio.oplus.ae
Enabled CEP 12 PlayerDebugMode for the current user.
Restart After Effects, then open Window > Extensions > Oplus Studio.
```

مسیر نصب افزونه این است:

```text
~/Library/Application Support/Adobe/CEP/extensions/studio.oplus.ae
```

علامت `~` یعنی پوشه کاربر فعلی شما.

برای مثال ممکن است مسیر کامل چنین باشد:

```text
/Users/sara/Library/Application Support/Adobe/CEP/extensions/studio.oplus.ae
```

### نکته مهم

پوشه `Library` مربوط به کاربر در macOS معمولاً مخفی است. این طبیعی است.

اسکریپت نصب خودش مسیر را پیدا می‌کند؛ لازم نیست آن را دستی بسازید.

---

## مرحله هفت: اجازه نوشتن فایل را در After Effects فعال کنید

Oplus Studio باید بتواند فایل‌های زیر را بسازد:

- `asset.json`
- `data.json`
- `preview.png`
- `settings.json`
- `library.json`
- `Logs/oplus.log`

برای همین باید اجازه نوشتن فایل توسط اسکریپت‌ها را فعال کنید.

1. After Effects 2025 را باز کنید.
2. از نوار بالای macOS روی `After Effects` کلیک کنید.
3. وارد این بخش شوید:

```text
After Effects > Settings > Scripting & Expressions
```

در بعضی نسخه‌ها به‌جای `Settings` کلمه `Preferences` دیده می‌شود:

```text
After Effects > Preferences > Scripting & Expressions
```

4. گزینه زیر را پیدا کنید:

```text
Allow Scripts to Write Files and Access Network
```

5. تیک این گزینه را روشن کنید.
6. روی `OK` کلیک کنید.
7. After Effects را با `Command + Q` کاملاً ببندید.
8. After Effects را دوباره باز کنید.

اگر این گزینه خاموش باشد، پنل ممکن است باز شود ولی ذخیره Asset یا ساخت Preview کار نکند.

---

## مرحله هشت: Oplus Studio را باز کنید

بعد از باز شدن After Effects:

1. از نوار بالای برنامه روی `Window` کلیک کنید.
2. وارد `Extensions` شوید.
3. روی `Oplus Studio` کلیک کنید.

مسیر کامل:

```text
Window > Extensions > Oplus Studio
```

در بعضی نصب‌های Adobe ممکن است منو این نام را داشته باشد:

```text
Window > Extensions (Legacy) > Oplus Studio
```

اگر پنل باز شد، باید بالای آن این وضعیت را ببینید:

```text
Oplus Engine Connected
```

پنل همچنین باید این اطلاعات را نشان دهد:

- نسخه After Effects
- وضعیت Project
- مسیر Library

---

## مرحله نهم: در اولین اجرا Library را بسازید

در اولین اجرا، پنجره Setup دیده می‌شود.

Oplus Studio از شما می‌پرسد فایل‌های Asset کجا ذخیره شوند.

### یک مسیر خوب انتخاب کنید

مثلاً:

```text
/Users/your-name/Movies/OplusLibrary
```

یا روی یک حافظه خارجی:

```text
/Volumes/MyDrive/OplusLibrary
```

اگر از حافظه خارجی استفاده می‌کنید، آن حافظه باید همیشه هنگام استفاده از Oplus Studio به مک وصل باشد.

### چه مسیری انتخاب نکنیم؟

این موارد را انتخاب نکنید:

- ریشه کامل دیسک مثل `/`
- خود پوشه افزونه
- پوشه‌های سیستمی macOS
- پوشه‌ای که اجازه نوشتن داخل آن ندارید
- پوشه موقتی که بعداً پاک می‌شود

### ادامه Setup

1. روی `BROWSE` کلیک کنید.
2. پوشه دلخواه را انتخاب کنید.
3. روی `CREATE LIBRARY` کلیک کنید.

Oplus Studio داخل مسیر انتخاب‌شده این ساختار را می‌سازد:

```text
OplusLibrary/
├── Database/
│   ├── settings.json
│   └── library.json
├── Library/
├── Cache/
└── Logs/
    └── oplus.log
```

بعداً هر Asset داخل `Library` پوشه جداگانه خودش را خواهد داشت:

```text
Library/
└── My Asset/
    ├── asset.json
    ├── data.json
    └── preview.png
```

---

## مرحله ده: یک آزمایش خیلی ساده انجام دهید

حالا بررسی می‌کنیم Save و Import کار می‌کنند.

### ساخت Composition آزمایشی

1. در After Effects یک Project خالی بسازید.
2. یک Composition جدید بسازید.
3. یک Text Layer بسازید.
4. داخل آن مثلاً بنویسید:

```text
Hello Oplus
```

5. Text Layer را در Timeline انتخاب کنید.

### ذخیره Asset

1. در پنل Oplus Studio روی `SAVE` کلیک کنید.
2. یک نام بنویسید؛ مثلاً:

```text
My First Text
```

3. Category را روی `Text` قرار دهید.
4. در صورت تمایل Tag بنویسید.
5. روی دکمه نهایی Save کلیک کنید.
6. چند لحظه صبر کنید تا Preview ساخته شود.

Asset باید در Library دیده شود.

### Import کردن Asset

1. Asset ذخیره‌شده را انتخاب کنید.
2. یک Import Mode انتخاب کنید.
3. روی `IMPORT` کلیک کنید.

لایه باید دوباره وارد Composition شود.

### تست Undo

بعد از Import کلیدهای زیر را فشار دهید:

```text
Command + Z
```

تمام Import باید با یک Undo برگردد.

اگر این اتفاق افتاد، Save، Import و Undo درست کار می‌کنند.

---

## معنی Import Modeها

### Keep Original Position

لایه‌ها در موقعیت ذخیره‌شده خودشان قرار می‌گیرند.

### Center Composition

ریشه Asset به مرکز Composition جدید منتقل می‌شود.

### Place At Current Time

شروع Asset به نشانگر زمان فعلی Timeline منتقل می‌شود.

### Keep Original Time

زمان‌های اصلی ذخیره‌شده حفظ می‌شوند.

### Replace Selected Layers

لایه‌های انتخاب‌شده با Asset واردشده جایگزین می‌شوند. این عملیات در یک Undo Group انجام می‌شود.

---

## روش نصب دستی

روش اسکریپت بالا پیشنهاد می‌شود؛ اما اگر خواستید دستی نصب کنید، این مراحل را انجام دهید.

### 1. Build بگیرید

داخل پوشه پروژه اجرا کنید:

```bash
npm run build
```

نسخه قابل نصب ساخته می‌شود:

```text
dist/studio.oplus.ae
```

فقط همین پوشه Buildشده را نصب کنید.

پوشه `Extension` سورس پروژه است و نباید به‌تنهایی نصب شود.

### 2. پوشه CEP را در Finder باز کنید

1. Finder را باز کنید.
2. از بالای صفحه روی `Go` کلیک کنید.
3. روی `Go to Folder…` کلیک کنید.

می‌توانید کلیدهای زیر را هم فشار دهید:

```text
Command + Shift + G
```

4. این مسیر را Paste کنید:

```text
~/Library/Application Support/Adobe/CEP/extensions
```

5. کلید `Return` را فشار دهید.

اگر پوشه وجود ندارد، پوشه‌ها را دقیقاً با همین نام بسازید.

### 3. پوشه Build را کپی کنید

کل پوشه زیر را:

```text
dist/studio.oplus.ae
```

داخل پوشه `extensions` کپی کنید.

ساختار نهایی باید چنین باشد:

```text
extensions/
└── studio.oplus.ae/
    ├── CSXS/
    │   └── manifest.xml
    ├── UI/
    ├── JSX/
    ├── Engine/
    └── Database/
```

این ساختار اشتباه است:

```text
extensions/
└── studio.oplus.ae/
    └── studio.oplus.ae/
        └── CSXS/
```

یعنی نباید پوشه `studio.oplus.ae` دوبار داخل خودش قرار گرفته باشد.

### 4. Debug Mode را فعال کنید

در Terminal اجرا کنید:

```bash
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
```

بعد After Effects را کاملاً ببندید و دوباره باز کنید.

---

## چطور بفهمیم Debug Mode فعال است؟

در Terminal اجرا کنید:

```bash
defaults read com.adobe.CSXS.12 PlayerDebugMode
```

اگر خروجی این بود، Debug Mode فعال است:

```text
1
```

اگر مقدار وجود نداشت یا خطا دیدید، این دستور را اجرا کنید:

```bash
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
```

بعد After Effects را Restart کنید.

---

## اگر پیام Permission Denied دیدید

اگر هنگام اجرای Installer چنین پیامی دیدید:

```text
permission denied
```

دوباره این دستور را اجرا کنید:

```bash
chmod +x scripts/*.sh
```

سپس دوباره Installer را اجرا کنید:

```bash
./scripts/install-dev.sh --debug
```

از `sudo` استفاده نکنید. نصب برای کاربر فعلی انجام می‌شود و به دسترسی Administrator نیاز ندارد.

---

## اگر macOS درباره دسترسی Terminal سؤال کرد

گاهی macOS می‌پرسد Terminal اجازه دسترسی به `Desktop`، `Documents` یا `Downloads` را دارد یا نه.

اگر پروژه واقعاً داخل همان پوشه‌ای است که پیام درباره آن سؤال می‌کند، اجازه دسترسی را تأیید کنید.

اگر نمی‌خواهید چنین دسترسی‌ای بدهید، پروژه را به یک پوشه توسعه معمولی منتقل کنید؛ مثلاً:

```text
~/Projects/Oplus-Studio
```

نیازی نیست تنظیمات امنیتی دیگر macOS را خاموش کنید.

---

## اگر Oplus Studio در منوی Window دیده نشد

این موارد را یکی‌یکی بررسی کنید.

### بررسی 1: نسخه After Effects

نسخه باید `25.x` باشد.

### بررسی 2: After Effects کاملاً Restart شده باشد

برنامه را فقط با دکمه قرمز نبندید.

از این میانبر استفاده کنید:

```text
Command + Q
```

سپس دوباره برنامه را باز کنید.

### بررسی 3: مسیر نصب درست باشد

در Finder با `Command + Shift + G` این مسیر را باز کنید:

```text
~/Library/Application Support/Adobe/CEP/extensions/studio.oplus.ae
```

داخل آن باید پوشه `CSXS` وجود داشته باشد.

این فایل باید موجود باشد:

```text
CSXS/manifest.xml
```

### بررسی 4: Debug Mode

در Terminal اجرا کنید:

```bash
defaults read com.adobe.CSXS.12 PlayerDebugMode
```

خروجی باید `1` باشد.

### بررسی 5: نام منو

هر دو مسیر را بررسی کنید:

```text
Window > Extensions > Oplus Studio
```

و:

```text
Window > Extensions (Legacy) > Oplus Studio
```

### بررسی 6: پروژه را دوباره نصب کنید

After Effects را ببندید و اجرا کنید:

```bash
npm run verify
chmod +x scripts/*.sh
./scripts/install-dev.sh --debug
```

بعد After Effects را دوباره باز کنید.

---

## اگر پنل باز شد ولی Engine Connected نشد

ابتدا روی وضعیت Connection داخل پنل کلیک کنید تا دوباره تست شود.

بعد این موارد را بررسی کنید:

1. فایل زیر در نسخه نصب‌شده وجود داشته باشد:

```text
JSX/bootstrap.jsx
```

2. After Effects اجازه نوشتن فایل توسط Scriptها را داشته باشد:

```text
After Effects > Settings > Scripting & Expressions
```

3. گزینه زیر روشن باشد:

```text
Allow Scripts to Write Files and Access Network
```

4. After Effects را Restart کنید.

5. فایل Log را بررسی کنید:

```text
OplusLibrary/Logs/oplus.log
```

---

## اگر Save کار نکرد

این موارد را بررسی کنید:

1. یک Composition باز باشد.
2. حداقل یک Layer در Timeline انتخاب شده باشد.
3. Library Location تنظیم شده باشد.
4. مسیر Library قابل نوشتن باشد.
5. اجازه `Allow Scripts to Write Files and Access Network` روشن باشد.
6. دیسک یا حافظه خارجی متصل باشد.
7. فضای خالی کافی وجود داشته باشد.

برای یک تست ساده، فقط یک Text Layer را انتخاب کنید و دوباره Save را امتحان کنید.

---

## اگر Preview سریع ظاهر نشد

ساخت `preview.png` در After Effects می‌تواند چند ثانیه طول بکشد.

کارهای زیر را انجام دهید:

1. کمی صبر کنید.
2. روی `REFRESH` کلیک کنید.
3. بررسی کنید فایل زیر ساخته شده باشد:

```text
OplusLibrary/Library/Asset Name/preview.png
```

اگر Preview ساخته نشد، فایل Log را بررسی کنید:

```text
OplusLibrary/Logs/oplus.log
```

خود Asset ممکن است با وجود خطای Preview همچنان قابل Import باشد.

---

## آپدیت کردن Oplus Studio

برای نصب نسخه جدید:

1. After Effects را با `Command + Q` ببندید.
2. فایل‌های پروژه را با نسخه جدید جایگزین کنید.
3. Terminal را داخل پوشه جدید `Oplus-Studio` باز کنید.
4. اجرا کنید:

```bash
npm run verify
chmod +x scripts/*.sh
./scripts/install-dev.sh --debug
```

5. After Effects را دوباره باز کنید.

اسکریپت نصب هنگام آپدیت از پوشه `Database` نصب قبلی نسخه پشتیبان موقت می‌گیرد و آن را برمی‌گرداند.

Assetهای اصلی داخل Library انتخاب‌شده شما قرار دارند و با Build کردن پروژه پاک نمی‌شوند.

بااین‌حال همیشه از Library مهم خود Backup داشته باشید.

---

## حذف Oplus Studio از مک

### روش ساده با Finder

1. After Effects را کاملاً ببندید.
2. Finder را باز کنید.
3. کلیدهای `Command + Shift + G` را فشار دهید.
4. این مسیر را وارد کنید:

```text
~/Library/Application Support/Adobe/CEP/extensions
```

5. پوشه زیر را پیدا کنید:

```text
studio.oplus.ae
```

6. فقط همین پوشه را به Trash منتقل کنید.

به پوشه Library شخصی Assetها دست نزنید؛ آن پوشه جداست و Assetهای شما را نگه می‌دارد.

### خاموش کردن Debug Mode

اگر دیگر هیچ افزونه CEP توسعه‌ای ندارید، می‌توانید این دستور را اجرا کنید:

```bash
defaults delete com.adobe.CSXS.12 PlayerDebugMode
```

اگر پیام داد که چنین مقداری وجود ندارد، مشکلی نیست.

بعد After Effects را Restart کنید.

---

## تفاوت نسخه Development و نسخه نهایی

روش این راهنما یک نسخه Development و بدون امضای رسمی نصب می‌کند.

به همین دلیل `PlayerDebugMode` را فعال کردیم.

برای انتشار عمومی، افزونه باید:

1. با Certificate امضا شود.
2. به شکل ZXP بسته‌بندی شود.
3. با ابزار مناسب Extension Manager نصب شود.

فایل Certificate و Password آن نباید داخل پروژه قرار بگیرند.

راهنمای رسمی Adobe برای بسته‌بندی:

[Adobe CEP Package, Distribute and Install Guide](https://github.com/Adobe-CEP/Getting-Started-guides/blob/master/Package%20Distribute%20Install/readme.md)

---

## خلاصه خیلی کوتاه برای افراد باتجربه

اگر Node.js و After Effects 2025 آماده هستند:

```bash
cd /path/to/Oplus-Studio
npm run verify
chmod +x scripts/*.sh
./scripts/install-dev.sh --debug
```

سپس در After Effects:

```text
After Effects > Settings > Scripting & Expressions
```

گزینه زیر را روشن کنید:

```text
Allow Scripts to Write Files and Access Network
```

After Effects را Restart کنید و بروید به:

```text
Window > Extensions > Oplus Studio
```

---

## چک‌لیست نهایی

قبل از اینکه بگویید نصب تمام شده، این موارد را بررسی کنید:

- [ ] After Effects نسخه 25.x است.
- [ ] `node --version` یک شماره نشان می‌دهد.
- [ ] `npm --version` یک شماره نشان می‌دهد.
- [ ] `npm run verify` بدون خطا تمام شده است.
- [ ] `chmod +x scripts/*.sh` اجرا شده است.
- [ ] `./scripts/install-dev.sh --debug` موفق شده است.
- [ ] Debug Mode مقدار `1` دارد.
- [ ] اجازه نوشتن فایل توسط Scriptها در After Effects روشن است.
- [ ] After Effects کاملاً Restart شده است.
- [ ] Oplus Studio در منوی Window دیده می‌شود.
- [ ] وضعیت `Oplus Engine Connected` نمایش داده می‌شود.
- [ ] Library Location انتخاب شده است.
- [ ] Save آزمایشی موفق است.
- [ ] `asset.json`، `data.json` و `preview.png` ساخته شده‌اند.
- [ ] Import آزمایشی موفق است.
- [ ] `Command + Z` تمام Import را برمی‌گرداند.

اگر همه موارد تیک خورده‌اند، Oplus Studio آماده استفاده است.
