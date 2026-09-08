# استخدام بيئة تشغيل Node.js رسمية
FROM node:18-alpine

# إنشاء مجلد العمل داخل الحاوية
WORKDIR /app

# نسخ ملفات اعتماد المشروع
COPY package*.json ./

# تثبيت الحزم المطلوبة
RUN npm install

# نسخ باقي ملفات المشروع
COPY . .

# المنفذ الذي يستمع عليه السيرفر
EXPOSE 3000

# أمر تشغيل التطبيق
CMD ["npm", "start"]
