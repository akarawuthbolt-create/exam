# Exam System Backend

ระบบสอบออนไลน์สำหรับนักเรียน อาจารย์ และผู้ดูแลระบบ พัฒนาด้วย Node.js และ Express รองรับการตรวจข้อสอบที่ฝั่งเซิร์ฟเวอร์ การประกาศผล วิเคราะห์ข้อสอบ ส่งออก Excel/PDF และจัดเก็บข้อมูลด้วย SQLite หรือ PostgreSQL

## ความต้องการของระบบ

- Node.js รุ่นที่รองรับ `node:sqlite` (แนะนำ Node.js 22.13 ขึ้นไป)
- npm
- PostgreSQL เป็นทางเลือกสำหรับ production

## เริ่มใช้งานในเครื่อง

```powershell
npm install
Copy-Item .env.example .env
npm start
```

เปิดหน้าเว็บที่:

- นักเรียน: `http://localhost:3000/`
- อาจารย์: `http://localhost:3000/teacher`
- ผู้ดูแลระบบ: `http://localhost:3000/admin`
- งาน Object Analysis/DFD: `http://localhost:3000/object-analysis-design`
- Liveness check: `http://localhost:3000/health`
- Readiness check: `http://localhost:3000/ready`

ระบบจะใช้ SQLite ที่ `data/exam-system.sqlite` เมื่อไม่ได้กำหนด `DATABASE_URL` และจะสร้างข้อมูลตัวอย่างเมื่อฐานข้อมูลยังไม่มีชุดข้อสอบ

## คำสั่งที่ใช้บ่อย

```powershell
npm start                 # เปิดเซิร์ฟเวอร์
npm run dev               # เปิดแบบ watch mode
npm test                  # รันชุดทดสอบทั้งหมด
npm run migrate:postgres  # ย้ายข้อมูล local ไป PostgreSQL
```

บน Windows ที่ไม่อนุญาตให้รัน `npm.ps1` สามารถใช้ `npm.cmd` แทน `npm` ได้

## การตั้งค่า

คัดลอก [.env.example](./.env.example) เป็น `.env` และกำหนดค่าที่ต้องใช้:

| ตัวแปร | จำเป็น | รายละเอียด |
| --- | --- | --- |
| `PORT` | ไม่ | พอร์ต HTTP ค่าเริ่มต้น `3000` |
| `ADMIN_KEY` | ใช่ | secret สำหรับผู้ดูแลระบบ ห้ามใช้ค่าเริ่มต้นใน production |
| `DATABASE_URL` | Production | PostgreSQL connection string; เว้นว่างเพื่อใช้ SQLite |
| `RESEND_API_KEY` | Email reports | API key จาก Resend; เว้นว่างเพื่อปิดการส่งอีเมล |
| `SCORE_REPORT_FROM_EMAIL` | Email reports | ผู้ส่งที่ยืนยันโดเมนใน Resend เช่น `Exam System <scores@school.ac.th>` |
| `DATABASE_SSL` | ไม่ | กำหนด `false` เฉพาะ PostgreSQL ในเครื่องที่ไม่มี TLS |
| `SUPABASE_URL` | ไม่ | URL ของ Supabase สำหรับจัดเก็บ asset |
| `SUPABASE_SECRET_KEY` | ไม่ | Supabase secret key ฝั่งเซิร์ฟเวอร์ |
| `SUPABASE_STORAGE_BUCKET` | ไม่ | bucket ค่าเริ่มต้น `exam-assets` |
| `GOOGLE_FORMS_CLIENT_ID` | ไม่ | Google OAuth client ID |
| `GOOGLE_FORMS_CLIENT_SECRET` | ไม่ | Google OAuth client secret |
| `GOOGLE_FORMS_REDIRECT_URI` | ไม่ | callback URL ซึ่งต้องลงท้ายด้วย `/api/google-forms/callback` |
| `GOOGLE_FORMS_TOKEN_ENCRYPTION_KEY` | ไม่ | key สำหรับเข้ารหัสการเชื่อมต่อ Google Forms ที่จำไว้ (ใช้ `BACKUP_ENCRYPTION_KEY` หากไม่กำหนด) |

ห้าม commit ไฟล์ `.env`, database local หรือ secret ใด ๆ เข้า Git

## โครงสร้างโปรเจกต์

```text
server.js              จุดเริ่มต้นและประกอบ Express application
src/config.js          อ่านค่า environment และ path
src/database.js        SQLite/PostgreSQL schema, migration และ persistence
src/auth.js            password hashing และ session middleware
src/grading.js         ตรวจข้อสอบและควบคุมช่วงเวลาสอบ
src/routes/            REST API แยกตามฟีเจอร์
public/                หน้าเว็บนักเรียน อาจารย์ และผู้ดูแลระบบ
scripts/               migration scripts
test/                  unit และ integration tests
data/                  ฐานข้อมูลสำหรับ local development
```

## ฐานข้อมูล

### SQLite

เป็นโหมดเริ่มต้นสำหรับ development ไม่ต้องตั้งค่าเพิ่มเติม ไฟล์ฐานข้อมูลไม่ถูกติดตามด้วย Git

### PostgreSQL

กำหนด `DATABASE_URL` ก่อนเปิดระบบ ตารางและ index ที่จำเป็นจะถูกสร้างอัตโนมัติ หากต้องการย้ายข้อมูลจาก SQLite ให้สำรองข้อมูลก่อนแล้วรัน:

```powershell
npm run migrate:postgres
```

## การทดสอบ

```powershell
npm test
```

## Production readiness, backup และ alerts

