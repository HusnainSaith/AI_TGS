import 'dotenv/config';

async function main() {
  if (process.env.RUN_SAFEPAY_SANDBOX_TESTS !== 'true')
    throw new Error('Set RUN_SAFEPAY_SANDBOX_TESTS=true to opt in');
  if (process.env.SAFEPAY_ENVIRONMENT !== 'sandbox')
    throw new Error('Sandbox validation refuses non-sandbox environments');
  if (!process.env.SAFEPAY_SECRET_KEY) throw new Error('SAFEPAY_SECRET_KEY is required');
  const response = await fetch('https://sandbox.api.getsafepay.com/client/passport/v1/token', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-sfpy-merchant-secret': process.env.SAFEPAY_SECRET_KEY,
    },
    body: '{}',
    signal: AbortSignal.timeout(Number(process.env.SAFEPAY_TIMEOUT_MS ?? 15000)),
  });
  if (!response.ok) throw new Error(`Safepay sandbox authentication failed (${response.status})`);
  console.log('Safepay sandbox authentication succeeded');
}
void main();
