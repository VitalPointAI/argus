const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://argus.vitalpoint.ai';

async function getSources() {
  const res = await fetch(`${API_URL}/api/v1/sources`, { cache: 'no-store' });
  return res.json();
}

async function getDomains() {
  const res = await fetch(`${API_URL}/api/v1/domains`, { cache: 'no-store' });
  return res.json();
}

export default async function SourcesPage() {
  const [sourcesData, domainsData] = await Promise.all([
    getSources(),
    getDomains(),
  ]);

  const sources = sourcesData.data || [];
  const domains = domainsData.data || [];

  // Group sources by domain
  const domainMap = new Map(domains.map((d: any) => [d.id, d]));
  const sourcesByDomain = sources.reduce((acc: any, source: any) => {
    const domainId = source.domainId;
    if (!acc[domainId]) {
      acc[domainId] = {
        domain: domainMap.get(domainId),
        sources: [],
      };
    }
    acc[domainId].sources.push(source);
    return acc;
  }, {});

  const groupedDomains = Object.values(sourcesByDomain).sort((a: any, b: any) => 
    (a.domain?.name || '').localeCompare(b.domain?.name || '')
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Intelligence Sources
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2">
            {sources.length} RSS feeds across {domains.length} strategic domains
          </p>
        </div>
        <div className="flex gap-3">
          <span className="px-4 py-2 bg-green-100 text-green-800 rounded-lg text-sm font-medium">
            {sources.filter((s: any) => s.active).length} Active
          </span>
          <span className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium">
            {sources.filter((s: any) => !s.active).length} Inactive
          </span>
        </div>
      </div>

      {/* Sources by Domain */}
      <div className="space-y-6">
        {groupedDomains.map((group: any) => (
          <div key={group.domain?.id || 'unknown'} className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-700 px-6 py-4 border-b border-slate-200 dark:border-slate-600">
              <h2 className="text-lg font-semibold flex items-center gap-3">
                <a href={`/domains/${group.domain?.slug}`} className="hover:text-argus-600">
                  {group.domain?.name || 'Unknown Domain'}
                </a>
                <span className="text-sm font-normal text-slate-500">
                  {group.sources.length} source{group.sources.length !== 1 ? 's' : ''}
                </span>
              </h2>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {group.sources.map((source: any) => (
                <div key={source.id} className="px-6 py-4 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <StatusDot active={source.active} />
                      <span className="font-medium">{source.name}</span>
                      <TypeBadge type={source.type} />
                    </div>
                    <div className="mt-1 text-sm text-slate-500 truncate max-w-xl">
                      {source.url}
                    </div>
                  </div>
                  <div className="text-right text-sm text-slate-500">
                    {source.lastFetchedAt ? (
                      <div>
                        Last fetched: {new Date(source.lastFetchedAt).toLocaleString()}
                      </div>
                    ) : (
                      <div className="text-slate-400">Never fetched</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 text-sm text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <StatusDot active={true} />
            <span>Active - Feed is being polled</span>
          </div>
          <div className="flex items-center gap-2">
            <StatusDot active={false} />
            <span>Inactive - Feed paused</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span className={`w-2 h-2 rounded-full ${active ? 'bg-green-500' : 'bg-slate-300'}`} />
  );
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    rss: 'bg-orange-100 text-orange-700',
    api: 'bg-blue-100 text-blue-700',
    scraper: 'bg-purple-100 text-purple-700',
  };
  
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[type] || 'bg-slate-100 text-slate-600'}`}>
      {type.toUpperCase()}
    </span>
  );
}