Frontend หลักถูกแยกเป็น HTML สำหรับโครงสร้าง และไฟล์ CSS/JavaScript รายหน้าภายใต้ `public/assets/` เพื่อลดขนาดไฟล์ HTML และทำให้แก้ไข ทดสอบ และ cache asset ได้ง่ายขึ้น

- `GET /health` ใช้ตรวจว่า process ยังทำงาน (liveness)
- `GET /ready` probe ฐานข้อมูลจริงทุกครั้งและคืน HTTP 503 เมื่อฐานข้อมูลไม่ตอบภายใน `DATABASE_READINESS_TIMEOUT_MS`; ใช้ `/health` สำหรับ liveness ที่ตรวจถี่ และตั้ง `/ready` ให้ตรวจห่างกว่าเพื่อไม่ปลุก Neon โดยไม่จำเป็น
- หน้า Admin > Operations แสดงสถานะฐานข้อมูลแบบ live, latency, backup และ external alerts
- เปิด backup ด้วย `BACKUP_ENABLED=true` และกำหนด `BACKUP_ENCRYPTION_KEY` อย่างน้อย 32 ตัวอักษร ไฟล์จะถูก gzip และเข้ารหัส AES-256-GCM ก่อนเขียนแบบ atomic
- `RESTORE_DRILL_ENABLED=true` จะ enqueue การทดสอบกู้คืนหลัง backup สำเร็จ โดยถอดรหัสและตรวจโครงสร้างในหน่วยความจำเท่านั้น ไม่เขียนทับฐานข้อมูลจริง
- `BACKUP_INTERVAL_HOURS` กำหนดรอบสำรอง และ `BACKUP_RETENTION_DAYS` กำหนดอายุไฟล์
- กำหนด `ALERT_WEBHOOK_URL` เพื่อรับ JSON alerts เมื่อฐานข้อมูลล่ม/ฟื้น, backup ล้มเหลว/ฟื้น, 5xx สูง หรือคิวส่งข้อสอบใกล้เต็ม โดยไม่มีข้อมูลนักเรียนหรือคำตอบใน payload
- งานเบื้องหลังใช้ queue ที่จำกัด concurrency และจำนวนงานค้าง รองรับ timeout, exponential retry, deduplication และ graceful drain โดยดูสถานะได้ที่ Admin > Operations; ปรับขนาดด้วย `JOB_CONCURRENCY`, `JOB_MAX_PENDING` และ `JOB_RETRY_BASE_MS`
- กำหนด `REDIS_URL` เพื่อใช้ shared teacher/student sessions ระหว่างหลาย application instances; หากเว้นว่าง local development จะใช้ memory store และหน้า Operations จะแสดงสถานะดังกล่าว
- Admin > Operations ใช้ authenticated SSE stream เพื่อแสดงจำนวนนักเรียนที่กำลังทำข้อสอบ ผลส่งล่าสุด และสถานะคิวทุก 3 วินาที โดยส่งเฉพาะ aggregate metrics และไม่ใส่ admin key ใน URL
- การ์ดคะแนนไม่ตรง/ตรวจสอบไม่ได้ใน Operations เปิดรายงาน expected เทียบ actual แยกตามส่วน พร้อมสาเหตุและผู้เรียนที่ได้รับผล โดยไม่ส่งคำตอบหรือเฉลย และไม่แก้คะแนนอัตโนมัติ

หาก deploy บน Railway หรือ container ที่ไม่มี persistent volume ไฟล์ใน `BACKUP_DIR` จะหายเมื่อ redeploy จึงไม่ควรเปิด file backup โดยไม่มี external storage และควรให้ระบบ monitoring ภายนอก (เช่น UptimeRobot, Better Stack หรือ provider health check) เรียก `/health` สำหรับการตรวจถี่ และเรียก `/ready` ทุก 5-10 นาทีจากภายนอกเพื่อยืนยันฐานข้อมูลจริง ไม่ควรพึ่ง webhook ภายใน process เพียงทางเดียว ควรทดสอบ restore จากไฟล์ `.json.gz.enc` เป็นระยะและเก็บ `BACKUP_ENCRYPTION_KEY` แยกจากไฟล์ backup

ชุดทดสอบใช้ SQLite และปิดการเชื่อมต่อ PostgreSQL เมื่อ `NODE_ENV=test` โดยครอบคลุมการยืนยันตัวตน สิทธิ์การเข้าถึง การตรวจคะแนน การส่งออกเอกสาร Google Forms และการไม่เปิดเผยเฉลยแก่นักเรียน

## ตรวจสอบก่อน deploy

- เปลี่ยน `ADMIN_KEY` เป็นค่าแบบสุ่มที่ยาวและคาดเดายาก
- กำหนด `DATABASE_URL` และสำรองฐานข้อมูล
- เปิด HTTPS ที่ reverse proxy หรือ hosting provider
- เก็บ Supabase และ Google OAuth secrets เฉพาะในระบบ environment variables
- ตรวจว่า Google redirect URI ตรงกับโดเมน production
- รัน `npm test` ให้ผ่านก่อน deploy

Session ของอาจารย์และนักเรียนถูกเก็บในหน่วยความจำของ process ปัจจุบัน การ restart จะทำให้ session หมด และการรันหลาย instance ควรย้าย session ไปใช้ shared store ก่อน

เมื่อได้รับ `SIGTERM` หรือ `SIGINT` ระบบจะหยุดรับ connection ใหม่ รอการเขียนข้อมูลที่กำลังทำงาน และปิดฐานข้อมูลก่อนจบ process โดยมีเวลา graceful shutdown สูงสุด 10 วินาที
