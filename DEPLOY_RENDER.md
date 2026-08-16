# ย้าย Exam System จาก Railway ไป Render Free

ไฟล์ `render.yaml` ที่ root กำหนด Node.js Web Service, Singapore region, Free instance, คำสั่ง build/start และ `/health` ให้แล้ว

## 1. ตรวจตำแหน่งฐานข้อมูล

ดู hostname ใน `DATABASE_URL` เดิมของ Railway โดยไม่เปิดเผย connection string:

- หากลงท้ายด้วย `neon.tech` ข้อมูลอยู่ที่ Neon และนำ URL เดิมไปใช้บน Render ได้
- หากเป็น hostname ของ Railway ต้อง export/ย้าย PostgreSQL ก่อน มิฉะนั้น Render จะเชื่อมข้อมูลเดิมไม่ได้
- ควร export ฐานข้อมูลต้นทางก่อนเปลี่ยนระบบ และห้าม commit secret ลง Git

## 2. สร้าง Render Blueprint

1. Push `render.yaml` และการแก้ไขทั้งหมดขึ้น GitHub repository `aumakarawuth/exam`
2. เข้า Render Dashboard แล้วเลือก **New > Blueprint**
3. เชื่อม GitHub และเลือก repository `aumakarawuth/exam`
4. Render จะอ่าน `render.yaml` และสร้าง service ชื่อ `charan-exam`
5. เมื่อระบบถาม `DATABASE_URL` ให้วาง Neon **pooled connection string**
6. กดสร้าง Blueprint และรอ deploy

Render สร้าง `ADMIN_KEY` แบบสุ่มให้โดยอัตโนมัติ ดูหรือเปลี่ยนค่าได้ที่ Service > Environment

## 3. Environment variables เพิ่มเติม

เพิ่มเฉพาะฟีเจอร์ที่ใช้งานใน Service > Environment:

```text
REDIS_URL=<Upstash Redis TLS URL>
SESSION_KEY_PREFIX=exam
SUPABASE_URL=<ถ้าใช้เก็บไฟล์>
SUPABASE_SECRET_KEY=<ถ้าใช้เก็บไฟล์>
SUPABASE_STORAGE_BUCKET=exam-assets
RESEND_API_KEY=<ถ้าใช้ส่งรายงานคะแนน>
SCORE_REPORT_FROM_EMAIL=<ผู้ส่งที่ยืนยันใน Resend>
GOOGLE_FORMS_CLIENT_ID=<ถ้าใช้ Google Forms>
GOOGLE_FORMS_CLIENT_SECRET=<ถ้าใช้ Google Forms>
GOOGLE_FORMS_REDIRECT_URI=https://charan-exam.onrender.com/api/google-forms/callback
```

Free instance ไม่มี persistent disk จึงกำหนด `BACKUP_ENABLED=false` ไว้ ข้อมูลหลักยังอยู่ใน Neon แต่ควรจัดทำ database export แยกต่างหาก

## 4. ตรวจหลัง deploy

```text
https://charan-exam.onrender.com/health
https://charan-exam.onrender.com/ready
https://charan-exam.onrender.com/
https://charan-exam.onrender.com/teacher
https://charan-exam.onrender.com/admin
```

- `/health` ต้องคืน HTTP 200 และ `status: ok`
- `/ready` ต้องคืน HTTP 200 และ database engine เป็น `PostgreSQL`
- หาก `/health` ผ่านแต่ `/ready` เป็น 503 ให้ตรวจ `DATABASE_URL` และ Runtime logs

## ข้อจำกัดของ Free instance

Render Free จะพัก service หลังไม่มี inbound traffic 15 นาที และปลุกเมื่อมี request ใหม่ การเปิดครั้งแรกอาจรอประมาณหนึ่งนาที เหมาะกับงานทดลอง/ใช้งานเบาและไม่มี SLA สำหรับ production
