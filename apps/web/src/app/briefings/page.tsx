const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

async function getLatestBriefing() {
  try {
    const res = await fetch(`${API_URL}/api/v1/briefings/latest`, { 
      cache: 'no-store',
      next: { revalidate: 0 }
    });
    if (!res.ok) return { success: false, data: null };
    return res.json();
  } catch {
    return { success: false, data: null };
  }
}

async function getStats() {
  try {
    const res = await fetch(`${API_URL}/api/v1/stats`, { 
      cache: 'no-store',
      next: { revalidate: 0 }
    });
    if (!res.ok) return { success: false, data: null };
    return res.json();
  } catch {
    return { success: false, data: null };
  }
}

export default async function BriefingsPage() {
  const [latestData, statsData] = await Promise.all([
    getLatestBriefing(),
    getStats(),
  ]);

  const latest = latestData?.data;
  const stats = statsData?.data;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
          Intelligence Briefings
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2">
          AI-generated summaries of strategic intelligence
        </p>
      </div>

      {/* Platform Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            title="Total Articles"
            value={stats.content?.total || 0}
            subtitle={`${stats.content?.last24h || 0} in last 24h`}
          />
          <StatCard
            title="Verified"
            value={stats.content?.verified || 0}
            subtitle={`${stats.content?.averageConfidence || 0}% avg confidence`}
          />
          <StatCard
            title="Sources"
            value={stats.sources || 0}
            subtitle="Active feeds"
          />
          <StatCard
            title="Domains"
            value={stats.domains || 0}
            subtitle="Strategic areas"
          />
        </div>
      )}

      {/* Latest Saved Briefing */}
      {latest ? (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-600 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Latest Briefing</h2>
            <div className="text-sm text-slate-500">
              Generated: {new Date(latest.generatedAt).toLocaleString()}
              {latest.deliveredAt && (
                <span className="ml-3 text-green-600">
                  ✓ Delivered
                </span>
              )}
            </div>
          </div>
          <div className="p-6 space-y-6">
            <div className="flex items-center gap-4">
              <TypeBadge type={latest.type} />
            </div>
            
            {/* Summary */}
            <div>
              <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-2">Summary</h3>
              <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 text-sm whitespace-pre-wrap">
                {latest.summary || 'No summary available'}
              </div>
            </div>

            {/* Key Changes */}
            {latest.changes && latest.changes.length > 0 && (
              <div>
                <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-2">Key Developments</h3>
                <div className="space-y-2">
                  {latest.changes.map((change: any, i: number) => (
                    <div key={i} className="bg-slate-50 dark:bg-slate-700 rounded-lg p-3 text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-argus-600 dark:text-argus-400">
                          {change.domain}
                        </span>
                        {change.significance && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            change.significance === 'high' ? 'bg-red-100 text-red-700' :
                            change.significance === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-slate-200 text-slate-600'
                          }`}>
                            {change.significance}
                          </span>
                        )}
                      </div>
                      <p className="text-slate-700 dark:text-slate-300">{change.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Forecasts */}
            {latest.forecasts && latest.forecasts.length > 0 && (
              <div>
                <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-2">Forecasts</h3>
                <div className="space-y-2">
                  {latest.forecasts.map((forecast: any, i: number) => (
                    <div key={i} className="bg-slate-50 dark:bg-slate-700 rounded-lg p-3 text-sm">
                      <p className="text-slate-700 dark:text-slate-300">{forecast.prediction || forecast}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-12 text-center">
          <div className="text-6xl mb-4">📋</div>
          <h2 className="text-xl font-semibold mb-2">No Briefings Yet</h2>
          <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Briefings are generated from verified intelligence. 
            Use the API to generate morning or evening briefings.
          </p>
          <div className="mt-6 text-sm text-slate-400">
            <code className="bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
              POST /api/briefings/generate
            </code>
          </div>
        </div>
      )}

      {/* Briefing Types Explanation */}
      <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-6">
        <h3 className="font-semibold mb-4">Briefing Types</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="flex gap-3 items-start">
            <TypeBadge type="morning" />
            <span className="text-slate-600 dark:text-slate-400">
              Comprehensive overnight intelligence summary
            </span>
          </div>
          <div className="flex gap-3 items-start">
            <TypeBadge type="evening" />
            <span className="text-slate-600 dark:text-slate-400">
              End-of-day developments and changes
            </span>
          </div>
          <div className="flex gap-3 items-start">
            <TypeBadge type="alert" />
            <span className="text-slate-600 dark:text-slate-400">
              Urgent breaking developments
            </span>
          </div>
          <div className="flex gap-3 items-start">
            <TypeBadge type="weekly" />
            <span className="text-slate-600 dark:text-slate-400">
              Weekly trend analysis and forecasts
            </span>
          </div>
        </div>
      </div>

      {/* API Usage */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
        <h3 className="font-semibold mb-4">Generate Briefings via API</h3>
        <div className="space-y-4 text-sm">
          <div>
            <div className="font-medium text-slate-700 dark:text-slate-300 mb-1">Generate Morning Briefing:</div>
            <code className="block bg-slate-100 dark:bg-slate-700 px-3 py-2 rounded text-xs">
              curl -X POST https://argus.vitalpoint.ai/api/briefings/generate \<br/>
              &nbsp;&nbsp;-H &quot;Content-Type: application/json&quot; \<br/>
              &nbsp;&nbsp;-d &apos;&#123;&quot;type&quot;: &quot;morning&quot;&#125;&apos;
            </code>
          </div>
          <div>
            <div className="font-medium text-slate-700 dark:text-slate-300 mb-1">Get Latest Briefing:</div>
            <code className="block bg-slate-100 dark:bg-slate-700 px-3 py-2 rounded text-xs">
              curl https://argus.vitalpoint.ai/api/v1/briefings/latest
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle }: { title: string; value: number | string; subtitle: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
      <div className="text-sm text-slate-500 dark:text-slate-400">{title}</div>
      <div className="text-3xl font-bold text-slate-900 dark:text-white mt-1">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subtitle}</div>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    morning: 'bg-amber-100 text-amber-700',
    evening: 'bg-indigo-100 text-indigo-700',
    alert: 'bg-red-100 text-red-700',
    weekly: 'bg-emerald-100 text-emerald-700',
  };
  
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${colors[type] || 'bg-slate-100 text-slate-600'}`}>
      {type.charAt(0).toUpperCase() + type.slice(1)}
    </span>
  );
}
