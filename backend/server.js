import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const dist = fileURLToPath(new URL('../dist/', import.meta.url));

// Fixed IMDSv2 endpoints only: never proxy user input or request IAM credentials.
async function instanceMetadata() {
	if (process.env.ENABLE_IMDS !== 'true') return { status: 'disabled' };
	try {
		const base = 'http://169.254.169.254/latest';
		const tokenResponse = await fetch(`${base}/api/token`, {
			method: 'PUT',
			headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '60' },
			signal: AbortSignal.timeout(1000),
		});
		if (!tokenResponse.ok) throw new Error('IMDS token unavailable');
		const response = await fetch(`${base}/dynamic/instance-identity/document`, {
			headers: { 'X-aws-ec2-metadata-token': await tokenResponse.text() },
			signal: AbortSignal.timeout(1000),
		});
		if (!response.ok) throw new Error('IMDS document unavailable');
		const { region, availabilityZone, instanceId, privateIp } = await response.json();
		return { region, availabilityZone, instanceId, privateIp, status: 'available' };
	} catch {
		return { status: 'unavailable' };
	}
}

function localPrivateIp() {
	const addresses = Object.values(os.networkInterfaces()).flat().filter(Boolean);
	// Prefer RFC1918 addresses; a laptop may have several interfaces or VPNs.
	return (
		addresses.find(
			({ family, internal, address }) =>
				family === 'IPv4' &&
				!internal &&
				(/^10\./.test(address) ||
					/^192\.168\./.test(address) ||
					/^172\.(1[6-9]|2\d|3[01])\./.test(address)),
		)?.address || null
	);
}

function json(res, status, value) {
	res.writeHead(status, {
		'Content-Type': 'application/json; charset=utf-8',
		'Cache-Control': 'no-store',
	});
	res.end(JSON.stringify(value));
}

const mime = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.svg': 'image/svg+xml',
};

const server = http.createServer(async (req, res) => {
	try {
		const pathname = new URL(req.url, 'http://localhost').pathname;
		if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
		if (pathname === '/api/health') return json(res, 200, { status: 'ok' });
		if (pathname === '/api/info') {
			const metadata = await instanceMetadata();
			return json(res, 200, {
				backend: {
					hostname: os.hostname(),
					privateIp:
						process.env.BACKEND_PRIVATE_IP ||
						metadata.privateIp ||
						localPrivateIp(),
					privateIpSource: process.env.BACKEND_PRIVATE_IP
						? 'environment'
						: metadata.privateIp
							? 'IMDSv2'
							: 'local network interface (best effort)',
					port,
					environment: process.env.NODE_ENV || 'development',
				},
				loadBalancer: { dnsName: process.env.ALB_DNS_NAME || null },
				aws: {
					region: process.env.AWS_REGION || metadata.region || null,
					availabilityZone:
						process.env.AWS_AVAILABILITY_ZONE ||
						metadata.availabilityZone ||
						null,
					instanceId:
						process.env.EC2_INSTANCE_ID || metadata.instanceId || null,
					vpcId: process.env.VPC_ID || null,
					subnetId: process.env.SUBNET_ID || null,
					metadataStatus: metadata.status,
				},
				request: {
					timestamp: new Date().toISOString(),
					endpoint: pathname,
					forwardedFor: req.headers['x-forwarded-for'] || null,
					forwardedProto: req.headers['x-forwarded-proto'] || null,
					forwardedPort: req.headers['x-forwarded-port'] || null,
					host: req.headers.host || null,
					peerAddress: req.socket.remoteAddress,
				},
			});
		}
		if (pathname.startsWith('/api/'))
			return json(res, 404, { error: 'API endpoint not found' });
		// Serve only build output. Never expose .env or backend source files.
		const relative = decodeURIComponent(pathname).replace(/^\/+/, '');
		if (relative.split('/').some(part => part.startsWith('.')))
			return json(res, 404, { error: 'Not found' });
		const candidate = path.resolve(dist, relative || 'index.html');
		if (!candidate.startsWith(dist)) return json(res, 403, { error: 'Forbidden' });
		const target = path.extname(candidate)
			? candidate
			: path.join(dist, 'index.html');
		try {
			const body = await readFile(target);
			res.writeHead(200, {
				'Content-Type': mime[path.extname(target)] || 'application/octet-stream',
			});
			res.end(body);
		} catch {
			json(res, 404, {
				error: 'File not found. Run npm run build to serve the frontend on this port.',
			});
		}
	} catch {
		json(res, 400, { error: 'Unable to process request' });
	}
});

server.listen(port, host, () =>
	console.log(`AWS Network Test backend: http://${host}:${port}`),
);
server.on('error', error => {
	console.error(error.message);
	process.exitCode = 1;
});
