# خادم المراسلة العربي

## التشغيل على جهازك
1. ثبّت Node.js 18 أو أحدث.
2. نفّذ: `npm install`
3. انسخ `.env.example` إلى `.env` وعدّل `JWT_SECRET`.
4. نفّذ: `npm start`
5. اختبر: `http://localhost:3000/health`

## نقاط الاتصال
- `GET /health`
- `POST /api/auth/register` body: `{ "name":"خليل", "password":"1234" }`
- `POST /api/auth/login` body: `{ "code":"12345", "password":"1234" }`
- `GET /api/users/:code` مع Bearer token
- `GET /api/messages/:code` مع Bearer token
- WebSocket عبر Socket.IO، وأرسل حدث `send_message` بالصيغة `{to:"12345", body:"مرحبا"}`.

## الرفع على الاستضافة
ارفع المجلد إلى خادم يدعم Node.js، ثم نفّذ `npm install` و`npm start`. استخدم HTTPS وWSS في الإنتاج، وضع قيمة JWT_SECRET قوية، ولا تترك CORS على `*` إلا للاختبار.

## ربط تطبيق Android
ضع عنوان الخادم في إعدادات التطبيق مثل:
`https://your-domain.com`
واستخدم `/api/...` للطلبات وSocket.IO لنقل الرسائل الفورية.
