# حالت‌های Save و Load در Otiner Studio 1.4

نسخه 1.4 برای جلوگیری از Freeze و Crash، ذخیره دقیق Asset را از شکل Load آن جدا می‌کند. در هر سه پروفایل، فایل Native AEP مرجع اصلی است و حالت داخلی Shape، Text، Keyframe، Expression و پلاگین‌های نصب‌شده حفظ می‌شود.

## 1. Safe Composition — پیشنهاد اصلی

- سریع‌ترین Save دقیق است.
- هنگام Load، همه لایه‌ها داخل یک Precomposition Native باقی می‌مانند و فقط همان یک Precomp به Composition فعال اضافه می‌شود.
- هیچ لایه‌ای با `copyToComp` تک‌تک کپی نمی‌شود.
- مناسب Assetهای سنگین، Deep Glow، Shapeهای پیچیده و پروژه‌های کاری است.
- Media هنگام Save کپی نمی‌شود؛ هنگام Share به‌صورت کامل جمع‌آوری می‌شود.

## 2. Editable Native Layers

- Save همچنان سریع و Native است.
- هنگام Load، تمام لایه‌ها در یک عملیات Batch Copy/Paste داخلی After Effects وارد می‌شوند.
- لایه‌ها قابل ویرایش و جدا از هم هستند.
- اگر After Effects نتواند همه لایه‌ها را در یک Batch وارد کند، عملیات متوقف می‌شود و کاربر باید Safe Composition را انتخاب کند. مسیر تک‌لایه‌ای پرریسک به‌صورت خودکار اجرا نمی‌شود.

## 3. Maximum Compatibility Archive

- کندترین حالت است.
- علاوه بر Native AEP، تمام Propertyها، Keyframeها، Expressionها و Sourceها در JSON کامل ذخیره می‌شوند.
- Media همان موقع Save جمع‌آوری و SHA-256 آن محاسبه می‌شود.
- حالت Compatibility Rebuild فقط برای Assetهای این پروفایل یا Assetهای قدیمیِ دارای JSON کامل قابل استفاده است.

## گزینه‌های Load Structure

- `Use Asset Default`: از پروفایل ذخیره‌شده استفاده می‌کند. Assetهای قدیمی بدون پروفایل با Safe Precomposition باز می‌شوند.
- `Safe Precomposition`: همیشه یک Precomp وارد می‌کند.
- `Editable Native Layers`: لایه‌ها را با Batch Copy وارد می‌کند.
- `Compatibility Rebuild`: Native AEP را کنار می‌گذارد و از JSON کامل استفاده می‌کند.

## نکات ایمنی

1. پروژه After Effects باید قبل از Save حداقل یک‌بار روی دیسک ذخیره شده باشد.
2. Otiner قبل از ساخت Snapshot، پروژه اصلی را Save می‌کند.
3. پروژه اصلی پیش از پایان فرمان Save به‌صورت هم‌زمان بازگردانده می‌شود؛ Restore دیگر هم‌زمان با عملیات پنل در پس‌زمینه اجرا نمی‌شود.
4. اگر Batch Copy ناقص باشد، لایه‌های نیمه‌واردشده پاک می‌شوند و عملیات با خطای قابل‌کنترل متوقف می‌شود.
5. برای بیشترین پایداری، Safe Composition را انتخاب کنید.
