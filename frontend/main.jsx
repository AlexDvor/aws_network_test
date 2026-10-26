import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function Card({ title, values }) {
	return (
		<section className='card'>
			<h2>{title}</h2>
			<dl>
				{Object.entries(values).map(([key, value]) => (
					<div key={key}>
						<dt>{key}</dt>
						<dd>
							{value === null || value === undefined || value === ''
								? 'Не налаштовано / недоступно'
								: String(value)}
						</dd>
					</div>
				))}
			</dl>
		</section>
	);
}

function App() {
	const [data, setData] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [status, setStatus] = useState(null);
	async function refresh() {
		setLoading(true);
		setError('');
		setStatus(null);
		setData(null);
		try {
			const response = await fetch('/api/info', {
				cache: 'no-store',
				signal: AbortSignal.timeout(10000),
			});
			setStatus(response.status);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			setData(await response.json());
		} catch (e) {
			setError(
				`Не вдалося отримати дані: ${e.message}. Перевірте запуск backend на порту 3000.`,
			);
		} finally {
			setLoading(false);
		}
	}
	useEffect(() => {
		refresh();
	}, []);
	const url = new URL(window.location.href);
	return (
		<main>
			<header>
				<div>
					<p className='eyebrow'>CLOUD ENGINEERING LAB / 01</p>
					<h1>AWS Network Test</h1>
					<p>Один HTTP-запит. Увесь шлях перед вами.</p>
				</div>
				<button onClick={refresh} disabled={loading}>
					{loading ? 'Loading…' : 'Refresh Data'}
				</button>
			</header>
			<section className='flow'>
				<span>Browser</span>
				<b>→</b>
				<span>Internet / IGW</span>
				<b>→</b>
				<span>ALB :80 / :443</span>
				<b>→</b>
				<span>EC2 :{data?.backend.port || 3000}</span>
				<b>→</b>
				<span>Node.js API</span>
			</section>
			<p className='note'>
				Це майбутній AWS-шлях. Локально: Browser :5173 → Vite proxy → Node.js
				:3000. Internet Gateway забезпечує маршрутизацію, а не обробляє HTTP.
			</p>
			<p role='status' aria-live='polite'>
				{loading
					? 'Отримуємо актуальні дані…'
					: error
						? 'Запит не виконано'
						: `HTTP ${status} · Дані оновлено`}
			</p>
			{error && (
				<p role='alert' className='error'>
					{error}
				</p>
			)}
			<div className='grid'>
				<Card
					title='Frontend'
					values={{
						URL: url.href,
						Protocol: url.protocol,
						Port: url.port || (url.protocol === 'https:' ? '443' : '80'),
						'Browser hostname': url.hostname,
						'Browser host': url.host,
					}}
				/>
				<Card
					title='Load Balancer'
					values={{
						'DNS name (environment)': data?.loadBalancer.dnsName,
						'Listener port (forwarded header)': data?.request.forwardedPort,
						'Protocol (forwarded header)': data?.request.forwardedProto,
					}}
				/>
				{data && (
					<>
						<Card title='Backend' values={data.backend} />
						<Card title='AWS' values={data.aws} />
						<Card
							title='Request'
							values={{
								...data.request,
								'Response status': status,
								'Browser API URL': `${url.origin}/api/info`,
							}}
						/>
					</>
				)}
				<section className='card'>
					<h2>Як читати ці дані</h2>
					<p>
						80 — HTTP, 443 — HTTPS, 3000 — наш Node.js. ALB DNS задається
						окремо: Host header може містити власний домен.
					</p>
					<p>
						X-Forwarded-* показує передані proxy значення. Вони не доводять
						наявність ALB і не використовуються для авторизації.
					</p>
					<p>
						Порожні AWS-поля локально — нормальна поведінка. DNS Load Balancer
						не є постійною IP-адресою.
					</p>
				</section>
			</div>
			<footer>
				Навчальна діагностика · Без credentials · Не публікуйте тут чутливу
				інформацію
			</footer>
		</main>
	);
}

createRoot(document.getElementById('root')).render(<App />);
