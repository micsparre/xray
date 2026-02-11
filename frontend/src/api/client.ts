const API_BASE = '/api';

export async function startAnalysis(repoUrl: string, months = 6): Promise<string> {
  const res = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_url: repoUrl, months }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Failed to start analysis');
  return data.job_id;
}

export async function getResults(jobId: string) {
  const res = await fetch(`${API_BASE}/results/${jobId}`);
  return res.json();
}

export async function getCached(repoSlug: string) {
  const res = await fetch(`${API_BASE}/cached/${repoSlug}`);
  if (!res.ok) return null;
  return res.json();
}

export function createWebSocket(jobId: string): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}${API_BASE}/ws/${jobId}`;
  return new WebSocket(wsUrl);
}
