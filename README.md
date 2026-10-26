# AWS Network Test

Невеликий навчальний React SPA + Node.js API для дослідження HTTP, AWS VPC, ALB, EC2 та Security Groups. Авторизації, бази даних та AWS SDK немає. AWS ресурси автоматично не створюються.

## Локальний запуск

Потрібен Node.js 22.12+ (або новіший LTS) та npm.

```powershell
cd D:\code\aws\aws\aws-project-test
npm install
Copy-Item .env.example .env
npm run server
```

В іншому терміналі з тієї ж папки:

```powershell
npm run dev
```

Відкрити http://localhost:5173. API: http://127.0.0.1:3000/api/info.
Vite передає `/api` на Node.js порт 3000. Це same-origin request для браузера, тому CORS не потрібен. Порт 5173 зайнятий — Vite повідомить про помилку, а не обере інший порт.

## Один сервер, як на майбутній EC2

Зупинити попередній backend через Ctrl+C, потім:

```powershell
npm run build
npm start
```

Відкрити http://127.0.0.1:3000. Node.js віддає і `dist/`, і API. Vite на EC2 запускати не потрібно. `/api/health` повертає HTTP 200 для майбутнього ALB Health Check.

## Файли

- `frontend/main.jsx` — React cards, fetch, Refresh Data, loading/error states.
- `frontend/style.css` — просте адаптивне оформлення.
- `backend/server.js` — API, optional IMDSv2, роздача frontend build.
- `vite.config.js` — frontend dev server і proxy для API.
- `index.html` — HTML-вхід SPA.
- `.env.example` — приклад несекретної конфігурації backend.
- `package.json` / `package-lock.json` — команди та зафіксовані залежності.
- `dist/` — результат build; `node_modules/` — встановлені залежності, обидві папки ігноруються Git.

## Звідки беруться значення

Frontend URL, protocol, port і hostname беруться з `window.location`. Backend hostname — з ОС, private IP — environment, IMDSv2 або перша приватна IPv4 мережевого інтерфейсу. На ноутбуці з VPN це лише best effort; джерело показано на сторінці.

Region, AZ та instance ID можна задати як `AWS_REGION`, `AWS_AVAILABILITY_ZONE`, `EC2_INSTANCE_ID`. Якщо `ENABLE_IMDS=true` на EC2, backend отримує короткочасний IMDSv2 token і читає тільки instance identity document. Token та весь документ не передаються браузеру. Таймаути обмежені; IMDS failure не ламає API. Рекомендується також налаштувати EC2 Metadata options: IMDSv2 required. Локально залишити `ENABLE_IMDS=false`.

`VPC_ID`, `SUBNET_ID` і `ALB_DNS_NAME` задаються вручну через environment: так простіше зрозуміти конфігурацію без AWS API, IAM permissions та SDK. Незаповнені значення повертаються як `null`; вони не вигадуються. Після зміни `.env` перезапустити backend. Змінні `.env` автоматично не експортуються у React. Не додавайте credentials або секрети до цих діагностичних полів.

`X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Port`, `Host` показуються як raw headers. Їх може підробити прямий клієнт: це навчальна діагностика, не механізм авторизації. `peerAddress` показує TCP peer, за ALB це адреса його вузла. `Host` не обов'язково дорівнює ALB DNS. DNS задаємо окремо; ALB не має однієї гарантованої постійної IP-адреси.

API не віддає довільні environment variables, metadata credentials або файли поза `dist/`. Водночас hostname, private IP та instance ID є внутрішньою діагностикою: цей приклад не слід перетворювати на публічний production diagnostics endpoint.

## Майбутня AWS архітектура

```text
Browser → Internet → Internet Gateway → ALB listener :80
                                      → Target Group → EC2 private IP :3000
                                                      → Node.js (React + API)
```

VPC `10.0.0.0/16`; дві public subnets у різних AZ (план: `10.0.1.0/24`, `10.0.2.0/24`); Internet Gateway та route table з default route. ALB використовує обидві subnets; для навчання спочатку буде одна EC2, тому backend не має високої доступності. Subnet стає public завдяки маршруту до IGW, а не через назву. IGW не є HTTP proxy.

ALB SG: inbound TCP 80 з `0.0.0.0/0`; outbound TCP 3000 до EC2 SG. EC2 SG: inbound TCP 3000 тільки від ALB SG, а не з `0.0.0.0/0`. Health Check також використовує цей порт. На EC2 встановимо `HOST=0.0.0.0`, `NODE_ENV=production`. Це bind на інтерфейси сервера; доступ обмежується SG. SSH 22, якщо знадобиться, дозволятимемо лише з вашої IP `/32`.

Перший варіант використовує HTTP 80; HTTPS 443 вимагатиме окремого налаштування certificate/listener. Public IPv4 EC2 може знадобитися для встановлення пакетів без NAT Gateway; вона не є адресою target для ALB. EC2, EBS, ALB, public IPv4 та окремі види data transfer можуть оплачуватися. NAT Gateway у цьому проєкті не планується. Після навчання платні ресурси потрібно видалити, а не просто закрити браузер.

AWS створюємо поетапно в Console. Перший крок — тільки VPC; решту ресурсів поки не створюємо.
