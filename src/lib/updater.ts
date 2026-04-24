const REPO = 'BlackFoxMedia2026/volley-scout-pro';
export const CURRENT_VERSION = '0.1.2';

export interface UpdateInfo {
  version: string;
  releaseUrl: string;
  body: string;
  publishedAt: string;
}

export interface ReleaseInfo extends UpdateInfo {
  isNewer: boolean;
}

function semverGt(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases/latest`,
      { headers: { Accept: 'application/vnd.github+json' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const latest: string = data.tag_name ?? '';
    if (!semverGt(latest, CURRENT_VERSION)) return null;
    return {
      version: latest,
      releaseUrl: data.html_url,
      body: data.body ?? '',
      publishedAt: data.published_at ?? '',
    };
  } catch {
    return null;
  }
}

export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases/latest`,
      { headers: { Accept: 'application/vnd.github+json' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const latest: string = data.tag_name ?? '';
    return {
      version: latest,
      releaseUrl: data.html_url,
      body: data.body ?? '',
      publishedAt: data.published_at ?? '',
      isNewer: semverGt(latest, CURRENT_VERSION),
    };
  } catch {
    return null;
  }
}
