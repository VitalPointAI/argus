const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

async function getStats() {
  const res = await fetch(`${API_URL}/api/v1/stats`, { cache: 'no-store' });
  return res.json();
}

async function getRecentContent() {
  const res = await fetch(`${API_URL}/api/v1/intelligence?limit=10&minConfidence=50`, { cache: 'no-store' });
  return res.json();
}

async function getDomains() {
  const res = await fetch(`${API_URL}/api/v1/domains`, { cache: 'no-store' });
  return res.json();
}

export default async function Dashboard() {
  const [statsData, contentData, domainsData] = await Promise.all([
    getStats(),
    getRecentContent(),
    getDomains(),
  ]);

  const stats = statsData.data;
  const content = contentData.data || [];
  const domains = domainsData.data || [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
          Strategic Intelligence Dashboard
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2">
          Real-time OSINT with verification and confidence scoring
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Articles"
          value={stats?.content?.total || 0}
          subtitle={`${stats?.content?.last24h || 0} in last 24h`}
        />
        <StatCard
          title="Verified"
          value={stats?.content?.verified || 0}
          subtitle={`${stats?.content?.averageConfidence || 0}% avg confidence`}
        />
        <StatCard
          title="Sources"
          value={stats?.sources || 0}
          subtitle="Active feeds"
        />
        <StatCard
          title="Domains"
          value={stats?.domains || 0}
          subtitle="Strategic areas"
        />
      </div>

      {/* Domain Overview */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Domains</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {domains.slice(0, 20).map((domain: any) => (
            <a
              key={domain.id}
              href={`/domains/${domain.slug}`}
              className="bg-slate-50 dark:bg-slate-700 p-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600 transition"
            >
              <div className="font-medium text-sm">{domain.name}</div>
              <div className="text-xs text-slate-500">{domain.slug}</div>
            </a>
          ))}
        </div>
      </div>

      {/* Recent Intelligence */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Recent Intelligence</h2>
        <div className="space-y-4">
          {content.map((item: any) => (
            <article key={item.id} className="border-b border-slate-100 dark:border-slate-700 pb-4 last:border-0">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:text-argus-600">
                    {item.title}
                  </a>
                  <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                    <span>{item.source?.name}</span>
                    <span>•</span>
                    <span>{item.domain?.name}</span>
                    <span>•</span>
                    <span>{new Date(item.publishedAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <ConfidenceBadge score={item.confidenceScore} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle }: { title: string; value: number; subtitle: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
      <div className="text-sm text-slate-500 dark:text-slate-400">{title}</div>
      <div className="text-3xl font-bold text-slate-900 dark:text-white mt-1">
        {value.toLocaleString()}
      </div>
      <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subtitle}</div>
    </div>
  );
}

function ConfidenceBadge({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-green-100 text-green-800' :
                score >= 40 ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800';
  
  return (
    <span className={`px-2 py-1 rounded text-sm font-medium ${color}`}>
      {score}%
    </span>
  );
}
